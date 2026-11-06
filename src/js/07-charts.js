// =====================================================================
// Gráficos e indicadores: velas da Binance (cache), médias, RSI, Bollinger,
// mini-gráficos em SVG (sparkline, velocímetro, rosca) e LightweightCharts
// carregado sob demanda (versão fixa + integridade SRI).
// =====================================================================

// ---------- bibliotecas sob demanda ----------
const _libs = {};
function loadScript(lib) {
  if (window[lib.global]) return Promise.resolve(window[lib.global]);
  if (_libs[lib.global]) return _libs[lib.global];
  _libs[lib.global] = (async () => {
    let lastErr;
    for (const url of lib.urls) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = url; s.async = true; s.crossOrigin = 'anonymous';
          if (lib.sri) s.integrity = lib.sri;
          const t = setTimeout(() => { s.remove(); rej(new Error('timeout')); }, 20000);
          s.onload = () => { clearTimeout(t); res(); };
          s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('falha ao carregar ' + hostOf(url))); };
          document.head.appendChild(s);
        });
        if (window[lib.global]) return window[lib.global];
      } catch (e) { lastErr = e; }
    }
    _libs[lib.global] = null;
    throw lastErr || new Error(L('biblioteca indisponível', 'library unavailable'));
  })();
  return _libs[lib.global];
}

// ---------- velas (klines) da Binance com cache curto ----------
const KL_TTL = { '1m': 15e3, '5m': 30e3, '15m': 60e3, '1h': 120e3, '4h': 300e3, '1d': 600e3, '1w': 3600e3, '1M': 3600e3 };
const _kl = new Map();
async function klines(sym, interval = '1d', limit = 500, { startTime, endTime } = {}) {
  const key = [sym, interval, limit, startTime || '', endTime || ''].join('|');
  const hit = _kl.get(key);
  if (hit && (hit.pending || Date.now() - hit.ts < (KL_TTL[interval] || 60e3))) return hit.p;
  const p = (async () => {
    let lastErr;
    for (const base of ['https://api.binance.com', 'https://data-api.binance.vision']) {
      try {
        const qs = new URLSearchParams({ symbol: sym, interval, limit: String(limit) });
        if (startTime) qs.set('startTime', String(startTime));
        if (endTime) qs.set('endTime', String(endTime));
        const a = await getJSON(`${base}/api/v3/klines?${qs}`, { timeout: 14000 });
        if (!Array.isArray(a)) throw new Error('klines');
        return a.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], qv: +k[7], ct: k[6] }))
          .filter((k) => isNum(k.c) && k.c > 0);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('binance');
  })();
  const rec = { p, ts: Date.now(), pending: true };
  _kl.set(key, rec);
  p.then(() => { rec.pending = false; rec.ts = Date.now(); }, () => _kl.delete(key));
  if (_kl.size > 120) _kl.delete(_kl.keys().next().value);
  return p;
}
// histórico longo (pagina de 1000 em 1000 velas a partir de uma data)
async function klinesSince(sym, interval, fromMs) {
  const out = [];
  let start = fromMs;
  for (let guard = 0; guard < 8; guard++) {
    const page = await klines(sym, interval, 1000, { startTime: start });
    if (!page.length) break;
    out.push(...page);
    if (page.length < 1000) break;
    start = page[page.length - 1].t + 1;
  }
  return out;
}

