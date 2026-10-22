// =====================================================================
// BURN, BABY, BURN — recompras, queimas e reservas acumuladas, dia a dia.
// "Se o protocolo ganha, o token ganha?" Quanto do que cada protocolo fatura
// volta para o token: recompra e queima, só queima, recompra e guarda ou
// repasse aos detentores. Fonte: DefiLlama ("holders revenue"), pelo robô.
// =====================================================================
const BB = { per: '1d', filt: 'bb', sort: 'usd', dir: -1, q: '', all: false };
const BB_PER = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const BB_MECH = () => ({
  'buyback-burn': { t: L('Recompra → queima', 'Buyback → burn'), c: '#ff8a4c', ic: 'flame' },
  burn: { t: L('Queima', 'Burn'), c: '#f87171', ic: 'flame-kindling' },
  buyback: { t: L('Recompra e guarda', 'Bought & held'), c: '#62b4ff', ic: 'vault' },
  share: { t: L('Repasse aos detentores', 'Paid to holders'), c: '#a78bfa', ic: 'hand-coins' },
});
const BB_FILT = () => [['bb', L('Recompra e queima', 'Buybacks & burns')], ['burn', L('Só queima', 'Burns only')], ['held', L('Recompra e guarda', 'Bought & held')], ['share', L('Repasse a stakers', 'Paid to stakers')], ['all', L('Todos', 'All')]];
const bbMatch = (type, f) => (f === 'all' ? true : f === 'bought' ? type === 'buyback' || type === 'buyback-burn' : f === 'bb' ? type !== 'share' : f === 'burn' ? type === 'burn' || type === 'buyback-burn' : f === 'held' ? type === 'buyback' : type === 'share');
function registerBuybackSources() {
  source({
    id: 'buybacks', label: 'Burn, Baby, Burn', provider: 'DefiLlama', every: 60 * 60e3, persist: false, kind: 'daily',
    need: () => S.page === 'buybacks' || (S.page === 'tokenomics' && hasPro()),
    run: async () => getPipeline('buybacks', 30 * 3600e3),
    validate: (j) => Array.isArray(j.list) && j.list.length >= 8,
    onData: (j) => { BB.D = null; BB.raw = j; const D = bbData(); if (D && HEALTH.buybacks) HEALTH.buybacks.dataTs = D.ref + 12 * 3600e3; _markDirty('BUYBACKS'); },
  });
}
// ---------- dados: um registro por token (soma das versões/mercados do protocolo) ----------
function bbData() {
  const c = CACHE.get('buybacks'); const j = BB.raw || (c && c.v); if (!j || !Array.isArray(j.list)) return null;
  if (BB.D && BB.D._j === j) return BB.D;
  const DAY = 86400e3;
  // último dia completo (UTC): a data final mais comum entre os tokens (as fontes da DefiLlama chegam em dias diferentes)
  // série diária de cada protocolo: formato compacto (c0 + cv) ou o antigo [[ms, valor], ...]
  const pts = (x) => (Array.isArray(x.cv) && isNum(x.c0) ? x.cv.map((v, k) => [x.c0 + k * DAY, v]).filter((p) => isNum(p[1])) : Array.isArray(x.chart) ? x.chart : []);
  const lastOf = (x) => { const a = pts(x); return a.length ? a[a.length - 1][0] : null; };
  // a DefiLlama já manda o dia de hoje (UTC) pela metade: o último dia completo é o anterior ao da geração do arquivo
  const genDay = Math.floor(Date.parse(j.generatedAt) / DAY) * DAY;
  const refMax = isNum(genDay) ? genDay - DAY : Infinity;
  const cnt = {}; for (const x of j.list) { let l = lastOf(x); if (l > refMax) l = refMax; if (l) cnt[l] = (cnt[l] || 0) + 1; }
  const ref = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0]);
  if (!isNum(ref)) return null;
  const N = 200; const t0 = ref - (N - 1) * DAY;
  const by = new Map();
  for (const x of j.list) {
    const k = x.cg || x.id;
    let t = by.get(k);
    if (!t) { t = { k, cg: x.cg, sym: x.sym || '', n: x.n, img: x.img || x.logo, price: x.price, mcap: x.mcap, fdv: x.fdv, chg: x.chg, rank: x.rank, src: [], end: null }; by.set(k, t); }
    // série diária densa até o dia de referência; antes do 1º dado = sem dado (null), não zero
    const arr = new Array(N).fill(null); let first = null, last = null;
    const P = pts(x);
    for (const [ms, v] of P) { const i = Math.round((ms - t0) / DAY); if (i < 0 || i >= N || !isNum(v)) continue; arr[i] = v; if (first === null || i < first) first = i; if (last === null || i > last) last = i; }
    // "novo": a fonte só tem dados deste protocolo há menos de 30 dias
    const born = P.length ? P[0][0] : null; if (isNum(born) && (t.born === undefined || born < t.born)) t.born = born;
    if (first !== null) for (let i = first; i <= last; i++) if (arr[i] === null) arr[i] = 0;
    t.src.push({ id: x.id, n: x.n, type: x.type || 'share', method: x.method || '', parts: x.parts || [], arr, last, y1: x.y1, all: x.all, d30: x.d30 });
    if (last !== null && (t.end === null || last > t.end)) t.end = last;
    if ((x.d30 || 0) > (t._big || 0)) { t._big = x.d30 || 0; t.n = x.n; }
  }
  const toks = [...by.values()].filter((t) => t.end !== null);
  for (const t of toks) t.isNew = isNum(t.born) && ref - t.born < 30 * DAY;
  // nome do token: o do produto principal sem o sufixo de versão/mercado
  for (const t of toks) t.n = String(t.n || t.sym).replace(/\s+(V\d+(\.\d+)?|Perps|Spot( Orderbook)?|AMM|Lending|L1|Aggregator|Staking|Protocol|Exchange)$/i, '') || t.sym;
  BB.D = { _j: j, toks, ref, t0, N, gen: j.generatedAt };
  return BB.D;
}
const bbLivePx = (t) => { const u = BY_CG[t.cg]; const live = u && PX[u.s]; return live ? live.p : t.price; };
// valor de mercado e FDV: CoinGecko ao vivo quando a moeda está no Top 100 carregado, senão o do robô.
// Abaixo de US$ 1 milhão o CoinGecko costuma não ter a oferta em circulação: fica "—" para não inventar rendimento.
const bbOkCap = (v) => (isNum(v) && v >= 1e6 ? v : null);
const bbMcap = (t) => { const m = CGM[t.cg]; return bbOkCap(m && num(m.market_cap)) || bbOkCap(t.mcap); };
const bbFdv = (t) => { const m = CGM[t.cg]; const f = bbOkCap(m && num(m.fully_diluted_valuation)) || bbOkCap(t.fdv); const mc = bbMcap(t); return f && (!mc || f >= mc * 0.98) ? f : null; };
// soma de uma janela de n dias terminando em "end" (só as fontes do filtro)
function bbWin(t, D, n, back = 0, f = BB.filt) {
  const end = Math.min(t.end, D.N - 1) - back * n;
  let s = 0, has = false;
  for (const src of t.src) {
    if (!bbMatch(src.type, f)) continue;
    for (let i = Math.max(0, end - n + 1); i <= end; i++) { const v = src.arr[i]; if (isNum(v)) { s += v; has = true; } }
  }
  return has ? s : null;
}
function bbRow(t, D) {
  const n = BB_PER[BB.per];
  const srcs = t.src.filter((s) => bbMatch(s.type, BB.filt));
  if (!srcs.length) return null;
  let sum, prev = null;
  if (BB.per === '1y') { const ys = srcs.map((s) => s.y1).filter(isNum); sum = ys.length ? ys.reduce((a, b) => a + b, 0) : null; } else { sum = bbWin(t, D, n); prev = n <= 90 ? bbWin(t, D, n, 1) : null; }
  const perDay = isNum(sum) ? sum / n : null;
  const px = bbLivePx(t), mcap = bbMcap(t), fdv = bbFdv(t);
  const mechs = [...new Set(srcs.map((s) => s.type))];
  const spark = new Array(90).fill(0).map((_, k) => { const i = Math.min(t.end, D.N - 1) - 89 + k; let v = null; for (const s of srcs) { const x = s.arr[i]; if (isNum(x)) v = (v || 0) + x; } return v; });
  return { t, sum, prev, perDay, chg: isNum(sum) && isNum(prev) && prev > 0 ? (sum / prev - 1) * 100 : null, tokens: isNum(sum) && px > 0 ? sum / px : null, tokDay: isNum(perDay) && px > 0 ? perDay / px : null,
    yMcap: isNum(perDay) && mcap > 0 ? perDay * 365 / mcap * 100 : null, wMcap: isNum(perDay) && mcap > 0 ? perDay * 7 / mcap * 100 : null,
    yFdv: isNum(perDay) && fdv > 0 ? perDay * 365 / fdv * 100 : null, wFdv: isNum(perDay) && fdv > 0 ? perDay * 7 / fdv * 100 : null,
    mechs, spark, stale: t.end < D.N - 1 ? t.end : null, px, mcap, fdv };
}
function bbRows(D) {
  const q = labNorm(BB.q).trim();
  let rows = D.toks.filter((t) => !q || labNorm(`${t.n} ${t.sym} ${t.cg}`).includes(q)).map((t) => bbRow(t, D)).filter(Boolean);
  const key = { usd: (r) => r.sum, mcap: (r) => r.yMcap, fdv: (r) => r.yFdv, chg: (r) => r.chg, tok: (r) => r.tokens }[BB.sort] || ((r) => r.sum);
  rows.sort((a, b) => { const x = key(a), y = key(b); if (!isNum(x) && !isNum(y)) return 0; if (!isNum(x)) return 1; if (!isNum(y)) return -1; return (x - y) * BB.dir; });
  return rows;
}
// ---------- desenho ----------
function bbBars(vals, color, w = 120, h = 28) {
  const v = vals.map((x) => (isNum(x) ? x : 0)); const mx = Math.max(...v, 0); if (!(mx > 0)) return `<span class="faint tiny">${esc(L('sem fluxo', 'no flow'))}</span>`;
  const bw = w / v.length;
  return `<svg class="bb-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${v.map((x, i) => (x > 0 ? `<rect x="${(i * bw).toFixed(2)}" y="${(h - Math.max(1, x / mx * h)).toFixed(2)}" width="${Math.max(0.6, bw - 0.4).toFixed(2)}" height="${Math.max(1, x / mx * h).toFixed(2)}" style="fill:${color}"/>` : '')).join('')}</svg>`;
}
const bbPill = (m) => { const x = BB_MECH()[m] || BB_MECH().share; return `<span class="bb-pill" style="--c:${x.c}">${ico(x.ic, 13)}${esc(x.t)}</span>`; };
const bbDayTxt = (D, i) => fmtDate(D.t0 + i * 86400e3 + 12 * 3600e3, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
function bbHtml() {
  return `${pageHead(PAGES.buybacks, `<span class="stamp-wrap">${stamp('buybacks')}</span>`)}
  <section class="panel bb-hero" id="bb-sum"></section>
  <section class="panel flush mt" id="bb-tbl"><div class="panel-h" style="padding:16px 18px 6px;margin:0"><div class="tt"><h2 class="panel-t"><span class="bb-n">01</span>${esc(L('Quanto chega ao token', 'How much reaches the token'))}</h2><p class="panel-s">${esc(L('Valor que cada protocolo usou para recomprar, queimar ou repassar ao token, e quanto isso representa do valor de mercado e do FDV por ano (no ritmo do período).', 'Value each protocol used to buy back, burn or pass to its token, and what that means as a share of market cap and FDV per year (at the period’s pace).'))}</p></div>${seg('bbp', [['1d', '1D'], ['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['1y', L('1A', '1Y')]], BB.per)}</div>
    <div class="bb-tools"><div class="bb-filt" role="group" aria-label="${esc(L('Mecanismo', 'Mechanism'))}">${BB_FILT().map(([k, t]) => `<button class="lab-cat" data-act="bbFilt" data-k="${k}" aria-pressed="${BB.filt === k}">${esc(t)}</button>`).join('')}</div><div class="inp-search bb-q">${ico('search', 16)}<input class="inp" type="search" data-inp="bbQ" value="${esc(BB.q)}" placeholder="${esc(L('Buscar token', 'Search token'))}" aria-label="${esc(L('Buscar token', 'Search token'))}"></div></div>
    <div id="bb-tb"></div></section>
  <div class="grid g-2 mt"><section class="panel" id="bb-burners"></section><section class="panel" id="bb-buyers"></section></div>
  <div class="grid g-2 mt"><section class="panel" id="bb-rank"></section><section class="panel" id="bb-yield"></section></div>
  <section class="panel mt" id="bb-how"></section>`;
}
function bbEmpty() {
  const h = HEALTH.buybacks;
  return h && h.ok === false ? emptyBox('wifi-off', L('Dados de recompra indisponíveis agora', 'Buyback data unavailable right now'), esc(L('O arquivo do robô não chegou. Tentando de novo; enquanto isso, veja direto na DefiLlama.', 'The robot file did not arrive. Retrying; meanwhile, see it on DefiLlama.')), extLink('https://defillama.com/holders-revenue', 'DefiLlama')) : skel(5, 22);
}
function bbDraw() { bbDrawSum(); bbDrawTbl(); bbDrawTop(); bbDrawRank(); bbDrawYield(); bbDrawHow(); }
function bbDrawSum() {
  const box = $('#bb-sum'); if (!box) return;
  const D = bbData();
  if (!D) { setHTML(box, bbEmpty()); return; }
  const rows = bbRows(D); const n = BB_PER[BB.per];
  const tot = rows.reduce((s, r) => s + (r.sum || 0), 0);
  const prev = BB.per === '1y' ? null : rows.reduce((s, r) => s + (r.prev || 0), 0);
  // queimado e guardado: só o que o filtro atual inclui
  const part = (f) => (['all', 'bb', f].includes(BB.filt) ? rows.reduce((s, r) => s + (BB.per === '1y' ? r.t.src.filter((x) => bbMatch(x.type, f)).reduce((a, x) => a + (x.y1 || 0), 0) : bbWin(r.t, D, n, 0, f) || 0), 0) : 0);
  const burnT = part('burn'), heldT = part('held');
  const act = rows.filter((r) => r.sum > 0).length;
  const perLbl = { '1d': L('no último dia', 'on the last day'), '7d': L('em 7 dias', 'in 7 days'), '30d': L('em 30 dias', 'in 30 days'), '90d': L('em 90 dias', 'in 90 days'), '1y': L('em 1 ano', 'in 1 year') }[BB.per];
  const ch = isNum(prev) && prev > 0 ? (tot / prev - 1) * 100 : null;
  setHTML(box, `<div class="bb-tag">${esc(L('Se o protocolo ganha, o token ganha?', 'If the protocol wins, does the token win?'))}</div>
    <div class="bb-kpis">
      ${kpiBox(L(`Chegou aos tokens ${perLbl}`, `Reached the tokens ${perLbl}`), esc(fmtCompact(tot)), esc(L(`${fmtCompact(tot / n)} por dia em média`, `${fmtCompact(tot / n)} per day on average`)))}
      ${kpiBox(L('Comparado ao período anterior', 'Versus the previous period'), isNum(ch) ? `<span class="${tone(ch)}">${esc(fmtPct(ch, 1))}</span>` : '—', esc(isNum(prev) ? L(`antes: ${fmtCompact(prev)}`, `before: ${fmtCompact(prev)}`) : L('sem comparação para 1 ano', 'no comparison for 1 year')))}
      ${kpiBox(L('Queimado (sai de circulação)', 'Burned (removed from supply)'), esc(fmtCompact(burnT)), esc(L('queima direta e recompra → queima', 'direct burns and buyback → burn')))}
      ${kpiBox(L('Recomprado e guardado', 'Bought & held'), esc(fmtCompact(heldT)), esc(L('fica na tesouraria ou em fundo do protocolo', 'kept in the treasury or a protocol fund')))}
      ${kpiBox(L('Tokens com fluxo', 'Tokens with flow'), esc(`${act}/${rows.length}`), esc(L('tiveram recompra ou queima no período', 'had buybacks or burns in the period')))}
    </div>
    <p class="tiny faint" style="margin-top:10px">${esc(L(`Último dia completo (UTC): ${fmtDate(D.ref + 12 * 3600e3, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} · robô atualizado ${fmtDateTime(D.gen)} · fonte: DefiLlama (receita repassada aos detentores).`, `Last complete day (UTC): ${fmtDate(D.ref + 12 * 3600e3, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} · robot updated ${fmtDateTime(D.gen)} · source: DefiLlama (holders revenue).`))}</p>`);
}
function bbDrawTbl() {
  const box = $('#bb-tb'); if (!box) return;
  const D = bbData();
  if (!D) { setHTML(box, `<div style="padding:0 18px 18px">${bbEmpty()}</div>`); return; }
  const rows = bbRows(D);
  const multi = BB.per !== '1d';
  const th = (k, t, cls = 'r') => `<th class="${cls} sortable" data-act="bbSort" data-k="${k}" aria-sort="${BB.sort === k ? (BB.dir < 0 ? 'descending' : 'ascending') : 'none'}">${esc(t)}${BB.sort === k ? (BB.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const total = rows.length; const shown = BB.all || BB.q ? rows : rows.slice(0, 40);
  const body = shown.map((r, i) => {
    const t = r.t; const noFlow = !(r.sum > 0);
    const col = (BB_MECH()[r.mechs[0]] || BB_MECH().share).c;
    return `<tr class="click" data-act="bbOpen" data-k="${esc(t.k)}" tabindex="0">
      <td class="r rank">${i + 1}</td>
      <td><div class="coin">${coinLogo({ b: t.sym, logo: t.img, cg: t.cg }, 28)}<div><div class="nm">${esc(t.sym || t.n)}${t.isNew ? ` <span class="bb-new" title="${esc(L('Entrou na fonte há menos de 30 dias', 'Added to the source less than 30 days ago'))}">${esc(L('novo', 'new'))}</span>` : ''}${noFlow ? ` <span class="bb-nf">${esc(L('sem fluxo', 'no flow'))}</span>` : ''}</div><div class="sy">${esc(t.n)}${isNum(r.stale) ? ` · <span class="warn-t">${esc(L(`dado até ${bbDayTxt(D, r.stale)}`, `data to ${bbDayTxt(D, r.stale)}`))}</span>` : ''}</div></div></div></td>
      <td><div class="bb-mechs">${r.mechs.map(bbPill).join('')}</div></td>
      <td class="r">${isNum(r.tokens) ? `<b class="num">≈ ${esc(fmtNum(r.tokens, 0, r.tokens < 10 ? 2 : 0))}</b>${multi && isNum(r.tokDay) ? `<div class="tiny faint">≈ ${esc(fmtNum(r.tokDay, 0, r.tokDay < 10 ? 2 : 0))}/${esc(L('dia', 'day'))}</div>` : `<div class="tiny faint">${esc(t.sym)}</div>`}` : '—'}</td>
      <td class="r"><b class="num">${isNum(r.sum) ? esc(usd(r.sum, [0, 0])) : '—'}</b>${multi && isNum(r.perDay) ? `<div class="tiny faint">${esc(usd(r.perDay, [0, 0]))}/${esc(L('dia', 'day'))}</div>` : ''}${isNum(r.chg) ? `<div class="tiny ${tone(r.chg)}">${esc(fmtPct(r.chg, 0))} ${esc(L('vs antes', 'vs prior'))}</div>` : ''}</td>
      <td class="r">${isNum(r.yMcap) ? `<b class="num">${esc(fmtNum(r.yMcap, 2, 2))}%/${esc(L('ano', 'yr'))}</b><div class="tiny faint">${esc(fmtNum(r.wMcap, 3, 3))}%/${esc(L('sem.', 'wk'))}</div>` : '—'}</td>
      <td class="r hide-m">${isNum(r.yFdv) ? `<b class="num">${esc(fmtNum(r.yFdv, 2, 2))}%/${esc(L('ano', 'yr'))}</b><div class="tiny faint">${esc(fmtNum(r.wFdv, 3, 3))}%/${esc(L('sem.', 'wk'))}</div>` : '—'}</td>
      <td class="hide-m">${bbBars(r.spark, col)}</td>
    </tr>`;
  }).join('');
  setHTML(box, `<div class="tbl-wrap"><table class="tbl bb-t"><thead><tr><th class="r">#</th><th>${esc(L('Ativo', 'Asset'))}</th><th>${esc(L('Mecanismo', 'Mechanism'))}</th>${th('tok', L('Tokens', 'Tokens'))}${th('usd', L('Valor (US$)', 'Value (US$)'))}${th('mcap', L('% do valor de mercado', '% of market cap'))}<th class="r sortable hide-m" data-act="bbSort" data-k="fdv">${esc(L('% do FDV', '% of FDV'))}${BB.sort === 'fdv' ? (BB.dir < 0 ? ' ▼' : ' ▲') : ''}</th><th class="hide-m">${esc(L('90 dias', '90 days'))}</th></tr></thead><tbody>${body || `<tr><td colspan="8" class="center faint">${esc(L('Nenhum token neste filtro.', 'No token in this filter.'))}</td></tr>`}</tbody></table></div>
    ${total > shown.length || BB.all ? `<div class="row wrap between" style="padding:10px 18px 0;gap:8px"><button class="btn sm" data-act="bbAll">${ico(BB.all ? 'chevron-up' : 'chevron-down', 15)}${esc(BB.all ? L('Mostrar só os 40 maiores', 'Show only the top 40') : L(`Mostrar todos (${total})`, `Show all (${total})`))}</button><span class="tiny faint">${esc(L(`${total} tokens neste filtro · os que entram na fonte aparecem sozinhos`, `${total} tokens in this filter · new ones appear automatically`))}</span></div>` : `<p class="tiny faint" style="padding:10px 18px 0">${esc(L(`${total} tokens neste filtro · os que entram na fonte aparecem sozinhos`, `${total} tokens in this filter · new ones appear automatically`))}</p>`}
    <div style="padding:8px 18px 16px">${note(esc(L('Toque em um token para ver o gráfico diário e os detalhes. "Tokens" ≈ valor ÷ preço de hoje (a quantidade exata depende do preço de cada compra). "% do valor de mercado por ano" = média diária do período × 365 ÷ valor de mercado — como um "dividend yield" do token. FDV = valor com todas as moedas que ainda serão emitidas.', 'Tap a token for its daily chart and details. "Tokens" ≈ value ÷ today’s price (the exact amount depends on each purchase price). "% of market cap per year" = period daily average × 365 ÷ market cap — like a token "dividend yield". FDV = value including all tokens still to be issued.')))}</div>`);
}
function bbBarsPanel(box, title, num_, rows, val, fmt, sub) {
  const mx = Math.max(...rows.map(val).filter(isNum), 0) || 1;
  setHTML(box, `<div class="panel-h"><div class="tt"><h2 class="panel-t"><span class="bb-n">${num_}</span>${esc(title)}</h2><p class="panel-s">${esc(sub)}</p></div></div>` + (rows.length ? '' : `<p class="small faint">${esc(L('Nenhum token com fluxo neste período e filtro.', 'No token with flow in this period and filter.'))}</p>`) + `<div class="bb-bars">${rows.map((r) => { const v = val(r); const col = (BB_MECH()[r.mechs[0]] || BB_MECH().share).c; return `<button class="bb-bar" data-act="bbOpen" data-k="${esc(r.t.k)}"><span class="l">${coinLogo({ b: r.t.sym, logo: r.t.img, cg: r.t.cg }, 22)}<b>${esc(r.t.sym || r.t.n)}</b></span><span class="b"><i style="width:${clamp(v / mx * 100, 1.5, 100)}%;background:${col}"></i></span><span class="v">${esc(fmt(v))}</span></button>`; }).join('')}</div>`);
}
// quem mais queima e quem mais recompra no período escolhido (independe do filtro da tabela)
function bbRowsFor(D, f) { const keep = BB.filt, kq = BB.q; BB.filt = f; BB.q = ''; try { return bbRows(D); } finally { BB.filt = keep; BB.q = kq; } }
function bbDrawTop() {
  const D = bbData();
  const per = { '1d': L('no último dia', 'in the last day'), '7d': L('em 7 dias', 'in 7 days'), '30d': L('em 30 dias', 'in 30 days'), '90d': L('em 90 dias', 'in 90 days'), '1y': L('em 1 ano', 'in 1 year') }[BB.per];
  for (const [id, f, title, n, sub] of [
    ['#bb-burners', 'burn', L('Quem mais queima', 'Who burns the most'), '02', L(`Valor queimado ${per} (queima direta ou recompra seguida de queima): moedas que somem para sempre.`, `Value burned ${per} (direct burn or buyback then burn): coins gone for good.`)],
    ['#bb-buyers', 'bought', L('Quem mais recompra', 'Who buys back the most'), '03', L(`Valor usado para recomprar o próprio token ${per} (depois queima ou guarda no caixa).`, `Value used to buy back its own token ${per} (then burned or held).`)],
  ]) {
    const box = $(id); if (!box) continue;
    if (!D) { setHTML(box, bbEmpty()); continue; }
    const rows = bbRowsFor(D, f).filter((r) => r.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 10);
    bbBarsPanel(box, title, n, rows, (r) => r.sum, (v) => fmtCompact(v), sub);
  }
}
function bbDrawRank() {
  const box = $('#bb-rank'); if (!box) return;
  const D = bbData(); if (!D) { setHTML(box, bbEmpty()); return; }
  const rows = bbRows(D).filter((r) => r.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 12);
  bbBarsPanel(box, L('Quem mais devolve ao token', 'Who returns the most to its token'), '04', rows, (r) => r.sum, (v) => fmtCompact(v), L('Valor no período escolhido, com a cor do mecanismo.', 'Value in the chosen period, colored by mechanism.'));
}
function bbDrawYield() {
  const box = $('#bb-yield'); if (!box) return;
  const D = bbData(); if (!D) { setHTML(box, bbEmpty()); return; }
  const rows = bbRows(D).filter((r) => isNum(r.yMcap) && r.yMcap > 0 && r.mcap >= 50e6).sort((a, b) => b.yMcap - a.yMcap).slice(0, 12);
  bbBarsPanel(box, L('Maior rendimento para o detentor', 'Highest yield to holders'), '05', rows, (r) => r.yMcap, (v) => `${fmtNum(v, 2, 2)}%/${L('ano', 'yr')}`, L('% do valor de mercado por ano no ritmo do período (só tokens acima de US$ 50 milhões, para não distorcer).', '% of market cap per year at the period’s pace (only tokens above US$ 50 million, to avoid distortion).'));
}
function bbDrawHow() {
  const box = $('#bb-how'); if (!box) return;
  const M = BB_MECH();
  setHTML(box, panelHead('circle-help', L('Como ler', 'How to read it')) + `<div class="bb-how">
    <div>${bbPill('buyback-burn')}<p>${esc(L('O protocolo usa parte da receita para comprar o próprio token no mercado e destruí-lo. A oferta cai.', 'The protocol uses revenue to buy its token on the market and destroy it. Supply goes down.'))}</p></div>
    <div>${bbPill('burn')}<p>${esc(L('Parte das taxas pagas na rede é destruída direto (sem compra), como no Ethereum e na Solana.', 'Part of the fees paid on the network is destroyed directly (no purchase), as on Ethereum and Solana.'))}</p></div>
    <div>${bbPill('buyback')}<p>${esc(L('Compra o token e guarda (tesouraria, fundo de assistência ou reserva). Tira moedas do mercado, mas elas ainda existem.', 'Buys the token and holds it (treasury, assistance fund or reserve). Removes coins from the market, but they still exist.'))}</p></div>
    <div>${bbPill('share')}<p>${esc(L('A receita vai para quem deixa o token travado ou em stake. Não muda a oferta.', 'Revenue goes to those who lock or stake the token. Supply does not change.'))}</p></div>
  </div>` + note(esc(L(`Fonte: DefiLlama — "holders revenue" de cada protocolo, somado por token (todas as versões e mercados). A DefiLlama recebe os dados de cada protocolo em horários diferentes: quando um token ainda não tem o último dia, ele aparece com "dado até" e a data. Valor de mercado e FDV: CoinGecko. Nada aqui é recomendação.`, 'Source: DefiLlama — each protocol’s "holders revenue", summed per token (all versions and markets). DefiLlama receives each protocol’s data at different times: when a token is missing the last day it shows "data to" and the date. Market cap and FDV: CoinGecko. Nothing here is a recommendation.'))) + `<div class="row wrap" style="gap:8px 18px">${extLink('https://defillama.com/holders-revenue', 'DefiLlama · Holders Revenue')}${extLink('https://defillama.com/fees', 'DefiLlama · Fees')}</div>`);
  void M;
}
// ---------- detalhe de um token ----------
ACT.bbOpen = (el) => {
  const D = bbData(); if (!D) return;
  const t = D.toks.find((x) => x.k === el.dataset.k); if (!t) return;
  const sumN = (n, back = 0) => bbWin(t, D, n, back, 'all');
  const y1 = t.src.map((s) => s.y1).filter(isNum).reduce((a, b) => a + b, 0) || null;
  const all = t.src.map((s) => s.all).filter(isNum).reduce((a, b) => a + b, 0) || null;
  const mcap = bbMcap(t), fdv = bbFdv(t), px = bbLivePx(t);
  const d30 = sumN(30), p30 = sumN(30, 1);
  const pace = isNum(d30) ? d30 / 30 : null;
  const k = (a, b, c = '') => `<div class="bb-k"><span>${esc(a)}</span><b>${b}</b>${c ? `<small>${c}</small>` : ''}</div>`;
  const u = BY_CG[t.cg]; const live = u && PX[u.s];
  const body = `<div class="row wrap" style="gap:10px 18px;align-items:center;margin-top:-4px">${coinLogo({ b: t.sym, logo: t.img, cg: t.cg }, 40)}<div class="grow"><div class="b" style="font-size:17px">${esc(t.n)} <span class="faint">${esc(t.sym)}</span></div><div class="bb-mechs" style="margin-top:4px">${[...new Set(t.src.map((s) => s.type))].map(bbPill).join('')}</div></div><div class="right"><div class="b">${isNum(px) ? esc(usd(px)) : '—'}</div><div class="tiny">${live ? chg(live.chg) : isNum(t.chg) ? chg(t.chg) : ''}</div></div></div>
    <div class="bb-ks">
      ${k(L('Último dia', 'Last day'), isNum(sumN(1)) ? esc(fmtCompact(sumN(1))) : '—', esc(bbDayTxt(D, Math.min(t.end, D.N - 1))))}
      ${k(L('7 dias', '7 days'), isNum(sumN(7)) ? esc(fmtCompact(sumN(7))) : '—', isNum(sumN(7)) ? esc(L(`${fmtCompact(sumN(7) / 7)}/dia`, `${fmtCompact(sumN(7) / 7)}/day`)) : '')}
      ${k(L('30 dias', '30 days'), isNum(d30) ? esc(fmtCompact(d30)) : '—', isNum(d30) && isNum(p30) && p30 > 0 ? `<span class="${tone(d30 - p30)}">${esc(fmtPct((d30 / p30 - 1) * 100, 0))}</span> ${esc(L('vs 30 dias antes', 'vs prior 30 days'))}` : '')}
      ${k(L('90 dias', '90 days'), isNum(sumN(90)) ? esc(fmtCompact(sumN(90))) : '—', isNum(sumN(90)) ? esc(L(`${fmtCompact(sumN(90) / 90)}/dia`, `${fmtCompact(sumN(90) / 90)}/day`)) : '')}
      ${k(L('1 ano', '1 year'), isNum(y1) ? esc(fmtCompact(y1)) : '—', isNum(y1) ? esc(L(`${fmtCompact(y1 / 365)}/dia`, `${fmtCompact(y1 / 365)}/day`)) : '')}
      ${k(L('Desde o início', 'All time'), isNum(all) ? esc(fmtCompact(all)) : '—')}
      ${k(L('% do valor de mercado por ano', '% of market cap per year'), isNum(pace) && mcap > 0 ? esc(`${fmtNum(pace * 365 / mcap * 100, 2, 2)}%`) : '—', esc(L('no ritmo dos últimos 30 dias', 'at the last 30 days’ pace')))}
      ${k(L('% do FDV por ano', '% of FDV per year'), isNum(pace) && fdv > 0 ? esc(`${fmtNum(pace * 365 / fdv * 100, 2, 2)}%`) : '—', mcap ? esc(L(`valor de mercado ${fmtCompact(mcap)}`, `market cap ${fmtCompact(mcap)}`)) : '')}
      ${k(L('Dias para devolver 1% do valor de mercado', 'Days to return 1% of market cap'), isNum(pace) && pace > 0 && mcap > 0 ? esc(fmtNum(mcap * 0.01 / pace, 0, 0)) : '—', esc(L('no ritmo dos últimos 30 dias', 'at the last 30 days’ pace')))}
    </div>
    <h3 class="lab-h3">${esc(L('Por dia (últimos 200 dias)', 'Daily (last 200 days)'))}</h3><div id="bb-mchart" style="height:230px"></div>
    <p class="tiny faint" style="margin-top:4px">${esc(L('Barras: valor de cada dia (UTC). Linha: média de 7 dias.', 'Bars: each day’s value (UTC). Line: 7-day average.'))}</p>
    <h3 class="lab-h3">${esc(L('Como funciona (metodologia da DefiLlama)', 'How it works (DefiLlama methodology)'))}</h3>
    <div class="bb-src">${t.src.map((s) => `<div><div class="row wrap" style="gap:6px 10px">${bbPill(s.type)}<b class="small">${esc(s.n)}</b><span class="tiny faint">${esc(L(`30 dias: ${fmtCompact(s.d30)}`, `30 days: ${fmtCompact(s.d30)}`))}</span></div>${s.method ? `<p class="tiny muted" lang="en">${esc(s.method)}</p>` : ''}${s.parts && s.parts.length > 1 ? `<p class="tiny faint">${esc(L('Inclui: ', 'Includes: '))}${esc(s.parts.join(', '))}</p>` : ''}</div>`).join('')}</div>
    <div class="row wrap mt" style="gap:8px 18px">${extLink(`https://defillama.com/protocol/${encodeURIComponent(t.src[0].id)}`, 'DefiLlama')}${t.cg ? extLink(`https://www.coingecko.com/pt/moedas/${encodeURIComponent(t.cg)}`, 'CoinGecko') : ''}</div>`;
  openModal({
    title: `${t.sym || t.n} · Burn, Baby, Burn`, wide: true, body,
    foot: `<button class="btn ghost" data-act="closeModal">${esc(L('Fechar', 'Close'))}</button>${t.cg ? `<button class="btn pri" data-act="go" data-to="tokenomics" data-params='${esc(JSON.stringify({ id: t.cg }))}'>${ico('package', 16)}${esc(L('Abrir no Tokenomics', 'Open in Tokenomics'))}</button>` : ''}`,
    onOpen: () => bbChart(t, D),
  });
};
async function bbChart(t, D) {
  const el = $('#bb-mchart'); if (!el) return;
  let r; try { r = await makeChart(el, { priceFmt: (v) => fmtCompact(v, '') }); } catch { el.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable')); return; }
  const { ch, c } = r;
  ch.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.02 } }, timeScale: { rightOffset: 2 } });
  const tot = new Array(D.N).fill(null);
  for (const s of t.src) for (let i = 0; i < D.N; i++) { const v = s.arr[i]; if (isNum(v)) tot[i] = (tot[i] || 0) + v; }
  const col = (BB_MECH()[t.src.slice().sort((a, b) => (b.d30 || 0) - (a.d30 || 0))[0].type] || BB_MECH().share).c;
  const hs = ch.addHistogramSeries({ color: labRGBA(col, 0.8), priceLineVisible: false, lastValueVisible: false, base: 0 });
  const tm = (i) => ctime(D.t0 + i * 86400e3, false);
  hs.setData(tot.map((v, i) => (isNum(v) ? { time: tm(i), value: v } : null)).filter(Boolean));
  const ma = rollMean(tot.map((v) => (isNum(v) ? v : null)), 7);
  const ls = ch.addLineSeries({ color: c.text, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  ls.setData(ma.map((v, i) => (isNum(v) ? { time: tm(i), value: v } : null)).filter(Boolean));
  ch.timeScale().fitContent();
}
// ---------- ações ----------
ACT.seg_bbp = (v) => { BB.per = v; LS.set('bb', { per: BB.per, filt: BB.filt }); bbDraw(); };
ACT.bbFilt = (el) => { BB.filt = el.dataset.k; $$('#bb-tbl .bb-filt .lab-cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === BB.filt))); LS.set('bb', { per: BB.per, filt: BB.filt }); bbDraw(); };
ACT.bbQ = (el) => { BB.q = el.value; bbDrawTbl(); };
ACT.bbAll = () => { BB.all = !BB.all; bbDrawTbl(); };
ACT.bbSort = (el) => { const k = el.dataset.k; if (BB.sort === k) BB.dir = -BB.dir; else { BB.sort = k; BB.dir = -1; } bbDrawTbl(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act="bbOpen"]')) ACT.bbOpen(e.target); });
onPrice((set) => {
  if (S.page !== 'buybacks') return;
  if (set.has('BUYBACKS') || set.has('TOP100')) bbDraw();
});
page({
  id: 'buybacks', group: 'analise', icon: 'flame', pt: 'Burn, Baby, Burn', en: 'Burn, Baby, Burn',
  sub: 'Se o protocolo ganha, o token ganha? Recompras, queimas e reservas acumuladas a cada dia, com dados reais da DefiLlama.',
  subEn: 'If the protocol wins, does the token win? Daily buybacks, burns and reserve accumulation, with real DefiLlama data.',
  init(el) { const p = LS.get('bb'); if (p) { if (BB_PER[p.per]) BB.per = p.per; if (BB_FILT().some(([k]) => k === p.filt)) BB.filt = p.filt; } el.innerHTML = bbHtml(); bbDraw(); },
  show() { bbDraw(); },
});
