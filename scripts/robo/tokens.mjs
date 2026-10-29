// =====================================================================
// Robô — lista de tokens por rede para o Wallet Watch (tokens.json).
// Para cada rede suportada: os contratos das ~1.500 maiores moedas por valor de mercado
// (CoinGecko), com as casas decimais (DefiLlama; nas redes EVM o que faltar é lido no
// próprio contrato). O navegador só lê saldo de token que está nesta lista: assim moeda
// falsa ("airdrop", golpe) nunca aparece como se tivesse valor.
// Renova a cada ~20 h; se falhar, o arquivo anterior é mantido (lista de contratos muda pouco).
// =====================================================================
const VER = 1;
const PAGES = 6; // 6 × 250 = 1.500 moedas
const FAST = !!process.env.NX_ROBOT_FAST; // testes: sem pausas entre pedidos
const sleep = (ms) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));
// id de plataforma no CoinGecko → chave da rede no site
export const TK_PLAT = {
  ethereum: 'eth', 'binance-smart-chain': 'bsc', 'polygon-pos': 'pol', 'arbitrum-one': 'arb', base: 'base',
  'optimistic-ethereum': 'op', avalanche: 'avax', linea: 'linea', zksync: 'zks', scroll: 'scroll', xdai: 'gno',
  sonic: 'sonic', unichain: 'uni', berachain: 'bera', hyperevm: 'hyper', mantle: 'mantle', celo: 'celo',
  cronos: 'cronos', blast: 'blast', solana: 'sol', tron: 'trx', 'the-open-network': 'ton',
};
// chave da rede no DefiLlama (coins.llama.fi/prices/current/<rede>:<contrato>)
const LLAMA = {
  eth: 'ethereum', bsc: 'bsc', pol: 'polygon', arb: 'arbitrum', base: 'base', op: 'optimism', avax: 'avax', linea: 'linea',
  zks: 'era', scroll: 'scroll', gno: 'xdai', sonic: 'sonic', uni: 'unichain', bera: 'berachain', hyper: 'hyperliquid',
  mantle: 'mantle', celo: 'celo', cronos: 'cronos', blast: 'blast', sol: 'solana', trx: 'tron', ton: 'ton',
};
// RPC público (CORS e Multicall3 conferidos em 16/10/2026) para ler decimals() do que faltar
const RPC = {
  eth: 'https://ethereum-rpc.publicnode.com', bsc: 'https://bsc-rpc.publicnode.com', pol: 'https://polygon-bor-rpc.publicnode.com',
  arb: 'https://arbitrum-one-rpc.publicnode.com', base: 'https://base-rpc.publicnode.com', op: 'https://optimism-rpc.publicnode.com',
  avax: 'https://avalanche-c-chain-rpc.publicnode.com', linea: 'https://linea-rpc.publicnode.com', zks: 'https://mainnet.era.zksync.io',
  scroll: 'https://scroll-rpc.publicnode.com', gno: 'https://gnosis-rpc.publicnode.com', sonic: 'https://sonic-rpc.publicnode.com',
  uni: 'https://unichain-rpc.publicnode.com', bera: 'https://berachain-rpc.publicnode.com', hyper: 'https://rpc.hyperliquid.xyz/evm',
  mantle: 'https://mantle-rpc.publicnode.com', celo: 'https://celo-rpc.publicnode.com', cronos: 'https://cronos-evm-rpc.publicnode.com',
  blast: 'https://blast-rpc.publicnode.com',
};
const MULTICALL = { zks: '0xF9cda624FBC7e059355ce98a31693d299FACd963' }; // nas demais: 0xcA11bde05977b3631167028862bE2a173976CA11
const MC3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const IMG_PRE = 'https://coin-images.coingecko.com/coins/images/';

