// =====================================================================
// Preços ao vivo (Binance WebSocket + REST de segurança), câmbio, metais,
// logos/sparklines (CoinGecko) e moedas extras escolhidas pelo usuário.
// Uma única fonte por ativo em todo o site: o mesmo número em todas as páginas.
// =====================================================================
const PX = {};                  // 'BTCUSDT' → { p, o, chg, hi, lo, qv, ts, src }
let LOGOS = LS.get('logos', {}); // id CoinGecko → url do logo
const CGM = {};                 // id CoinGecko → linha de /coins/markets (mcap, sparkline, variações)
const XP = {};                  // moedas extras (fora da Binance): id CoinGecko → { p, chg, ts }
const FX = { usdbrl: null, eurbrl: null, eurusd: null, gbpbrl: null, chg: {}, ts: 0, src: '' };
const METAL = { xau: null, xag: null, ts: 0, src: '', xauChg: null };
const WSS = { ok: false, ws: null, fails: 0, last: 0, host: 0, polling: false };
let VALID = new Set(LS.get('binance:valid', { list: UNIVERSE.map((c) => c.s) }).list);
const _priceSubs = new Set();
const _dirty = new Set();
let _flushQueued = false;
function onPrice(fn) { _priceSubs.add(fn); return () => _priceSubs.delete(fn); }
function _flush() {
  _flushQueued = false;
  if (!_dirty.size) return;
  const syms = new Set(_dirty); _dirty.clear();
  _priceSubs.forEach((fn) => { try { fn(syms); } catch (e) { console.warn('[NX] onPrice', e); } });
}
function _markDirty(sym) { _dirty.add(sym); if (!_flushQueued) { _flushQueued = true; requestAnimationFrame(_flush); } }

const liveCoins = () => UNIVERSE.filter((c) => VALID.has(c.s));
const streamSyms = () => [...liveCoins().map((c) => c.s), ...AUX_PAIRS];

// ---------- confere quais pares estão negociando (a cada 24 h) ----------
async function validateUniverse() {
  const cached = LS.get('binance:valid');
  if (cached && Date.now() - cached.ts < 24 * 3600e3) return;
  const syms = [...UNIVERSE.map((c) => c.s), ...AUX_PAIRS];
  for (const base of ['https://api.binance.com', 'https://data-api.binance.vision']) {
    try {
      const j = await getJSON(`${base}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(syms))}`, { timeout: 12000 });
      const ok = (j.symbols || []).filter((s) => s.status === 'TRADING').map((s) => s.symbol);
      if (ok.length > 10) {
        VALID = new Set(ok);
        LS.set('binance:valid', { ts: Date.now(), list: ok });
        return;
      }
    } catch (e) { /* tenta o próximo servidor */ }
  }
}

function _applyTicker(t, src) {
  const p = num(t.lastPrice ?? t.c), o = num(t.openPrice ?? t.o);
  if (p === null || p <= 0) return;
  const closeT = num(t.closeTime ?? t.C);
  // par parado (sem negociação há mais de 15 min) não é "ao vivo": fica fora
  if (closeT && Date.now() - closeT > 15 * 60e3 && src === 'rest') { delete PX[t.symbol ?? t.s]; return; }
  const sym = t.symbol ?? t.s;
  // o REST de segurança não sobrescreve um preço mais novo vindo do WebSocket
  if (src === 'rest' && PX[sym] && PX[sym].src === 'ws' && Date.now() - PX[sym].seen < 15000) return;
  const prev = PX[sym] ? PX[sym].p : null;
  PX[sym] = {
    p, o, prev,
    chg: num(t.priceChangePercent ?? t.P) ?? (o ? ((p - o) / o) * 100 : null),
    hi: num(t.highPrice ?? t.h), lo: num(t.lowPrice ?? t.l), qv: num(t.quoteVolume ?? t.q),
    ts: closeT || Date.now(), seen: Date.now(), src,
  };
  _markDirty(sym);
}

