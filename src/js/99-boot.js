// =====================================================================
// Faixa de cotações (ticker) e inicialização do app.
// A faixa mostra as principais moedas ao vivo e os destaques do Top 100 nas últimas 24 h
// (maiores altas e baixas, sem stablecoins). Ela rola sempre (o usuário pode parar em Configurações).
// =====================================================================
const TICK = { built: '', t: 0, rebuilt: 0 };
const TICK_MAJORS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const STABLE_CG = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde', 'usds', 'paypal-usd', 'true-usd', 'frax', 'usdd', 'binance-usd', 'tether-gold', 'pax-gold', 'usd1-wlfi', 'ripple-usd', 'global-dollar', 'usdtb', 'falcon-finance', 'blackrock-usd-institutional-digital-liquidity-fund', 'ondo-us-dollar-yield', 'susds', 'ethena-staked-usde', 'eurc', 'gemini-dollar']);
function tickerMovers() {
  const c = CACHE.get('top100'); if (!c || !Array.isArray(c.v)) return { up: [], down: [] };
  const rows = c.v.filter((m) => !STABLE_CG.has(m.id) && !(m.current_price > 0.97 && m.current_price < 1.03 && Math.abs(num(m.price_change_percentage_7d_in_currency) || 0) < 1.5)).map((m) => {
    const u = BY_CG[m.id]; const live = u && PX[u.s];
    return { k: 'cg:' + m.id, cg: m.id, sym: (m.symbol || '').toUpperCase(), logo: m.image, n: m.name, p: live ? live.p : num(m.current_price), chg: live ? live.chg : num(m.price_change_percentage_24h_in_currency ?? m.price_change_percentage_24h), to: u ? { s: u.s } : null };
  }).filter((r) => isNum(r.chg) && isNum(r.p));
  rows.sort((a, b) => b.chg - a.chg);
  return { up: rows.slice(0, 8), down: rows.slice(-6).reverse() };
}
function tickerItems() {
  const items = [];
  for (const s of TICK_MAJORS) { const c = BY_SYM[s]; if (c && PX[s]) items.push({ k: s, logo: LOGOS[c.cg], c, sym: c.b, p: PX[s].p, chg: PX[s].chg, to: { s } }); }
  const mv = tickerMovers();
  if (mv.up.length) { items.push({ k: 'lbl:up', label: L('Maiores altas 24h', 'Top gainers 24h'), dir: 'up' }); mv.up.forEach((x) => items.push(x)); }
  if (mv.down.length) { items.push({ k: 'lbl:down', label: L('Maiores baixas 24h', 'Top losers 24h'), dir: 'down' }); mv.down.forEach((x) => items.push(x)); }
  if (!mv.up.length) liveCoins().filter((c) => PX[c.s] && !TICK_MAJORS.includes(c.s)).slice(0, 12).forEach((c) => items.push({ k: c.s, logo: LOGOS[c.cg], c, sym: c.b, p: PX[c.s].p, chg: PX[c.s].chg, to: { s: c.s } }));
  const r = brlRate();
  if (r) items.push({ k: 'USDBRL', sym: L('Dólar', 'USD/BRL'), txt: brl(r.v, [3, 3]), chg: FX.chg.usdbrl });
  if (METAL.xau) items.push({ k: 'XAU', sym: L('Ouro', 'Gold'), txt: usd(METAL.xau, [0, 0]) });
  if (METAL.xag) items.push({ k: 'XAG', sym: L('Prata', 'Silver'), txt: usd(METAL.xag, [2, 2]) });
  return items;
}
function tickItemHtml(x) {
  if (x.label) return `<span class="tk tk-lbl ${x.dir}" data-k="${esc(x.k)}">${ico(x.dir === 'up' ? 'trending-up' : 'trending-down', 15)}${esc(x.label)}</span>`;
  const logo = x.c ? coinLogo({ ...x.c, logo: x.logo }, 18) : x.cg ? coinLogo({ b: x.sym, logo: x.logo, cg: x.cg }, 18) : '';
  const link = x.to ? ` data-act="go" data-to="chart" data-params='${esc(JSON.stringify(x.to))}' role="link" tabindex="-1"` : x.cg ? ` data-act="go" data-to="top100" role="link" tabindex="-1"` : '';
  return `<span class="tk" data-k="${esc(x.k)}"${link}>${logo.replace('class="coin-logo"', 'class="coin-logo tk-logo"').replace('class="coin-fb"', 'class="coin-fb tk-logo"')}<span class="tk-sym">${esc(x.sym)}</span><span class="tk-p">${esc(x.txt || usd(x.p))}</span>${isNum(x.chg) ? `<span class="tk-c ${tone(x.chg)}">${esc(fmtPct(x.chg))}</span>` : ''}</span>`;
}
function buildTicker() {
  const tr = $('#tk-track'); if (!tr) return;
  const items = tickerItems(); if (items.length < 3) return;
  const sig = items.map((x) => x.k).join(',');
  if (sig === TICK.built) return;
  TICK.built = sig; TICK.rebuilt = Date.now();
  const one = items.map(tickItemHtml).join('');
  tr.innerHTML = one + one.replace(/data-act="go"/g, 'data-act="go" aria-hidden="true"'); // repetido para rolar sem emenda
  // velocidade constante (~55 px/s), qualquer que seja a quantidade de itens
  requestAnimationFrame(() => { const w = tr.scrollWidth / 2; tr.style.setProperty('--tk-dur', `${Math.max(30, Math.round(w / 55))}s`); });
}
function updTicker(set) {
  if (Date.now() - TICK.t < 1000) return; TICK.t = Date.now();
  const items = tickerItems();
  // reconstruir faz a faixa "pular": só quando a lista muda e no máximo a cada 3 min (ou se ainda não montou)
  const sig = items.map((x) => x.k).join(',');
  if (sig !== TICK.built && (!TICK.built || (sig.includes('lbl:up') && !TICK.built.includes('lbl:up')) || Date.now() - TICK.rebuilt > 180000)) buildTicker();
  const byK = Object.fromEntries(items.map((x) => [x.k, x]));
  $$('#tk-track .tk').forEach((el) => {
    const x = byK[el.dataset.k]; if (!x || x.label) return;
    if (x.c && set && !set.has(x.k) && !set.has('TOP100')) return;
    const p = el.querySelector('.tk-p'), c = el.querySelector('.tk-c');
    const txt = x.txt || usd(x.p); if (p && p.textContent !== txt) p.textContent = txt;
    if (c && isNum(x.chg)) { const t = fmtPct(x.chg); if (c.textContent !== t) c.textContent = t; c.className = 'tk-c ' + tone(x.chg); }
  });
}
function applyTickerMotion() { document.body.classList.toggle('tk-still', LS.get('tickerMotion', 'roll') === 'still'); }
onPrice((set) => { updTicker(set); updHeaderBtc(); });

