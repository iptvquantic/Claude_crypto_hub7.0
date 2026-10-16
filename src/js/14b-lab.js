// =====================================================================
// BITCOIN LAB (PRO)
// O ciclo do Bitcoin com os principais indicadores do mercado: sinais de
// fundo e de topo (limiar e preço-gatilho de cada um), níveis de preço
// on-chain e um gráfico com dezenas de indicadores reais — arrastável, com
// zoom, altura ajustável, painéis embaixo e tela cheia.
// Dados: histórico diário do robô (lab.json: Coin Metrics desde 2010,
// BGeometrics/bitcoin-data.com e alternative.me). Se o robô atrasar, o
// navegador busca a Coin Metrics direto. O último ponto usa o preço ao vivo.
// =====================================================================
const LAB_T0 = Date.UTC(2010, 6, 18);
const DAYMS = 86400e3;
const LAB_HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'];
const LAB_DEF_SEL = ['realized', 'sma200w', 'sthRP', 'mvrvZ'];
const LAB_MAX_PANES = 4;
const LAB = { sel: LAB_DEF_SEL.slice(), mode: 'ind', tab: 'acc', range: '4y', log: true, cat: 'all', q: '', h: 0, full: false, sideOpen: true, seq: 0, raw: null, D: null, cD: null, charts: [], _ck: '', _tk: 0 };