// ---------- ABI mínima (Multicall3.aggregate3) ----------
const hex32 = (n) => BigInt(n).toString(16).padStart(64, '0');
export function encAggregate3(calls) {
  let offs = '', body = '', cur = 32 * calls.length;
  for (const c of calls) {
    offs += hex32(cur);
    const d = c.data.replace(/^0x/, ''); const pad = d + '0'.repeat((64 - (d.length % 64)) % 64);
    const t = hex32(c.target) + hex32(1) + hex32(0x60) + hex32(d.length / 2) + pad;
    body += t; cur += t.length / 2;
  }
  return '0x82ad56cb' + hex32(0x20) + hex32(calls.length) + offs + body;
}
export function decAggregate3(hs) {
  const h = hs.replace(/^0x/, ''); const at = (o) => Number(BigInt('0x' + (h.slice(o * 2, o * 2 + 64) || '0')));
  const ao = at(0), n = at(ao), base = ao + 32, out = [];
  for (let i = 0; i < n; i++) {
    const eo = base + at(base + 32 * i); const ok = at(eo) === 1; const bo = eo + at(eo + 32); const bl = at(bo);
    out.push({ ok, data: '0x' + h.slice((bo + 32) * 2, (bo + 32 + bl) * 2) });
  }
  return out;
}
// ---------- TON: endereço amigável (EQ…/UQ…) → bruto (0:hex) ----------
export function tonRaw(a) {
  const s = String(a || '').trim();
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();
  if (!/^[A-Za-z0-9_\-+/]{48}$/.test(s)) return null;
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (b.length !== 36) return null;
  const wc = b[1] === 0xff ? -1 : b[1];
  return `${wc}:${b.subarray(2, 34).toString('hex')}`;
}
// ---------- CoinGecko grátis: pedido com nova tentativa ----------
const CG_GAP = 7000;          // entre as páginas (~8 pedidos por minuto, abaixo do limite do plano grátis)
const CG_BUDGET = 4 * 60e3;   // teto das etapas 1 e 2
// "429" = limite por minuto: espera 65 s (o minuto vira); outro erro: 15 s. Até 4 tentativas, sem passar do teto.
export async function cgGet(get, url, what, timeout, until) {
  for (let tent = 0; ; tent++) {
    try {
      const j = await get(url, { as: 'json', timeout });
      if (Array.isArray(j)) return j;
      throw new Error('resposta inesperada');
    } catch (e) {
      const wait = /\b429\b/.test(String(e.message)) ? 65000 : 15000;
      if (tent >= 3 || Date.now() + wait > until) throw new Error(`CoinGecko ${what}: ${e.message}`);
      await sleep(wait);
    }
  }
}
const normAddr = (k, a) => (RPC[k] ? String(a).trim().toLowerCase() : k === 'ton' ? tonRaw(a) : String(a).trim());
const okAddr = (k, a) => (RPC[k] ? /^0x[0-9a-f]{40}$/.test(a) : k === 'ton' ? !!a : k === 'trx' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) : k === 'sol' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) : false);

