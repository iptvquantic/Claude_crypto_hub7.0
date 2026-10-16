// Respostas simuladas das APIs para os testes automáticos (o sandbox não acessa a internet).
// SÓ PARA TESTE: nenhum destes números aparece no site publicado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEV = new URL('.', import.meta.url).pathname;
const DAY = 86400e3;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NOW = () => Date.now();

const BASE = { BTCUSDT: 81500, ETHUSDT: 3100, SOLUSDT: 145, BNBUSDT: 600, XRPUSDT: 2.3, DOGEUSDT: 0.18, ADAUSDT: 0.62, TRXUSDT: 0.3, HYPEUSDT: 38, LINKUSDT: 16, AVAXUSDT: 22, SUIUSDT: 2.6, XLMUSDT: 0.32, HBARUSDT: 0.19, BCHUSDT: 480, LTCUSDT: 92, DOTUSDT: 3.9, UNIUSDT: 7.5, AAVEUSDT: 230, ONDOUSDT: 0.85, ENAUSDT: 0.45, PENDLEUSDT: 3.8, NEARUSDT: 2.4, APTUSDT: 4.6, ICPUSDT: 4.9, TAOUSDT: 330, ETCUSDT: 17, ATOMUSDT: 4.3, FILUSDT: 2.4, ARBUSDT: 0.38, OPUSDT: 0.62, POLUSDT: 0.21, RENDERUSDT: 3.4, FETUSDT: 0.55, WLDUSDT: 1.1, INJUSDT: 11, SEIUSDT: 0.24, TIAUSDT: 1.6, JUPUSDT: 0.42, ALGOUSDT: 0.2, VETUSDT: 0.022, LDOUSDT: 1.05, CRVUSDT: 0.62, SKYUSDT: 0.07, SHIBUSDT: 0.0000115, PEPEUSDT: 0.0000088, USDTBRL: 5.47, PAXGUSDT: 4150 };
const CG = { BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana', BNBUSDT: 'binancecoin', XRPUSDT: 'ripple', DOGEUSDT: 'dogecoin', ADAUSDT: 'cardano', TRXUSDT: 'tron', HYPEUSDT: 'hyperliquid', LINKUSDT: 'chainlink', AVAXUSDT: 'avalanche-2', SUIUSDT: 'sui', XLMUSDT: 'stellar', HBARUSDT: 'hedera-hashgraph', BCHUSDT: 'bitcoin-cash', LTCUSDT: 'litecoin', DOTUSDT: 'polkadot', UNIUSDT: 'uniswap', AAVEUSDT: 'aave', ONDOUSDT: 'ondo-finance', ENAUSDT: 'ethena', PENDLEUSDT: 'pendle', NEARUSDT: 'near', APTUSDT: 'aptos', ICPUSDT: 'internet-computer', TAOUSDT: 'bittensor', ETCUSDT: 'ethereum-classic', ATOMUSDT: 'cosmos', FILUSDT: 'filecoin', ARBUSDT: 'arbitrum', OPUSDT: 'optimism', POLUSDT: 'polygon-ecosystem-token', RENDERUSDT: 'render-token', FETUSDT: 'fetch-ai', WLDUSDT: 'worldcoin-wld', INJUSDT: 'injective-protocol', SEIUSDT: 'sei-network', TIAUSDT: 'celestia', JUPUSDT: 'jupiter-exchange-solana', ALGOUSDT: 'algorand', VETUSDT: 'vechain', LDOUSDT: 'lido-dao', CRVUSDT: 'curve-dao-token', SKYUSDT: 'sky', SHIBUSDT: 'shiba-inu', PEPEUSDT: 'pepe' };
const SUPPLY = { bitcoin: 19.94e6, ethereum: 120.7e6, solana: 540e6, binancecoin: 140e6, ripple: 59e9, tether: 183e9, 'usd-coin': 74e9 };
const BY_ID = Object.fromEntries(Object.entries(CG).map(([s, id]) => [id, s]));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const json = (v, status = 200, headers = {}) => ({ status, contentType: 'application/json', body: JSON.stringify(v), headers: { ...CORS, ...headers } });
const text = (v, status = 200, ct = 'text/plain') => ({ status, contentType: ct, body: String(v), headers: CORS });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const chg = (s) => { const h = [...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000; return (h / 1000 - 0.45) * 12; };
const price = (s) => BASE[s] * (1 + chg(s) / 300);

// velas: passeio aleatório determinístico que termina no preço atual
const IV = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': DAY, '1w': 7 * DAY };
function candles(sym, interval, limit, startTime) {
  let ts = [];
  const now = NOW();
  if (interval === '1M') {
    const d = new Date(Date.UTC(2017, 7, 1));
    while (d.getTime() <= now) { ts.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
  } else {
    const iv = IV[interval] || DAY;
    const lastOpen = Math.floor(now / iv) * iv - (interval === '1w' ? 3 * DAY : 0);
    const first = Math.max(Date.UTC(2017, 7, 17), startTime ? Math.ceil(startTime / iv) * iv : lastOpen - (limit - 1) * iv);
    for (let t = first; t <= lastOpen && ts.length < (startTime ? 1000 : limit); t += iv) ts.push(t);
  }
  if (!startTime) ts = ts.slice(-limit);
  const end = price(sym);
  let p = end; const out = [];
  seed = [...sym + interval].reduce((a, c) => (a * 33 + c.charCodeAt(0)) % 2147483647, 11) || 1;
  for (let i = ts.length - 1; i >= 0; i--) {
    const c = p; const o = c / (1 + (rnd() - 0.5) * (interval === '1M' ? 0.3 : interval === '1w' ? 0.12 : 0.04));
    const h = Math.max(o, c) * (1 + rnd() * 0.01), l = Math.min(o, c) * (1 - rnd() * 0.01);
    const iv = interval === '1M' ? 30 * DAY : IV[interval] || DAY;
    out.unshift([ts[i], o.toPrecision(8), h.toPrecision(8), l.toPrecision(8), c.toPrecision(8), '1000', ts[i] + iv - 1, String(o * 1000 * (5 + rnd() * 10)), 100, '500', '500', '0']);
    p = o * (interval === '1M' ? 0.98 : 0.999);
  }
  return out;
}
function cgMarket(id, i) {
  const s = BY_ID[id];
  const p = s ? price(s) : id === 'tether' || id === 'usd-coin' ? 1 : 0.5 + i / 10;
  const sup = SUPPLY[id] || 1e9 / (i + 1);
  return {
    id, symbol: (s ? s.replace('USDT', '') : id.slice(0, 4)).toLowerCase(), name: id.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), image: `https://assets.test/logo/${id}.png`,
    current_price: p, market_cap: p * sup, market_cap_rank: i + 1, fully_diluted_valuation: p * sup * 1.2, total_volume: p * sup * 0.04,
    price_change_percentage_24h: chg(id), market_cap_change_percentage_24h: chg(id) * 0.9, circulating_supply: sup, total_supply: sup * 1.1, max_supply: id === 'bitcoin' ? 21e6 : null,
    ath: p * 1.6, ath_change_percentage: -37, ath_date: '2025-10-06T00:00:00.000Z', last_updated: new Date().toISOString(),
    sparkline_in_7d: { price: Array.from({ length: 168 }, (_, k) => p * (1 + Math.sin(k / 9 + i) * 0.03)) },
    price_change_percentage_1h_in_currency: chg(id) / 8, price_change_percentage_24h_in_currency: chg(id), price_change_percentage_7d_in_currency: chg(id) * 2, price_change_percentage_30d_in_currency: chg(id) * 3,
  };
}
// juros: faixa-alvo do Fed (histórico real resumido) e Selic
const FED_STEPS = [['2024-12-19', 4.25, 4.5], ['2025-09-18', 4.0, 4.25], ['2025-10-30', 3.75, 4.0], ['2025-12-11', 3.5, 3.75], ['2026-09-17', 3.75, 4.0]];
const SELIC_STEPS = [['2025-01-30', 13.25], ['2025-03-20', 14.25], ['2025-05-08', 14.75], ['2025-06-19', 15.0], ['2026-03-19', 14.75], ['2026-04-30', 14.5], ['2026-06-18', 14.25], ['2026-08-06', 14.0], ['2026-09-17', 13.75]];
const fedOn = (d) => { let r = FED_STEPS[0]; for (const x of FED_STEPS) if (x[0] <= d) r = x; return r; };
const selicOn = (d) => { let r = 12.25; for (const x of SELIC_STEPS) if (x[0] <= d) r = x[1]; return r; };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const br = (t) => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const parseBr = (s) => { const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], 12) : NOW(); };