// ---------- indicadores ----------
function sma(vals, n) {
  const out = new Array(vals.length).fill(null); let s = 0;
  for (let i = 0; i < vals.length; i++) {
    s += vals[i]; if (i >= n) s -= vals[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
function ema(vals, n) {
  const out = new Array(vals.length).fill(null); const k = 2 / (n + 1); let e = null;
  for (let i = 0; i < vals.length; i++) {
    if (i === n - 1) e = avg(vals.slice(0, n));
    else if (i >= n) e = vals[i] * k + e * (1 - k);
    if (e !== null) out[i] = e;
  }
  return out;
}
function bollinger(vals, n = 20, mult = 2) {
  const mid = sma(vals, n), up = [], lo = [];
  for (let i = 0; i < vals.length; i++) {
    if (mid[i] === null) { up.push(null); lo.push(null); continue; }
    let s = 0; for (let j = i - n + 1; j <= i; j++) s += (vals[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    up.push(mid[i] + mult * sd); lo.push(mid[i] - mult * sd);
  }
  return { mid, up, lo };
}
// RSI de Wilder (o mesmo das corretoras)
function rsiSeries(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; }
  let ag = g / n, al = l / n;
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}
const lastOf = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return arr[i]; return null; };

// ---------- cores ----------
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// fundo do mapa de calor: cinza-azulado → verde/vermelho conforme a força da variação
function heatBg(v, scale = 8) {
  if (!isNum(v)) return '#3a4560';
  const t = clamp(Math.abs(v) / scale, 0, 1) ** 0.75;
  return v >= 0 ? mixHex('#2f4a46', '#0c9b55', t) : mixHex('#4f3540', '#d23345', t);
}
function fgColor(v) {
  if (!isNum(v)) return 'var(--off)';
  // cores por tema (styles.css: --fg-1 … --fg-5), sempre legíveis no fundo do tema
  if (v < 25) return 'var(--fg-1)';
  if (v < 45) return 'var(--fg-2)';
  if (v <= 55) return 'var(--fg-3)';
  if (v <= 75) return 'var(--fg-4)';
  return 'var(--fg-5)';
}
const FG_PT = { 'Extreme Fear': ['Medo extremo', 'Extreme fear'], Fear: ['Medo', 'Fear'], Neutral: ['Neutro', 'Neutral'], Greed: ['Ganância', 'Greed'], 'Extreme Greed': ['Ganância extrema', 'Extreme greed'] };
const fgLabel = (cls) => (FG_PT[cls] ? L(...FG_PT[cls]) : cls || '—');

// ---------- SVG ----------
function sparkSVG(vals, { w = 110, h = 28, color } = {}) {
  const v = (vals || []).filter(isNum);
  if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const step = w / (v.length - 1);
  const pts = v.map((x, i) => `${(i * step).toFixed(1)},${(h - 2 - ((x - mn) / r) * (h - 4)).toFixed(1)}`);
  const c = color || (v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--down)');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" aria-hidden="true"><path d="M0,${h} L${pts.join(' L')} L${w},${h} Z" style="fill:${c};opacity:.12"/><polyline points="${pts.join(' ')}" style="fill:none;stroke:${c};stroke-width:1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
// velocímetro 0–100 (Fear & Greed)
function gaugeSVG(value) {
  const R = 80, cx = 100, cy = 100;
  const pt = (v) => { const a = Math.PI * (1 - v / 100); return [cx + R * Math.cos(a), cy - R * Math.sin(a)]; };
  const arc = (a, b, col) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}" style="fill:none;stroke:${col};stroke-width:15;stroke-linecap:butt"/>`; };
  const bands = [[0, 24.4, fgColor(10)], [25.6, 44.4, fgColor(35)], [45.6, 54.4, fgColor(50)], [55.6, 74.4, fgColor(65)], [75.6, 100, fgColor(90)]];
  let s = `<svg class="fg-svg" viewBox="0 0 200 118" role="img" aria-label="${esc(L('Índice de medo e ganância', 'Fear and greed index'))}: ${isNum(value) ? value : '—'}">`;
  s += bands.map(([a, b, c]) => arc(a, b, c)).join('');
  if (isNum(value)) {
    const [nx, ny] = (() => { const a = Math.PI * (1 - clamp(value, 0, 100) / 100); return [cx + (R - 24) * Math.cos(a), cy - (R - 24) * Math.sin(a)]; })();
    const [mx, my] = pt(clamp(value, 0, 100));
    s += `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="9" style="fill:var(--panel);stroke:${fgColor(value)};stroke-width:4"/>`;
    s += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" style="stroke:var(--text);stroke-width:3.5;stroke-linecap:round"/><circle cx="${cx}" cy="${cy}" r="6.5" style="fill:var(--text)"/>`;
  }
  s += `<text x="16" y="116" style="fill:var(--text-3);font-size:10px">0</text><text x="178" y="116" style="fill:var(--text-3);font-size:10px">100</text></svg>`;
  return s;
}
// rosca (participações)
function donutSVG(parts, { size = 150, thick = 22, label = '' } = {}) {
  const tot = sum(parts.map((p) => Math.max(0, p.v || 0)));
  const R = (size - thick) / 2, C = 2 * Math.PI * R;
  let off = 0, segs = '';
  if (tot > 0) {
    for (const p of parts) {
      const frac = Math.max(0, p.v) / tot; if (frac <= 0) continue;
      const len = frac * C;
      segs += `<circle cx="${size / 2}" cy="${size / 2}" r="${R}" style="fill:none;stroke:${p.c};stroke-width:${thick}" stroke-dasharray="${Math.max(0, len - (parts.length > 1 ? 1.5 : 0)).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(p.t || '')}</title></circle>`;
      off += len;
    }
  } else segs = `<circle cx="${size / 2}" cy="${size / 2}" r="${R}" style="fill:none;stroke:var(--panel-3);stroke-width:${thick}"/>`;
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">${segs}</svg>`;
}

// ---------- LightweightCharts ----------
const CHARTS = new Set();
function chartTheme() {
  return {
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar('--text-2'), fontFamily: "Archivo, 'Segoe UI', system-ui, sans-serif", fontSize: 12 },
    grid: { vertLines: { color: cssVar('--grid') }, horzLines: { color: cssVar('--grid') } },
    rightPriceScale: { borderColor: cssVar('--line') },
    timeScale: { borderColor: cssVar('--line') },
    crosshair: {
      vertLine: { color: cssVar('--line-2'), labelBackgroundColor: cssVar('--panel-3') },
      horzLine: { color: cssVar('--line-2'), labelBackgroundColor: cssVar('--panel-3') },
    },
  };
}
const chartColors = () => ({ up: cssVar('--up'), down: cssVar('--down'), accent: cssVar('--accent'), signal: cssVar('--signal'), info: cssVar('--info'), text: cssVar('--text'), text3: cssVar('--text-3'), line: cssVar('--line-2') });
function _sweepCharts() { CHARTS.forEach((c) => { if (!document.contains(c.el)) { try { c.ch.remove(); } catch { /* */ } CHARTS.delete(c); } }); }
// Séries com nome: o gráfico mostra o nome da linha onde o mouse (ou o dedo) passa, como no TradingView.
// Toda série criada com `title` (rótulo no eixo) ou `nxName` (só no mouse) entra na lista.
const _SERIES_ADD = ['addLineSeries', 'addAreaSeries', 'addCandlestickSeries', 'addBarSeries', 'addHistogramSeries', 'addBaselineSeries'];
function _chartNamed(rec) {
  const { ch } = rec;
  for (const m of _SERIES_ADD) {
    const orig = ch[m] && ch[m].bind(ch); if (!orig) continue;
    ch[m] = (opts = {}, ...rest) => {
      const { nxName, nxFmt, nxColor, ...o } = opts || {};
      const s = orig(o, ...rest);
      const n = nxName !== undefined ? nxName : o.title;
      if (n) rec.named.push({ s, n: String(n), kind: m, fmt: nxFmt, c: nxColor || o.color || o.lineColor || o.upColor || '' });
      return s;
    };
  }
  const rm = ch.removeSeries.bind(ch);
  ch.removeSeries = (s) => { rec.named = rec.named.filter((x) => x.s !== s); return rm(s); };
}
function _chartHover(rec, fmtP) {
  const { ch, el } = rec;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const tag = document.createElement('div'); tag.className = 'ch-tag'; tag.hidden = true; tag.setAttribute('aria-hidden', 'true'); el.appendChild(tag);
  let hot = null;
  const cool = () => { if (hot && hot.w0) { try { hot.s.applyOptions({ lineWidth: hot.w0 }); } catch { /* */ } } hot = null; };
  const hide = () => { tag.hidden = true; cool(); };
  el.addEventListener('mouseleave', hide);
  ch.subscribeCrosshairMove((p) => {
    if (!p || !p.point || p.time === undefined || !rec.named.length || !p.seriesData) { hide(); return; }
    let best = null;
    for (const r of rec.named) {
      const d = p.seriesData.get(r.s); if (!d) continue;
      const v = d.value !== undefined ? d.value : d.close; if (!isNum(v)) continue;
      let y; try { y = r.s.priceToCoordinate(v); } catch { y = null; } if (y === null || y === undefined) continue;
      let dist = Math.abs(y - p.point.y);
      if (d.high !== undefined) { const yh = r.s.priceToCoordinate(d.high), yl = r.s.priceToCoordinate(d.low); if (yh !== null && yl !== null && p.point.y >= Math.min(yh, yl) - 4 && p.point.y <= Math.max(yh, yl) + 4) dist = 0; }
      if (r.kind === 'addHistogramSeries') { const y0 = r.s.priceToCoordinate(0); if (y0 !== null && p.point.y >= Math.min(y, y0) - 3 && p.point.y <= Math.max(y, y0) + 3) dist = 0; }
      if (!best || dist < best.dist) best = { r, v, d, y, dist };
    }
    if (!best || best.dist > 18) { hide(); return; }
    const r = best.r, d = best.d;
    let col = r.c || (r.s.options && (r.s.options().color || r.s.options().lineColor)) || 'var(--text)';
    if (d.color) col = d.color;
    if (r.kind === 'addCandlestickSeries' && d.close !== undefined) col = d.close >= d.open ? cssVar('--up') : cssVar('--down');
    const f = r.fmt || fmtP;
    const val = r.kind === 'addCandlestickSeries' || r.kind === 'addBarSeries'
      ? `<span class="o">${esc(L('A', 'O'))} ${esc(f(d.open))}</span><span class="o">${esc(L('M', 'H'))} ${esc(f(d.high))}</span><span class="o">${esc(L('m', 'L'))} ${esc(f(d.low))}</span><span>${esc(L('F', 'C'))} ${esc(f(d.close))}</span>`
      : `<span>${esc(f(best.v))}</span>`;
    tag.style.setProperty('--tc', col);
    tag.innerHTML = `<i></i><b>${esc(r.n)}</b>${val}`;
    tag.hidden = false;
    const w = tag.offsetWidth, h = tag.offsetHeight, W = el.clientWidth, H = el.clientHeight;
    let x = p.point.x + 14; if (x + w > W - 64) x = p.point.x - w - 14; x = Math.max(2, x);
    const yy = clamp((r.kind === 'addCandlestickSeries' ? p.point.y : best.y) - h - 8, 2, Math.max(2, H - h - 26));
    tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(yy)}px)`;
    // destaca a linha apontada (engrossa um pouco)
    if (!hot || hot.r !== r) {
      cool();
      if (r.kind === 'addLineSeries') { let w0 = 2; try { w0 = r.s.options().lineWidth || 2; } catch { /* */ } try { r.s.applyOptions({ lineWidth: Math.min(4, w0 + 1) }); } catch { /* */ } hot = { r, s: r.s, w0 }; } else hot = { r };
    }
  });
}
async function makeChart(el, { intraday = false, onTheme, priceFmt, hover = true } = {}) {
  _sweepCharts();
  const LWC = await loadScript(LIBS.lwc);
  // um gráfico por elemento: o anterior é desmontado
  [...CHARTS].forEach((c) => { if (c.el === el) { try { c.ch.remove(); } catch { /* */ } CHARTS.delete(c); } });
  el.innerHTML = '';
  const fmtP = priceFmt || ((p) => { const [mn, mx] = priceDigits(p); return fmtNum(p, mn, Math.min(mx, 8)); });
  const ch = LWC.createChart(el, {
    autoSize: true,
    ...chartTheme(),
    localization: { locale: LOC(), priceFormatter: fmtP },
    timeScale: { ...chartTheme().timeScale, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
    handleScroll: { vertTouchDrag: false },
  });
  const rec = { ch, el, onTheme, named: [] };
  CHARTS.add(rec);
  _chartNamed(rec);
  if (hover) _chartHover(rec, fmtP);
  return { ch, LWC, c: chartColors() };
}
// velas para o LightweightCharts
const candleData = (ks, intraday) => ks.map((k) => ({ time: ctime(k.t, intraday), open: k.o, high: k.h, low: k.l, close: k.c }));
const candleOpts = (c) => ({ upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down, priceLineVisible: false });
// botão "Linha | Velas" (o valor fica salvo por gráfico)
const chartKind = (k, d = 'line') => { const v = LS.get('ck-' + k); return v === 'candle' || v === 'line' ? v : d; };
const chartKindSeg = (k, cur) => seg('ck_' + k, [['line', L('Linha', 'Line'), 'chart-line'], ['candle', L('Velas', 'Candles'), 'chart-candlestick']], cur, 'ck');
// tempo para o gráfico: velas diárias ficam na data UTC; intradiárias no horário local
function ctime(ms, intraday) { return Math.floor(ms / 1000) - (intraday ? new Date(ms).getTimezoneOffset() * 60 : 0); }
function onThemeChange() {
  _sweepCharts();
  const th = chartTheme(), c = chartColors();
  [...CHARTS].forEach((r) => { try { r.ch.applyOptions(th); if (r.onTheme) r.onTheme(c); } catch { /* */ } });
  // SVGs usam variáveis CSS e se ajustam sozinhos
}
// série de linha com nulos removidos
const lineData = (ks, vals, intraday) => ks.map((k, i) => (isNum(vals[i]) ? { time: ctime(k.t, intraday), value: vals[i] } : null)).filter(Boolean);