export async function tokens(ctx, { force = false } = {}) {
  const { get, previous, save } = ctx;
  const prev = await previous('tokens');
  if (!force && prev && prev.v === VER && prev.chains && Date.now() - Date.parse(prev.generatedAt) < 20 * 3600e3) {
    save('tokens', prev);
    return { kept: true, n: prev.n };
  }
  // 1) as maiores moedas por valor de mercado. O CoinGecko grátis aceita poucos pedidos por minuto e o
  // endereço do GitHub é dividido com muita gente: pausa entre as páginas e, no "429" (limite), espera o
  // minuto virar. Tudo dentro de um teto de tempo (o robô inteiro tem 12 min); passou, mantém o arquivo anterior.
  const until = Date.now() + CG_BUDGET;
  const coins = {};
  for (let page = 1; page <= PAGES; page++) {
    const arr = await cgGet(get, `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`, `markets p${page}`, 30000, until);
    for (const m of arr) {
      if (!m || !m.id || !m.symbol) continue;
      const img = typeof m.image === 'string' ? (m.image.startsWith(IMG_PRE) ? m.image.slice(IMG_PRE.length) : m.image) : '';
      coins[m.id] = [String(m.symbol).toUpperCase().slice(0, 16), String(m.name || m.id).slice(0, 60), m.market_cap_rank || null, img.replace('/large/', '/small/')];
    }
    await sleep(CG_GAP);
  }
  if (Object.keys(coins).length < 500) throw new Error(`poucas moedas (${Object.keys(coins).length})`);
  // 2) contratos de cada moeda em cada rede
  const list = await cgGet(get, 'https://api.coingecko.com/api/v3/coins/list?include_platform=true', 'lista de contratos', 90000, until);
  if (list.length < 5000) throw new Error('lista de contratos do CoinGecko incompleta');
  const chains = {}; const seen = new Set();
  for (const c of list) {
    if (!coins[c.id] || !c.platforms) continue;
    for (const [p, raw] of Object.entries(c.platforms)) {
      const k = TK_PLAT[p]; if (!k || !raw) continue;
      const a = normAddr(k, raw); if (!a || !okAddr(k, a)) continue;
      const key = k + ':' + a; if (seen.has(key)) continue; seen.add(key);
      (chains[k] = chains[k] || []).push({ a, f: String(raw).trim(), id: c.id, dec: null });
    }
  }
  // 3) casas decimais pelo DefiLlama (lotes de 60)
  const all = Object.entries(chains).flatMap(([k, arr]) => arr.map((t) => ({ k, t })));
  for (let i = 0; i < all.length; i += 60) {
    const part = all.slice(i, i + 60);
    // TON vai no formato amigável (EQ…), como o DefiLlama conhece; as demais, como estão na lista
    const q = part.map(({ k, t }) => `${LLAMA[k]}:${k === 'ton' ? t.f : t.a}`).join(',');
    try {
      const j = await get(`https://coins.llama.fi/prices/current/${q}?searchWidth=12h`, { as: 'json', timeout: 30000 });
      const got = (j && j.coins) || {};
      for (const [key, v] of Object.entries(got)) {
        if (!v || !Number.isInteger(v.decimals)) continue;
        const [lk, ...rest] = key.split(':'); const addr = rest.join(':');
        const k = Object.keys(LLAMA).find((x) => LLAMA[x] === lk); if (!k) continue;
        const na = normAddr(k, addr); const t = (chains[k] || []).find((x) => x.a === na); if (t) t.dec = v.decimals;
      }
    } catch (e) { console.warn('  tokens: DefiLlama lote', i, e.message); }
    await sleep(250);
  }
  // 4) redes EVM: o que faltou é lido no contrato (decimals()); lote que falhar é repartido
  async function readDec(k, part) {
    try {
      const data = encAggregate3(part.map((t) => ({ target: t.a, data: '0x313ce567' })));
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
      let j;
      try { const r = await fetch(RPC[k], { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: MULTICALL[k] || MC3, data }, 'latest'] }) }); j = await r.json(); }
      finally { clearTimeout(to); }
      if (!j || typeof j.result !== 'string') throw new Error((j && j.error && j.error.message) || 'sem resultado');
      decAggregate3(j.result).forEach((x, n) => { if (x.ok && x.data.length >= 66) { const d = Number(BigInt(x.data.slice(0, 66))); if (d >= 0 && d <= 36) part[n].dec = d; } });
    } catch (e) {
      if (part.length > 20) { const q = Math.ceil(part.length / 4); for (let i = 0; i < part.length; i += q) await readDec(k, part.slice(i, i + q)); }
      else console.warn('  tokens: decimals', k, part.length, e.message);
    }
  }
  for (const [k, arr] of Object.entries(chains)) {
    if (!RPC[k]) continue;
    const miss = arr.filter((t) => t.dec === null);
    for (let i = 0; i < miss.length; i += 200) await readDec(k, miss.slice(i, i + 200));
  }
  // 5) saída compacta: rede → [[contrato, decimais, id], …] (sem decimais conhecidos, fica de fora)
  const out = {}; let n = 0; const used = new Set();
  for (const [k, arr] of Object.entries(chains)) {
    const ok = arr.filter((t) => Number.isInteger(t.dec)).sort((a, b) => (coins[a.id][2] || 1e9) - (coins[b.id][2] || 1e9));
    if (!ok.length) continue;
    out[k] = ok.map((t) => [t.a, t.dec, t.id]); n += ok.length; ok.forEach((t) => used.add(t.id));
  }
  // moedas nativas das redes também entram no mapa de nomes (preço e logo)
  for (const id of ['bitcoin', 'ethereum', 'binancecoin', 'polygon-ecosystem-token', 'avalanche-2', 'solana', 'tron', 'litecoin', 'dogecoin', 'ripple', 'the-open-network', 'hyperliquid', 'xdai', 'sonic-3', 'berachain-bera', 'mantle', 'celo', 'crypto-com-chain', 'cronos', 'usd-coin']) if (coins[id]) used.add(id);
  const coinsOut = {}; for (const id of used) coinsOut[id] = coins[id];
  if (n < 300) throw new Error(`poucos tokens com decimais (${n})`);
  const perChain = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
  save('tokens', { generatedAt: new Date().toISOString(), v: VER, src: 'CoinGecko (maiores moedas por valor de mercado) + DefiLlama/contratos (decimais)', imgBase: IMG_PRE, coins: coinsOut, chains: out, n, perChain });
  return { n, coins: Object.keys(coinsOut).length, perChain };
}