function rssFor(feed) {
  const name = (feed.match(/\/\/(?:www\.|rss\.|feeds\.)?([^/.]+)/) || [])[1] || 'fonte';
  const words = ['Bitcoin sobe após dados de inflação', 'Ethereum testa resistência importante', 'Fed sinaliza cautela com juros', 'Ibovespa fecha em alta com bancos', 'Nova lei de IA avança no Congresso', 'Ucrânia e Rússia retomam negociações', 'Israel e Irã: tensão no Oriente Médio', 'China responde a tarifas dos EUA', 'Taiwan reforça defesa', 'Copom deve manter a Selic, diz mercado'];
  return { status: 'ok', feed: { title: name, link: feed }, items: Array.from({ length: 10 }, (_, i) => ({ title: `${pick(words)} (${name} ${i + 1})`, link: `https://news.test/${name}/${i}?x=1`, pubDate: new Date(NOW() - (i * 47 + 5) * 60e3).toISOString().slice(0, 19).replace('T', ' '), description: '<p>Resumo da notícia de teste para o NEXUS HUB.</p>', thumbnail: i % 3 === 0 ? `https://assets.test/img/${name}-${i}.png` : '', enclosure: {} })) };
}
function pmEvents(tag) {
  const mk = (q, y) => ({ question: q, outcomes: '["Yes", "No"]', outcomePrices: JSON.stringify([String(y), String(1 - y)]), groupItemTitle: q, active: true, closed: false });
  const base = [
    { id: 'e1', slug: 'fed-decision-in-october', title: 'Fed Decision in October?', image: 'https://assets.test/pm/fed.png', endDate: new Date(NOW() + 13 * DAY).toISOString(), volume24hr: 3151620, markets: [mk('50+ bps decrease', 0.0015), mk('25 bps decrease', 0.04), mk('No change', 0.93), mk('25+ bps increase', 0.03)] },
    { id: 'e2', slug: 'bitcoin-above-100k', title: 'Bitcoin above $100k by December 31?', image: 'https://assets.test/pm/btc.png', endDate: new Date(NOW() + 77 * DAY).toISOString(), volume24hr: 820000, markets: [mk('Bitcoin above $100k by December 31?', 0.18)] },
    { id: 'e3', slug: 'brazil-election', title: 'Brazil Presidential Election', image: '', endDate: new Date(NOW() + 10 * DAY).toISOString(), volume24hr: 2400000, markets: [mk('Lula', 0.55), mk('Flávio Bolsonaro', 0.44)] },
  ];
  return tag === 'sports' ? [] : base;
}
// ---------- robô (ramo data) ----------
// histórico diário sintético do Bitcoin Lab (forma parecida com a real, números de teste)
function labFixture(gen) {
  const t0 = Date.UTC(2010, 6, 18); const n = Math.floor((NOW() - t0) / DAY) + 1;
  const arr = (f, from = 0, lag = 1) => Array.from({ length: n }, (_, i) => (i >= from && i <= n - 1 - lag ? +f(i).toPrecision(6) : null));
  const pr = (i) => Math.max(0.06, 81500 * Math.pow((i + 1) / n, 3.4) * (1 + 0.32 * Math.sin(i / 260)));
  const mv = (i) => 1.55 + 0.75 * Math.sin(i / 230 + 0.6);
  const sup = (i) => Math.min(20.1e6, 3.3e6 + i * 4200);
  const cyc = (i, a, b) => a + b * Math.sin(i / 190);
  const bdFrom = n - 1462;
  const iso = (i) => new Date(t0 + i * DAY).toISOString().slice(0, 10);
  return {
    generatedAt: gen, t0: '2010-07-18', n,
    cm: { price: arr(pr), mvrv: arr(mv, 0, 2), mcap: arr((i) => pr(i) * sup(i), 0, 2), iss: arr((i) => pr(i) * 900 * (1 + 0.1 * Math.sin(i / 50)), 0, 2), hash: arr((i) => 1e9 * Math.pow((i + 1) / n, 2) * (1 + 0.05 * Math.sin(i / 37))), addr: arr((i) => 650000 * (1 + 0.2 * Math.sin(i / 90))), bal: arr((i) => 5.5e7 * (i + 1) / n), supply: arr(sup, 0, 2), exch: arr((i) => 2.7e6 + 3e5 * Math.sin(i / 400), 280, 2), inflow: arr((i) => 26000 + 3000 * Math.sin(i / 11), 280, 2), outflow: arr((i) => 26200 + 3000 * Math.cos(i / 13), 280, 2), fees: arr((i) => 3 + 2 * Math.sin(i / 70) + 2.2), tx: arr((i) => 700000 * (1 + 0.15 * Math.sin(i / 60))) },
    cmAt: gen,
    bd: { cvdd: arr((i) => pr(i) / 5, bdFrom, 2), sthRealizedPrice: arr((i) => pr(i) * 0.92, bdFrom, 7), lthRealizedPrice: arr((i) => pr(i) * 0.6, bdFrom, 7), aviv: arr((i) => cyc(i, 1.1, 0.4), bdFrom, 7), lthSopr: arr((i) => cyc(i, 1.6, 0.9), bdFrom, 7), sthSopr: arr((i) => cyc(i, 1.0, 0.03), bdFrom, 7), sthMvrv: arr((i) => cyc(i, 1.05, 0.2), bdFrom, 7), lthMvrv: arr((i) => cyc(i, 1.8, 0.8), bdFrom, 7), sopr: arr((i) => cyc(i, 1.0, 0.02), bdFrom, 7), reserveRisk: arr((i) => cyc(i, 0.0012, 0.0006), bdFrom, 1), trueMarketMean: arr((i) => pr(i) * 0.95, bdFrom, 7), terminalPrice: arr((i) => pr(i) * 1.25, bdFrom, 1) },
    bdLast: { cvdd: iso(n - 3), sthRealizedPrice: iso(n - 8), lthRealizedPrice: iso(n - 8), aviv: iso(n - 8), lthSopr: iso(n - 8), sthSopr: iso(n - 8), sthMvrv: iso(n - 8), lthMvrv: iso(n - 8), sopr: iso(n - 8), reserveRisk: iso(n - 2), trueMarketMean: iso(n - 8), terminalPrice: iso(n - 2) },
    fng: arr((i) => Math.round(50 + 30 * Math.sin(i / 40)), 2755, 0), fngAt: gen,
  };
}
// NX_DATA=<pasta com os .json do robô>: usa os arquivos reais (só para conferir o visual com dados de verdade)
function realPipeline(name, gen) {
  if (!process.env.NX_DATA) return null;
  try { const j = JSON.parse(readFileSync(join(process.env.NX_DATA, name + '.json'), 'utf8')); j.generatedAt = gen; return j; } catch { return null; }
}
function pipeline(name) {
  const gen = new Date(NOW() - 12 * 60e3).toISOString();
  const real = realPipeline(name, gen); if (real) return real;
  if (name === 'lab') return labFixture(gen);
  if (name === 'news') {
    const cat = (c) => Array.from({ length: 12 }, (_, i) => ({ t: `Manchete ${c} ${i + 1}: mercado reage a dados`, u: `https://news.test/${c}/${i}`, d: NOW() - (i * 37 + 3) * 60e3, x: 'Resumo curto.', img: i === 0 ? 'https://assets.test/img/lead.png' : '', src: pick(['InfoMoney', 'Livecoins', 'g1', 'BBC News Brasil']), lang: i % 5 === 4 ? 'en' : 'pt' }));
    return { generatedAt: gen, cats: { cripto: cat('cripto'), economia: cat('economia'), tech: cat('tech'), mundo: cat('mundo').map((n, i) => ({ ...n, t: i % 2 ? 'Rússia e Ucrânia: novo cessar-fogo em discussão' : 'Israel amplia operação em Gaza' })) } };
  }
  if (name === 'markets') {
    const q = (n, g, p, fmt = 'pts') => ({ n, g, p, chg: chg(n), t: NOW() - 20 * 60e3, fmt });
    return { generatedAt: gen, quotes: { '^BVSP': q('Ibovespa', 'br', 147230.5), '^GSPC': q('S&P 500', 'us', 6712.4), '^IXIC': q('Nasdaq', 'us', 22790.1), '^DJI': q('Dow Jones', 'us', 46120.3), '^VIX': q('VIX (medo)', 'us', 18.2), '^N225': q('Nikkei 225', 'world', 47100), '^GDAXI': q('DAX', 'world', 24200), 'DX-Y.NYB': q('Índice do dólar (DXY)', 'rates', 98.7), '^TNX': q('Juros 10 anos EUA', 'rates', 4.12, 'pct'), 'BZ=F': q('Petróleo Brent', 'cmd', 64.3, 'usd') },
      etfs: { IBIT: { p: 46.1, chg: 1.2, vol: 4.2e7, t: NOW() - 20 * 60e3 }, FBTC: { p: 70.2, chg: 1.1, vol: 6e6, t: NOW() - 20 * 60e3 }, 'HASH11.SA': { p: 89.5, chg: 0.8, vol: 2e5, t: NOW() - 20 * 60e3 } },
      world: Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, n: i === 0 ? 'Gold' : i === 6 ? 'Bitcoin' : `Empresa ${i + 1}`, s: i === 0 ? 'GOLD' : i === 6 ? 'BTC' : `EMP${i}`, kind: i === 0 ? 'metal' : i === 6 ? 'crypto' : 'stock', mcap: 3e13 / (i + 1.5), p: 100 + i, chg: chg('w' + i), country: 'EUA' })), worldSrc: 'companiesmarketcap.com' };
  }
  if (name === 'calendar') {
    const ev = (d, h, country, title, impact, f, p) => ({ title, country, date: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + d, h)).toISOString(), impact, forecast: f, previous: p });
    return { generatedAt: gen, events: [ev(0, 13, 'USD', 'Unemployment Claims', 'Medium', '228K', '224K'), ev(1, 14, 'USD', 'Prelim UoM Consumer Sentiment', 'Medium', '54.8', '55.1'), ev(2, 9, 'EUR', 'German ZEW Economic Sentiment', 'Medium', '38.2', '37.3'), ev(3, 12, 'USD', 'Retail Sales m/m', 'High', '0.4%', '0.6%'), ev(4, 1, 'CNY', 'GDP q/q', 'High', '1.0%', '1.1%'), ev(5, 23, 'JPY', 'BOJ Policy Rate', 'High', '0.75%', '0.75%')] };
  }
  if (name === 'status') return { generatedAt: gen, sources: { news: { ok: true, n: 48 }, calendar: { ok: true, n: 6 }, quotes: { ok: true, n: 10 }, world: { ok: false, err: 'HTTP 403' }, db: { ok: false, err: 'projeto pausado no Supabase (reativar no painel)' } } };
  return null;
}
// ---------- Supabase simulado ----------
export function makeSupabase({ plan = 'trial', admin = false } = {}) {
  const uid = '11111111-2222-3333-4444-555555555555';
  const email = admin ? 'dono@teste.com' : 'cliente@teste.com';
  const db = { entries: [], claims: [], profile: { id: uid, email, name: admin ? 'Dono' : 'Cliente Teste', plan: admin ? 'master' : plan, plan_expiry: new Date(NOW() + (plan === 'expired' ? -2 : 9) * DAY).toISOString(), active: true, created_at: new Date(NOW() - 6 * DAY).toISOString() } };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(NOW() / 1000) + 3600, iat: Math.floor(NOW() / 1000) })}.sig`;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email, user_metadata: { name: db.profile.name }, app_metadata: { provider: 'email' }, created_at: db.profile.created_at };
  const session = () => ({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(NOW() / 1000) + 3600, refresh_token: 'rt-test', user });
  let n = 0;
  const handle = (url, method, body, headers) => {
    const u = new URL(url); const p = u.pathname;
    const single = /vnd\.pgrst\.object/.test(headers.accept || '');
    if (p === '/functions/v1/signup') return json({ ok: true });
    if (p === '/functions/v1/account') { const b = JSON.parse(body || '{}'); if (b.action === 'admin_reset') return json({ ok: true, email: 'cliente@teste.com', temp_password: 'Tmp-abc12345' }); return json({ ok: true }); }
    if (p === '/auth/v1/token') return json(session());
    if (p === '/auth/v1/user') return json(user);
    if (p === '/auth/v1/logout') return { status: 204, contentType: 'application/json', body: '' };
    if (p === '/rest/v1/rpc/my_profile') { const pr = db.profile; const pro = pr.active && (['admin', 'master'].includes(pr.plan) || Date.parse(pr.plan_expiry) > NOW()); return json({ ...pr, pro, admin: ['admin', 'master'].includes(pr.plan), server_time: new Date().toISOString() }); }
    if (p === '/rest/v1/profiles') return { status: 204, contentType: 'application/json', body: '' };
    if (p === '/rest/v1/vault_entries') {
      if (method === 'GET') return json(db.entries.filter((e) => !e.removed_at));
      if (method === 'POST') {
        const rows = [].concat(JSON.parse(body)); const out = [];
        for (const r of rows) { if (r.legacy_id && db.entries.some((e) => e.legacy_id === r.legacy_id)) continue; const row = { id: `v-${++n}`, user_id: uid, fee: 0, created_at: new Date(NOW() + n).toISOString(), updated_at: new Date().toISOString(), removed_at: null, ...r }; db.entries.push(row); out.push(row); }
        return json(single ? out[0] : out, 201);
      }
      if (method === 'PATCH') { const id = (u.searchParams.get('id') || '').replace('eq.', ''); const row = db.entries.find((e) => e.id === id); Object.assign(row, JSON.parse(body), { updated_at: new Date().toISOString() }); return json(single ? row : [row]); }
    }
    if (p === '/rest/v1/rpc/vault_remove') { const { p_id } = JSON.parse(body); const r = db.entries.find((e) => e.id === p_id); if (r) r.removed_at = new Date().toISOString(); return json({ ok: !!r }); }
    if (p === '/rest/v1/rpc/vault_restore') { const { p_id } = JSON.parse(body); const r = db.entries.find((e) => e.id === p_id); if (r) r.removed_at = null; return json({ ok: !!r }); }
    if (p === '/rest/v1/payment_claims') { if (method === 'GET') return json(db.claims); const r = { id: 'c' + ++n, ...JSON.parse(body), status: 'pending', created_at: new Date().toISOString() }; db.claims.push(r); return json([r], 201); }
    if (p === '/rest/v1/rpc/admin_overview') return json({ users: 12, pro_active: 3, trial_active: 5, expired: 4, new_7d: 2, claims_pending: 1, entries: 87, server_time: new Date().toISOString() });
    if (p === '/rest/v1/rpc/admin_list_claims') return json([{ id: 'c9', user_id: 'u9', email: 'pagou@teste.com', plan: 'anual', note: 'Maria, pago 15/10', status: 'pending', created_at: new Date().toISOString() }]);
    if (p === '/rest/v1/rpc/admin_list_users') return json([{ id: uid, email, name: 'Dono', plan: 'master', plan_expiry: new Date(NOW() + 999 * DAY).toISOString(), active: true, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), entries: 3, pending_claims: 0 }, { id: 'u9', email: 'pagou@teste.com', name: 'Maria', plan: 'trial', plan_expiry: new Date(NOW() - DAY).toISOString(), active: true, created_at: new Date().toISOString(), last_seen_at: null, entries: 0, pending_claims: 1 }]);
    if (p.startsWith('/rest/v1/rpc/admin_')) return json({ ok: true });
    return json({ message: 'não simulado: ' + p }, 404);
  };
  return { db, handle, uid };
}
// ---------- roteador geral ----------
export function respond(url, method = 'GET', body = '', opts = {}) {
  const u = new URL(url); const h = u.host; const p = u.pathname; const q = u.searchParams;
  if (h === 'fonts.googleapis.com') {
    const f = (n) => readFileSync(join(DEV, 'node_modules/@fontsource-variable/archivo/files', n)).toString('base64');
    return text("@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(https://fonts.gstatic.com/s/archivo/v1/test.woff2) format('woff2')}", 200, 'text/css');
  }
  if (h === 'fonts.gstatic.com') return { status: 200, contentType: 'font/woff2', body: readFileSync(join(DEV, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2')), headers: CORS };
  if (h === 'cdn.jsdelivr.net' || h === 'unpkg.com') {
    const file = p.includes('supabase') ? 'node_modules/@supabase/supabase-js/dist/umd/supabase.js' : 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js';
    return { status: 200, contentType: 'application/javascript', body: readFileSync(join(DEV, file)), headers: { 'access-control-allow-origin': '*' } };
  }
  if (h === 'assets.test') return { status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } };
  if (h === 'api.binance.com' || h === 'data-api.binance.vision') {
    if (p === '/api/v3/exchangeInfo') return json({ symbols: JSON.parse(q.get('symbols')).map((s) => ({ symbol: s, status: 'TRADING' })) });
    if (p === '/api/v3/ticker/24hr') return json(JSON.parse(q.get('symbols')).filter((s) => BASE[s]).map((s) => { const pr = price(s); const c = chg(s); return { symbol: s, lastPrice: String(pr), openPrice: String(pr / (1 + c / 100)), priceChangePercent: c.toFixed(3), highPrice: String(pr * 1.02), lowPrice: String(pr * 0.97), quoteVolume: String(pr * 1e6), closeTime: NOW() - 500 }; }));
    if (p === '/api/v3/klines') return json(candles(q.get('symbol'), q.get('interval'), +q.get('limit') || 500, q.get('startTime') ? +q.get('startTime') : null));
  }
  if (h === 'api.coingecko.com') {
    if (p === '/api/v3/coins/markets') { const ids = q.get('ids'); const list = ids ? ids.split(',') : [...Object.values(CG), 'tether', 'usd-coin', ...Array.from({ length: 60 }, (_, i) => 'altcoin-' + i)]; return json(list.map(cgMarket)); }
    if (p === '/api/v3/global') return json({ data: { total_market_cap: { usd: 2.71e12 }, total_volume: { usd: 1.05e11 }, market_cap_percentage: { btc: 59.8, eth: 13.8, usdt: 6.8, xrp: 4.9, bnb: 3.1, sol: 2.9, usdc: 2.7, doge: 1.0 }, market_cap_change_percentage_24h_usd: -1.4, active_cryptocurrencies: 17654, updated_at: Math.floor(NOW() / 1000) } });
    if (p === '/api/v3/global/decentralized_finance_defi') return json({ data: { defi_market_cap: '120520026123.6', eth_market_cap: '296779353841.3', defi_dominance: '4.24', trading_volume_24h: '5829755142.2', top_coin_name: 'Lido Staked Ether' } });
    if (p === '/api/v3/search/trending') return json({ coins: Array.from({ length: 7 }, (_, i) => ({ item: { id: 'trend-' + i, name: 'Trend Coin ' + i, symbol: 'TR' + i, market_cap_rank: 100 + i, small: `https://assets.test/logo/t${i}.png`, data: { price: 0.01 * (i + 1), price_change_percentage_24h: { usd: 30 - i * 9 } } } })) });
    if (p === '/api/v3/search') return json({ coins: [{ id: 'kaspa', name: 'Kaspa', symbol: 'KAS', market_cap_rank: 40, thumb: 'https://assets.test/logo/kaspa.png', large: 'https://assets.test/logo/kaspa.png' }] });
    if (p.startsWith('/api/v3/companies/public_treasury/')) return json({ total_holdings: 1302063, total_value_usd: 1.06e11, market_cap_dominance: 6.2, companies: [{ name: 'Strategy', symbol: 'MSTR.US', country: 'US', total_holdings: 848250, total_entry_value_usd: 64536394091, total_current_value_usd: 6.9e10, percentage_of_total_supply: 4.039 }, { name: 'Metaplanet', symbol: '3350.T', country: 'JP', total_holdings: 44000, total_entry_value_usd: 3896249023, total_current_value_usd: 3.6e9, percentage_of_total_supply: 0.21 }, { name: 'Twenty One', symbol: 'XXI.US', country: 'US', total_holdings: 43514, total_entry_value_usd: 0, total_current_value_usd: 3.5e9, percentage_of_total_supply: 0.207 }, { name: 'Empresa BR', symbol: 'MELI.US', country: 'BR', total_holdings: 570, total_entry_value_usd: 4.0e7, total_current_value_usd: 4.6e7, percentage_of_total_supply: 0.003 }] });
    const mc = p.match(/^\/api\/v3\/coins\/([^/]+)\/market_chart$/);
    if (mc) { const days = +q.get('days') || 30; return json({ prices: Array.from({ length: days }, (_, i) => [NOW() - (days - i) * DAY, 0.07 * (1 + Math.sin(i / 5) * 0.1)]) }); }
    const co = p.match(/^\/api\/v3\/coins\/([^/]+)$/);
    if (co) { const m = cgMarket(co[1], 30); return json({ id: co[1], symbol: m.symbol, name: m.name, market_cap_rank: 30, image: { large: m.image }, market_data: { current_price: { usd: m.current_price }, market_cap: { usd: m.market_cap }, fully_diluted_valuation: { usd: m.current_price * 1e10 }, total_volume: { usd: m.total_volume }, circulating_supply: 3.1e9, total_supply: 1e10, max_supply: 1e10, ath: { usd: m.current_price * 2.5 }, ath_date: { usd: '2024-12-16T00:00:00.000Z' }, price_change_percentage_24h: 2.1 } }); }
  }
  if (h === 'api.alternative.me') return json({ data: Array.from({ length: 31 }, (_, i) => { const v = Math.round(53 - i * 0.9 + Math.sin(i) * 6); return { value: String(v), value_classification: v < 25 ? 'Extreme Fear' : v < 46 ? 'Fear' : v < 55 ? 'Neutral' : v < 76 ? 'Greed' : 'Extreme Greed', timestamp: String(Math.floor((Math.floor(NOW() / DAY) * DAY - i * DAY) / 1000)) }; }) });
  if (h === 'economia.awesomeapi.com.br') return json({ USDBRL: { bid: '5.4523', pctChange: '-0.31', timestamp: String(Math.floor(NOW() / 1000)) }, EURBRL: { bid: '6.3412', pctChange: '0.12' }, EURUSD: { bid: '1.1630', pctChange: '0.2' }, GBPBRL: { bid: '7.2950', pctChange: '-0.05' } });
  if (h === 'api.gold-api.com') return json({ price: p.endsWith('XAU') ? 4161.3 : 51.42, updatedAt: new Date().toISOString() });
  if (h === 'stablecoins.llama.fi') return json({ peggedAssets: [{ symbol: 'USDT', circulating: { peggedUSD: 183.7e9 }, circulatingPrevDay: { peggedUSD: 183.9e9 }, circulatingPrevWeek: { peggedUSD: 184.1e9 }, circulatingPrevMonth: { peggedUSD: 183.2e9 } }, { symbol: 'USDC', circulating: { peggedUSD: 74e9 }, circulatingPrevDay: { peggedUSD: 73.8e9 }, circulatingPrevWeek: { peggedUSD: 73e9 }, circulatingPrevMonth: { peggedUSD: 72e9 } }, { symbol: 'USDe', circulating: { peggedUSD: 14e9 }, circulatingPrevDay: { peggedUSD: 14e9 }, circulatingPrevWeek: { peggedUSD: 14.2e9 }, circulatingPrevMonth: { peggedUSD: 13e9 } }] });
  if (h === 'api.llama.fi') {
    if (p === '/hacks') return json([{ date: 1700000000, name: 'Ondo Finance', classification: 'Protocol Logic', technique: 'Teste', amount: 1200000, chain: ['Ethereum'], returnedFunds: null }, { date: 1650000000, name: 'Outro Protocolo', classification: 'Infra', technique: 'Teste', amount: 5e6, chain: ['BSC'] }]);
    if (p.startsWith('/summary/fees/ondo-finance')) return json({ total24h: 41000, total7d: 290000, total30d: 1.2e6, total1y: 14e6, change_1d: 2.1 });
    if (p.startsWith('/summary/fees/')) return json({ message: 'not found' }, 404);
  }
  if (h === 'mempool.space' || h === 'blockstream.info') {
    if (p.endsWith('/blocks/tip/height')) return text('971600');
    if (p.endsWith('/v1/difficulty-adjustment')) return json({ progressPercent: 94.2, difficultyChange: 6.6, estimatedRetargetDate: NOW() + 18 * 3600e3, remainingBlocks: 112, remainingTime: 6.5e7, timeAvg: 563061, nextRetargetHeight: 971712 });
    if (p.endsWith('/v1/mining/hashrate/3d')) return json({ hashrates: [], currentHashrate: 1.03e21, currentDifficulty: 1.327e14 });
    if (p.endsWith('/v1/fees/recommended')) return json({ fastestFee: 5, halfHourFee: 4, hourFee: 2, economyFee: 1, minimumFee: 1 });
    if (p.endsWith('/mempool')) return json({ count: 84390, vsize: 41066851, total_fee: 16938235 });
  }
  if (h === 'community-api.coinmetrics.io') {
    const start = q.get('start_time'); const now = Math.floor(NOW() / DAY) * DAY - DAY;
    const days = start ? Math.floor((now - Date.parse(start)) / DAY) + 1 : +q.get('page_size') || 8;
    const data = Array.from({ length: days }, (_, i) => { const t = now - (days - 1 - i) * DAY; const k = i / days; const pr = start ? Math.max(5, 81500 * Math.pow(k, 3.2) * (1 + 0.25 * Math.sin(i / 120))) : 81000 + i * 60; return { asset: 'btc', time: new Date(t).toISOString().replace('.000Z', '.000000000Z'), PriceUSD: String(pr), CapMVRVCur: String(1.2 + 0.9 * Math.sin(i / 200) + 0.3), SplyCur: '20097763.6', AdrActCnt: '651256', TxCnt: '841198', HashRate: '1075367762.3' }; });
    return json({ data });
  }
  if (h === 'bitcoin-data.com') {
    if (p === '/v1/cvdd/last') return json({ d: iso(NOW() - DAY), cvdd: 13947.11 });
    if (p === '/v1/sth-mvrv/last') return json({ d: iso(NOW() - 7 * DAY), sthMvrv: 1.0997, delayed: true });
    if (p === '/v1/cvdd') return json(Array.from({ length: 1460 }, (_, i) => ({ d: iso(NOW() - (1460 - i) * DAY), cvdd: 4600 + i * 6.4 })));
  }
  if (h === 'markets.newyorkfed.org') {
    if (p.includes('/last/1')) return json({ refRates: [{ effectiveDate: iso(NOW() - DAY), type: 'EFFR', percentRate: 3.88, targetRateFrom: 3.75, targetRateTo: 4.0 }] });
    const s = Date.parse(q.get('startDate')), e = Date.parse(q.get('endDate')); const out = [];
    for (let t = e; t >= s; t -= DAY) { const d = new Date(t); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; const f = fedOn(iso(t)); out.push({ effectiveDate: iso(t), type: 'EFFR', percentRate: f[1] + 0.13, targetRateFrom: f[1], targetRateTo: f[2] }); }
    return json({ refRates: out });
  }
  if (h === 'api.bcb.gov.br') {
    const n = (p.match(/sgs\.(\d+)/) || [])[1];
    const last = (p.match(/ultimos\/(\d+)/) || [])[1];
    let from, to;
    if (last) { to = NOW() + (n === '432' ? 20 * DAY : 0); from = to - (+last - 1) * (n === '13522' ? 30 * DAY : DAY); }
    else { from = parseBr(q.get('dataInicial')); to = parseBr(q.get('dataFinal')); }
    const out = [];
    if (n === '13522') { for (let t = from; t <= to; t += 30 * DAY) { const d = new Date(t); out.push({ data: `01/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`, valor: (4.2 + Math.sin(t / 1e9) * 0.4).toFixed(2) }); } }
    else for (let t = from; t <= to; t += DAY) out.push({ data: br(t), valor: n === '432' ? selicOn(iso(t)).toFixed(2) : n === '4389' ? '13.65' : (5.3 + Math.sin(t / 5e9) * 0.3).toFixed(4) });
    return json(out);
  }
  if (h === 'olinda.bcb.gov.br') { const y = new Date().getFullYear(); return json({ value: [{ Indicador: 'IPCA', Data: iso(NOW() - 5 * DAY), DataReferencia: String(y), Mediana: 5.22 }, { Indicador: 'IPCA', Data: iso(NOW() - 5 * DAY), DataReferencia: String(y + 1), Mediana: 4.3 }, { Indicador: 'Selic', Data: iso(NOW() - 5 * DAY), DataReferencia: String(y), Mediana: 13.75 }, { Indicador: 'Selic', Data: iso(NOW() - 5 * DAY), DataReferencia: String(y + 1), Mediana: 12.25 }] }); }
  if (h === 'servicodados.ibge.gov.br') { const it = (d, t, prod) => ({ id: Math.round(d * 1000), titulo: t, nome_produto: prod, data_divulgacao: br(NOW() + d * DAY).replace(/$/, ' 12:00:00'), descricao: '' }); return json({ items: [it(9, 'Índice Nacional de Preços ao Consumidor Amplo', 'IPCA'), it(12, 'Índice Nacional de Preços ao Consumidor Amplo 15', 'IPCA-15'), it(20, 'Pesquisa Nacional por Amostra de Domicílios Contínua Mensal', 'pnad'), it(3, 'Pesquisa Mensal de Comércio', 'pmc')] }); }
  if (h === 'gamma-api.polymarket.com') return json(pmEvents(q.get('tag_slug')));
  if (h === 'api.rss2json.com') return json(rssFor(q.get('rss_url')));
  if (h === 'raw.githubusercontent.com') {
    const name = (p.match(/\/data\/([a-z]+)\.json$/) || [])[1];
    const d = opts.pipeline !== false && name ? pipeline(name) : null;
    return d ? { ...json(d), headers: { 'access-control-allow-origin': '*' } } : { status: 404, contentType: 'text/plain', body: '404: Not Found', headers: { 'access-control-allow-origin': '*' } };
  }
  if (/\.supabase\.co$/.test(h) && p === '/rest/v1/rpc/ping') { if (opts.pings) opts.pings.push(method); return json({ ok: true, server_time: new Date().toISOString() }); }
  if (/\.supabase\.co$/.test(h) && opts.supabase) return opts.supabase.handle(url, method, body, opts.headers || {});
  return null;
}
