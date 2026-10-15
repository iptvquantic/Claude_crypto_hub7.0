// =====================================================================
// GRÁFICO — velas da Binance para qualquer moeda da lista, médias móveis,
// Bandas de Bollinger e volume. A última vela se move ao vivo.
// =====================================================================
const CH = { s: 'BTCUSDT', tf: '1d', ov: { ma20: true, ma50: true, ma200: true, bb: false, vol: true }, seq: 0, kl: [], cs: null, ch: null, intraday: false };
const CH_TF = [['15m', '15m'], ['1h', '1h'], ['4h', '4h'], ['1d', '1D'], ['1w', '1S'], ['1M', '1M']];
const CH_OV = [['ma20', 'MM 20', '#f4b43f'], ['ma50', 'MM 50', '#62b4ff'], ['ma200', 'MM 200', '#c084fc'], ['bb', 'Bollinger (20, 2)', '#8b97b2'], ['vol', 'Volume', '']];
function chartPrefs() {
  const p = LS.get('chart'); if (!p) return;
  if (p.s && BY_SYM[p.s]) CH.s = p.s;
  if (CH_TF.some(([v]) => v === p.tf)) CH.tf = p.tf;
  if (p.ov) Object.assign(CH.ov, p.ov);
}
const saveChartPrefs = () => LS.set('chart', { s: CH.s, tf: CH.tf, ov: CH.ov });
function chartHeadHtml() {
  const c = BY_SYM[CH.s]; const q = PX[CH.s];
  return `<button class="btn" data-act="chPick" style="height:46px;padding:0 14px 0 10px">${coinLogo({ ...c, logo: LOGOS[c.cg] }, 30)}<span style="text-align:left;line-height:1.2"><b style="display:block">${esc(c.n)}</b><span class="tiny faint">${esc(c.b)}/USDT · ${esc(L('trocar', 'change'))}</span></span>${ico('chevron-down', 16)}</button>
  <div class="row wrap" style="gap:6px 22px" id="ch-kpis">
    ${kpiBox(L('Preço', 'Price'), q ? esc(usd(q.p)) : '—', q ? chg(q.chg) + ' <span class="faint">24h</span>' : '', 'ch-k')}
    ${kpiBox(L('Máxima 24h', '24h high'), q ? esc(usd(q.hi)) : '—', '', 'ch-k')}
    ${kpiBox(L('Mínima 24h', '24h low'), q ? esc(usd(q.lo)) : '—', '', 'ch-k')}
    ${kpiBox(L('Volume 24h', '24h volume'), q ? esc(fmtCompact(q.qv)) : '—', '', 'ch-k')}
  </div>`;
}
function chartHtml() {
  const p = PAGES.chart;
  return `${pageHead(p, stamp('px-rest', 'Binance'))}
  <section class="panel">
    <div class="row wrap between" style="gap:14px" id="ch-head">${chartHeadHtml()}</div>
    <div class="row wrap between mt" style="gap:10px">
      <div class="seg-scroll">${seg('chtf', CH_TF.map(([v, l]) => [v, l]), CH.tf)}</div>
      <div class="row wrap" style="gap:6px" id="ch-ov">${CH_OV.map(([k, l, col]) => `<button class="btn xs ${CH.ov[k] ? '' : 'ghost'}" data-act="chOv" data-k="${k}" aria-pressed="${CH.ov[k]}">${col ? `<i style="width:10px;height:3px;border-radius:2px;background:${col};display:inline-block"></i>` : ico('chart-column', 14)}${esc(l)}</button>`).join('')}</div>
    </div>
    <div id="ch-legend" class="small faint mt" style="min-height:20px"></div>
    <div id="ch-box" style="height:clamp(340px,58vh,620px);margin-top:6px;position:relative"></div>
    ${note(L('Velas da Binance (par em USDT). Velas diárias, semanais e mensais seguem o dia UTC; as de 15 min a 4 h estão no seu horário. MM = média móvel simples dos fechamentos.', 'Binance candles (USDT pair). Daily, weekly and monthly candles follow the UTC day; 15m–4h are in your local time. MA = simple moving average of closes.'))}
  </section>`;
}
async function chartLoad() {
  const seq = ++CH.seq, box = $('#ch-box'); if (!box) return;
  if (!CH.cs) box.innerHTML = `<div class="skel" style="position:absolute;inset:0"></div>`;
  try {
    const kl = await klines(CH.s, CH.tf, CH.tf === '1M' ? 300 : 600);
    if (seq !== CH.seq) return;
    if (!kl.length) throw new Error(L('sem velas para este par', 'no candles for this pair'));
    CH.kl = kl.map((k) => ({ ...k }));
    await chartRender(seq);
  } catch (e) {
    if (seq !== CH.seq) return;
    CH.cs = null;
    box.innerHTML = emptyBox('wifi-off', L('Não foi possível carregar o gráfico', 'Could not load the chart'), esc(String(e.message || e)), `<button class="btn sm" data-act="chReload">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`);
  }
}
ACT.chReload = () => chartLoad();
async function chartRender(seq) {
  const box = $('#ch-box'); if (!box) return;
  const intraday = ['15m', '1h', '4h'].includes(CH.tf); CH.intraday = intraday;
  const { ch, c } = await makeChart(box, { intraday, onTheme: () => chartRender(CH.seq) });
  if (seq !== CH.seq) { ch.remove(); return; }
  CH.ch = ch;
  const kl = CH.kl, closes = kl.map((k) => k.c);
  const cs = ch.addCandlestickSeries({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false });
  cs.setData(kl.map((k) => ({ time: ctime(k.t, intraday), open: k.o, high: k.h, low: k.l, close: k.c })));
  CH.cs = cs;
  const line = (vals, color, opts = {}) => { const s = ch.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts }); s.setData(lineData(kl, vals, intraday)); return s; };
  const legendVals = {};
  for (const [k, n] of [['ma20', 20], ['ma50', 50], ['ma200', 200]]) {
    if (!CH.ov[k]) continue;
    const v = sma(closes, n); line(v, CH_OV.find((o) => o[0] === k)[2]); legendVals[k] = v;
  }
  if (CH.ov.bb) {
    const b = bollinger(closes, 20, 2); const col = cssVar('--text-3');
    line(b.up, col, { lineWidth: 1, lineStyle: 2 }); line(b.lo, col, { lineWidth: 1, lineStyle: 2 }); line(b.mid, col, { lineWidth: 1 });
    legendVals.bb = b;
  }
  if (CH.ov.vol) {
    const vs = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vs.setData(kl.map((k) => ({ time: ctime(k.t, intraday), value: k.qv, color: (k.c >= k.o ? c.up : c.down) + '50' })));
  }
  ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, kl.length - (intraday ? 160 : 180)), to: kl.length + 2 });
  const legend = (i) => {
    const k = kl[i]; if (!k) return;
    const prev = kl[i - 1];
    const parts = [`<b style="color:var(--text)">${esc(intraday ? fmtDateTime(k.t) : fmtDate(k.t, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b>`,
      `${L('Abr', 'O')} ${esc(fmtNum(k.o, ...priceDigits(k.o)))}`, `${L('Máx', 'H')} ${esc(fmtNum(k.h, ...priceDigits(k.h)))}`, `${L('Mín', 'L')} ${esc(fmtNum(k.l, ...priceDigits(k.l)))}`, `${L('Fch', 'C')} ${esc(fmtNum(k.c, ...priceDigits(k.c)))}`,
      prev ? `<span class="${tone(k.c - prev.c)}">${esc(fmtPct((k.c / prev.c - 1) * 100))}</span>` : ''];
    for (const [key, lbl, col] of CH_OV) {
      if (!legendVals[key] || key === 'bb') continue;
      const v = legendVals[key][i]; if (isNum(v)) parts.push(`<span style="color:${col}">${esc(lbl)} ${esc(fmtNum(v, ...priceDigits(v)))}</span>`);
    }
    if (legendVals.bb && isNum(legendVals.bb.up[i])) parts.push(`<span>BB ${esc(fmtNum(legendVals.bb.lo[i], ...priceDigits(legendVals.bb.lo[i])))} – ${esc(fmtNum(legendVals.bb.up[i], ...priceDigits(legendVals.bb.up[i])))}</span>`);
    setHTML('#ch-legend', parts.filter(Boolean).join(' &nbsp; '));
  };
  legend(kl.length - 1);
  ch.subscribeCrosshairMove((param) => {
    if (!param || param.time === undefined) { legend(kl.length - 1); return; }
    const i = kl.findIndex((k) => ctime(k.t, intraday) === param.time); if (i >= 0) legend(i);
  });
}
function chartLive() {
  const q = PX[CH.s]; if (!q || !CH.cs || !CH.kl.length) return;
  const last = CH.kl[CH.kl.length - 1];
  if (Date.now() > last.ct + 1500) { chartLoad(); return; } // vela fechou: busca a nova
  last.c = q.p; last.h = Math.max(last.h, q.p); last.l = Math.min(last.l, q.p);
  try { CH.cs.update({ time: ctime(last.t, CH.intraday), open: last.o, high: last.h, low: last.l, close: last.c }); } catch { /* gráfico recriado */ }
}
onPrice((set) => {
  if (S.page !== 'chart' || !set.has(CH.s)) return;
  setHTML('#ch-head', chartHeadHtml());
  chartLive();
});
ACT.seg_chtf = (v) => { CH.tf = v; saveChartPrefs(); CH.cs = null; chartLoad(); };
ACT.chOv = (el) => { const k = el.dataset.k; CH.ov[k] = !CH.ov[k]; el.setAttribute('aria-pressed', String(CH.ov[k])); el.classList.toggle('ghost', !CH.ov[k]); saveChartPrefs(); chartRender(CH.seq); };
ACT.chPick = () => openCoinPicker({ title: L('Escolher moeda do gráfico', 'Pick chart coin'), onPick: (p) => {
  if (p.kind !== 'b') { toast(L('Gráfico de velas disponível para moedas com par na Binance. Abrindo a página da moeda no CoinGecko.', 'Candle charts are available for coins with a Binance pair. Opening the CoinGecko page.'), { type: 'warn' }); window.open(`https://www.coingecko.com/pt/moedas/${encodeURIComponent(p.cg)}`, '_blank', 'noopener'); return; }
  go('chart', { s: p.s });
} });
page({
  id: 'chart', group: 'mercado', icon: 'chart-candlestick', pt: 'Gráfico', en: 'Chart',
  sub: 'Velas ao vivo de qualquer moeda da lista, com médias móveis, Bollinger e volume.',
  subEn: 'Live candles for any listed coin, with moving averages, Bollinger and volume.',
  init(el, params) { chartPrefs(); if (params.s && BY_SYM[params.s]) CH.s = params.s; saveChartPrefs(); el.innerHTML = chartHtml(); CH.cs = null; chartLoad(); },
  show(el, params) {
    if (params.s && BY_SYM[params.s] && params.s !== CH.s) { CH.s = params.s; saveChartPrefs(); setHTML('#ch-head', chartHeadHtml()); CH.cs = null; chartLoad(); }
    else if (!CH.cs) chartLoad();
  },
});
