// =====================================================================
// GRÁFICO — velas da Binance para qualquer moeda da lista, como numa
// corretora: mira livre (o preço segue o mouse, dentro ou fora da vela),
// arrastar para cima/baixo e para os lados, roda para zoom, escala log,
// médias móveis à sua escolha (MM ou MME, quantas quiser), Bollinger,
// volume e RSI em painel próprio. Mais velas antigas carregam ao voltar.
// =====================================================================
const MA_COLORS = ['#f4b43f', '#62b4ff', '#c084fc', '#2dd4bf', '#fb923c', '#f472b6', '#a3e635', '#e879f9'];
const MA_SUGEST = [7, 9, 12, 20, 21, 26, 50, 100, 120, 144, 200, 300];
const CH = { s: 'BTCUSDT', tf: '1d', mas: [{ t: 'sma', n: 20, c: 0 }, { t: 'sma', n: 50, c: 1 }, { t: 'sma', n: 200, c: 2 }], vol: true, rsi: true, bb: false, log: false, seq: 0, kl: [], cs: null, ch: null, rch: null, rs: null, intraday: false, more: false, end: false, auto: true };
const CH_TF = [['15m', '15m'], ['1h', '1h'], ['4h', '4h'], ['1d', '1D'], ['1w', '1S'], ['1M', '1M']];
function chartPrefs() {
  const p = LS.get('chart'); if (!p) return;
  if (p.s && BY_SYM[p.s]) CH.s = p.s;
  if (CH_TF.some(([v]) => v === p.tf)) CH.tf = p.tf;
  if (Array.isArray(p.mas)) CH.mas = p.mas.filter((m) => m && Number.isInteger(m.n) && m.n >= 2 && m.n <= 500 && (m.t === 'sma' || m.t === 'ema')).slice(0, 8).map((m, i) => ({ t: m.t, n: m.n, c: Number.isInteger(m.c) ? m.c : i }));
  else if (p.ov) { // preferências da versão anterior (MM 20/50/200 fixas)
    CH.mas = [[20, 'ma20'], [50, 'ma50'], [200, 'ma200']].filter(([, k]) => p.ov[k] !== false).map(([n], i) => ({ t: 'sma', n, c: i }));
  }
  for (const k of ['vol', 'rsi', 'bb', 'log']) if (typeof p[k] === 'boolean') CH[k] = p[k];
  if (p.ov && typeof p.ov.vol === 'boolean' && typeof p.vol !== 'boolean') CH.vol = p.ov.vol;
}
const saveChartPrefs = () => LS.set('chart', { s: CH.s, tf: CH.tf, mas: CH.mas.map(({ t, n, c }) => ({ t, n, c })), vol: CH.vol, rsi: CH.rsi, bb: CH.bb, log: CH.log });
// cada média guarda a sua cor (remover uma não troca a cor das outras)
const maColor = (i) => { const m = CH.mas[i]; return MA_COLORS[(m && Number.isInteger(m.c) ? m.c : i) % MA_COLORS.length]; };
const maFreeColor = () => { const used = new Set(CH.mas.map((m) => m.c)); for (let i = 0; i < MA_COLORS.length; i++) if (!used.has(i)) return i; return CH.mas.length % MA_COLORS.length; };
const maLabel = (m) => `${m.t === 'ema' ? L('MME', 'EMA') : L('MM', 'MA')} ${m.n}`;
function chartHeadHtml() {
  const c = BY_SYM[CH.s]; const q = PX[CH.s];
  const brl = (v) => (isNum(v) && toBRL(v) ? esc(fmtMoney(toBRL(v), 'BRL')) : '');
  return `<button class="btn" data-act="chPick" style="height:46px;padding:0 14px 0 10px">${coinLogo({ ...c, logo: LOGOS[c.cg] }, 30)}<span style="text-align:left;line-height:1.2"><b style="display:block">${esc(c.n)}</b><span class="tiny faint">${esc(c.b)}/USDT · ${esc(L('trocar', 'change'))}</span></span>${ico('chevron-down', 16)}</button>
  <div class="row wrap" style="gap:6px 22px" id="ch-kpis">
    ${kpiBox(L('Preço', 'Price'), q ? esc(usd(q.p)) : '—', q ? `${chg(q.chg)} <span class="faint">24h</span>${toBRL(q.p) ? ` · ${esc(fmtMoney(toBRL(q.p), 'BRL'))}` : ''}` : '', 'ch-k')}
    ${kpiBox(L('Máxima 24h', '24h high'), q ? `<span class="up">${esc(usd(q.hi))}</span>` : '—', brl(q && q.hi), 'ch-k')}
    ${kpiBox(L('Mínima 24h', '24h low'), q ? `<span class="down">${esc(usd(q.lo))}</span>` : '—', brl(q && q.lo), 'ch-k')}
    ${kpiBox(L('Volume 24h', '24h volume'), q ? esc(fmtCompact(q.qv)) : '—', '', 'ch-k')}
  </div>`;
}
function chartIndHtml() {
  const chips = CH.mas.map((m, i) => `<span class="ch-ma" style="--c:${maColor(i)}"><i></i><button class="ch-ma-t" data-act="chMaType" data-i="${i}" title="${esc(L('Trocar entre média simples (MM) e exponencial (MME)', 'Toggle simple (MA) / exponential (EMA)'))}">${m.t === 'ema' ? esc(L('MME', 'EMA')) : esc(L('MM', 'MA'))}</button><input class="ch-ma-n" type="text" inputmode="numeric" list="ch-ma-l" maxlength="3" value="${m.n}" data-i="${i}" aria-label="${esc(L('Período da média (dias/velas)', 'Average period (candles)'))}"><button class="ch-ma-x" data-act="chMaDel" data-i="${i}" aria-label="${esc(L('Remover média', 'Remove average'))}">${ico('x', 13)}</button></span>`).join('');
  const tg = (k, label, icon) => `<button class="btn xs ${CH[k] ? '' : 'ghost'}" data-act="chTog" data-k="${k}" aria-pressed="${CH[k]}">${ico(icon, 14)}${esc(label)}</button>`;
  return `<span class="small faint" style="margin-right:2px">${esc(L('Médias:', 'Averages:'))}</span>${chips}${CH.mas.length < 8 ? `<button class="btn xs" data-act="chMaAdd" title="${esc(L('Adicionar outra média', 'Add another average'))}">${ico('plus', 14)}${esc(L('Média', 'Average'))}</button>` : ''}<datalist id="ch-ma-l">${MA_SUGEST.map((n) => `<option value="${n}">`).join('')}</datalist>
    <span class="ch-sep"></span>${tg('vol', 'Volume', 'chart-column')}${tg('rsi', L('RSI 14', 'RSI 14'), 'activity')}${tg('bb', 'Bollinger', 'waves')}`;
}
function chartHtml() {
  const p = PAGES.chart;
  return `${pageHead(p, stamp('px-rest', 'Binance'))}
  <section class="panel">
    <div class="row wrap between" style="gap:14px" id="ch-head">${chartHeadHtml()}</div>
    <div class="row wrap between mt" style="gap:10px">
      <div class="seg-scroll">${seg('chtf', CH_TF.map(([v, l]) => [v, l]), CH.tf)}</div>
      <div class="row wrap ch-tools" style="gap:6px"><button class="btn xs ${CH.log ? '' : 'ghost'}" data-act="chLog" aria-pressed="${CH.log}" title="${esc(L('Escala logarítmica', 'Log scale'))}">Log</button><button class="btn xs ${CH.auto ? '' : 'ghost'}" id="ch-auto" data-act="chAuto" title="${esc(L('Ajustar o preço automaticamente (desliga quando você arrasta para cima/baixo)', 'Auto-fit price (turns off when you drag up/down)'))}">${ico('move-vertical', 14)}Auto</button><button class="btn xs ghost" data-act="chFit" title="${esc(L('Voltar para as velas recentes', 'Back to recent candles'))}">${ico('rotate-ccw', 14)}${esc(L('Recentes', 'Recent'))}</button></div>
    </div>
    <div class="row wrap mt ch-ind" id="ch-ind" style="gap:6px">${chartIndHtml()}</div>
    <div id="ch-legend" class="ch-legend mt"></div>
    <div id="ch-box" style="height:clamp(340px,56vh,620px);margin-top:6px;position:relative"></div>
    <div id="ch-rsi-wrap" style="${CH.rsi ? '' : 'display:none'}"><div class="ch-rsi-h"><b>RSI 14</b> <span id="ch-rsi-v" class="faint"></span><span class="faint tiny">${esc(L('acima de 70: esticado para cima · abaixo de 30: esticado para baixo', 'above 70: overbought · below 30: oversold'))}</span></div><div id="ch-rsi" style="height:150px;position:relative"></div></div>
    ${note(L('Velas da Binance (par em USDT). Arraste o gráfico para os lados e para cima/baixo; roda do mouse ou pinça dá zoom; arrastar o eixo de preço estica a escala; dois cliques no eixo voltam ao automático. Ao voltar no tempo, velas mais antigas carregam sozinhas. Diárias, semanais e mensais seguem o dia UTC; 15 min a 4 h estão no seu horário. MM = média simples dos fechamentos; MME = média exponencial.', 'Binance candles (USDT pair). Drag sideways and up/down; wheel or pinch zooms; drag the price axis to stretch; double-click the axis for auto. Older candles load as you scroll back. Daily/weekly/monthly follow the UTC day; 15m–4h are local time. MA = simple average of closes; EMA = exponential.'))}
  </section>`;
}
async function chartLoad() {
  const seq = ++CH.seq, box = $('#ch-box'); if (!box) return;
  if (!CH.cs) box.innerHTML = `<div class="skel" style="position:absolute;inset:0"></div>`;
  CH.end = false; CH.more = false;
  try {
    const kl = await klines(CH.s, CH.tf, 1000);
    if (seq !== CH.seq) return;
    if (!kl.length) throw new Error(L('sem velas para este par', 'no candles for this pair'));
    CH.kl = kl.map((k) => ({ ...k }));
    if (kl.length < 1000) CH.end = true;
    await chartRender(seq);
  } catch (e) {
    if (seq !== CH.seq) return;
    CH.cs = null;
    box.innerHTML = emptyBox('wifi-off', L('Não foi possível carregar o gráfico', 'Could not load the chart'), esc(String(e.message || e)), `<button class="btn sm" data-act="chReload">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`);
  }
}
ACT.chReload = () => chartLoad();
// velas mais antigas quando você volta no tempo (até ~8 mil velas)
async function chartMore() {
  if (CH.more || CH.end || !CH.kl.length || CH.kl.length > 8000) return;
  CH.more = true; const seq = CH.seq;
  try {
    const first = CH.kl[0];
    const older = await klines(CH.s, CH.tf, 1000, { endTime: first.t - 1 });
    if (seq !== CH.seq) return;
    const add = older.filter((k) => k.t < first.t);
    if (add.length < 1) { CH.end = true; return; }
    if (older.length < 1000) CH.end = true;
    const ts = CH.ch.timeScale(); const r = ts.getVisibleLogicalRange();
    CH.kl = add.concat(CH.kl);
    await chartRender(seq, r ? { from: r.from + add.length, to: r.to + add.length } : null);
  } catch { /* fica com o que já tem */ } finally { CH.more = false; }
}
function chartSeriesData() {
  const kl = CH.kl, closes = kl.map((k) => k.c), intraday = CH.intraday;
  const mas = CH.mas.map((m) => (m.t === 'ema' ? ema(closes, m.n) : sma(closes, m.n)));
  const rsi = rsiSeries(closes, 14);
  const bb = CH.bb ? bollinger(closes, 20, 2) : null;
  return { closes, mas, rsi, bb, intraday };
}
async function chartRender(seq, keepRange) {
  const box = $('#ch-box'); if (!box) return;
  const intraday = ['15m', '1h', '4h'].includes(CH.tf); CH.intraday = intraday;
  const prevRange = keepRange || (CH.ch && CH.cs ? (() => { try { return CH.ch.timeScale().getVisibleLogicalRange(); } catch { return null; } })() : null);
  const { ch, c, LWC } = await makeChart(box, { intraday, onTheme: () => chartRender(CH.seq) });
  if (seq !== CH.seq) { try { ch.remove(); } catch { /* */ } return; }
  CH.ch = ch;
  const MODE = (LWC.CrosshairMode && LWC.CrosshairMode.Normal) ?? 0;
  ch.applyOptions({
    crosshair: { mode: MODE, vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
    rightPriceScale: { mode: CH.log ? 1 : 0, autoScale: CH.auto, minimumWidth: 86, scaleMargins: { top: 0.08, bottom: CH.vol ? 0.2 : 0.06 } },
    // no celular, arrastar na vertical continua rolando a página (senão o dedo fica preso no gráfico)
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: !CH_TOUCH() },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true },
    timeScale: { rightOffset: 6, barSpacing: 8, minBarSpacing: 0.6 },
  });
  const kl = CH.kl; const D = chartSeriesData();
  const cs = ch.addCandlestickSeries({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false, priceLineColor: c.text3 });
  cs.setData(kl.map((k) => ({ time: ctime(k.t, intraday), open: k.o, high: k.h, low: k.l, close: k.c })));
  CH.cs = cs;
  const line = (vals, color, opts = {}) => { const s = ch.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts }); s.setData(lineData(kl, vals, intraday)); return s; };
  D.mas.forEach((v, i) => line(v, maColor(i)));
  if (D.bb) { const col = c.text3; line(D.bb.up, col, { lineWidth: 1, lineStyle: 2 }); line(D.bb.lo, col, { lineWidth: 1, lineStyle: 2 }); line(D.bb.mid, col, { lineWidth: 1 }); }
  if (CH.vol) {
    const vs = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    vs.setData(kl.map((k) => ({ time: ctime(k.t, intraday), value: k.qv, color: (k.c >= k.o ? c.up : c.down) + '55' })));
    CH.vs = vs;
  } else CH.vs = null;
  // arrastar para cima/baixo: desliga o ajuste automático do preço (igual às corretoras)
  chartDragWatch(box);
  // RSI em painel próprio, sincronizado
  await chartRsi(seq, D, c, LWC);
  if (prevRange && keepRange !== false) ch.timeScale().setVisibleLogicalRange(prevRange);
  else ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, kl.length - (intraday ? 160 : 180)), to: kl.length + 4 });
  const fp = (v) => esc(fmtNum(v, ...priceDigits(v)));
  const legend = (i) => {
    const k = kl[i]; if (!k) return;
    const prev = kl[i - 1]; const dir = k.c >= k.o ? 'up' : 'down';
    const parts = [`<b class="lg-d">${esc(intraday ? fmtDateTime(k.t) : fmtDate(k.t, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b>`,
      `<span class="lg-i"><em class="lg-o">${esc(L('Abertura', 'Open'))}</em> ${fp(k.o)}</span>`, `<span class="lg-i"><em class="lg-h">${esc(L('Máxima', 'High'))}</em> ${fp(k.h)}</span>`, `<span class="lg-i"><em class="lg-l">${esc(L('Mínima', 'Low'))}</em> ${fp(k.l)}</span>`, `<span class="lg-i"><em class="lg-c ${dir}">${esc(L('Fechamento', 'Close'))}</em> <span class="${dir}">${fp(k.c)}</span></span>`,
      prev ? `<span class="lg-i chip ${tone(k.c - prev.c) || 'flat'}">${esc(fmtPct((k.c / prev.c - 1) * 100))}</span>` : '',
      `<span class="lg-i"><em class="lg-v">Vol</em> ${esc(fmtCompact(k.qv))}</span>`];
    const ma = CH.mas.map((m, j) => { const v = D.mas[j][i]; return isNum(v) ? `<span class="lg-i" style="color:${maColor(j)}"><em>${esc(maLabel(m))}</em> ${fp(v)}</span>` : ''; }).filter(Boolean);
    if (D.bb && isNum(D.bb.up[i])) ma.push(`<span class="lg-i"><em class="lg-v">BB</em> ${fp(D.bb.lo[i])} – ${fp(D.bb.up[i])}</span>`);
    setHTML('#ch-legend', `<div class="lg-row">${parts.filter(Boolean).join('')}</div>${ma.length ? `<div class="lg-row">${ma.join('')}</div>` : ''}`);
    const rv = D.rsi[i]; setHTML('#ch-rsi-v', isNum(rv) ? `<span class="${rv >= 70 ? 'down' : rv <= 30 ? 'up' : ''}">${esc(fmtNum(rv, 1, 1))}</span>` : '—');
  };
  CH.legend = legend; CH.D = D;
  legend(kl.length - 1);
  const idxOf = (time) => { if (time === undefined || time === null) return -1; let lo = 0, hi = kl.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; const t = ctime(kl[m].t, intraday); if (t === time) return m; if (t < time) lo = m + 1; else hi = m - 1; } return -1; };
  ch.subscribeCrosshairMove((param) => {
    if (!param || param.time === undefined) { legend(kl.length - 1); if (CH.rch) try { CH.rch.clearCrosshairPosition(); } catch { /* */ } return; }
    const i = idxOf(param.time); if (i >= 0) legend(i);
    if (CH.rch && CH.rs && i >= 0 && isNum(D.rsi[i])) { try { CH.rch.setCrosshairPosition(D.rsi[i], param.time, CH.rs); } catch { /* */ } }
  });
  ch.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r && r.from < 30) chartMore(); });
}
// Arrastar para cima/baixo move o preço (como nas corretoras). A biblioteca só move o preço com o ajuste
// automático desligado no início do arraste: desligamos ao apertar o botão e religamos se o arraste foi só
// para os lados (ou foi um clique). Arrastou na vertical: fica manual até clicar em "Auto" ou dar 2 cliques no eixo.
const CH_TOUCH = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
function chartDragWatch(box) {
  if (box._dragWatch) return; box._dragWatch = true;
  let st = null;
  const syncAuto = () => { if (!CH.ch) return; try { const a = CH.ch.priceScale('right').options().autoScale; if (a !== CH.auto) { CH.auto = a; chartAutoBtn(); } } catch { /* */ } };
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !CH.ch || (e.pointerType === 'touch' && CH_TOUCH())) return;
    const r = box.getBoundingClientRect();
    const onAxis = e.clientX > r.right - 90 || e.clientY > r.bottom - 28;
    st = { x: e.clientX, y: e.clientY, onAxis, wasAuto: CH.auto, moved: 0 };
    if (!onAxis && CH.auto) { try { CH.ch.priceScale('right').applyOptions({ autoScale: false }); } catch { /* */ } }
  }, true);
  box.addEventListener('pointermove', (e) => { if (st && (e.buttons & 1)) st.moved = Math.max(st.moved, Math.abs(e.clientY - st.y)); }, true);
  const end = () => {
    if (!st) return;
    const s0 = st; st = null;
    if (s0.onAxis) { setTimeout(syncAuto, 30); return; }
    if (s0.wasAuto && s0.moved < 8) { try { CH.ch.priceScale('right').applyOptions({ autoScale: true }); } catch { /* */ } }
    else if (s0.wasAuto) { CH.auto = false; chartAutoBtn(); }
  };
  window.addEventListener('pointerup', end, true); box.addEventListener('pointercancel', end, true);
  box.addEventListener('dblclick', () => setTimeout(syncAuto, 50));
}
function chartSetAuto(on) {
  CH.auto = on;
  if (CH.ch) try { CH.ch.priceScale('right').applyOptions({ autoScale: on }); } catch { /* */ }
  chartAutoBtn();
}
function chartAutoBtn() { const b = $('#ch-auto'); if (b) { b.classList.toggle('ghost', !CH.auto); b.setAttribute('aria-pressed', String(CH.auto)); } }
async function chartRsi(seq, D, c, LWC) {
  const wrap = $('#ch-rsi-wrap'), el = $('#ch-rsi');
  if (CH.rch) { try { CH.rch.remove(); } catch { /* */ } [...CHARTS].forEach((r) => { if (r.el === el) CHARTS.delete(r); }); CH.rch = null; CH.rs = null; }
  if (!el || !wrap) return;
  wrap.style.display = CH.rsi ? '' : 'none';
  if (!CH.rsi) return;
  const { ch: rch } = await makeChart(el, { intraday: CH.intraday, priceFmt: (p) => fmtNum(p, 0, 0) });
  if (seq !== CH.seq) { try { rch.remove(); } catch { /* */ } return; }
  rch.applyOptions({
    crosshair: { mode: (LWC.CrosshairMode && LWC.CrosshairMode.Normal) ?? 0 },
    rightPriceScale: { minimumWidth: 86, autoScale: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { visible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 0.6 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false } },
  });
  const kl = CH.kl, intraday = CH.intraday;
  const rs = rch.addLineSeries({ color: c.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
  // pontos vazios onde ainda não há RSI: mantém as velas alinhadas com o gráfico de cima
  rs.setData(kl.map((k, i) => (isNum(D.rsi[i]) ? { time: ctime(k.t, intraday), value: D.rsi[i] } : { time: ctime(k.t, intraday) })));
  for (const [lv, col] of [[70, c.down], [50, c.text3], [30, c.up]]) rs.createPriceLine({ price: lv, color: col, lineWidth: 1, lineStyle: 2, axisLabelVisible: lv !== 50, title: '' });
  CH.rch = rch; CH.rs = rs;
  // os dois gráficos andam juntos
  let lock = false;
  const sync = (a, b) => a.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (lock || !r) return; lock = true; try { b.timeScale().setVisibleLogicalRange(r); } catch { /* */ } lock = false; });
  sync(CH.ch, rch); sync(rch, CH.ch);
  rch.subscribeCrosshairMove((pm) => {
    if (!pm || pm.time === undefined) { try { CH.ch.clearCrosshairPosition(); } catch { /* */ } return; }
    const i = CH.kl.findIndex((k) => ctime(k.t, intraday) === pm.time);
    if (i >= 0 && CH.legend) CH.legend(i);
    if (i >= 0) try { CH.ch.setCrosshairPosition(CH.kl[i].c, pm.time, CH.cs); } catch { /* */ }
  });
}
// vela fechou: busca as últimas velas sem cache e acrescenta (no máximo 1 pedido a cada 5 s)
async function chartRoll() {
  if (CH.rolling || !CH.kl.length) return;
  CH.rolling = true; const seq = CH.seq;
  try {
    const last = CH.kl[CH.kl.length - 1];
    const fresh = await klines(CH.s, CH.tf, 5, { startTime: last.t, endTime: Math.ceil(Date.now() / 5000) * 5000 + 60e3 });
    if (seq !== CH.seq || !fresh.length) return;
    let added = false;
    for (const k of fresh) {
      const i = CH.kl.findIndex((x) => x.t === k.t);
      if (i >= 0) CH.kl[i] = { ...k }; else if (k.t > CH.kl[CH.kl.length - 1].t) { CH.kl.push({ ...k }); added = true; }
    }
    if (added) await chartRender(seq);
  } catch { /* tenta de novo no próximo preço */ } finally { setTimeout(() => { CH.rolling = false; }, 5000); }
}
let _chLiveRsi = 0;
function chartLive() {
  const q = PX[CH.s]; if (!q || !CH.cs || !CH.kl.length) return;
  const last = CH.kl[CH.kl.length - 1];
  if (Date.now() > last.ct + 1500) { chartRoll(); return; } // vela fechou: busca só as novas (mantém o histórico carregado)
  last.c = q.p; last.h = Math.max(last.h, q.p); last.l = Math.min(last.l, q.p);
  const t = ctime(last.t, CH.intraday);
  try { CH.cs.update({ time: t, open: last.o, high: last.h, low: last.l, close: last.c }); } catch { /* gráfico recriado */ }
  if (CH.rs && CH.D && Date.now() - _chLiveRsi > 3000) {
    _chLiveRsi = Date.now();
    const r = rsiSeries(CH.kl.map((k) => k.c), 14); CH.D.rsi = r;
    const v = r[r.length - 1]; if (isNum(v)) try { CH.rs.update({ time: t, value: v }); } catch { /* */ }
  }
}
onPrice((set) => {
  if (S.page !== 'chart' || !(set.has(CH.s) || set.has('FX'))) return;
  setHTML('#ch-head', chartHeadHtml());
  if (set.has(CH.s)) chartLive();
});
const chRedrawInd = () => { setHTML('#ch-ind', chartIndHtml()); saveChartPrefs(); chartRender(CH.seq); };
ACT.seg_chtf = (v) => { CH.tf = v; saveChartPrefs(); CH.cs = null; CH.auto = true; chartAutoBtn(); chartLoad(); };
ACT.chTog = (el) => { const k = el.dataset.k; CH[k] = !CH[k]; chRedrawInd(); };
ACT.chLog = (el) => { CH.log = !CH.log; el.classList.toggle('ghost', !CH.log); el.setAttribute('aria-pressed', String(CH.log)); saveChartPrefs(); if (CH.ch) try { CH.ch.priceScale('right').applyOptions({ mode: CH.log ? 1 : 0 }); } catch { /* */ } };
ACT.chAuto = () => chartSetAuto(true);
ACT.chFit = () => { if (!CH.ch) return; chartSetAuto(true); CH.ch.timeScale().setVisibleLogicalRange({ from: Math.max(0, CH.kl.length - (CH.intraday ? 160 : 180)), to: CH.kl.length + 4 }); };
ACT.chMaType = (el) => { const m = CH.mas[+el.dataset.i]; if (!m) return; m.t = m.t === 'ema' ? 'sma' : 'ema'; chRedrawInd(); };
ACT.chMaDel = (el) => { CH.mas.splice(+el.dataset.i, 1); chRedrawInd(); };
ACT.chMaAdd = () => {
  if (CH.mas.length >= 8) return;
  const used = new Set(CH.mas.map((m) => m.n));
  const n = [20, 50, 200, 9, 21, 100, 7, 12, 26, 144].find((x) => !used.has(x)) || 30;
  CH.mas.push({ t: 'sma', n, c: maFreeColor() }); chRedrawInd();
  setTimeout(() => { const i = $$('#ch-ind .ch-ma-n').pop(); if (i) { i.focus(); i.select(); } }, 30);
};
// período da média: aplica ao sair do campo ou com Enter
const chMaApply = (inp) => {
  const i = +inp.dataset.i, m = CH.mas[i]; if (!m) return;
  const n = parseInt(String(inp.value).replace(/\D/g, ''), 10);
  if (!Number.isInteger(n) || n < 2 || n > 500) { inp.value = m.n; toast(L('Use um período entre 2 e 500.', 'Use a period between 2 and 500.'), { type: 'warn' }); return; }
  if (n === m.n) return;
  m.n = n; chRedrawInd();
};
document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('#ch-ind .ch-ma-n')) chMaApply(e.target); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#ch-ind .ch-ma-n')) { e.preventDefault(); chMaApply(e.target); } });
ACT.chPick = () => openCoinPicker({ title: L('Escolher moeda do gráfico', 'Pick chart coin'), onPick: (p) => {
  if (p.kind !== 'b') { toast(L('Gráfico de velas disponível para moedas com par na Binance. Abrindo a página da moeda no CoinGecko.', 'Candle charts are available for coins with a Binance pair. Opening the CoinGecko page.'), { type: 'warn' }); window.open(`https://www.coingecko.com/pt/moedas/${encodeURIComponent(p.cg)}`, '_blank', 'noopener'); return; }
  go('chart', { s: p.s });
} });
page({
  id: 'chart', group: 'mercado', icon: 'chart-candlestick', pt: 'Gráfico', en: 'Chart',
  sub: 'Velas ao vivo de qualquer moeda, com as médias que você escolher, RSI, volume e Bollinger — arraste em qualquer direção.',
  subEn: 'Live candles for any coin, with the averages you choose, RSI, volume and Bollinger — drag in any direction.',
  init(el, params) { chartPrefs(); if (params.s && BY_SYM[params.s]) CH.s = params.s; saveChartPrefs(); el.innerHTML = chartHtml(); CH.cs = null; chartLoad(); },
  show(el, params) {
    if (params.s && BY_SYM[params.s] && params.s !== CH.s) { CH.s = params.s; saveChartPrefs(); setHTML('#ch-head', chartHeadHtml()); CH.cs = null; CH.auto = true; chartAutoBtn(); chartLoad(); }
    else if (!CH.cs) chartLoad();
  },
});