// ---------- inicialização ----------
let _booted = false;
function hideBoot() { const b = $('#boot'); if (b && !b.classList.contains('hide')) { b.classList.add('hide'); setTimeout(() => b.remove(), 400); } }
function boot() {
  if (_booted) return; _booted = true;
  const lang = LS.get('lang'); S.lang = lang === 'en' ? 'en' : 'pt';
  document.documentElement.lang = S.lang === 'en' ? 'en' : 'pt-BR';
  $$('.lang-sw button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.lang)));
  applyTheme(LS.get('theme', 'dark'));
  if (window.innerWidth > 900 && LS.get('sb-mini', false)) setSbMini(true); else setSbMini(false);
  if (LS.get('ticker', true) === false) document.body.classList.add('no-ticker');
  applyTickerMotion();
  buildHeaderLabels(); updClock();
  // fontes de dados
  registerPriceSources(); registerSharedSources(); registerDashSources(); registerTop100Sources(); registerMarketSources();
  registerOnchainSources(); registerLabSources(); registerBuybackSources(); registerEtfSources(); registerWhaleSources(); registerMacroSources(); registerNewsSources();
  buildSidebar();
  accountBoot();
  setTimeout(dbHeartbeat, 6000);
  renderInstallUI();
  if (isStandalone()) document.body.classList.add('standalone');
  // preços: foto imediata pelo REST e depois o WebSocket (pares conferidos)
  runSource('px-rest', { force: true }).then(() => { buildTicker(); hideBoot(); });
  validateUniverse().catch(() => {}).finally(() => wsStart());
  const { id, params } = parseHash(); showPage(id, params);
  setTimeout(hideBoot, 1500);
  // relógios
  setInterval(schedTick, 1000);
  setInterval(() => { updClock(); tickCountdowns(); }, 1000);
  setInterval(stampsRefresh, 5000);
  setInterval(wsWatchdog, 5000);
  setInterval(() => { if (!document.hidden) nxAudit(); }, 5 * 60e3);
  setTimeout(nxAudit, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; refreshStale(); stampsRefresh(); if (!WSS.ok || Date.now() - WSS.last > 25000) wsStart(); });
  window.addEventListener('online', () => { toast(L('Conexão de volta. Atualizando…', 'Back online. Refreshing…'), { type: 'ok', ms: 2500 }); refreshStale(); wsStart(); });
  window.addEventListener('offline', () => toast(L('Sem internet: mostrando os últimos valores lidos, com o horário de cada um.', 'Offline: showing last values read, each with its time.'), { type: 'warn', ms: 6000 }));
  window.addEventListener('resize', debounce(() => { if (window.innerWidth <= 900) document.body.classList.remove('sb-mini'); else if (LS.get('sb-mini', false)) document.body.classList.add('sb-mini'); }, 200));
  // PWA (só nesta pasta; nunca guarda dados de mercado)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('error', (e) => { console.error('[NX] erro', e.message, e.filename, e.lineno); });
window.addEventListener('unhandledrejection', (e) => { console.warn('[NX] promessa sem tratamento', e.reason); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
