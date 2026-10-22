// Respostas simuladas das fontes do Wallet Watch (SÓ PARA TESTE: nenhum destes saldos é real).
// Os endereços de teste são formatos válidos; os saldos aqui são inventados para conferir a tela.
import { readFileSync } from 'node:fs';

const NOW = () => Date.now();
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const json = (v, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(v), headers: CORS });

// núcleo do Wallet Watch (o mesmo do site) para derivar os endereços da xpub de teste
const src = readFileSync(new URL('../src/js/19b-wallets-core.js', import.meta.url), 'utf8');
const { WWC } = new Function(`${src.slice(src.indexOf('// ==WWC-START=='), src.indexOf('// ==WWC-END=='))}; return { WWC };`)();

export const WT = {
  btc: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
  zpub: 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
  xpub86: 'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ',
  evm: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  ens: 'teste.eth', ensAddr: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  sol: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  trx: 'TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G',
  ltc: 'LQTpS3VaYTjCr4s9Y1t5zbeY26zevf7Fb3',
  doge: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L',
  xrp: 'rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh',
  ton: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
};
// endereços da xpub de teste que "têm uso" (saldo em satoshis)
const XUSED = {};
async function deriveUsed() {
  const d = async (xp, type, c, i) => { const x = WWC.parseExt(xp); const n = await WWC.ckd(await WWC.ckd({ chain: x.chain, key: x.key }, c), i); return WWC.btcAddr[type](n.key); };
  XUSED[await d(WT.zpub, 'p2wpkh', 0, 0)] = [10000000, 3];  // 0,1 BTC
  XUSED[await d(WT.zpub, 'p2wpkh', 0, 1)] = [0, 2];
  XUSED[await d(WT.zpub, 'p2wpkh', 0, 23)] = [5000000, 1]; // logo depois do limite de 20 sem uso, no mesmo lote: entra (0,05 BTC)
  XUSED[await d(WT.zpub, 'p2wpkh', 0, 70)] = [7000000, 1]; // muito além do limite: não é lido
  XUSED[await d(WT.zpub, 'p2wpkh', 0, 2)] = [25000000, 1]; // 0,25 BTC
  XUSED[await d(WT.zpub, 'p2wpkh', 1, 0)] = [2500000, 2];  // troco 0,025 BTC
  XUSED[await d(WT.xpub86, 'p2tr', 0, 0)] = [40000000, 2]; // xpub "ambígua": só o Taproot tem uso → 0,4 BTC
}
await deriveUsed();