async function priceSnapshot() {
  const syms = streamSyms();
  let lastErr;
  for (const base of ['https://api.binance.com', 'https://data-api.binance.vision']) {
    try {
      const arr = await getJSON(`${base}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(syms))}`, { timeout: 10000 });
      if (!Array.isArray(arr)) throw new Error('formato');
      arr.forEach((t) => _applyTicker(t, 'rest'));
      return arr.length;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('binance');
}

// ---------- WebSocket ----------
const WS_HOSTS = ['wss://stream.binance.com:9443', 'wss://data-stream.binance.vision'];
function wsStart() {
  try { if (WSS.ws) { WSS.ws.onclose = null; WSS.ws.close(); } } catch { /* */ }
  const url = `${WS_HOSTS[WSS.host % WS_HOSTS.length]}/stream?streams=${streamSyms().map((s) => s.toLowerCase() + '@ticker').join('/')}`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { return wsRetry(); }
  WSS.ws = ws;
  ws.onopen = () => { WSS.ok = true; WSS.fails = 0; WSS.last = Date.now(); WSS.polling = false; liveStatus(); };
  ws.onmessage = (ev) => {
    WSS.last = Date.now();
    try { const m = JSON.parse(ev.data); if (m && m.data && m.data.s) _applyTicker(m.data, 'ws'); } catch { /* ignora quadro inválido */ }
  };
  ws.onerror = () => { try { ws.close(); } catch { /* */ } };
  ws.onclose = () => { WSS.ok = false; liveStatus(); wsRetry(); };
}
function wsRetry() {
  WSS.fails++; WSS.host++;
  if (WSS.fails >= 3) WSS.polling = true; // sem WebSocket: o REST de segurança passa a cada 10 s
  const wait = Math.min(30000, 1000 * 2 ** Math.min(WSS.fails, 5)) * (0.8 + Math.random() * 0.4);
  clearTimeout(WSS.timer);
  WSS.timer = setTimeout(() => { if (!document.hidden) wsStart(); }, wait);
}
function wsWatchdog() {
  if (document.hidden) return;
  if (WSS.ok && Date.now() - WSS.last > 25000) { try { WSS.ws.close(); } catch { /* */ } }
  liveStatus();
}
function liveStatus() {
  const el = $('#live-pill'); if (!el) return;
  const fresh = WSS.ok && Date.now() - WSS.last < 20000;
  const restFresh = HEALTH['px-rest'] && HEALTH['px-rest'].ts && Date.now() - HEALTH['px-rest'].ts < 90000;
  el.classList.toggle('on', fresh);
  el.classList.toggle('warn', !fresh && !!restFresh);
  const txt = fresh ? L('Ao vivo', 'Live') : restFresh ? L('Atualizando', 'Updating') : L('Conectando', 'Connecting');
  const t = el.querySelector('.txt'); if (t) t.textContent = txt;
  el.title = fresh ? L('Preços em tempo real (Binance WebSocket)', 'Real-time prices (Binance WebSocket)')
    : restFresh ? L('WebSocket indisponível: preços por consulta a cada 10 s', 'WebSocket down: polling every 10 s')
      : L('Conectando à Binance…', 'Connecting to Binance…');
}

// ---------- câmbio ----------
function brlRate() {
  if (FX.usdbrl) return { v: FX.usdbrl, src: FX.src };
  const u = PX.USDTBRL; if (u && u.p) return { v: u.p, src: 'USDT/BRL Binance' };
  return null;
}
const toBRL = (usdv) => { const r = brlRate(); return r && isNum(usdv) ? usdv * r.v : null; };

// ---------- preço de qualquer ativo ----------
// chave: par Binance ('BTCUSDT'), símbolo base ('BTC') ou id CoinGecko ('bitcoin')
function priceOf(key) {
  if (!key) return null;
  const c = BY_SYM[key] || BY_BASE[String(key).toUpperCase()] || BY_CG[key];
  if (c && PX[c.s]) return { p: PX[c.s].p, chg: PX[c.s].chg, ts: PX[c.s].seen, src: 'Binance', live: true };
  if (PX[key]) return { p: PX[key].p, chg: PX[key].chg, ts: PX[key].seen, src: 'Binance', live: true };
  const id = c ? c.cg : key;
  if (XP[id]) return { p: XP[id].p, chg: XP[id].chg, ts: XP[id].ts, src: 'CoinGecko', live: false };
  if (CGM[id] && isNum(CGM[id].current_price)) return { p: CGM[id].current_price, chg: CGM[id].price_change_percentage_24h, ts: CGM[id]._ts, src: 'CoinGecko', live: false };
  return null;
}

// ---------- registro das fontes de preço ----------
function registerPriceSources() {
  source({
    id: 'px-rest', label: 'Preços (REST)', provider: 'Binance', every: 60000, persist: false,
    run: priceSnapshot,
    need: () => true,
    onData: () => liveStatus(),
  });
  // se o WebSocket cair, o REST passa a 10 s
  setInterval(() => { if (WSS.polling && !document.hidden) runSource('px-rest', { force: true }); }, 10000);
  source({
    id: 'fx', label: L('Câmbio', 'FX'), provider: 'AwesomeAPI', every: 60000,
    run: async () => {
      const j = await getJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,EUR-USD,GBP-BRL', { timeout: 10000 });
      const g = (k) => j[k] && num(j[k].bid);
      const out = { usdbrl: g('USDBRL'), eurbrl: g('EURBRL'), eurusd: g('EURUSD'), gbpbrl: g('GBPBRL'),
        chg: { usdbrl: num(j.USDBRL?.pctChange), eurbrl: num(j.EURBRL?.pctChange), eurusd: num(j.EURUSD?.pctChange), gbpbrl: num(j.GBPBRL?.pctChange) },
        dataTs: (num(j.USDBRL?.timestamp) || 0) * 1000 };
      return out;
    },
    validate: (d) => d.usdbrl > 1 && d.usdbrl < 50,
    onData: (d) => { Object.assign(FX, d, { ts: Date.now(), src: 'AwesomeAPI' }); _markDirty('FX'); },
    onError: async () => { // reserva: taxa diária do ExchangeRate-API (rotulada como diária)
      if (FX.usdbrl && Date.now() - FX.ts < 3600e3) return;
      try {
        const j = await getJSON('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
        if (j && j.rates && j.rates.BRL > 1) {
          Object.assign(FX, { usdbrl: j.rates.BRL, eurusd: j.rates.EUR ? 1 / j.rates.EUR : null, eurbrl: j.rates.EUR ? j.rates.BRL / j.rates.EUR : null, gbpbrl: j.rates.GBP ? j.rates.BRL / j.rates.GBP : null, chg: {}, ts: Date.now(), src: 'ExchangeRate-API (diária)' });
          _markDirty('FX');
        }
      } catch { /* sem câmbio: valores em R$ mostram "—" */ }
    },
  });
  source({
    id: 'metals', label: L('Ouro e prata', 'Gold & silver'), provider: 'gold-api.com', every: 120000,
    run: async () => {
      const [a, b] = await Promise.allSettled([getJSON('https://api.gold-api.com/price/XAU'), getJSON('https://api.gold-api.com/price/XAG')]);
      const xau = a.status === 'fulfilled' ? num(a.value.price) : null;
      const xag = b.status === 'fulfilled' ? num(b.value.price) : null;
      if (!xau && !xag) throw new Error('gold-api');
      return { xau, xag, at: a.value?.updatedAt || b.value?.updatedAt };
    },
    validate: (d) => (!d.xau || (d.xau > 300 && d.xau < 50000)) && (!d.xag || (d.xag > 3 && d.xag < 1000)),
    onData: (d) => { Object.assign(METAL, { xau: d.xau ?? METAL.xau, xag: d.xag ?? METAL.xag, ts: Date.now(), src: 'gold-api.com' }); _markDirty('METAL'); },
  });
  // logos, sparklines 7d, market cap e variações do universo (CoinGecko)
  source({
    id: 'cg-uni', label: L('Dados das moedas', 'Coin data'), provider: 'CoinGecko', every: 10 * 60e3, persist: false,
    run: async () => {
      const ids = [...UNIVERSE.map((c) => c.cg), ...CG_EXTRA_IDS].join(',');
      return getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&per_page=250&sparkline=true&price_change_percentage=1h,24h,7d,30d`, { timeout: 15000 });
    },
    validate: (a) => Array.isArray(a) && a.length > 10,
    onData: (arr) => {
      const ts = Date.now();
      arr.forEach((m) => { CGM[m.id] = { ...m, _ts: ts }; if (m.image) LOGOS[m.id] = m.image; });
      LS.set('logos', LOGOS);
      _markDirty('CGM');
    },
  });
  source({
    id: 'cg-extra', label: L('Moedas extras', 'Extra coins'), provider: 'CoinGecko', every: 60000,
    need: () => extraIds().length > 0,
    // /coins/markets traz preço, variação, logo e mini-gráfico de 7 dias numa chamada só
    run: async () => getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${extraIds().join(',')}&sparkline=true&price_change_percentage=24h,7d`, { timeout: 12000 }),
    validate: (a) => Array.isArray(a),
    onData: (arr) => {
      const ts = Date.now();
      arr.forEach((m) => {
        if (isNum(m.current_price)) XP[m.id] = { p: m.current_price, chg: num(m.price_change_percentage_24h), ts: Date.parse(m.last_updated) || ts };
        CGM[m.id] = { ...m, _ts: ts };
        if (m.image) LOGOS[m.id] = m.image;
      });
      _markDirty('XP');
    },
  });
}
// ids CoinGecko de moedas fora da Binance que o usuário acompanha (dashboard + vault)
const _extraSet = new Set();
function extraIds() { return [..._extraSet]; }
function trackExtra(id) { if (id && !BY_CG[id]) { const had = _extraSet.has(id); _extraSet.add(id); if (!had && SRC['cg-extra']) runSource('cg-extra', { force: true }); } }
