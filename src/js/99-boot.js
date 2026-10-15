// =====================================================================
// Faixa de cotações (ticker) e inicialização do app.
// =====================================================================
const TICK = { built: '', t: 0 };
function tickerItems() {
  const items = liveCoins().filter((c) => PX[c.s]).map((c) => ({ k: c.s, logo: LOGOS[c.cg], c, sym: c.b, p: PX[c.s].p, chg: PX[c.s].chg, to: { s: c.s } }));
  const r = brlRate();
  if (r) items.push({ k: 'USDBRL', sym: L('Dólar', 'USD/BRL'), txt: brl(r.v, [3, 3]), chg: FX.chg.usdbrl });
  if (METAL.xau) items.push({ k: 'XAU', sym: L('Ouro', 'Gold'), txt: usd(METAL.xau, [0, 0]) });
  if (METAL.xag) items.push({ k: 'XAG', sym: L('Prata', 'Silver'), txt: usd(METAL.xag, [2, 2]) });
  return items;
}
function tickItemHtml(x) {
  const logo = x.c ? coinLogo({ ...x.c, logo: x.logo }, 16).replace('class="coin-logo"', 'class="coin-logo tk-logo"').replace('class="coin-fb"', 'class="coin-fb tk-logo"') : '';
  return `<span class="tk" data-k="${esc(x.k)}"${x.to ? ` data-act="go" data-to="chart" data-params='${esc(JSON.stringify(x.to))}' role="link" tabindex="-1"` : ''}>${logo}<span class="tk-sym">${esc(x.sym)}</span><span class="tk-p">${esc(x.txt || usd(x.p))}</span>${isNum(x.chg) ? `<span class="tk-c ${tone(x.chg)}">${esc(fmtPct(x.chg))}</span>` : ''}</span>`;
}
function buildTicker() {
  const tr = $('#tk-track'); if (!tr) return;
  const items = tickerItems(); if (items.length < 3) return;
  const sig = items.map((x) => x.k).join(',');
  if (sig === TICK.built) return;
  TICK.built = sig;
  const one = items.map(tickItemHtml).join('');
  tr.innerHTML = one + one.replace(/data-act="go"/g, 'data-act="go" aria-hidden="true"'); // repetido para rolar sem emenda
  tr.style.setProperty('--tk-dur', `${Math.max(40, items.length * 3.2)}s`);
}
function updTicker(set) {
  if (Date.now() - TICK.t < 1000) return; TICK.t = Date.now();
  const items = tickerItems();
  if (items.map((x) => x.k).join(',') !== TICK.built) { if (Date.now() - (TICK.rebuilt || 0) > 60000 || !TICK.built) { TICK.rebuilt = Date.now(); buildTicker(); } }
  const byK = Object.fromEntries(items.map((x) => [x.k, x]));
  $$('#tk-track .tk').forEach((el) => {
    const x = byK[el.dataset.k]; if (!x) return;
    if (x.c && set && !set.has(x.k)) return;
    const p = el.querySelector('.tk-p'), c = el.querySelector('.tk-c');
    const txt = x.txt || usd(x.p); if (p && p.textContent !== txt) p.textContent = txt;
    if (c && isNum(x.chg)) { const t = fmtPct(x.chg); if (c.textContent !== t) c.textContent = t; c.className = 'tk-c ' + tone(x.chg); }
  });
}
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
  buildHeaderLabels(); updClock();
  // fontes de dados
  registerPriceSources(); registerSharedSources(); registerDashSources(); registerTop100Sources(); registerMarketSources();
  registerOnchainSources(); registerLabSources(); registerEtfSources(); registerWhaleSources(); registerMacroSources(); registerNewsSources();
  buildSidebar();
  accountBoot();
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