// ---------- séries diárias (índice = dias desde 18/07/2010) ----------
function lastPt(a) { if (!a) return null; for (let i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return { v: a[i], i }; return null; }
function rollMean(a, k) {
  const n = a.length, o = new Array(n).fill(null); let s = 0, c = 0;
  for (let i = 0; i < n; i++) {
    if (isNum(a[i])) { s += a[i]; c++; }
    if (i >= k && isNum(a[i - k])) { s -= a[i - k]; c--; }
    if (i >= k - 1 && c === k) o[i] = s / k;
  }
  return o;
}
const rollSum = (a, k) => rollMean(a, k).map((v) => (isNum(v) ? v * k : null));
function emaS(a, k) {
  const o = new Array(a.length).fill(null); const m = 2 / (k + 1); let e = null, s = 0, c = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]; if (!isNum(v)) continue;
    if (e === null) { s += v; c++; if (c === k) { e = s / k; o[i] = e; } } else { e = v * m + e * (1 - m); o[i] = e; }
  }
  return o;
}
function ffill(a) { const o = a.slice(); let last = null; for (let i = 0; i < o.length; i++) { if (isNum(o[i])) last = o[i]; else if (last !== null) o[i] = last; } return o; }
const mulA = (a, k) => a.map((v) => (isNum(v) ? v * k : null));
const divA = (a, b) => a.map((v, i) => (isNum(v) && isNum(b[i]) && b[i] !== 0 ? v / b[i] : null));
const labNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- fonte: arquivo do robô (ou Coin Metrics direto) ----------
const LAB_CM = { PriceUSD: 'price', CapMVRVCur: 'mvrv', CapMrktCurUSD: 'mcap', IssTotUSD: 'iss', HashRate: 'hash', AdrActCnt: 'addr', AdrBalCnt: 'bal', SplyCur: 'supply', SplyExNtv: 'exch', FlowInExNtv: 'inflow', FlowOutExNtv: 'outflow', FeeTotNtv: 'fees', TxCnt: 'tx' };
async function labDirect() {
  const n = Math.floor((Date.now() - LAB_T0) / DAYMS) + 1;
  const j = await getJSON(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=${Object.keys(LAB_CM).join(',')}&frequency=1d&page_size=10000&start_time=2010-07-18`, { timeout: 40000 });
  const cm = {}; for (const k of Object.values(LAB_CM)) cm[k] = new Array(n).fill(null);
  for (const r of (j && j.data) || []) {
    const i = Math.round((Date.parse(String(r.time).slice(0, 10) + 'T00:00:00Z') - LAB_T0) / DAYMS); if (!(i >= 0 && i < n)) continue;
    for (const [m, k] of Object.entries(LAB_CM)) { const v = num(r[m]); if (v !== null) cm[k][i] = v; }
  }
  let fng = null;
  try {
    const f = await getJSON('https://api.alternative.me/fng/?limit=0&format=json', { timeout: 20000 });
    fng = new Array(n).fill(null);
    for (const x of (f && f.data) || []) { const i = Math.round((Number(x.timestamp) * 1000 - LAB_T0) / DAYMS); const v = num(x.value); if (i >= 0 && i < n && v !== null) fng[i] = v; }
  } catch { /* opcional */ }
  return { generatedAt: new Date().toISOString(), t0: '2010-07-18', n, cm, bd: {}, bdLast: {}, fng };
}
async function labFetch() {
  try { const j = await getPipeline('lab', 36 * 3600e3); j._via = 'robot'; return j; } catch (e) { const j = await labDirect(); j._via = 'direct'; return j; }
}
function registerLabSources() {
  source({
    id: 'lab', label: L('Histórico on-chain do BTC', 'BTC on-chain history'), provider: 'Coin Metrics', every: 60 * 60e3, kind: 'daily', persist: false,
    need: () => (S.page === 'lab' && hasPro()) || S.page === 'onchain',
    run: labFetch,
    validate: (j) => !!(j && j.cm && Array.isArray(j.cm.price) && j.cm.price.filter(isNum).length > 3000),
    onData: (j) => {
      LAB.raw = j; LAB.D = null;
      const lp = lastPt(j.cm.price); if (lp && HEALTH.lab) HEALTH.lab.dataTs = Date.parse((j.t0 || '2010-07-18') + 'T12:00:00Z') + lp.i * DAYMS;
      _markDirty('LAB');
    },
  });
}

// ---------- montagem das séries ----------
function hashRibbons(h30, h60, s10, s20) {
  const ev = []; let cap = -1;
  for (let i = 1; i < h30.length; i++) {
    const a = h30[i], b = h60[i], a0 = h30[i - 1], b0 = h60[i - 1];
    if (!isNum(a) || !isNum(b) || !isNum(a0) || !isNum(b0)) continue;
    if (a < b && a0 >= b0) cap = i;
    else if (a > b && a0 <= b0 && cap >= 0) {
      // capitulação de pelo menos 14 dias; compra quando o preço ganha força (média de 10 dias acima da de 20) em até 30 dias
      if (i - cap >= 14) { let buy = -1; for (let k = i; k < Math.min(h30.length, i + 30); k++) if (isNum(s10[k]) && isNum(s20[k]) && s10[k] > s20[k]) { buy = k; break; } ev.push({ cap, rec: i, buy }); }
      cap = -1;
    }
  }
  const lh = lastPt(h30);
  const capNow = lh && isNum(h60[lh.i]) && lh.v < h60[lh.i] ? cap : -1;
  return { ev, capNow, lastI: lh ? lh.i : -1 };
}
function labBuild(j, live) {
  const t0 = Date.parse((j.t0 || '2010-07-18') + 'T00:00:00Z');
  const cm = j.cm || {}, bd = j.bd || {};
  const lp = lastPt(cm.price); if (!lp) return null;
  const today = Math.floor((Date.now() - t0) / DAYMS);
  const hasLive = isNum(live) && live > 0 && today > lp.i;
  const N = hasLive ? today + 1 : lp.i + 1;
  const g = (a) => { const o = new Array(N).fill(null); if (Array.isArray(a)) { const m = Math.min(a.length, N); for (let i = 0; i < m; i++) if (isNum(a[i])) o[i] = a[i]; } return o; };
  const A = {};
  const p = g(cm.price); if (hasLive) p[N - 1] = live;
  A.p = p;
  const pf = ffill(p);
  for (const k of [10, 20, 50, 111, 140, 200, 350, 730, 1400]) A['sma' + k] = rollMean(pf, k);
  A.ema147 = emaS(pf, 147);
  // valor realizado (Coin Metrics): preço ÷ MVRV; hoje = último custo-base publicado
  A.mvrvCM = g(cm.mvrv);
  A.rp = divA(p, A.mvrvCM);
  A.rpF = ffill(A.rp);
  A.mvrv = divA(p, A.rpF);
  A.sup = ffill(g(cm.supply));
  A.mc = g(cm.mcap).map((v, i) => (isNum(v) ? v : isNum(p[i]) && isNum(A.sup[i]) ? p[i] * A.sup[i] : null));
  A.rcF = ffill(divA(A.mc, A.mvrvCM));
  // MVRV Z-Score: (valor de mercado − valor realizado) ÷ desvio-padrão do valor de mercado desde 2010
  A.z = new Array(N).fill(null); A.zSd = new Array(N).fill(null);
  { let n = 0, mean = 0, m2 = 0; for (let i = 0; i < N; i++) { const v = A.mc[i]; if (!isNum(v)) continue; n++; const d = v - mean; mean += d / n; m2 += d * (v - mean); if (n < 30 || !isNum(A.rcF[i])) continue; const sd = Math.sqrt(m2 / n); A.zSd[i] = sd; A.z[i] = (v - A.rcF[i]) / sd; } }
  A.nupl = A.mvrv.map((m) => (isNum(m) && m > 0 ? 1 - 1 / m : null));
  A.mayer = divA(p, A.sma200);
  A.piR = A.sma111.map((v, i) => (isNum(v) && isNum(A.sma350[i]) ? v / (2 * A.sma350[i]) : null));
  A.y2R = divA(p, A.sma730);
  A.w200R = divA(p, A.sma1400);
  A.g350R = divA(p, A.sma350);
  // mineração
  const iss = g(cm.iss), fees = g(cm.fees), hash = g(cm.hash);
  A.puell = divA(iss, rollMean(iss, 365));
  const eh = (a) => a.map((v) => (isNum(v) ? v / 1e6 : null)); // TH/s → EH/s
  A.hash7 = eh(rollMean(hash, 7)); A.h30 = eh(rollMean(hash, 30)); A.h60 = eh(rollMean(hash, 60));
  A.fees7 = rollMean(fees, 7);
  A.rev7 = rollMean(iss.map((v, i) => (isNum(v) && isNum(fees[i]) && isNum(p[i]) ? v + fees[i] * p[i] : null)), 7);
  // rede e corretoras
  A.addr7 = rollMean(g(cm.addr), 7); A.tx7 = rollMean(g(cm.tx), 7); A.bal = g(cm.bal);
  A.exch = g(cm.exch);
  const inf = g(cm.inflow), out = g(cm.outflow);
  A.net7 = rollSum(inf.map((v, i) => (isNum(v) && isNum(out[i]) ? v - out[i] : null)), 7);
  A.fng = g(j.fng);
  // BGeometrics (bitcoin-data.com)
  for (const k of ['sthRealizedPrice', 'lthRealizedPrice', 'trueMarketMean', 'terminalPrice', 'cvdd', 'balancedPrice', 'sthMvrv', 'lthMvrv', 'sopr', 'sthSopr', 'lthSopr', 'aviv', 'reserveRisk', 'rhodlRatio']) A[k] = g(bd[k]);
  A.sopr7 = rollMean(A.sopr, 7); A.sthSopr7 = rollMean(A.sthSopr, 7); A.lthSopr7 = rollMean(A.lthSopr, 7);
  A.hr = hashRibbons(A.h30, A.h60, A.sma10, A.sma20);
  const D = { A, N, t0, hasLive, live, lastCM: lp.i, bdLast: j.bdLast || {}, via: j._via || 'robot', gen: j.generatedAt, T: (i) => t0 + i * DAYMS };
  D.key = `${j.generatedAt}|${N}|${hasLive}`;
  return D;
}
function labData() {
  const c = CACHE.get('lab'); const j = LAB.raw || (c && c.v); if (!j) return null;
  const now = Date.now();
  if (LAB.D && LAB.D._j === j && now - LAB.D._at < 15000) return LAB.D;
  let D = null;
  try { D = labBuild(j, PX.BTCUSDT && PX.BTCUSDT.p); } catch (e) { console.warn('[NX] lab', e); }
  if (D) { D._j = j; D._at = now; }
  LAB.D = D; return D;
}

// ---------- formatos ----------
function labFmt(f, v, axis) {
  if (!isNum(v)) return '—';
  switch (f) {
    case 'usd': return axis ? (Math.abs(v) >= 100 ? fmtNum(v, 0, 0) : fmtNum(v, 2, 2)) : usd(v, Math.abs(v) >= 100 ? [0, 0] : [2, 2]);
    case 'usdc': return fmtCompact(v, 'USD');
    case 'x3': return fmtNum(v, 3, 3);
    case 'rr': return fmtNum(v, 5, 5);
    case 'int': return fmtNum(v, 0, 0);
    case 'cmp': return fmtCompact(v, '');
    case 'eh': return fmtNum(v, 0, 0) + (axis ? '' : ' EH/s');
    case 'btc': return fmtNum(v, 0, 0) + (axis ? '' : ' BTC');
    case 'btcd': return fmtNum(v, 2, 2) + (axis ? '' : ' BTC');
    case 'btcs': return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), 0, 0) + (axis ? '' : ' BTC');
    default: return fmtNum(v, 2, 2);
  }
}
const LAB_SRC = { cm: 'Coin Metrics', bd: 'BGeometrics', fng: 'alternative.me', calc: 'NEXUS HUB' };

// ---------- catálogo de indicadores ----------
// kind 'ov' = linha sobre o preço (US$); 'pane' = painel próprio embaixo do gráfico.
// cyc(A): série resumida por ciclo de halving (no "i" de cada indicador).
function labIndicators() {
  if (LAB._inds && LAB._indsLang === S.lang) return LAB._inds;
  const z = (v, t, tone) => ({ v, t, tone });
  const rdZones = (zs, dflt) => (v) => { for (const x of zs) if (x.test(v)) return { t: x.t, c: x.c }; return { t: dflt || L('neutro', 'neutral'), c: '' }; };
  const lo = (thr, t, c = 'up') => ({ test: (v) => v <= thr, t, c });
  const hi = (thr, t, c = 'down') => ({ test: (v) => v >= thr, t, c });
  const W = L('atenção', 'watch'), X = L('extremo', 'extreme'), B = L('fundo', 'bottom');
  const list = [
    // ----- médias de preço -----
    { id: 'sma200w', cat: 'ma', kind: 'ov', n: '200W SMA', s: L('Média móvel de 200 semanas', '200-week moving average'), c: '#f4b43f', src: 'cm', f: 'usd', kw: 'media movel 200 semanas 1400 dias piso',
      lines: (A) => [{ v: A.sma1400 }], now: (A) => lastPt(A.sma1400), cyc: (A) => A.w200R, cycF: 'x2', cycT: L('Preço ÷ 200W SMA', 'Price ÷ 200W SMA'),
      desc: L('Média do preço dos últimos ~4 anos (1.400 dias): um ciclo inteiro do Bitcoin. Nos fundos de 2015, 2020 e 2022 o preço tocou ou ficou abaixo dela; por isso é vista como o piso de longo prazo.', 'Average price over the last ~4 years (1,400 days): one full Bitcoin cycle. At the 2015, 2020 and 2022 bottoms price touched or fell below it, so it is seen as the long-term floor.'),
      ref: L('Preço abaixo da 200W SMA = zona historicamente barata. A tabela mostra quanto o preço chegou a ficar acima ou abaixo dela em cada ciclo.', 'Price below the 200W SMA = historically cheap zone. The table shows how far above or below it price went in each cycle.') },
    { id: 'sma200', cat: 'ma', kind: 'ov', n: '200D SMA', s: L('Média móvel de 200 dias', '200-day moving average'), c: '#c084fc', src: 'cm', f: 'usd', kw: 'media movel 200 dias tendencia',
      lines: (A) => [{ v: A.sma200 }], now: (A) => lastPt(A.sma200), cyc: (A) => A.mayer, cycF: 'x2', cycT: L('Preço ÷ 200D SMA (Mayer)', 'Price ÷ 200D SMA (Mayer)'),
      desc: L('Média dos últimos 200 dias: a tendência de médio prazo. Preço acima dela costuma indicar mercado de alta; abaixo, de baixa. É a base do Mayer Multiple.', 'Average of the last 200 days: the medium-term trend. Price above it usually means a bull market; below, a bear market. It is the base of the Mayer Multiple.'),
      ref: L('Cruzamentos do preço com a 200D SMA costumam marcar mudanças de tendência.', 'Price crossing the 200D SMA often marks trend changes.') },
    { id: 'sma50', cat: 'ma', kind: 'ov', n: '50D SMA', s: L('Média móvel de 50 dias', '50-day moving average'), c: '#22d3ee', src: 'cm', f: 'usd', kw: 'media movel 50 dias golden cross death cross',
      lines: (A) => [{ v: A.sma50 }], now: (A) => lastPt(A.sma50),
      desc: L('Média dos últimos 50 dias: tendência de curto prazo. A 50D cruzando acima da 200D é o "golden cross"; abaixo, o "death cross".', 'Average of the last 50 days: short-term trend. The 50D crossing above the 200D is the "golden cross"; below, the "death cross".'),
      ref: L('Use junto com a 200D SMA para ver os cruzamentos.', 'Use it with the 200D SMA to see the crosses.') },
    { id: 'bmsb', cat: 'ma', kind: 'ov', n: 'Bull Market Support Band', s: L('20W SMA + 21W EMA', '20W SMA + 21W EMA'), c: '#34d399', src: 'cm', f: 'usd', kw: 'banda suporte mercado alta 20 semanas 21 semanas exponencial',
      lines: (A) => [{ v: A.sma140, t: '20W SMA' }, { v: A.ema147, t: '21W EMA', c: '#86efac' }], now: (A) => lastPt(A.sma140), sideTxt: (A) => { const a = lastPt(A.sma140), b = lastPt(A.ema147), p = lastPt(A.p); if (!a || !b || !p) return { v: '—', s: '' }; const lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v); return { v: labFmt('usd', lo), s: p.v > hi ? L('preço acima da faixa', 'price above band') : p.v < lo ? L('preço abaixo da faixa', 'price below band') : L('preço na faixa', 'price in band'), c: p.v > hi ? 'up' : p.v < lo ? 'down' : 'warn' }; }, nowTxt: (A) => { const a = lastPt(A.sma140), b = lastPt(A.ema147); return a && b ? `${usd(Math.min(a.v, b.v), [0, 0])} – ${usd(Math.max(a.v, b.v), [0, 0])}` : '—'; },
      desc: L('Faixa entre a média simples de 20 semanas e a exponencial de 21 semanas (calculadas em dias: 140 e 147). Nas altas o preço costuma voltar a ela e subir de novo; perder a faixa por semanas costuma marcar o fim da alta.', 'Band between the 20-week simple and 21-week exponential averages (computed in days: 140 and 147). In bull markets price tends to retest it and bounce; losing it for weeks often marks the end of the rally.'),
      ref: L('Preço acima da faixa = tendência de alta preservada.', 'Price above the band = uptrend intact.') },
    { id: 'piTop', cat: 'ma', kind: 'ov', n: 'Pi Cycle Top', s: L('111D SMA e 350D SMA × 2', '111D SMA and 350D SMA × 2'), c: '#ff6170', src: 'cm', f: 'usd', kw: 'pi ciclo topo 111 350 cruzamento',
      lines: (A) => [{ v: A.sma111, t: '111D SMA' }, { v: mulA(A.sma350, 2), t: '350D SMA × 2', c: '#ffb3ba' }], now: (A) => lastPt(A.sma111), sideTxt: (A) => { const r = lastPt(A.piR); return r ? { v: L(`razão ${fmtNum(r.v, 3, 3)}`, `ratio ${fmtNum(r.v, 3, 3)}`), s: r.v >= 1 ? L('cruzou', 'crossed') : L(`${fmtPct((1 - r.v) * 100, 0, false)} do cruzamento`, `${fmtPct((1 - r.v) * 100, 0, false)} from cross`), c: r.v >= 0.9 ? 'down' : '' } : { v: '—', s: '' }; }, nowTxt: (A) => { const r = lastPt(A.piR); return r ? L(`razão ${fmtNum(r.v, 3, 3)}`, `ratio ${fmtNum(r.v, 3, 3)}`) : '—'; },
      cyc: (A) => A.piR, cycF: 'x3', cycT: L('111D SMA ÷ (2 × 350D SMA)', '111D SMA ÷ (2 × 350D SMA)'),
      desc: L('Quando a média de 111 dias cruza acima do dobro da de 350 dias, o mercado esteve a poucos dias dos topos de 2013, 2017 e abril de 2021. Veja na tabela a razão entre as duas em cada ciclo (1,0 = cruzamento).', 'When the 111-day average crosses above twice the 350-day average, the market was days from the 2013, 2017 and April 2021 tops. The table shows the ratio between them in each cycle (1.0 = cross).'),
      ref: L('Razão ≥ 1 = cruzamento (sinal clássico de topo).', 'Ratio ≥ 1 = cross (classic top signal).') },
    { id: 'mayerB', cat: 'ma', kind: 'ov', n: 'Mayer Multiple Bands', s: L('0,8× e 2,4× a 200D SMA', '0.8× and 2.4× the 200D SMA'), c: '#2dd4bf', src: 'cm', f: 'usd', kw: 'bandas mayer multiplo 0,8 2,4 trace',
      lines: (A) => [{ v: mulA(A.sma200, 0.8), t: L('Mayer 0,8×', 'Mayer 0.8×'), st: 2 }, { v: mulA(A.sma200, 2.4), t: L('Mayer 2,4×', 'Mayer 2.4×'), st: 2, c: '#f87171' }], now: (A) => lastPt(A.sma200), sideTxt: (A) => { const m = lastPt(A.mayer); const s2 = lastPt(A.sma200); return m && s2 ? { v: labFmt('usd', s2.v * 0.8), s: L(`Mayer ${fmtNum(m.v, 2, 2)}`, `Mayer ${fmtNum(m.v, 2, 2)}`), c: m.v <= 0.8 ? 'up' : m.v >= 2.4 ? 'down' : '' } : { v: '—', s: '' }; }, nowTxt: (A) => { const m = lastPt(A.sma200); return m ? `${usd(m.v * 0.8, [0, 0])} – ${usd(m.v * 2.4, [0, 0])}` : '—'; },
      cyc: (A) => A.mayer, cycF: 'x2', cycT: 'Mayer Multiple',
      desc: L('Linhas em 0,8× e 2,4× a média de 200 dias. Abaixo de 0,8× o mercado esteve em pânico (fundos); acima de 2,4× — o limite usado por Trace Mayer — em euforia.', 'Lines at 0.8× and 2.4× the 200-day average. Below 0.8× the market was in panic (bottoms); above 2.4× — Trace Mayer’s threshold — in euphoria.'),
      ref: L('Entre as bandas: faixa normal.', 'Between the bands: normal range.') },
    { id: 'y2', cat: 'ma', kind: 'ov', n: '2-Year MA Multiplier', s: L('Média de 2 anos e 5× a média', '2-year MA and 5× the MA'), c: '#a3e635', src: 'cm', f: 'usd', kw: 'media 2 anos 730 dias investor tool multiplicador',
      lines: (A) => [{ v: A.sma730, t: '2Y MA' }, { v: mulA(A.sma730, 5), t: '2Y MA × 5', c: '#f87171' }], now: (A) => lastPt(A.sma730),
      cyc: (A) => A.y2R, cycF: 'x2', cycT: L('Preço ÷ média de 2 anos', 'Price ÷ 2-year MA'),
      desc: L('A média de 2 anos (730 dias) e 5× essa média ("Bitcoin Investor Tool"). Comprar abaixo da média de 2 anos foi historicamente a zona de maior retorno; acima de 5× marcou os topos de 2013 e 2017 (veja na tabela como os picos diminuíram).', 'The 2-year (730-day) average and 5× that average ("Bitcoin Investor Tool"). Buying below the 2-year average was historically the highest-return zone; above 5× marked the 2013 and 2017 tops (see how the peaks shrank in the table).'),
      ref: L('Abaixo da média de 2 anos = zona de acumulação.', 'Below the 2-year MA = accumulation zone.') },
    { id: 'golden', cat: 'ma', kind: 'ov', n: 'Golden Ratio Multiplier', s: L('350D SMA × 1,6 · 2 · 3 · 5', '350D SMA × 1.6 · 2 · 3 · 5'), c: '#facc15', src: 'cm', f: 'usd', kw: 'razao aurea fibonacci 350 dias multiplicador philip swift',
      lines: (A) => [{ v: mulA(A.sma350, 1.6), t: L('350D × 1,6', '350D × 1.6') }, { v: mulA(A.sma350, 2), t: '350D × 2', c: '#fb923c' }, { v: mulA(A.sma350, 3), t: '350D × 3', c: '#f87171' }, { v: mulA(A.sma350, 5), t: '350D × 5', c: '#e879f9' }], now: (A) => lastPt(A.sma350), sideTxt: (A) => { const r = lastPt(A.g350R), m = lastPt(A.sma350); return r && m ? { v: labFmt('usd', m.v * 1.6), s: L(`preço = ${fmtNum(r.v, 2, 2)}× a 350D`, `price = ${fmtNum(r.v, 2, 2)}× 350D`), c: '' } : { v: '—', s: '' }; }, nowTxt: (A) => { const m = lastPt(A.sma350); return m ? `×1,6 ${usd(m.v * 1.6, [0, 0])}` : '—'; },
      cyc: (A) => A.g350R, cycF: 'x2', cycT: L('Preço ÷ 350D SMA', 'Price ÷ 350D SMA'),
      desc: L('Múltiplos da média de 350 dias (×1,6, ×2, ×3 e ×5), criados por Philip Swift. Os topos de cada ciclo pararam em múltiplos cada vez menores, e a linha ×1,6 funcionou como resistência nas altas.', 'Multiples of the 350-day average (×1.6, ×2, ×3 and ×5), created by Philip Swift. Each cycle top stopped at a smaller multiple, and the ×1.6 line acted as resistance in rallies.'),
      ref: L('A tabela mostra o múltiplo máximo atingido em cada ciclo.', 'The table shows the highest multiple reached in each cycle.') },
    // ----- valor on-chain -----
    { id: 'realized', cat: 'val', kind: 'ov', n: 'Realized Price', s: L('Preço realizado: custo médio da rede', 'Network average cost basis'), c: '#62b4ff', src: 'cm', f: 'usd', kw: 'preco realizado custo medio valor realizado',
      lines: (A) => [{ v: A.rp }], now: (A) => lastPt(A.rpF), cyc: (A) => A.mvrv, cycF: 'x2', cycT: 'MVRV',
      desc: L('Custo médio de todos os bitcoins em circulação: cada moeda conta pelo preço do dia em que se moveu pela última vez (valor realizado ÷ oferta). Preço abaixo dele = o detentor médio no prejuízo, como nos fundos de 2015, 2018, 2020 e 2022.', 'Average cost of all bitcoins in circulation: each coin counts at the price of the day it last moved (realized cap ÷ supply). Price below it = the average holder at a loss, as at the 2015, 2018, 2020 and 2022 bottoms.'),
      ref: L('Preço ÷ Realized Price = MVRV. Abaixo de 1 = zona de fundo.', 'Price ÷ Realized Price = MVRV. Below 1 = bottom zone.') },
    { id: 'tmm', cat: 'val', kind: 'ov', n: 'True Market Mean', s: L('Custo médio dos investidores ativos', 'Active investors’ cost basis'), c: '#e879f9', src: 'bd', bdk: 'trueMarketMean', f: 'usd', kw: 'cointime media verdadeira mercado investidores ativos',
      lines: (A) => [{ v: A.trueMarketMean }], now: (A) => lastPt(A.trueMarketMean),
      desc: L('Custo médio dos investidores ativos, sem contar moedas perdidas ou paradas há muitos anos (método Cointime, da ARK Invest e Glassnode). Funciona como a "linha do meio" do ciclo: acima, mercado de alta; abaixo, de baixa.', 'Average cost basis of active investors, excluding lost or long-dormant coins (Cointime method by ARK Invest and Glassnode). It works as the cycle’s "midline": above, bull market; below, bear market.'),
      ref: L('Preço abaixo da True Market Mean costuma marcar fase de baixa.', 'Price below the True Market Mean usually marks a bear phase.') },
    { id: 'cvdd', cat: 'val', kind: 'ov', n: 'CVDD', s: L('Cumulative Value-Days Destroyed', 'Cumulative Value-Days Destroyed'), c: '#94a3b8', src: 'bd', bdk: 'cvdd', f: 'usd', kw: 'valor dias destruido willy woo piso fundo',
      lines: (A) => [{ v: A.cvdd }], now: (A) => lastPt(A.cvdd), cyc: (A) => divA(A.p, A.cvdd), cycF: 'x2', cycT: L('Preço ÷ CVDD', 'Price ÷ CVDD'),
      desc: L('Modelo de Willy Woo para achar fundos: soma do "valor-dias destruído" (moedas antigas que se movem × preço) dividida pela idade do mercado. As fórmulas variam entre provedores; este é o valor da BGeometrics — veja na tabela quanto o preço ficou acima dele nos fundos.', 'Willy Woo’s bottom model: the sum of value-days destroyed (old coins moving × price) divided by the market’s age. Formulas vary by provider; this is BGeometrics’ value — the table shows how far above it price stayed at bottoms.'),
      ref: L('Quanto mais perto do CVDD, mais perto de fundos históricos.', 'The closer to CVDD, the closer to historical bottoms.') },
    { id: 'terminal', cat: 'val', kind: 'ov', n: 'Terminal Price', s: L('Modelo de topo de ciclo', 'Cycle-top model'), c: '#f87171', src: 'bd', bdk: 'terminalPrice', f: 'usd', kw: 'preco terminal topo modelo',
      lines: (A) => [{ v: A.terminalPrice }], now: (A) => lastPt(A.terminalPrice), cyc: (A) => divA(A.p, A.terminalPrice), cycF: 'x2', cycT: L('Preço ÷ Terminal Price', 'Price ÷ Terminal Price'),
      desc: L('Modelo de teto de ciclo da família do CVDD (valor-dias destruído ajustado pela oferta). Funciona como um alvo de topo: o preço se aproximou dele nos picos de ciclo.', 'Cycle-ceiling model from the CVDD family (value-days destroyed adjusted for supply). It works as a top target: price approached it at cycle peaks.'),
      ref: L('Preço perto do Terminal Price = região de topo.', 'Price near the Terminal Price = top region.') },
    { id: 'balanced', cat: 'val', kind: 'ov', n: 'Balanced Price', s: L('Preço realizado − preço transferido', 'Realized price − transferred price'), c: '#5eead4', src: 'bd', bdk: 'balancedPrice', f: 'usd', kw: 'preco equilibrado fundo',
      lines: (A) => [{ v: A.balancedPrice }], now: (A) => lastPt(A.balancedPrice),
      desc: L('Diferença entre o preço realizado e o "preço transferido" (de David Puell). O preço tocou essa linha nos fundos de ciclo mais profundos.', 'Difference between realized price and "transferred price" (by David Puell). Price touched this line at the deepest cycle bottoms.'),
      ref: L('Preço perto do Balanced Price = fundo profundo.', 'Price near the Balanced Price = deep bottom.') },
    { id: 'mvrv', cat: 'val', kind: 'pane', n: 'MVRV Ratio', s: L('Valor de mercado ÷ valor realizado', 'Market value ÷ realized value'), c: '#62b4ff', src: 'cm', f: 'x2', kw: 'mvrv valor mercado realizado',
      lines: (A) => [{ v: A.mvrv }], now: (A) => lastPt(A.mvrv), cyc: (A) => A.mvrv, log: true,
      zones: [z(1, B, 'up'), z(2.5, W, 'warn'), z(3.5, X, 'down')], rd: rdZones([lo(0.8, L('fundo extremo', 'extreme bottom')), lo(1, L('zona de fundo', 'bottom zone')), hi(3.5, L('topo extremo', 'extreme top')), hi(2.5, L('aquecido', 'heated'), 'warn')]),
      desc: L('Quanto o preço está acima do custo médio da rede. Abaixo de 1 o detentor médio está no prejuízo (fundos de ciclo). Os picos de cada ciclo estão na tabela — cada vez menores.', 'How far price is above the network’s average cost. Below 1 the average holder is at a loss (cycle bottoms). Each cycle’s peak is in the table — smaller every time.'),
      ref: L('Fundo: abaixo de 1. Atenção: acima de 2,5 (o pico de 2024 foi 2,78). Extremo: acima de 3,5 (topos até 2021).', 'Bottom: below 1. Watch: above 2.5 (the 2024 peak was 2.78). Extreme: above 3.5 (tops up to 2021).') },
    { id: 'mvrvZ', cat: 'val', kind: 'pane', n: 'MVRV Z-Score', s: L('Distância do valor realizado em desvios-padrão', 'Distance from realized value in std devs'), c: '#a78bfa', src: 'calc', f: 'x2', kw: 'mvrv z score desvio padrao',
      lines: (A) => [{ v: A.z }], now: (A) => lastPt(A.z), cyc: (A) => A.z,
      zones: [z(0, B, 'up'), z(3, W, 'warn'), z(7, L('topo clássico', 'classic top'), 'down')], rd: rdZones([lo(0, L('zona de fundo', 'bottom zone')), hi(6, L('topo extremo', 'extreme top')), hi(3, L('aquecido', 'heated'), 'warn')]),
      desc: L('(Valor de mercado − valor realizado) ÷ desvio-padrão do valor de mercado desde 2010. Abaixo de 0 marcou os fundos de ciclo. A faixa vermelha clássica é acima de 7 (topos até 2021); o pico de 2024–25 foi bem menor (tabela). Calculado pelo NEXUS HUB com dados da Coin Metrics.', '(Market value − realized value) ÷ standard deviation of market value since 2010. Below 0 marked cycle bottoms. The classic red zone is above 7 (tops up to 2021); the 2024–25 peak was far lower (table). Computed by NEXUS HUB from Coin Metrics data.'),
      ref: L('Fundo: abaixo de 0. Atenção: acima de 3. Extremo: acima de 6.', 'Bottom: below 0. Watch: above 3. Extreme: above 6.') },
    { id: 'nupl', cat: 'val', kind: 'pane', n: 'NUPL', s: L('Lucro/prejuízo não realizado da rede', 'Net Unrealized Profit/Loss'), c: '#fb7185', src: 'calc', f: 'x2', kw: 'nupl lucro prejuizo nao realizado euforia capitulacao',
      lines: (A) => [{ v: A.nupl }], now: (A) => lastPt(A.nupl), cyc: (A) => A.nupl,
      zones: [z(0, L('capitulação', 'capitulation'), 'up'), z(0.25, L('esperança', 'hope'), ''), z(0.5, L('otimismo', 'optimism'), ''), z(0.75, L('euforia', 'euphoria'), 'down')],
      rd: rdZones([{ test: (v) => v < 0, t: L('capitulação', 'capitulation'), c: 'up' }, { test: (v) => v < 0.25, t: L('esperança / medo', 'hope / fear'), c: '' }, { test: (v) => v < 0.5, t: L('otimismo / ansiedade', 'optimism / anxiety'), c: '' }, { test: (v) => v < 0.75, t: L('crença / negação', 'belief / denial'), c: 'warn' }, { test: () => true, t: L('euforia / ganância', 'euphoria / greed'), c: 'down' }]),
      desc: L('Lucro ou prejuízo não realizado de toda a rede como fração do valor de mercado (1 − 1/MVRV). As faixas clássicas descrevem o humor do ciclo, da capitulação à euforia.', 'Unrealized profit or loss of the whole network as a share of market value (1 − 1/MVRV). The classic bands describe the cycle’s mood, from capitulation to euphoria.'),
      ref: L('Abaixo de 0: capitulação · 0–0,25: esperança/medo · 0,25–0,5: otimismo/ansiedade · 0,5–0,75: crença/negação · acima de 0,75: euforia.', 'Below 0: capitulation · 0–0.25: hope/fear · 0.25–0.5: optimism/anxiety · 0.5–0.75: belief/denial · above 0.75: euphoria.') },
    { id: 'mayer', cat: 'val', kind: 'pane', n: 'Mayer Multiple', s: L('Preço ÷ 200D SMA', 'Price ÷ 200D SMA'), c: '#2dd4bf', src: 'cm', f: 'x2', kw: 'mayer multiplo trace 200 dias',
      lines: (A) => [{ v: A.mayer }], now: (A) => lastPt(A.mayer), cyc: (A) => A.mayer, log: true,
      zones: [z(0.8, B, 'up'), z(1.8, W, 'warn'), z(2.4, X, 'down')], rd: rdZones([lo(0.8, L('zona de fundo', 'bottom zone')), hi(2.4, L('euforia', 'euphoria')), hi(1.8, L('aquecido', 'heated'), 'warn')]),
      desc: L('Preço ÷ média de 200 dias, criado por Trace Mayer. Acima de 2,4 o mercado esteve em euforia; abaixo de 0,8, em pânico.', 'Price ÷ 200-day average, created by Trace Mayer. Above 2.4 the market was euphoric; below 0.8, in panic.'),
      ref: L('Fundo: abaixo de 0,8. Atenção: acima de 1,8 (pico de 2024: 1,85). Extremo: acima de 2,4.', 'Bottom: below 0.8. Watch: above 1.8 (2024 peak: 1.85). Extreme: above 2.4.') },
    { id: 'piR', cat: 'val', kind: 'pane', n: 'Pi Cycle Top Ratio', s: L('111D SMA ÷ (2 × 350D SMA)', '111D SMA ÷ (2 × 350D SMA)'), c: '#ff6170', src: 'cm', f: 'x3', kw: 'pi ciclo razao cruzamento topo',
      lines: (A) => [{ v: A.piR }], now: (A) => lastPt(A.piR), cyc: (A) => A.piR,
      zones: [z(0.9, W, 'warn'), z(1, L('cruzamento', 'cross'), 'down')], rd: rdZones([hi(1, L('cruzou: sinal de topo', 'crossed: top signal')), hi(0.9, L('perto do cruzamento', 'near the cross'), 'warn')], L('longe do cruzamento', 'far from the cross')),
      desc: L('A razão entre a média de 111 dias e o dobro da de 350 dias. Quando chega a 1, as médias se cruzam: o sinal clássico de topo do Pi Cycle.', 'The ratio between the 111-day average and twice the 350-day average. When it reaches 1 the averages cross: the classic Pi Cycle top signal.'),
      ref: L('1,0 = cruzamento.', '1.0 = cross.') },
    // ----- detentores -----
    { id: 'sthRP', cat: 'hold', kind: 'ov', n: 'STH Realized Price', s: L('Custo médio de quem comprou há menos de ~155 dias', 'Cost basis of coins bought < ~155 days ago'), c: '#f472b6', src: 'bd', bdk: 'sthRealizedPrice', f: 'usd', kw: 'curto prazo short term holder custo medio',
      lines: (A) => [{ v: A.sthRealizedPrice }], now: (A) => lastPt(A.sthRealizedPrice), cyc: (A) => divA(A.p, ffill(A.sthRealizedPrice)), cycF: 'x2', cycT: L('Preço ÷ STH Realized Price', 'Price ÷ STH Realized Price'),
      desc: L('Custo médio dos detentores de curto prazo (moedas compradas nos últimos ~155 dias). Preço acima: novos compradores no lucro. Abaixo: no prejuízo — e nas altas, voltar a ele costuma servir de suporte.', 'Average cost of short-term holders (coins bought in the last ~155 days). Price above: new buyers in profit. Below: at a loss — and in rallies, retesting it often acts as support.'),
      ref: L('Preço ÷ STH Realized Price = STH MVRV.', 'Price ÷ STH Realized Price = STH MVRV.') },
    { id: 'lthRP', cat: 'hold', kind: 'ov', n: 'LTH Realized Price', s: L('Custo médio de quem segura há mais de ~155 dias', 'Cost basis of coins held > ~155 days'), c: '#818cf8', src: 'bd', bdk: 'lthRealizedPrice', f: 'usd', kw: 'longo prazo long term holder custo medio',
      lines: (A) => [{ v: A.lthRealizedPrice }], now: (A) => lastPt(A.lthRealizedPrice),
      desc: L('Custo médio dos detentores de longo prazo (moedas paradas há mais de ~155 dias). O preço só ficou abaixo dele em capitulações profundas, como em novembro de 2022.', 'Average cost of long-term holders (coins unmoved for more than ~155 days). Price only fell below it in deep capitulations, such as November 2022.'),
      ref: L('Preço ÷ LTH Realized Price = LTH MVRV.', 'Price ÷ LTH Realized Price = LTH MVRV.') },
    { id: 'sthMvrv', cat: 'hold', kind: 'pane', n: 'STH MVRV', s: L('MVRV dos detentores de curto prazo', 'Short-term holder MVRV'), c: '#f472b6', src: 'bd', bdk: 'sthMvrv', f: 'x2', kw: 'curto prazo short term holder mvrv',
      lines: (A) => [{ v: A.sthMvrv }], now: (A) => lastPt(A.sthMvrv), cyc: (A) => A.sthMvrv,
      zones: [z(1, L('equilíbrio', 'break-even'), 'up'), z(1.3, W, 'warn'), z(1.5, X, 'down')], rd: rdZones([lo(0.8, L('capitulação', 'capitulation')), lo(1, L('no prejuízo', 'at a loss')), hi(1.5, L('lucro extremo', 'extreme profit')), hi(1.3, L('lucro alto', 'high profit'), 'warn')], L('no lucro', 'in profit')),
      desc: L('Preço ÷ custo médio dos detentores de curto prazo. Abaixo de 1, quem comprou nos últimos meses está no prejuízo (medo, perto de fundos locais). Acima de 1,3–1,5, o lucro alto costuma trazer pressão de venda (topos locais).', 'Price ÷ short-term holders’ cost basis. Below 1, recent buyers are at a loss (fear, near local bottoms). Above 1.3–1.5, high profits tend to bring selling pressure (local tops).'),
      ref: L('Equilíbrio: 1. Atenção: acima de 1,3. Extremo: acima de 1,5.', 'Break-even: 1. Watch: above 1.3. Extreme: above 1.5.') },
    { id: 'lthMvrv', cat: 'hold', kind: 'pane', n: 'LTH MVRV', s: L('MVRV dos detentores de longo prazo', 'Long-term holder MVRV'), c: '#818cf8', src: 'bd', bdk: 'lthMvrv', f: 'x2', kw: 'longo prazo long term holder mvrv',
      lines: (A) => [{ v: A.lthMvrv }], now: (A) => lastPt(A.lthMvrv), cyc: (A) => A.lthMvrv,
      zones: [z(1, L('equilíbrio', 'break-even'), 'up')], rd: rdZones([lo(1, L('capitulação profunda', 'deep capitulation'))], L('no lucro', 'in profit')),
      desc: L('Preço ÷ custo médio dos detentores de longo prazo. Só ficou abaixo de 1 em capitulações profundas (novembro de 2022). Picos altos mostram veteranos com muito lucro — e vendendo.', 'Price ÷ long-term holders’ cost basis. It only fell below 1 in deep capitulations (November 2022). High peaks show veterans with large profits — and selling.'),
      ref: L('Abaixo de 1 = capitulação dos veteranos.', 'Below 1 = veterans capitulating.') },
    { id: 'sopr', cat: 'hold', kind: 'pane', n: 'SOPR', s: L('Spent Output Profit Ratio (média de 7 dias)', 'Spent Output Profit Ratio (7-day average)'), c: '#38bdf8', src: 'bd', bdk: 'sopr', f: 'x3', kw: 'sopr lucro vendas moedas gastas',
      lines: (A) => [{ v: A.sopr, w: 1, a: 0.35 }, { v: A.sopr7 }], now: (A) => lastPt(A.sopr7), cyc: (A) => A.sopr7,
      zones: [z(1, L('equilíbrio', 'break-even'), '')], rd: rdZones([lo(1, L('vendas no prejuízo', 'selling at a loss'))], L('vendas no lucro', 'selling in profit')),
      desc: L('Preço de venda ÷ preço de compra das moedas que se moveram no dia. Acima de 1: vendas com lucro; abaixo de 1: com prejuízo. Nas altas, voltar a 1 costuma ser suporte; nas baixas, resistência.', 'Sale price ÷ purchase price of coins moved that day. Above 1: selling in profit; below 1: at a loss. In bull markets a return to 1 tends to be support; in bear markets, resistance.'),
      ref: L('Linha fina: diário. Linha forte: média de 7 dias.', 'Thin line: daily. Bold line: 7-day average.') },
    { id: 'sthSopr', cat: 'hold', kind: 'pane', n: 'STH-SOPR', s: L('SOPR dos detentores de curto prazo', 'Short-term holder SOPR'), c: '#f9a8d4', src: 'bd', bdk: 'sthSopr', f: 'x3', kw: 'curto prazo sopr',
      lines: (A) => [{ v: A.sthSopr, w: 1, a: 0.35 }, { v: A.sthSopr7 }], now: (A) => lastPt(A.sthSopr7), cyc: (A) => A.sthSopr7,
      zones: [z(1, L('equilíbrio', 'break-even'), '')], rd: rdZones([lo(1, L('vendas no prejuízo', 'selling at a loss'))], L('vendas no lucro', 'selling in profit')),
      desc: L('SOPR só das moedas de curto prazo: mostra se quem comprou há pouco está vendendo com lucro ou prejuízo. Mergulhos abaixo de 1 marcaram fundos locais.', 'SOPR of short-term coins only: shows whether recent buyers are selling in profit or at a loss. Dips below 1 marked local bottoms.'),
      ref: L('Média de 7 dias abaixo de 1 = vendas de pânico.', '7-day average below 1 = panic selling.') },
    { id: 'lthSopr', cat: 'hold', kind: 'pane', n: 'LTH-SOPR', s: L('SOPR dos detentores de longo prazo', 'Long-term holder SOPR'), c: '#a5b4fc', src: 'bd', bdk: 'lthSopr', f: 'x2', kw: 'longo prazo sopr capitulacao veteranos',
      lines: (A) => [{ v: A.lthSopr, w: 1, a: 0.35 }, { v: A.lthSopr7 }], now: (A) => lastPt(A.lthSopr7), cyc: (A) => A.lthSopr7, log: true,
      zones: [z(1, L('equilíbrio', 'break-even'), 'up')], rd: rdZones([lo(0.7, L('capitulação extrema', 'extreme capitulation')), lo(1, L('veteranos no prejuízo', 'veterans at a loss'))], L('veteranos no lucro', 'veterans in profit')),
      desc: L('SOPR só das moedas de longo prazo. Abaixo de 1 (média de 7 dias), veteranos estão vendendo no prejuízo — capitulação, como em novembro de 2022.', 'SOPR of long-term coins only. Below 1 (7-day average), veterans are selling at a loss — capitulation, as in November 2022.'),
      ref: L('Sinal de fundo: média de 7 dias abaixo de 1. Extremo: abaixo de 0,7.', 'Bottom signal: 7-day average below 1. Extreme: below 0.7.') },
    { id: 'aviv', cat: 'hold', kind: 'pane', n: 'AVIV Ratio', s: L('Valor ativo ÷ valor investido (Cointime)', 'Active value ÷ investor value (Cointime)'), c: '#f0abfc', src: 'bd', bdk: 'aviv', f: 'x2', kw: 'aviv cointime ativo investidor',
      lines: (A) => [{ v: A.aviv }], now: (A) => lastPt(A.aviv), cyc: (A) => A.aviv,
      zones: [z(0.55, B, 'up'), z(1.8, W, 'warn'), z(2.5, X, 'down')], rd: rdZones([lo(0.55, L('sobrevendido', 'oversold')), hi(2.5, L('sobrevalorizado', 'overvalued')), hi(1.8, L('aquecido', 'heated'), 'warn')]),
      desc: L('Um MVRV que ignora moedas perdidas ou paradas: valor de mercado ativo ÷ valor investido (método Cointime, da ARK Invest e Glassnode). A BGeometrics usa abaixo de 0,55 como sobrevenda e acima de 2,5 como sobrevalorização.', 'An MVRV that ignores lost or dormant coins: active market value ÷ investor value (Cointime method by ARK Invest and Glassnode). BGeometrics uses below 0.55 as oversold and above 2.5 as overvalued.'),
      ref: L('Fundo: abaixo de 0,55. Atenção: acima de 1,8 (picos de 2024). Extremo: acima de 2,5.', 'Bottom: below 0.55. Watch: above 1.8 (2024 peaks). Extreme: above 2.5.') },
    { id: 'rr', cat: 'hold', kind: 'pane', n: 'Reserve Risk', s: L('Preço ÷ convicção dos detentores', 'Price ÷ holder conviction'), c: '#4ade80', src: 'bd', bdk: 'reserveRisk', f: 'rr', kw: 'reserve risk risco reserva convicao hodl',
      lines: (A) => [{ v: A.reserveRisk }], now: (A) => lastPt(A.reserveRisk), cyc: (A) => A.reserveRisk, log: true,
      zones: [z(0.002, L('zona baixa', 'low zone'), 'up')], rd: rdZones([lo(0.002, L('risco baixo', 'low risk'))], L('risco alto', 'high risk')),
      desc: L('Preço ÷ "banco de HODL" (o custo de oportunidade acumulado de quem não vende). Valores baixos = convicção alta e preço barato em relação a ela; valores altos = risco. Na escala da BGeometrics, abaixo de 0,002 é zona baixa.', 'Price ÷ the "HODL bank" (the accumulated opportunity cost of not selling). Low values = high conviction and cheap price relative to it; high values = risk. On BGeometrics’ scale, below 0.002 is the low zone.'),
      ref: L('Compare com o próprio histórico (tabela).', 'Compare with its own history (table).') },
    { id: 'rhodl', cat: 'hold', kind: 'pane', n: 'RHODL Ratio', s: L('Moedas de 1 semana ÷ moedas de 1–2 anos', '1-week ÷ 1–2-year coins'), c: '#facc15', src: 'bd', bdk: 'rhodlRatio', f: 'int', kw: 'rhodl hodl waves ondas',
      lines: (A) => [{ v: A.rhodlRatio }], now: (A) => lastPt(A.rhodlRatio), cyc: (A) => A.rhodlRatio, log: true,
      desc: L('Razão entre o valor realizado das moedas movidas na última semana e o das paradas há 1–2 anos. Picos marcam excesso de dinheiro novo (topos).', 'Ratio between the realized value of coins moved in the last week and those held 1–2 years. Peaks mark excess new money (tops).'),
      ref: L('Compare com o próprio histórico (tabela).', 'Compare with its own history (table).') },
    // ----- mineração -----
    { id: 'puell', cat: 'min', kind: 'pane', n: 'Puell Multiple', s: L('Emissão diária (US$) ÷ média de 365 dias', 'Daily issuance (US$) ÷ 365-day average'), c: '#fbbf24', src: 'cm', f: 'x2', kw: 'puell mineradores emissao receita',
      lines: (A) => [{ v: A.puell }], now: (A) => lastPt(A.puell), cyc: (A) => A.puell, log: true,
      zones: [z(0.5, B, 'up'), z(2.4, W, 'warn'), z(4, X, 'down')], rd: rdZones([lo(0.5, L('mineradores sob pressão', 'miners under stress')), hi(4, L('receita extrema', 'extreme revenue')), hi(2.4, L('receita alta', 'high revenue'), 'warn')]),
      desc: L('Valor das moedas novas emitidas por dia para os mineradores (em US$) ÷ média de 365 dias desse valor. Abaixo de 0,5, mineradores sob pressão (fundos). Acima de 4, receita muito acima do normal (topos até 2017; o ciclo 2024 chegou a 2,4).', 'Value of new coins issued to miners per day (US$) ÷ its 365-day average. Below 0.5, miners under stress (bottoms). Above 4, revenue far above normal (tops up to 2017; the 2024 cycle reached 2.4).'),
      ref: L('Fundo: abaixo de 0,5. Atenção: acima de 2,4. Extremo: acima de 4.', 'Bottom: below 0.5. Watch: above 2.4. Extreme: above 4.') },
    { id: 'hashR', cat: 'min', kind: 'pane', n: 'Hash Ribbons', s: L('Médias de 30 e 60 dias do hashrate', '30- and 60-day hashrate averages'), c: '#60a5fa', src: 'cm', f: 'eh', kw: 'hash ribbons capitulacao mineradores sinal compra charles edwards',
      lines: (A) => [{ v: A.h30, t: '30D' }, { v: A.h60, t: '60D', c: '#f472b6' }], now: (A) => lastPt(A.h30), marks: true,
      rd: () => ({ t: '', c: '' }),
      desc: L('Médias de 30 e 60 dias do poder de mineração. Quando a de 30 cai abaixo da de 60, mineradores estão desligando máquinas (capitulação). A volta da de 30 para cima, com o preço ganhando força (média de 10 dias acima da de 20), é o "sinal de compra" de Charles Edwards — marcado no gráfico.', '30- and 60-day averages of mining power. When the 30-day falls below the 60-day, miners are switching off machines (capitulation). The 30-day crossing back above, with price gaining strength (10-day average above the 20-day), is Charles Edwards’ "buy signal" — marked on the chart.'),
      ref: L('Capitulações de pelo menos 14 dias. Hashrate diário estimado pela Coin Metrics.', 'Capitulations of at least 14 days. Daily hashrate estimated by Coin Metrics.') },
    { id: 'hash', cat: 'min', kind: 'pane', n: 'Hashrate', s: L('Poder de mineração (média de 7 dias)', 'Mining power (7-day average)'), c: '#93c5fd', src: 'cm', f: 'eh', kw: 'hashrate poder mineracao seguranca rede',
      lines: (A) => [{ v: A.hash7 }], now: (A) => lastPt(A.hash7), log: true,
      desc: L('Poder computacional que protege a rede, em exa-hashes por segundo (EH/s). Estimativa diária da Coin Metrics, média de 7 dias.', 'Computing power securing the network, in exahashes per second (EH/s). Daily Coin Metrics estimate, 7-day average.'),
      ref: L('Alta contínua = mineradores investindo na rede.', 'Steady growth = miners investing in the network.') },
    { id: 'rev', cat: 'min', kind: 'pane', n: 'Miner Revenue', s: L('Receita diária dos mineradores (média de 7 dias)', 'Daily miner revenue (7-day average)'), c: '#fcd34d', src: 'calc', f: 'usdc', kw: 'receita mineradores emissao taxas',
      lines: (A) => [{ v: A.rev7 }], now: (A) => lastPt(A.rev7), log: true,
      desc: L('Quanto os mineradores recebem por dia em dólares: emissão de moedas novas + taxas das transações (média de 7 dias).', 'What miners earn per day in dollars: newly issued coins + transaction fees (7-day average).'),
      ref: L('Cai pela metade em cada halving se o preço não subir.', 'Halves at each halving unless price rises.') },
    { id: 'fees', cat: 'min', kind: 'pane', n: 'Fees', s: L('Taxas pagas por dia (média de 7 dias)', 'Fees paid per day (7-day average)'), c: '#fda4af', src: 'cm', f: 'btcd', kw: 'taxas fees rede uso',
      lines: (A) => [{ v: A.fees7 }], now: (A) => lastPt(A.fees7), log: true,
      desc: L('Total de taxas pagas na rede por dia, em BTC (média de 7 dias). Sobe quando há disputa por espaço nos blocos.', 'Total fees paid on the network per day, in BTC (7-day average). Rises when there is competition for block space.'),
      ref: L('Picos = rede congestionada.', 'Spikes = congested network.') },
    // ----- rede e corretoras -----
    { id: 'addr', cat: 'net', kind: 'pane', n: 'Active Addresses', s: L('Endereços ativos por dia (média de 7 dias)', 'Daily active addresses (7-day average)'), c: '#67e8f9', src: 'cm', f: 'cmp', kw: 'enderecos ativos uso rede',
      lines: (A) => [{ v: A.addr7 }], now: (A) => lastPt(A.addr7),
      desc: L('Endereços que enviaram ou receberam BTC no dia (média de 7 dias). Mede o uso da rede.', 'Addresses that sent or received BTC that day (7-day average). Measures network use.'),
      ref: L('Crescimento junto com o preço = alta saudável.', 'Growth alongside price = healthy rally.') },
    { id: 'tx', cat: 'net', kind: 'pane', n: 'Transactions', s: L('Transações por dia (média de 7 dias)', 'Transactions per day (7-day average)'), c: '#5eead4', src: 'cm', f: 'cmp', kw: 'transacoes por dia',
      lines: (A) => [{ v: A.tx7 }], now: (A) => lastPt(A.tx7),
      desc: L('Quantidade de transações confirmadas por dia (média de 7 dias).', 'Number of confirmed transactions per day (7-day average).'),
      ref: L('Mede a atividade na rede.', 'Measures on-chain activity.') },
    { id: 'bal', cat: 'net', kind: 'pane', n: 'Addresses with Balance', s: L('Endereços com saldo', 'Addresses holding BTC'), c: '#a7f3d0', src: 'cm', f: 'cmp', kw: 'enderecos com saldo adocao',
      lines: (A) => [{ v: A.bal }], now: (A) => lastPt(A.bal),
      desc: L('Quantos endereços guardam algum BTC. Cresce com a adoção (uma pessoa pode ter vários endereços).', 'How many addresses hold some BTC. Grows with adoption (one person may have many addresses).'),
      ref: L('Tendência de longo prazo da adoção.', 'Long-term adoption trend.') },
    { id: 'exch', cat: 'net', kind: 'pane', n: 'Exchange Balance', s: L('BTC nas corretoras', 'BTC held on exchanges'), c: '#fca5a5', src: 'cm', f: 'btc', kw: 'saldo corretoras exchanges reservas',
      lines: (A) => [{ v: A.exch }], now: (A) => lastPt(A.exch),
      desc: L('Quantidade de BTC nas carteiras conhecidas de corretoras (Coin Metrics). Queda = moedas saindo para guarda própria, menos oferta disponível para venda.', 'Amount of BTC in known exchange wallets (Coin Metrics). Falling = coins leaving for self-custody, less supply available to sell.'),
      ref: L('Queda contínua = acumulação.', 'Steady decline = accumulation.') },
    { id: 'netflow', cat: 'net', kind: 'pane', n: 'Exchange Netflow', s: L('Entradas − saídas das corretoras (7 dias)', 'Exchange inflows − outflows (7 days)'), c: '#f87171', src: 'cm', f: 'btcs', kw: 'fluxo liquido corretoras entradas saidas netflow',
      lines: (A) => [{ v: A.net7, hist: true }], now: (A) => lastPt(A.net7),
      rd: (v) => (v > 0 ? { t: L('mais entradas', 'net inflow'), c: 'down' } : { t: L('mais saídas', 'net outflow'), c: 'up' }),
      desc: L('Soma de 7 dias das entradas menos as saídas de BTC das corretoras. Positivo (vermelho): mais moedas chegando, possivelmente para vender. Negativo (verde): mais moedas saindo para guarda própria.', '7-day sum of BTC flowing into minus out of exchanges. Positive (red): more coins arriving, possibly to sell. Negative (green): more coins leaving to self-custody.'),
      ref: L('Saídas fortes e contínuas = acumulação.', 'Strong, steady outflows = accumulation.') },
    // ----- sentimento -----
    { id: 'fng', cat: 'sent', kind: 'pane', n: 'Fear & Greed Index', s: L('Medo e ganância (0 a 100)', 'Fear and greed (0 to 100)'), c: '#fbbf24', src: 'fng', f: 'int', kw: 'medo ganancia sentimento fear greed', fixed: [0, 100],
      lines: (A) => [{ v: A.fng }], now: (A) => lastPt(A.fng), cyc: (A) => A.fng, cycF: 'int',
      zones: [z(25, L('medo extremo', 'extreme fear'), 'up'), z(75, L('ganância extrema', 'extreme greed'), 'down')], rd: rdZones([lo(24, L('medo extremo', 'extreme fear')), lo(46, L('medo', 'fear'), ''), hi(76, L('ganância extrema', 'extreme greed')), hi(55, L('ganância', 'greed'), 'warn')]),
      desc: L('Índice da alternative.me que combina volatilidade, volume, redes sociais, dominância e buscas. Medo extremo costuma aparecer perto de fundos; ganância extrema, perto de topos.', 'alternative.me index combining volatility, volume, social media, dominance and search trends. Extreme fear tends to show up near bottoms; extreme greed, near tops.'),
      ref: L('0–24 medo extremo · 25–46 medo · 47–54 neutro · 55–75 ganância · 76–100 ganância extrema.', '0–24 extreme fear · 25–46 fear · 47–54 neutral · 55–75 greed · 76–100 extreme greed.') },
  ];
  LAB._inds = list; LAB._indsLang = S.lang;
  return list;
}
const labIndMap = () => { const m = {}; for (const x of labIndicators()) m[x.id] = x; return m; };
const LAB_CATS = () => [['all', L('Todos', 'All')], ['ma', L('Médias', 'Averages')], ['val', L('Valor on-chain', 'On-chain value')], ['hold', L('Detentores', 'Holders')], ['min', L('Mineração', 'Mining')], ['net', L('Rede e corretoras', 'Network & exchanges')], ['sent', L('Sentimento', 'Sentiment')]];
function labAvail(x, D) { if (!D) return false; D._av = D._av || {}; if (D._av[x.id] === undefined) D._av[x.id] = x.lines(D.A).some((l) => !!lastPt(l.v)); return D._av[x.id]; }
// valor atual de um indicador: { v, i, est } (est = estimado com o preço ao vivo)
function labCur(x, D) { const pt = x.now(D.A); if (!pt) return null; return { ...pt, est: D.hasLive && pt.i === D.N - 1 && ['mvrv', 'mvrvZ', 'nupl', 'mayer', 'realized'].includes(x.id) }; }
function labDateOf(D, i) { return fmtDate(D.T(i) + 12 * 3600e3, { day: '2-digit', month: 'short', timeZone: 'UTC' }); }

// ---------- sinais de fundo e de topo ----------
function labSignals(D) {
  if (D._sig) return D._sig;
  const A = D.A, n = D.N - 1;
  const price = isNum(A.p[n]) ? A.p[n] : (lastPt(A.p) || {}).v;
  const at = (a) => lastPt(a);
  const rp = at(A.rpF), sth = at(A.sthRealizedPrice), lth = at(A.lthRealizedPrice), s200 = at(A.sma200), w200 = at(A.sma1400), y2 = at(A.sma730), term = at(A.terminalPrice);
  const zSd = at(A.zSd), rc = at(A.rcF), sup = at(A.sup);
  const ratio = (b) => (b && isNum(price) ? price / b.v : null);
  const live = (b) => (b ? b.i : null);
  const lvl = (b, k) => (b ? b.v * k : null);
  const zLvl = (k) => (zSd && rc && sup ? (rc.v + k * zSd.v) / sup.v : null);
  const hr = A.hr; const lastBuy = hr.ev.filter((e) => e.buy >= 0).slice(-1)[0];
  const hrDays = lastBuy ? hr.lastI - lastBuy.buy : null;
  const mk = (o) => { o.state = labSigState(o); return o; };
  const fngPt = at(A.fng), puellPt = at(A.puell), lsPt = at(A.lthSopr7), avivPt = at(A.aviv), piPt = at(A.piR), zPt = at(A.z), mayerPt = at(A.mayer);
  const T = (v, d) => L(v, d);
  const acc = [
    mk({ id: 'a-mvrv', ind: 'mvrv', n: T('Preço abaixo do Realized Price', 'Price below Realized Price'), short: 'MVRV', dir: -1, thr: [1, 0.8], v: ratio(rp), f: 'x2', i: live(rp), est: true, vLbl: 'MVRV', lv: [lvl(rp, 1), lvl(rp, 0.8)], lvT: ['Realized Price (MVRV 1)', 'MVRV 0,8'] }),
    mk({ id: 'a-sth', ind: 'sthMvrv', n: T('STH MVRV abaixo de 1', 'STH MVRV below 1'), short: 'STH MVRV', dir: -1, thr: [1, 0.8], v: ratio(sth), f: 'x2', i: live(sth), est: true, bd: 'sthRealizedPrice', lv: [lvl(sth, 1), lvl(sth, 0.8)], lvT: ['STH Realized Price', 'STH MVRV 0,8'] }),
    mk({ id: 'a-lth', ind: 'lthMvrv', n: T('LTH MVRV abaixo de 1', 'LTH MVRV below 1'), short: 'LTH MVRV', dir: -1, thr: [1, 0.8], v: ratio(lth), f: 'x2', i: live(lth), est: true, bd: 'lthRealizedPrice', lv: [lvl(lth, 1), lvl(lth, 0.8)], lvT: ['LTH Realized Price', 'LTH MVRV 0,8'] }),
    mk({ id: 'a-mayer', ind: 'mayer', n: T('Mayer Multiple abaixo de 0,8', 'Mayer Multiple below 0.8'), short: 'Mayer', dir: -1, thr: [0.8, 0.6], v: mayerPt && mayerPt.v, f: 'x2', i: live(mayerPt), lv: [lvl(s200, 0.8), lvl(s200, 0.6)], lvT: ['Mayer 0,8×', 'Mayer 0,6×'] }),
    mk({ id: 'a-200w', ind: 'sma200w', n: T('Preço abaixo da 200W SMA', 'Price below the 200W SMA'), short: '200W', dir: -1, thr: [1, 0.8], v: ratio(w200), f: 'x2', i: live(w200), vLbl: T('preço ÷ 200W', 'price ÷ 200W'), lv: [lvl(w200, 1), lvl(w200, 0.8)], lvT: ['200W SMA', '200W SMA × 0,8'] }),
    mk({ id: 'a-2y', ind: 'y2', n: T('Preço abaixo da média de 2 anos', 'Price below the 2-year MA'), short: '2Y MA', dir: -1, thr: [1, 0.6], v: ratio(y2), f: 'x2', i: live(y2), vLbl: T('preço ÷ 2Y MA', 'price ÷ 2Y MA'), lv: [lvl(y2, 1), lvl(y2, 0.6)], lvT: ['2Y MA', '2Y MA × 0,6'] }),
    mk({ id: 'a-puell', ind: 'puell', n: T('Puell Multiple abaixo de 0,5', 'Puell Multiple below 0.5'), short: 'Puell', dir: -1, thr: [0.5, 0.35], v: puellPt && puellPt.v, f: 'x2', i: live(puellPt) }),
    mk({ id: 'a-lsopr', ind: 'lthSopr', n: T('LTH-SOPR abaixo de 1', 'LTH-SOPR below 1'), short: 'LTH-SOPR', dir: -1, thr: [1, 0.7], v: lsPt && lsPt.v, f: 'x2', i: live(lsPt), bd: 'lthSopr', vLbl: T('média de 7 dias', '7-day average') }),
    mk({ id: 'a-aviv', ind: 'aviv', n: T('AVIV abaixo de 0,55', 'AVIV below 0.55'), short: 'AVIV', dir: -1, thr: [0.55, 0.5], v: avivPt && avivPt.v, f: 'x2', i: live(avivPt), bd: 'aviv' }),
    mk({ id: 'a-hash', ind: 'hashR', n: T('Hash Ribbons: sinal de compra', 'Hash Ribbons: buy signal'), short: 'Hash Ribbons', special: 'hash', v: hr.lastI >= 0 ? 1 : null, i: hr.lastI >= 0 ? hr.lastI : null, hr, hrDays, lastBuy }),
    mk({ id: 'a-fng', ind: 'fng', n: T('Medo extremo', 'Extreme fear'), short: 'Fear & Greed', dir: -1, thr: [24, 15], nearAbs: 8, v: fngPt && fngPt.v, f: 'int', i: live(fngPt) }),
  ];
  const dist = [
    mk({ id: 'd-mvrv', ind: 'mvrv', n: T('MVRV acima de 2,5', 'MVRV above 2.5'), short: 'MVRV', dir: 1, thr: [2.5, 3.5], v: ratio(rp), f: 'x2', i: live(rp), est: true, vLbl: 'MVRV', lv: [lvl(rp, 2.5), lvl(rp, 3.5)], lvT: ['MVRV 2,5', 'MVRV 3,5'] }),
    mk({ id: 'd-z', ind: 'mvrvZ', n: T('MVRV Z-Score acima de 3', 'MVRV Z-Score above 3'), short: 'Z-Score', dir: 1, thr: [3, 6], v: zPt && zPt.v, f: 'x2', i: live(zPt), est: true, lv: [zLvl(3), zLvl(6)], lvT: ['Z-Score 3', 'Z-Score 6'] }),
    mk({ id: 'd-mayer', ind: 'mayer', n: T('Mayer Multiple acima de 1,8', 'Mayer Multiple above 1.8'), short: 'Mayer', dir: 1, thr: [1.8, 2.4], v: mayerPt && mayerPt.v, f: 'x2', i: live(mayerPt), lv: [lvl(s200, 1.8), lvl(s200, 2.4)], lvT: ['Mayer 1,8×', 'Mayer 2,4×'] }),
    mk({ id: 'd-pi', ind: 'piR', n: T('Pi Cycle Top perto do cruzamento', 'Pi Cycle Top near the cross'), short: 'Pi Cycle', dir: 1, thr: [0.9, 1], v: piPt && piPt.v, f: 'x3', i: live(piPt) }),
    mk({ id: 'd-2y', ind: 'y2', n: T('Preço acima de 2,4× a média de 2 anos', 'Price above 2.4× the 2-year MA'), short: '2Y MA', dir: 1, thr: [2.4, 5], v: ratio(y2), f: 'x2', i: live(y2), vLbl: T('preço ÷ 2Y MA', 'price ÷ 2Y MA'), lv: [lvl(y2, 2.4), lvl(y2, 5)], lvT: ['2Y MA × 2,4', '2Y MA × 5'] }),
    mk({ id: 'd-puell', ind: 'puell', n: T('Puell Multiple acima de 2,4', 'Puell Multiple above 2.4'), short: 'Puell', dir: 1, thr: [2.4, 4], v: puellPt && puellPt.v, f: 'x2', i: live(puellPt) }),
    mk({ id: 'd-sth', ind: 'sthMvrv', n: T('STH MVRV acima de 1,3', 'STH MVRV above 1.3'), short: 'STH MVRV', dir: 1, thr: [1.3, 1.5], v: ratio(sth), f: 'x2', i: live(sth), est: true, bd: 'sthRealizedPrice', lv: [lvl(sth, 1.3), lvl(sth, 1.5)], lvT: ['STH MVRV 1,3', 'STH MVRV 1,5'] }),
    mk({ id: 'd-aviv', ind: 'aviv', n: T('AVIV acima de 1,8', 'AVIV above 1.8'), short: 'AVIV', dir: 1, thr: [1.8, 2.5], v: avivPt && avivPt.v, f: 'x2', i: live(avivPt), bd: 'aviv' }),
    mk({ id: 'd-term', ind: 'terminal', n: T('Preço perto do Terminal Price', 'Price near the Terminal Price'), short: 'Terminal', dir: 1, thr: [0.9, 1], v: ratio(term), f: 'x2', i: live(term), est: true, bd: 'terminalPrice', vLbl: T('preço ÷ Terminal', 'price ÷ Terminal'), lv: [lvl(term, 0.9), lvl(term, 1)], lvT: ['Terminal Price × 0,9', 'Terminal Price'] }),
    mk({ id: 'd-fng', ind: 'fng', n: T('Ganância extrema', 'Extreme greed'), short: 'Fear & Greed', dir: 1, thr: [76, 90], nearAbs: 8, v: fngPt && fngPt.v, f: 'int', i: live(fngPt) }),
  ];
  for (const s of [...acc, ...dist]) { s.price = price; if (s.lv) s.dist = s.lv.map((x) => (isNum(x) && isNum(price) ? (x / price - 1) * 100 : null)); }
  D._sig = { acc, dist, price };
  return D._sig;
}
function labSigState(s) {
  if (s.special === 'hash') {
    if (!isNum(s.v)) return 'na';
    if (s.lastBuy && isNum(s.hrDays) && s.hrDays <= 30) return 'on';
    if (s.hr.capNow >= 0) return 'near';
    return 'off';
  }
  if (!isNum(s.v)) return 'na';
  const [a, b] = s.thr; const lo = s.dir < 0;
  if (lo ? s.v <= b : s.v >= b) return 'ext';
  if (lo ? s.v <= a : s.v >= a) return 'on';
  const near = s.nearAbs ? (lo ? s.v <= a + s.nearAbs : s.v >= a - s.nearAbs) : (lo ? s.v <= a * 1.1 : s.v >= a * 0.9);
  return near ? 'near' : 'off';
}
// posição no ciclo (modelo): média dos percentis históricos (desde 2012) de MVRV, Mayer e Pi Cycle
function labScore(D) {
  if (D._score !== undefined) return D._score;
  const A = D.A, from = Math.round((Date.UTC(2012, 0, 1) - D.t0) / DAYMS);
  const pct = (a) => { const cur = lastPt(a); if (!cur) return null; let n = 0, le = 0; for (let i = Math.max(0, from); i < a.length; i++) { const v = a[i]; if (!isNum(v)) continue; n++; if (v <= cur.v) le++; } return n ? (le / n) * 100 : null; };
  const parts = [pct(A.mvrv), pct(A.mayer), pct(A.piR)].filter(isNum);
  D._score = parts.length ? avg(parts) : null;
  return D._score;
}

// ---------- página ----------
function labLoadPrefs() {
  const p = LS.get('lab3');
  if (p) {
    if (Array.isArray(p.sel)) LAB.sel = p.sel.filter((k) => typeof k === 'string').slice(0, 24);
    if (['ind', 'lv'].includes(p.mode)) LAB.mode = p.mode;
    if (['acc', 'dist'].includes(p.tab)) LAB.tab = p.tab;
    if (['6m', '1y', '2y', '4y', '8y', 'all'].includes(p.range)) LAB.range = p.range;
    LAB.log = p.log !== false;
    if (isNum(p.h)) LAB.h = p.h;
  }
}
function labSave() { LS.set('lab3', { sel: LAB.sel, mode: LAB.mode, tab: LAB.tab, range: LAB.range, log: LAB.log, h: LAB.h }); }
const labH = () => (LAB.h || clamp(Math.round(window.innerHeight * 0.52), 320, 620));
function labHtml() { return `${pageHead(PAGES.lab, `<span class="stamp-wrap">${stamp('lab')}</span>`)}<div id="lab-body"></div>`; }
function labShell() {
  const cats = LAB_CATS().map(([k, t]) => `<button class="lab-cat" data-act="labCat" data-k="${k}" aria-pressed="${LAB.cat === k}">${esc(t)}</button>`).join('');
  return `<section class="panel" id="lab-sig"></section>
  <section class="panel mt lab-wrap" id="lab-wrap">
    ${panelHead('chart-spline', L('Gráfico do ciclo', 'Cycle chart'), { sub: esc(L('Arraste para mover, use a roda do mouse ou a pinça para aproximar e a alça embaixo para mudar a altura. Marque à direita os indicadores que quer ver.', 'Drag to pan, scroll or pinch to zoom and use the handle below to resize. Tick the indicators you want on the right.')) })}
    <div class="lab-tools">
      ${seg('labm', [['ind', L('Indicadores', 'Indicators'), 'layers'], ['lv', L('Níveis de sinal', 'Signal levels'), 'ruler']], LAB.mode)}
      ${seg('labr', [['6m', '6M'], ['1y', L('1A', '1Y')], ['2y', L('2A', '2Y')], ['4y', L('4A', '4Y')], ['8y', L('8A', '8Y')], ['all', L('Tudo', 'All')]], LAB.range)}
      <label class="check small lab-log"><input type="checkbox" data-chg="labLog" ${LAB.log ? 'checked' : ''}>${esc(L('Escala log', 'Log scale'))}</label>
      <span class="grow"></span>
      <div class="lab-zoom">
        <button class="btn sm ghost" data-act="labZoom" data-z="out" title="${esc(L('Afastar', 'Zoom out'))}" aria-label="${esc(L('Afastar', 'Zoom out'))}">${ico('zoom-out', 17)}</button>
        <button class="btn sm ghost" data-act="labZoom" data-z="in" title="${esc(L('Aproximar', 'Zoom in'))}" aria-label="${esc(L('Aproximar', 'Zoom in'))}">${ico('zoom-in', 17)}</button>
        <button class="btn sm ghost" data-act="labZoom" data-z="fit" title="${esc(L('Voltar ao período escolhido', 'Back to the chosen period'))}" aria-label="${esc(L('Voltar ao período escolhido', 'Back to the chosen period'))}">${ico('rotate-ccw', 17)}</button>
        <button class="btn sm" id="lab-fbtn" data-act="labFull">${ico('maximize-2', 16)}<span class="hide-m">${esc(L('Tela cheia', 'Full screen'))}</span></button>
      </div>
    </div>
    <div class="lab-main">
      <div class="lab-charts">
        <div class="lab-cw"><div class="lab-leg" id="lab-leg" aria-live="off"></div><div id="lab-chart" style="height:${labH()}px"></div></div>
        <div id="lab-panes"></div>
        <div class="lab-grip" id="lab-grip" role="separator" aria-orientation="horizontal" tabindex="0" title="${esc(L('Arraste para mudar a altura do gráfico', 'Drag to resize the chart'))}" aria-label="${esc(L('Altura do gráfico (setas para cima e para baixo)', 'Chart height (up and down arrows)'))}"></div>
        <div id="lab-lv"></div>
      </div>
      <aside class="lab-side" aria-label="${esc(L('Indicadores do gráfico', 'Chart indicators'))}">
        <div class="lab-side-in">
          <button class="lab-side-h" data-act="labSideTog" aria-expanded="${LAB.sideOpen}"><span class="row" style="gap:8px">${ico('sliders-horizontal', 17)}<b>${esc(L('Indicadores', 'Indicators'))}</b></span><span class="tiny faint" id="lab-cnt"></span>${ico('chevron-down', 16, 'lab-chev')}</button>
          <div class="lab-side-b"${LAB.sideOpen ? '' : ' hidden'}>
            <div class="inp-search">${ico('search', 16)}<input class="inp" id="lab-q" type="search" data-inp="labQ" placeholder="${esc(L('Buscar indicador (ex.: MVRV, SOPR, média)', 'Search indicator (e.g. MVRV, SOPR, average)'))}" value="${esc(LAB.q)}" autocomplete="off" aria-label="${esc(L('Buscar indicador', 'Search indicator'))}"></div>
            <div class="lab-cats" role="group" aria-label="${esc(L('Categorias', 'Categories'))}">${cats}</div>
            <div class="lab-list" id="lab-list"></div>
            <div class="lab-side-f"><button class="link-btn" data-act="labDefault">${ico('rotate-ccw', 14)}${esc(L('Seleção padrão', 'Default selection'))}</button><button class="link-btn" data-act="labClear">${ico('x', 14)}${esc(L('Limpar', 'Clear'))}</button></div>
          </div>
        </div>
      </aside>
    </div>
    <div id="lab-note"></div>
  </section>`;
}
function labDraw() {
  const box = $('#lab-body'); if (!box) return;
  if (!hasPro()) { box.innerHTML = proGate(PAGES.lab); return; }
  if (!$('#lab-wrap')) { box.innerHTML = labShell(); labGrip(); }
  labDrawSignals(); labDrawSide(); labDrawNote(); labChart();
}
function labEmpty() {
  const h = HEALTH.lab;
  if (h && h.ok === false && !LAB.raw) return emptyBox('wifi-off', L('Histórico indisponível agora', 'History unavailable right now'), esc(L('O robô de dados e a Coin Metrics não responderam. Tentando de novo sozinho.', 'The data robot and Coin Metrics did not respond. Retrying automatically.')), `<button class="btn sm" data-act="labRetry">${ico('refresh-cw', 15)}${esc(L('Tentar agora', 'Try now'))}</button>`);
  return null;
}
ACT.labRetry = () => runSource('lab', { force: true });

// ----- painel de sinais -----
function labSigCard(s, side, D, tag = 'button') {
  const stTxt = { ext: L('Extremo', 'Extreme'), on: L('Ativo', 'Active'), near: L('Perto', 'Near'), off: L('Inativo', 'Inactive'), na: L('Sem dado', 'No data') }[s.state];
  let val, meta = '';
  if (s.special === 'hash') {
    const hr = s.hr;
    if (s.state === 'on') val = L(`Compra em ${labDateOf(D, s.lastBuy.buy)}`, `Buy on ${labDateOf(D, s.lastBuy.buy)}`);
    else if (s.state === 'near') val = L(`Capitulação desde ${labDateOf(D, hr.capNow)}`, `Capitulation since ${labDateOf(D, hr.capNow)}`);
    else val = s.lastBuy ? L(`Último sinal: ${labDateOf(D, s.lastBuy.buy)}`, `Last signal: ${labDateOf(D, s.lastBuy.buy)}`) : L('Sem capitulação', 'No capitulation');
    meta = L('30D vs 60D do hashrate', '30D vs 60D hashrate');
  } else {
    val = `${labFmt(s.f, s.v)}<small>${esc(s.vLbl ? s.vLbl : '')}</small>`;
    const op = s.dir < 0 ? '<' : '>';
    meta = `${esc(L('sinal', 'signal'))} ${op} ${esc(labFmt(s.f, s.thr[0]))} · ${esc(L('extremo', 'extreme'))} ${op} ${esc(labFmt(s.f, s.thr[1]))}`;
  }
  const lvl = s.lv && isNum(s.lv[0]) ? `<div class="lab-lvl">${ico('ruler', 14)}<span><span class="w">${esc(L('Gatilho', 'Trigger'))} </span><b class="full">${esc(usd(s.lv[0], [0, 0]))}</b><b class="cmp">${esc(fmtCompact(s.lv[0], 'USD'))}</b></span><span>${esc(fmtPct(s.dist[0], 1))}</span></div>` : '';
  const srcBit = s.bd ? `BGeometrics · ${esc(D.bdLast[s.bd] ? fmtDate(parseDate(D.bdLast[s.bd]), { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—')}` : isNum(s.i) ? `${esc(s.ind === 'fng' ? 'alternative.me' : 'Coin Metrics')} · ${esc(labDateOf(D, s.i))}` : '';
  const open = tag === 'button' ? `<button class="lab-card ${side} st-${s.state}" data-act="labInfo" data-k="${esc(s.ind)}" data-sig="${esc(s.id)}">` : `<div class="lab-card static ${side} st-${s.state}">`;
  return `${open}
    <span class="h"><span class="t">${esc(s.n)}</span><span class="st">${esc(stTxt)}</span></span>
    <span class="v${s.special === 'hash' ? ' txt' : ''}">${s.special === 'hash' ? esc(val) : val}</span>
    <span class="m">${meta}</span>
    ${lvl}
    <span class="m faint">${srcBit}${s.est ? ` · ${esc(L('com o preço ao vivo', 'with live price'))}` : ''}</span>
  </${tag}>`;
}
function labTerritory(accOn, distOn) {
  if (distOn >= 3) return { t: L('Território de risco alto', 'High-risk territory'), c: 'down', d: L('Vários sinais de topo ativos ao mesmo tempo, como perto de topos anteriores.', 'Several top signals active at once, as near previous tops.') };
  if (distOn >= 1) return { t: L('Mercado aquecido', 'Heated market'), c: 'warn', d: L('Há sinal de topo ativo: o risco de queda forte aumentou.', 'A top signal is active: the risk of a sharp drop has increased.') };
  if (accOn >= 3) return { t: L('Território de acumulação', 'Accumulation territory'), c: 'up', d: L('Vários sinais de fundo ativos, como nos fundos de ciclo anteriores.', 'Several bottom signals active, as at previous cycle bottoms.') };
  if (accOn >= 1) return { t: L('Território de baixo risco', 'Low-risk territory'), c: 'up', d: L('Algum sinal de fundo ativo e nenhum de topo.', 'Some bottom signal active and no top signal.') };
  return { t: L('Território neutro', 'Neutral territory'), c: '', d: L('Nenhum sinal de fundo ou de topo ativo agora.', 'No bottom or top signal active right now.') };
}
function labDrawSignals() {
  const box = $('#lab-sig'); if (!box) return;
  const head = panelHead('radar', L('Sinais do ciclo', 'Cycle signals'), { sub: esc(L('Indicadores clássicos de fundo e de topo, lidos agora. Cada sinal mostra o limiar e, quando dá, o preço que o ativaria.', 'Classic bottom and top indicators, read now. Each signal shows its threshold and, when possible, the price that would trigger it.')), right: seg('labt', [['acc', L('Acumulação (fundo)', 'Accumulation (bottom)'), 'trending-down'], ['dist', L('Distribuição (topo)', 'Distribution (top)'), 'trending-up']], LAB.tab) });
  const D = labData();
  if (!D) { setHTML(box, head + (labEmpty() || `<div class="lab-sig-g"><div class="skel" style="height:230px"></div>${skel(4, 40)}</div>`)); return; }
  const sg = labSignals(D);
  const on = (a) => a.filter((s) => s.state === 'on' || s.state === 'ext').length;
  const accOn = on(sg.acc), distOn = on(sg.dist);
  const ter = labTerritory(accOn, distOn);
  const list = LAB.tab === 'acc' ? sg.acc : sg.dist;
  const cnt = LAB.tab === 'acc' ? accOn : distOn;
  const sc = labScore(D);
  const scCol = !isNum(sc) ? 'var(--text-3)' : sc < 25 ? 'var(--up)' : sc < 60 ? 'var(--signal)' : sc < 85 ? 'var(--fg-2)' : 'var(--down)';
  const sum = `<div class="lab-sum">
    <div class="small muted b">${esc(LAB.tab === 'acc' ? L('Sinais de fundo ativos', 'Bottom signals active') : L('Sinais de topo ativos', 'Top signals active'))}</div>
    <div class="lab-cnt ${LAB.tab === 'acc' ? (cnt ? 'up' : '') : (cnt ? 'down' : '')}">${cnt}<small>/${list.length}</small></div>
    <div class="lab-terr ${ter.c}">${ico(ter.c === 'down' ? 'triangle-alert' : ter.c === 'warn' ? 'flame' : ter.c === 'up' ? 'shield-check' : 'scale', 15)}${esc(ter.t)}</div>
    <p class="tiny muted" style="line-height:1.45">${esc(ter.d)} ${esc(LAB.tab === 'acc' ? L(`Sinais de topo ativos: ${distOn}/${sg.dist.length}.`, `Top signals active: ${distOn}/${sg.dist.length}.`) : L(`Sinais de fundo ativos: ${accOn}/${sg.acc.length}.`, `Bottom signals active: ${accOn}/${sg.acc.length}.`))}</p>
    <div class="lab-score"><div class="row between tiny"><span class="muted b">${esc(L('Posição no ciclo', 'Cycle position'))}</span>${modelBadge(L('Média dos percentis históricos (desde 2012) de MVRV, Mayer Multiple e Pi Cycle: 0 = mais barato já visto, 100 = mais caro. Cálculo do NEXUS HUB; não é previsão.', 'Average of historical percentiles (since 2012) of MVRV, Mayer Multiple and Pi Cycle: 0 = cheapest ever, 100 = most expensive. NEXUS HUB calculation; not a forecast.'))}</div>
      <div class="row" style="gap:10px;margin-top:6px"><b style="font-size:24px;color:${scCol}">${isNum(sc) ? fmtNum(sc, 0, 0) : '—'}</b><div class="grow"><div class="lab-gauge">${isNum(sc) ? `<i style="left:${clamp(sc, 0, 100)}%"></i>` : ''}</div><div class="row between tiny faint" style="margin-top:3px"><span>${esc(L('barato', 'cheap'))}</span><span>${esc(L('caro', 'expensive'))}</span></div></div></div></div>
  </div>`;
  const cards = `<div class="lab-cards">${list.map((s) => labSigCard(s, LAB.tab, D)).join('')}</div>`;
  setHTML(box, head + `<div class="lab-sig-g">${sum}${cards}</div>` + note(esc(L('Limiares: referências clássicas do mercado e os picos e fundos de cada ciclo (veja a tabela em cada indicador). "Perto" = a menos de 10% do limiar. Sinal não é recomendação.', 'Thresholds: classic market references and each cycle’s peaks and troughs (see each indicator’s table). "Near" = within 10% of the threshold. A signal is not a recommendation.'))));
}

// ----- lista de indicadores (lado do gráfico) -----
function labRowVal(x, D) {
  const cur = labCur(x, D);
  if (!cur) return { v: '—', s: '', c: '' };
  if (x.kind === 'ov') {
    const price = (lastPt(D.A.p) || {}).v;
    if (x.sideTxt) return x.sideTxt(D.A);
    const d = isNum(price) ? (price / cur.v - 1) * 100 : null;
    return { v: labFmt(x.f, cur.v), s: isNum(d) ? L(`preço ${fmtPct(d, 0)}`, `price ${fmtPct(d, 0)}`) : '', c: isNum(d) ? tone(d) : '' };
  }
  const r = x.rd ? x.rd(cur.v) : { t: '', c: '' };
  return { v: labFmt(x.f, cur.v), s: r.t, c: r.c };
}
function labDrawSide() {
  const box = $('#lab-list'); if (!box) return;
  const D = labData();
  const q = labNorm(LAB.q).trim();
  const all = labIndicators();
  const vis = all.filter((x) => (LAB.cat === 'all' || x.cat === LAB.cat) && (!q || labNorm(`${x.n} ${x.s} ${x.kw || ''} ${x.id}`).includes(q)));
  const ok = D ? vis.filter((x) => labAvail(x, D)) : vis;
  const waiting = D ? all.filter((x) => !labAvail(x, D)).length : 0;
  const nSel = LAB.sel.filter((k) => !D || all.some((x) => x.id === k && labAvail(x, D))).length;
  setHTML('#lab-cnt', esc(L(`${nSel} no gráfico`, `${nSel} on chart`)));
  if (!ok.length) { setHTML(box, `<div class="empty" style="padding:20px 8px">${ico('search', 22)}<b>${esc(L('Nenhum indicador encontrado', 'No indicator found'))}</b><p>${esc(L('Tente outro nome, como MVRV, SOPR, Puell ou média.', 'Try another name, like MVRV, SOPR, Puell or average.'))}</p></div>`); return; }
  const cats = Object.fromEntries(LAB_CATS());
  let html = '', lastCat = '';
  for (const x of ok) {
    if (LAB.cat === 'all' && !q && x.cat !== lastCat) { html += `<div class="lab-gh">${esc(cats[x.cat] || '')}</div>`; lastCat = x.cat; }
    const on = LAB.sel.includes(x.id);
    const rv = D ? labRowVal(x, D) : { v: '', s: '', c: '' };
    html += `<div class="lab-row${on ? ' on' : ''}" style="--c:${x.c}">
      <label><input type="checkbox" data-chg="labSel" data-k="${x.id}" ${on ? 'checked' : ''}><span class="lab-bar"></span><span class="grow"><span class="nm">${esc(x.n)}${x.kind === 'pane' ? `<span class="lab-kind" title="${esc(L('Abre um painel embaixo do gráfico', 'Opens a panel below the chart'))}">${esc(L('painel', 'panel'))}</span>` : ''}</span><span class="ds">${esc(x.s)}</span></span></label>
      <span class="vv">${esc(rv.v)}${rv.s ? `<small class="${rv.c}">${esc(rv.s)}</small>` : ''}</span>
      <button class="lab-ib" data-act="labInfo" data-k="${x.id}" title="${esc(L('O que é e como ler', 'What it is and how to read it'))}" aria-label="${esc(L(`Sobre ${x.n}`, `About ${x.n}`))}">${ico('info', 16)}</button>
    </div>`;
  }
  if (waiting && !q && LAB.cat === 'all') html += `<p class="tiny faint" style="padding:10px 4px 2px;line-height:1.45">${esc(L(`${waiting} indicador(es) aguardando dados da fonte.`, `${waiting} indicator(s) waiting for source data.`))}</p>`;
  setHTML(box, html);
}
function labDrawNote() {
  const D = labData();
  const via = D && D.via === 'direct' ? `<b>${esc(L('Robô de dados atrasado:', 'Data robot delayed:'))}</b> ${esc(L('histórico lido direto da Coin Metrics; os indicadores da BGeometrics voltam quando o robô atualizar.', 'history read directly from Coin Metrics; BGeometrics indicators return when the robot updates.'))} ` : '';
  setHTML('#lab-note', note(via + esc(L('Histórico diário: Coin Metrics (preço desde jul/2010, MVRV, oferta, emissão, hashrate, endereços e corretoras), BGeometrics/bitcoin-data.com (STH/LTH, SOPR, AVIV, Reserve Risk, CVDD, Terminal Price, True Market Mean — plano grátis: últimos 4 anos e atraso de até 7 dias) e alternative.me (Fear & Greed). O último ponto usa o preço ao vivo da Binance; o MVRV de hoje é estimado com o preço ao vivo e o último custo-base publicado. Médias e Z-Score calculados pelo NEXUS HUB.', 'Daily history: Coin Metrics (price since Jul 2010, MVRV, supply, issuance, hashrate, addresses and exchanges), BGeometrics/bitcoin-data.com (STH/LTH, SOPR, AVIV, Reserve Risk, CVDD, Terminal Price, True Market Mean — free plan: last 4 years and up to 7 days delay) and alternative.me (Fear & Greed). The last point uses the live Binance price; today’s MVRV is estimated with the live price and the latest published cost basis. Averages and Z-Score computed by NEXUS HUB.'))));
}

// ----- gráfico -----
const labTimes = (D) => { if (D._times) return D._times; const t = new Array(D.N); for (let i = 0; i < D.N; i++) t[i] = ctime(D.T(i), false); D._times = t; return t; };
const labSeriesData = (D, a) => { const t = labTimes(D), o = []; for (let i = 0; i < a.length && i < D.N; i++) if (isNum(a[i])) o.push({ time: t[i], value: a[i] }); return o; };
function labRGBA(hex, a) { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function labPaneHtml(x) {
  return `<div class="lab-pane" data-k="${x.id}"><div class="lab-ph"><span class="lab-dot" style="background:${x.c}"></span><b>${esc(x.n)}</b><span class="v" id="lab-pv-${x.id}"></span><span class="z" id="lab-pz-${x.id}"></span><span class="grow"></span>
    <button class="lab-ib" data-act="labInfo" data-k="${x.id}" title="${esc(L('O que é e como ler', 'What it is and how to read it'))}" aria-label="${esc(L(`Sobre ${x.n}`, `About ${x.n}`))}">${ico('info', 15)}</button>
    <button class="lab-ib" data-act="labRm" data-k="${x.id}" title="${esc(L('Tirar do gráfico', 'Remove from chart'))}" aria-label="${esc(L(`Tirar ${x.n} do gráfico`, `Remove ${x.n} from chart`))}">${ico('x', 15)}</button></div><div class="lab-pc" id="lab-pc-${x.id}"></div></div>`;
}
async function labChart(force) {
  const host = $('#lab-chart'); if (!host) return;
  const D = labData();
  if (!D) { if (!host.querySelector('.skel,.empty')) host.innerHTML = labEmpty() || '<div class="skel" style="height:100%"></div>'; setHTML('#lab-panes', ''); setHTML('#lab-leg', ''); return; }
  const im = labIndMap();
  const avail = (k) => im[k] && labAvail(im[k], D);
  const ov = LAB.mode === 'lv' ? [] : LAB.sel.filter((k) => avail(k) && im[k].kind === 'ov');
  const pn = LAB.sel.filter((k) => avail(k) && im[k].kind === 'pane');
  const key = [D.key, ov.join(','), pn.join(','), LAB.mode, LAB.tab, S.theme, S.lang].join('|');
  if (!force && key === LAB._ck && LAB.charts.length && document.contains(LAB.charts[0].el) && LAB.charts[0].el.querySelector('canvas')) return;
  LAB._ck = key;
  const seq = ++LAB.seq;
  let LWC; try { LWC = await loadScript(LIBS.lwc); } catch (e) { host.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable'), esc(e.message)); return; }
  if (seq !== LAB.seq) return;
  const keep = LAB.charts.length && LAB._keepRange ? labGetRange() : null; LAB._keepRange = false;
  setHTML('#lab-panes', pn.map((k) => labPaneHtml(im[k])).join(''));
  $$('.lab-pc').forEach((el) => { el.style.height = (window.innerWidth <= 640 ? 118 : 138) + 'px'; });
  const times = labTimes(D);
  const ws = times.map((t) => ({ time: t }));
  const c = chartColors();
  const tone2col = (t) => (t === 'up' ? c.up : t === 'down' ? c.down : t === 'warn' ? c.signal : c.text3);
  const charts = [];
  // gráfico principal: preço + linhas
  let r;
  try { r = await makeChart(host, { onTheme: () => labChart(true), priceFmt: (v) => labFmt('usd', v, true) }); } catch (e) { host.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable'), esc(e.message)); return; }
  if (seq !== LAB.seq) return;
  const ch = r.ch;
  ch.applyOptions({ rightPriceScale: { mode: LAB.log ? LWC.PriceScaleMode.Logarithmic : LWC.PriceScaleMode.Normal, minimumWidth: 78, scaleMargins: { top: 0.08, bottom: 0.05 } }, timeScale: { visible: !pn.length, rightOffset: 8, minBarSpacing: 0.02, lockVisibleTimeRangeOnResize: true }, crosshair: { mode: LWC.CrosshairMode.Normal } });
  const base = ch.addLineSeries({ color: 'rgba(0,0,0,0)', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
  base.setData(ws);
  const price = ch.addAreaSeries({ lineColor: c.text, topColor: labRGBA('#8e98ff', 0.16), bottomColor: labRGBA('#8e98ff', 0), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: 'BTC' });
  price.setData(labSeriesData(D, D.A.p));
  const legend = [];
  for (const k of ov) {
    const x = im[k];
    for (const l of x.lines(D.A)) {
      const col = l.c || x.c;
      const s = ch.addLineSeries({ color: col, lineWidth: l.w || 2, lineStyle: l.st || 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(labSeriesData(D, l.v));
      legend.push({ n: l.t || x.n, c: col, v: l.v });
    }
  }
  // modo "níveis de sinal": linhas tracejadas nos preços-gatilho de hoje
  let lvList = [];
  if (LAB.mode === 'lv') {
    const sg = labSignals(D)[LAB.tab];
    for (const s of sg) if (s.lv) s.lv.forEach((p, j) => { if (isNum(p) && p > 0) lvList.push({ p, t: s.lvT[j], ext: j === 1, side: LAB.tab, s }); });
    // no gráfico só os níveis de "sinal" (os de "extremo" ficam na tabela embaixo), sem achatar o preço
    const pNow = (lastPt(D.A.p) || {}).v;
    const drawn = lvList.filter((x) => !x.ext);
    for (const x of drawn) price.createPriceLine({ price: x.p, color: LAB.tab === 'acc' ? c.up : c.signal, lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: x.t });
    const fit = drawn.filter((x) => isNum(pNow) && x.p <= pNow * 2.5 && x.p >= pNow / 3);
    if (fit.length) {
      const lo = Math.min(...fit.map((x) => x.p)), hi = Math.max(...fit.map((x) => x.p));
      price.applyOptions({ autoscaleInfoProvider: (orig) => { const r0 = orig(); if (!r0 || !r0.priceRange) return r0; return { priceRange: { minValue: Math.min(r0.priceRange.minValue, lo * 0.97), maxValue: Math.max(r0.priceRange.maxValue, hi * 1.03) }, margins: r0.margins }; } });
    }
  }
  charts.push({ ch, el: host, s: price, vals: D.A.p });
  // painéis
  for (let pi = 0; pi < pn.length; pi++) {
    const x = im[pn[pi]]; const el = $('#lab-pc-' + x.id); if (!el) continue;
    let rr;
    try { rr = await makeChart(el, { priceFmt: (v) => labFmt(x.f, v, true) }); } catch { continue; }
    if (seq !== LAB.seq) return;
    const pc = rr.ch;
    pc.applyOptions({ layout: { attributionLogo: false }, rightPriceScale: { mode: x.log ? LWC.PriceScaleMode.Logarithmic : LWC.PriceScaleMode.Normal, minimumWidth: 78, scaleMargins: { top: 0.14, bottom: 0.08 } }, timeScale: { visible: pi === pn.length - 1, rightOffset: 8, minBarSpacing: 0.02, lockVisibleTimeRangeOnResize: true }, crosshair: { mode: LWC.CrosshairMode.Normal } });
    const b2 = pc.addLineSeries({ color: 'rgba(0,0,0,0)', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    b2.setData(ws);
    let main = null, mainVals = null;
    const lines = x.lines(D.A);
    lines.forEach((l, li) => {
      const col = l.c || x.c;
      let s;
      if (l.hist) {
        s = pc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: true, base: 0 });
        const t = labTimes(D); const data = [];
        const cDn = labRGBA(c.down, 0.75), cUp = labRGBA(c.up, 0.75);
        for (let i = 0; i < l.v.length; i++) if (isNum(l.v[i])) data.push({ time: t[i], value: l.v[i], color: l.v[i] > 0 ? cDn : cUp });
        s.setData(data);
      } else {
        s = pc.addLineSeries({ color: l.a ? labRGBA(col, l.a) : col, lineWidth: l.w || 2, priceLineVisible: false, lastValueVisible: li === lines.length - 1 || lines.length === 1, crosshairMarkerVisible: !l.a });
        const dd = labSeriesData(D, l.v);
        s.setData(x.log ? dd.filter((d) => d.value > 0) : dd);
      }
      if (x.fixed) s.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: x.fixed[0], maxValue: x.fixed[1] } }) });
      if (!l.a && !main) { main = s; mainVals = l.v; }
    });
    if (!main) { main = b2; mainVals = lines[0].v; }
    for (const zn of x.zones || []) main.createPriceLine({ price: zn.v, color: tone2col(zn.tone), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: zn.t });
    if (x.marks) {
      const t = labTimes(D);
      const mk = D.A.hr.ev.filter((e) => e.buy >= 0 && isNum(mainVals[e.buy])).map((e) => ({ time: t[e.buy], position: 'belowBar', color: c.up, shape: 'arrowUp', text: L('compra', 'buy') }));
      try { main.setMarkers(mk); } catch { /* */ }
    }
    charts.push({ ch: pc, el, s: main, vals: mainVals, x });
  }
  LAB.charts = charts; LAB.cD = D; LAB.legend = legend; LAB.lvList = lvList;
  labSync(D);
  const applyR = () => { if (seq !== LAB.seq) return; if (keep) labSetRange(keep); else labApplyRange(); };
  applyR(); requestAnimationFrame(() => requestAnimationFrame(applyR)); // de novo depois que o tamanho assenta
  labLegend(null);
  labDrawLevels(D);
}
function labGetRange() { try { return LAB.charts[0].ch.timeScale().getVisibleLogicalRange(); } catch { return null; } }
function labSetRange(r) { try { LAB.charts[0].ch.timeScale().setVisibleLogicalRange(r); } catch { /* */ } }
function labApplyRange() {
  const D = LAB.cD; if (!D || !LAB.charts.length) return;
  const yrs = { '6m': 0.5, '1y': 1, '2y': 2, '4y': 4, '8y': 8 }[LAB.range];
  const last = D.N - 1;
  labSetRange(yrs ? { from: Math.max(0, last - Math.round(yrs * 365.25)), to: last + 8 } : { from: 0, to: last + 8 });
}
function labSync(D) {
  const cs = LAB.charts; let lock = false;
  cs.forEach((cc) => {
    cc.ch.timeScale().subscribeVisibleLogicalRangeChange((rg) => {
      if (lock || !rg) return; lock = true;
      cs.forEach((o) => { if (o !== cc) { try { o.ch.timeScale().setVisibleLogicalRange(rg); } catch { /* */ } } });
      lock = false;
    });
    cc.ch.subscribeCrosshairMove((pr) => {
      if (LAB._xlock) return; LAB._xlock = true;
      const t = pr && pr.time !== undefined && pr.point ? pr.time : null;
      const i = t === null ? null : Math.round((t * 1000 - D.t0) / DAYMS);
      LAB._hover = i !== null;
      cs.forEach((o) => {
        if (o === cc) return;
        try { const v = i === null ? null : o.vals[i]; if (isNum(v)) o.ch.setCrosshairPosition(v, t, o.s); else o.ch.clearCrosshairPosition(); } catch { /* */ }
      });
      labLegend(i);
      LAB._xlock = false;
    });
  });
}
function labLegend(i) {
  const D = LAB.cD; if (!D) return;
  const A = D.A; const last = (lastPt(A.p) || {}).i;
  const idx = i === null || i === undefined || i < 0 || i >= D.N ? last : i;
  if (!isNum(idx)) return;
  const p = A.p[idx];
  const bits = [`<b>${esc(fmtDate(D.T(idx) + 12 * 3600e3, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b>`, `<span><i style="background:var(--text)"></i>BTC <b>${esc(labFmt('usd', p))}</b></span>`];
  const hov = !(i === null || i === undefined);
  for (const l of LAB.legend || []) { const v = isNum(l.v[idx]) ? l.v[idx] : !hov ? (lastPt(l.v) || {}).v : null; if (isNum(v)) bits.push(`<span><i style="background:${l.c}"></i>${esc(l.n)} <b>${esc(labFmt('usd', v))}</b></span>`); }
  setHTML('#lab-leg', bits.join(''));
  for (const cc of LAB.charts.slice(1)) {
    const x = cc.x; let v = cc.vals[idx];
    if (!isNum(v) && (i === null || i === undefined)) { const lp = lastPt(cc.vals); v = lp ? lp.v : null; }
    setHTML('#lab-pv-' + x.id, esc(labFmt(x.f, v)));
    const rd = isNum(v) && x.rd ? x.rd(v) : { t: '', c: '' };
    const zEl = $('#lab-pz-' + x.id); if (zEl) { zEl.textContent = rd.t || ''; zEl.className = 'z ' + (rd.c || ''); }
  }
}
function labDrawLevels(D) {
  const box = $('#lab-lv'); if (!box) return;
  if (LAB.mode !== 'lv' || !LAB.lvList || !LAB.lvList.length) { setHTML(box, ''); return; }
  const price = (lastPt(D.A.p) || {}).v;
  const rows = LAB.lvList.slice().sort((a, b) => b.p - a.p).map((x) => {
    const d = isNum(price) ? (x.p / price - 1) * 100 : null;
    return `<div class="lab-lvr ${x.ext ? 'ext' : ''} ${LAB.tab}"><i></i><span class="grow">${esc(x.t)}${x.ext ? ` <span class="faint tiny">· ${esc(L('extremo', 'extreme'))}</span>` : ''}</span><b>${esc(usd(x.p, [0, 0]))}</b><span class="muted">${esc(fmtPct(d, 1))}</span></div>`;
  }).join('');
  setHTML(box, `<div class="lab-lvh">${ico('ruler', 15)}<b>${esc(LAB.tab === 'acc' ? L('Preços que ativam os sinais de fundo', 'Prices that trigger the bottom signals') : L('Preços que ativam os sinais de topo', 'Prices that trigger the top signals'))}</b><span class="tiny faint">${esc(L('valores de hoje; mudam todo dia', 'today’s values; they change daily'))}</span></div><div class="lab-lvs">${rows}</div>`);
}
function labLiveTick() {
  const cc = LAB.charts[0], D = LAB.cD; if (!cc || !D || !D.hasLive) return;
  const live = PX.BTCUSDT && PX.BTCUSDT.p; if (!isNum(live)) return;
  try { cc.s.update({ time: labTimes(D)[D.N - 1], value: live }); D.A.p[D.N - 1] = live; } catch { /* */ }
  if (!LAB._hover) labLegend(null);
}
// alça para mudar a altura (mouse, toque e teclado)
function labGrip() {
  const g = $('#lab-grip'); if (!g || g.dataset.on) return; g.dataset.on = '1';
  let y0 = 0, h0 = 0, pid = null;
  g.addEventListener('pointerdown', (e) => { pid = e.pointerId; try { g.setPointerCapture(pid); } catch { /* */ } y0 = e.clientY; const el = $('#lab-chart'); h0 = el ? el.getBoundingClientRect().height : labH(); g.classList.add('on'); e.preventDefault(); });
  g.addEventListener('pointermove', (e) => { if (pid === null || e.pointerId !== pid) return; labSetH(h0 + e.clientY - y0, false); });
  const end = () => { if (pid === null) return; pid = null; g.classList.remove('on'); labSave(); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('keydown', (e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); const el = $('#lab-chart'); labSetH((el ? el.getBoundingClientRect().height : labH()) + (e.key === 'ArrowDown' ? 40 : -40), true); });
}
function labSetH(h, save) { LAB.h = clamp(Math.round(h), 240, 1400); const el = $('#lab-chart'); if (el && !LAB.full) el.style.height = LAB.h + 'px'; if (save) labSave(); }

// ---------- ações ----------
ACT.seg_labt = (v) => { LAB.tab = v; labSave(); labDrawSignals(); if (LAB.mode === 'lv') { LAB._keepRange = true; labChart(true); } };
ACT.seg_labm = (v) => { LAB.mode = v; labSave(); LAB._keepRange = true; labChart(true); };
ACT.seg_labr = (v) => { LAB.range = v; labSave(); labApplyRange(); };
ACT.labLog = (el) => { LAB.log = el.checked; labSave(); const cc = LAB.charts[0]; if (cc) { try { cc.ch.applyOptions({ rightPriceScale: { mode: LAB.log ? 1 : 0 } }); } catch { /* */ } } };
ACT.labSel = (el) => {
  const k = el.dataset.k; const im = labIndMap(); const x = im[k]; if (!x) return;
  if (el.checked) {
    if (!LAB.sel.includes(k)) LAB.sel.push(k);
    if (x.kind === 'ov' && LAB.mode === 'lv') { LAB.mode = 'ind'; $$('.seg[data-seg="labm"] button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === 'ind'))); }
    const panes = LAB.sel.filter((s) => im[s] && im[s].kind === 'pane');
    if (x.kind === 'pane' && panes.length > LAB_MAX_PANES) { const drop = panes[0]; LAB.sel = LAB.sel.filter((s) => s !== drop); toast(L(`Até ${LAB_MAX_PANES} painéis por vez: tirei ${im[drop].n}.`, `Up to ${LAB_MAX_PANES} panels at a time: removed ${im[drop].n}.`), { ms: 3500 }); }
  } else LAB.sel = LAB.sel.filter((s) => s !== k);
  labSave(); labDrawSide(); LAB._keepRange = true; labChart();
};
ACT.labRm = (el) => { LAB.sel = LAB.sel.filter((s) => s !== el.dataset.k); labSave(); labDrawSide(); LAB._keepRange = true; labChart(); };
ACT.labShow = (el) => {
  const k = el.dataset.k; closeModal();
  const on = LAB.sel.includes(k);
  const fake = { dataset: { k }, checked: !on }; ACT.labSel(fake);
  if (!on) { const w = $('#lab-wrap'); if (w && w.scrollIntoView) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
};
ACT.labCat = (el) => { LAB.cat = el.dataset.k; $$('.lab-cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === LAB.cat))); labDrawSide(); };
ACT.labQ = (el) => { LAB.q = el.value; labDrawSide(); };
ACT.labClear = () => { LAB.sel = []; labSave(); labDrawSide(); LAB._keepRange = true; labChart(); };
ACT.labDefault = () => { LAB.sel = LAB_DEF_SEL.slice(); LAB.mode = 'ind'; $$('.seg[data-seg="labm"] button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === 'ind'))); labSave(); labDrawSide(); LAB._keepRange = true; labChart(); };
ACT.labSideTog = (el) => { LAB.sideOpen = !LAB.sideOpen; el.setAttribute('aria-expanded', String(LAB.sideOpen)); const b = $('.lab-side-b'); if (b) b.hidden = !LAB.sideOpen; };
ACT.labZoom = (el) => {
  const cc = LAB.charts[0], D = LAB.cD; if (!cc || !D) return;
  if (el.dataset.z === 'fit') { labApplyRange(); return; }
  const rg = labGetRange(); if (!rg) return;
  const w = rg.to - rg.from, nw = clamp(w * (el.dataset.z === 'in' ? 0.6 : 1 / 0.6), 30, D.N + 40);
  labSetRange({ from: Math.max(-20, rg.to - nw), to: rg.to });
};
ACT.labFull = () => {
  const w = $('#lab-wrap'); if (!w) return;
  LAB.full = !LAB.full;
  w.classList.toggle('full', LAB.full); document.body.classList.toggle('lab-fs', LAB.full);
  const el = $('#lab-chart'); if (el) el.style.height = LAB.full ? '' : labH() + 'px';
  const b = $('#lab-fbtn'); if (b) b.innerHTML = `${ico(LAB.full ? 'minimize-2' : 'maximize-2', 16)}<span class="hide-m">${esc(LAB.full ? L('Sair da tela cheia', 'Exit full screen') : L('Tela cheia', 'Full screen'))}</span>`;
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && LAB.full && !$('#scrim.open')) ACT.labFull(); });
// janela "o que é e como ler" (com a tabela por ciclo de halving)
function labCycleRows(a, f, D) {
  const cuts = [0, ...LAB_HALVINGS.map((s) => Math.round((Date.parse(s + 'T00:00:00Z') - D.t0) / DAYMS)), D.N];
  const names = ['2010–2012', '2012–2016', '2016–2020', '2020–2024', L('2024–hoje', '2024–now')];
  let rows = '';
  for (let e = 0; e < 5; e++) {
    let mx = null, mn = null, ix = -1, in_ = -1;
    for (let i = Math.max(0, cuts[e]); i < Math.min(a.length, cuts[e + 1]); i++) { const v = a[i]; if (!isNum(v)) continue; if (mx === null || v > mx) { mx = v; ix = i; } if (mn === null || v < mn) { mn = v; in_ = i; } }
    const dt = (i) => fmtDate(D.T(i) + 12 * 3600e3, { month: 'short', year: 'numeric', timeZone: 'UTC' });
    rows += `<tr><td>${esc(names[e])}</td><td class="r">${mx === null ? '—' : `<b>${esc(labFmt(f, mx))}</b> <span class="faint tiny">${esc(dt(ix))}</span>`}</td><td class="r">${mn === null ? '—' : `<b>${esc(labFmt(f, mn))}</b> <span class="faint tiny">${esc(dt(in_))}</span>`}</td></tr>`;
  }
  return rows;
}
ACT.labInfo = (el) => {
  const k = el.dataset.k; const x = labIndMap()[k]; if (!x) return;
  const D = labData();
  const cur = D ? labCur(x, D) : null;
  const rv = D ? labRowVal(x, D) : { v: '—', s: '' };
  const on = LAB.sel.includes(k);
  const src = x.src === 'calc' ? L('Cálculo do NEXUS HUB com dados da Coin Metrics', 'NEXUS HUB calculation from Coin Metrics data') : x.src === 'bd' ? `BGeometrics (bitcoin-data.com)${D && x.bdk && D.bdLast[x.bdk] ? ' · ' + L('dado de ', 'data from ') + fmtDate(parseDate(D.bdLast[x.bdk]), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''}` : LAB_SRC[x.src] + (cur && D ? ' · ' + L('dado de ', 'data from ') + labDateOf(D, cur.i) : '');
  const sigs = D ? [...labSignals(D).acc.map((s) => ({ ...s, side: 'acc' })), ...labSignals(D).dist.map((s) => ({ ...s, side: 'dist' }))].filter((s) => s.ind === k) : [];
  const cyc = D && x.cyc ? x.cyc(D.A) : null;
  const tbl = cyc && cyc.some(isNum) ? `<h3 class="lab-h3">${esc(L('Por ciclo (entre halvings)', 'By cycle (between halvings)'))}${x.cycT ? ` <span class="faint tiny">· ${esc(x.cycT)}</span>` : ''}</h3><div class="tbl-wrap" style="margin:0"><table class="tbl"><thead><tr><th>${esc(L('Ciclo', 'Cycle'))}</th><th class="r">${esc(L('Máximo', 'High'))}</th><th class="r">${esc(L('Mínimo', 'Low'))}</th></tr></thead><tbody>${labCycleRows(cyc, x.cycF || x.f, D)}</tbody></table></div>` : '';
  const sigHtml = sigs.length ? `<h3 class="lab-h3">${esc(L('Sinais ligados a ele', 'Related signals'))}</h3><div class="lab-cards one">${sigs.map((s) => labSigCard(s, s.side, D, 'div')).join('')}</div>` : '';
  openModal({
    title: x.n, wide: true,
    body: `<p class="muted" style="margin-top:-4px">${esc(x.s)}</p>
      <div class="lab-ik"><div><span>${esc(L('Agora', 'Now'))}</span><b>${esc(rv.v)}</b>${rv.s ? `<small class="${rv.c || ''}">${esc(rv.s)}</small>` : ''}</div><div><span>${esc(L('Fonte', 'Source'))}</span><b class="small">${esc(src)}</b>${cur && cur.est ? `<small>${esc(L('estimado com o preço ao vivo', 'estimated with the live price'))}</small>` : ''}</div></div>
      <h3 class="lab-h3">${esc(L('O que é', 'What it is'))}</h3><p class="lab-p">${esc(x.desc)}</p>
      <h3 class="lab-h3">${esc(L('Como ler', 'How to read it'))}</h3><p class="lab-p">${esc(x.ref)}</p>
      ${sigHtml}${tbl}`,
    foot: `<button class="btn ghost" data-act="closeModal">${esc(L('Fechar', 'Close'))}</button>${D && labAvail(x, D) ? `<button class="btn pri" data-act="labShow" data-k="${esc(k)}">${ico(on ? 'eye-off' : 'eye', 16)}${esc(on ? L('Tirar do gráfico', 'Remove from chart') : L('Mostrar no gráfico', 'Show on chart'))}</button>` : ''}`,
  });
};

onPrice((set) => {
  if (S.page !== 'lab' || !hasPro()) return;
  if (set.has('LAB')) { LAB.D = null; labDraw(); return; }
  if (set.has('BTCUSDT') && Date.now() - LAB._tk > 15000) { LAB._tk = Date.now(); LAB.D = null; labDrawSignals(); labDrawSide(); labLiveTick(); }
});
page({
  id: 'lab', group: 'analise', icon: 'flask-conical', pt: 'Bitcoin Lab', en: 'Bitcoin Lab', pro: true, proWhat: 'o Bitcoin Lab', proWhatEn: 'Bitcoin Lab',
  sub: 'O ciclo do Bitcoin com os principais indicadores do mercado: sinais de fundo e de topo, preços-gatilho on-chain e um gráfico com dezenas de indicadores reais.',
  subEn: 'The Bitcoin cycle with the market’s main indicators: bottom and top signals, on-chain trigger prices and a chart with dozens of real indicators.',
  init(el) { labLoadPrefs(); el.innerHTML = labHtml(); labDraw(); },
  show() { labDraw(); },
  hide() { if (LAB.full) ACT.labFull(); },
});