export const TOKENS_FIXTURE = () => ({
  generatedAt: new Date(NOW() - 3600e3).toISOString(), v: 1, n: 7, imgBase: 'https://assets.test/cg/',
  coins: { tether: ['USDT', 'Tether', 3, 't.png'], 'usd-coin': ['USDC', 'USDC', 6, 'u.png'], chainlink: ['LINK', 'Chainlink', 15, ''], ethereum: ['ETH', 'Ethereum', 2, ''], bitcoin: ['BTC', 'Bitcoin', 1, ''] },
  chains: {
    eth: [['0xdac17f958d2ee523a2206206994597c13d831ec7', 6, 'tether'], ['0x514910771af9ca656af840dff83e8264ecf986ca', 18, 'chainlink']],
    base: [['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 6, 'usd-coin']],
    bsc: [['0x55d398326f99059ff775485246999027b3197955', 18, 'tether']],
    sol: [['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6, 'usd-coin']],
    trx: [['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 6, 'tether']],
    ton: [['0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', 6, 'tether']],
  },
});

// ---------- EVM ----------
const RPC_NET = { 'ethereum-rpc.publicnode.com': 'eth', 'bsc-rpc.publicnode.com': 'bsc', 'base-rpc.publicnode.com': 'base', 'arbitrum-one-rpc.publicnode.com': 'arb', 'optimism-rpc.publicnode.com': 'op', 'polygon-bor-rpc.publicnode.com': 'pol', 'avalanche-c-chain-rpc.publicnode.com': 'avax', 'rpc.hyperliquid.xyz': 'hyper', 'linea-rpc.publicnode.com': 'linea', 'mainnet.era.zksync.io': 'zks', 'scroll-rpc.publicnode.com': 'scroll', 'unichain-rpc.publicnode.com': 'uni', 'sonic-rpc.publicnode.com': 'sonic', 'berachain-rpc.publicnode.com': 'bera', 'gnosis-rpc.publicnode.com': 'gno', 'mantle-rpc.publicnode.com': 'mantle', 'celo-rpc.publicnode.com': 'celo', 'cronos-evm-rpc.publicnode.com': 'cronos', 'blast-rpc.publicnode.com': 'blast' };
const NATIVE = { eth: 1.5e18, base: 0.2e18, hyper: 3e18 };
const TOKBAL = { eth: { '0xdac17f958d2ee523a2206206994597c13d831ec7': 1234560000n, '0x514910771af9ca656af840dff83e8264ecf986ca': 10n * 10n ** 18n }, base: { '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 500000000n } };
const w = (v) => BigInt(v).toString(16).padStart(64, '0');
function decCalls(data) {
  const h = data.slice(10); const at = (o) => Number(BigInt('0x' + h.slice(o * 2, o * 2 + 64)));
  const ao = at(0), n = at(ao), base = ao + 32, out = [];
  for (let i = 0; i < n; i++) { const eo = base + at(base + 32 * i); const target = '0x' + h.slice(eo * 2 + 24, (eo + 32) * 2); const co = eo + at(eo + 64); const len = at(co); out.push({ target, data: h.slice((co + 32) * 2, (co + 32 + len) * 2) }); }
  return out;
}
function encResults(vals) { let offs = '', body = '', cur = 32 * vals.length; for (const v of vals) { offs += w(cur); const t = w(1) + w(0x40) + w(32) + w(v); body += t; cur += t.length / 2; } return '0x' + w(0x20) + w(vals.length) + offs + body; }
function rpc(net, body) {
  const b = JSON.parse(body || '{}'); const res = (result) => json({ jsonrpc: '2.0', id: b.id, result });
  if (b.method === 'eth_getBalance') { const who = String(b.params[0]).toLowerCase(); return res('0x' + BigInt(Math.round(who === WT.evm.toLowerCase() ? NATIVE[net] || 0 : net === 'eth' ? 5e16 : 0)).toString(16)); }
  if (b.method === 'eth_call') {
    const { to, data } = b.params[0];
    if (/^0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e$/i.test(to)) return res('0x' + w('0x231b0ee14048e9dccd1d247744d114a4eb5e8e63'));
    if (/^0x231b0ee14048e9dccd1d247744d114a4eb5e8e63$/i.test(to)) return res('0x' + w(WT.ensAddr.toLowerCase()));
    if (/^0x82ad56cb/.test(data)) { const calls = decCalls(data); return res(encResults(calls.map((c) => { const who = '0x' + c.data.slice(8 + 24, 8 + 64); return who === WT.evm.toLowerCase() ? (TOKBAL[net] || {})[c.target] || 0n : 0n; }))); }
  }
  return json({ jsonrpc: '2.0', id: b.id, error: { code: -32601, message: 'method not found' } });
}

// ---------- roteador ----------
export function walletRespond(url, method = 'GET', body = '') {
  const u = new URL(url); const h = u.host; const p = u.pathname; const q = u.searchParams;
  if (method === 'POST' && (RPC_NET[h] || /drpc\.org$|1rpc\.io$|bnbchain\.org$|base\.org$|optimism\.io$|arbitrum\.io$|avax\.network$|linea\.build$|scroll\.io$|unichain\.org$|soniclabs\.com$|berachain\.com$|gnosischain\.com$/.test(h))) {
    if (h === 'rpc.hyperliquid.xyz' || RPC_NET[h]) return rpc(RPC_NET[h] || 'x', body);
    return rpc('x', body);
  }
  if (h === 'mempool.space' && p.startsWith('/api/address/')) {
    const a = p.split('/')[3];
    if (p.endsWith('/txs')) return json(a === WT.btc ? [{ txid: 'aa'.repeat(32), status: { confirmed: true, block_time: Math.floor(NOW() / 1000) - 7200 }, vin: [], vout: [{ scriptpubkey_address: a, value: 3000000 }] }, { txid: 'bb'.repeat(32), status: { confirmed: true, block_time: Math.floor(NOW() / 1000) - 86400 * 3 }, vin: [{ prevout: { scriptpubkey_address: a, value: 1000000 } }], vout: [{ scriptpubkey_address: 'bc1qoutro', value: 990000 }] }] : []);
    if (a === WT.btc) return json({ address: a, chain_stats: { funded_txo_sum: 60000000, spent_txo_sum: 10000000, tx_count: 2 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } });
    const u2 = XUSED[a]; return json({ address: a, chain_stats: { funded_txo_sum: u2 ? u2[0] : 0, spent_txo_sum: 0, tx_count: u2 ? u2[1] : 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } });
  }
  if (h === 'blockchain.info') {
    const list = (q.get('active') || '').split('|').filter(Boolean);
    if (p === '/balance') return json(Object.fromEntries(list.map((a) => [a, { final_balance: XUSED[a] ? XUSED[a][0] : 0, n_tx: XUSED[a] ? XUSED[a][1] : 0, total_received: XUSED[a] ? XUSED[a][0] : 0 }])));
    if (p === '/multiaddr') { const bal = list.reduce((s, a) => s + (XUSED[a] ? XUSED[a][0] : 0), 0); return json({ wallet: { final_balance: bal, n_tx: 3 }, addresses: list.map((a) => ({ address: a, final_balance: XUSED[a] ? XUSED[a][0] : 0, n_tx: XUSED[a] ? XUSED[a][1] : 0 })), txs: bal ? [{ hash: 'cc'.repeat(32), time: Math.floor(NOW() / 1000) - 5400, result: 25000000, block_height: 971000 }, { hash: 'dd'.repeat(32), time: Math.floor(NOW() / 1000) - 86400 * 9, result: -1500000, block_height: 970000 }] : [] }); }
  }
  if (h === 'api.hyperliquid.xyz' && p === '/info') {
    const b = JSON.parse(body || '{}'); const mine = String(b.user || '').toLowerCase() === WT.evm.toLowerCase();
    if (b.type === 'spotClearinghouseState') return json({ balances: mine ? [{ coin: 'USDC', token: 0, total: '250.5', hold: '0' }, { coin: 'HYPE', token: 150, total: '12', hold: '0' }, { coin: 'PURR', token: 1, total: '1000', hold: '0' }] : [] });
    if (b.type === 'clearinghouseState') return json({ marginSummary: { accountValue: mine ? '1000.25' : '0.0' }, assetPositions: [] });
    if (b.type === 'delegatorSummary') return json({ delegated: mine ? '5.0' : '0.0', undelegated: '0.0', totalPendingWithdrawal: '0.0', nPendingWithdrawals: 0 });
    if (b.type === 'spotMetaAndAssetCtxs') return json([{ tokens: [{ name: 'USDC', index: 0 }, { name: 'PURR', index: 1 }, { name: 'HYPE', index: 150 }], universe: [{ tokens: [1, 0], name: 'PURR/USDC', index: 0 }, { tokens: [150, 0], name: '@107', index: 107 }] }, [{ markPx: '0.2', midPx: '0.2', prevDayPx: '0.19' }, { markPx: '38', midPx: '38', prevDayPx: '37' }]]);
  }
  if (h === 'lite-api.jup.ag') {
    if (p.startsWith('/ultra/v1/balances/')) return json(p.endsWith(WT.sol) ? { SOL: { amount: '3500000000', uiAmount: 3.5 }, EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { amount: '100000000', uiAmount: 100 }, JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { amount: '50000000', uiAmount: 50 }, SpamMint1111111111111111111111111111111111: { amount: '1', uiAmount: 1000000 } } : { SOL: { uiAmount: 0 } });
    if (p.startsWith('/tokens/v2/search')) { const ids = (q.get('query') || '').split(','); return json(ids.map((id) => (id.startsWith('JUP') ? { id, name: 'Jupiter', symbol: 'JUP', icon: 'https://assets.test/jup.png', decimals: 6, usdPrice: 0.42, isVerified: true, stats24h: { priceChange: 3.1 } } : { id, name: 'Visite www.golpe.test para resgatar', symbol: 'GOLPE', isVerified: false, usdPrice: 5 }))); }
  }
  if (h === 'api.trongrid.io' && p.startsWith('/v1/accounts/')) {
    const a = p.split('/')[3];
    if (a !== WT.trx) return json({ data: [], success: true });
    return json({ data: [{ address: a, balance: 150000000, frozenV2: [{ amount: 100000000 }, { type: 'ENERGY' }], trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '250000000' }, { TSpamToken11111111111111111111111: '999999999' }] }], success: true });
  }
  if (h === 'xrplcluster.com' || h === 'xrpl.ws') return json({ result: { account_data: { Account: WT.xrp, Balance: '25000000', OwnerCount: 0 }, status: 'success', validated: true } });
  if (h === 'litecoinspace.org' && p.startsWith('/api/address/')) {
    const a = p.split('/')[3];
    if (p.endsWith('/txs')) return json([{ txid: 'ee'.repeat(32), status: { confirmed: true, block_time: Math.floor(NOW() / 1000) - 3600 }, vin: [], vout: [{ scriptpubkey_address: a, value: 200000000 }] }]);
    return json({ address: a, chain_stats: { funded_txo_sum: 200000000, spent_txo_sum: 0, tx_count: 1 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } });
  }
  if (h === 'api.blockcypher.com' && p.includes('/doge/main/addrs/')) return json({ address: WT.doge, final_balance: 100000000000, final_n_tx: 2, txrefs: [{ tx_hash: 'ff'.repeat(32), tx_input_n: -1, value: 100000000000, confirmed: new Date(NOW() - 7200e3).toISOString() }] });
  if (h === 'tonapi.io') {
    if (p.endsWith('/jettons')) return json({ balances: [{ balance: '75000000', price: { prices: { USD: 0.9995 }, diff_24h: { USD: '−0.01%' } }, jetton: { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', name: 'Tether USD', symbol: 'USD₮', decimals: 6, verification: 'whitelist' } }, { balance: '999000000000', price: { prices: { USD: 3 } }, jetton: { address: '0:' + '1'.repeat(64), name: 'Ganhe TON grátis', symbol: 'FREE', decimals: 9, verification: 'none' } }] });
    if (p.startsWith('/v2/accounts/')) return json({ address: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8', balance: 5000000000, status: 'active' });
  }
  if (h === 'coins.llama.fi') {
    const keys = decodeURIComponent(p.split('/').pop()).split(',');
    const PR = { tether: 0.9996, 'usd-coin': 0.9999, chainlink: 16.2, xdai: 1, 'the-open-network': 1.38 };
    if (p.startsWith('/prices/current/')) return json({ coins: Object.fromEntries(keys.filter((k) => PR[k.replace('coingecko:', '')] !== undefined).map((k) => [k, { price: PR[k.replace('coingecko:', '')], symbol: 'X', timestamp: Math.floor(NOW() / 1000) - 60, confidence: 0.99 }])) });
    if (p.startsWith('/percentage/')) return json({ coins: Object.fromEntries(keys.filter((k) => PR[k.replace('coingecko:', '')] !== undefined).map((k) => [k, k.includes('chainlink') ? 2.4 : 0.01])) });
  }
  return null;
}
