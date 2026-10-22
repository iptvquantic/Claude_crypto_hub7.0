// =====================================================================
// PORTFOLIO VAULT™ (PRO) — aportes salvos na sua conta (servidor, com
// acesso só seu), sincronizados entre PC e celular. Compra e venda, preço
// médio, resultado realizado e não realizado, evolução do patrimônio,
// mapa de acumulação, desempenho por aporte, exportação e importação.
// =====================================================================
const VAULT = { rows: [], loaded: false, loading: false, err: '', cur: LS.get('vault-cur', 'BRL'), range: 'all', asset: null, hist: null, histKey: '', fxHist: {}, uid: null };
const round2 = (v) => Math.round(v * 100) / 100;
function vNorm(r) {
  return { ...r, qty: num(r.qty), amount_usd: num(r.amount_usd), amount_brl: num(r.amount_brl), fx_brl: num(r.fx_brl), fee: num(r.fee) || 0 };
}
async function vaultLoad(force = false) {
  if (!ACCOUNT.user) return;
  if (VAULT.loading || (VAULT.loaded && !force && VAULT.uid === ACCOUNT.user.id)) return;
  VAULT.loading = true; VAULT.err = '';
  try {
    const sb = await sbClient();
    const { data, error } = await sb.from('vault_entries').select('*').order('date', { ascending: true }).order('created_at', { ascending: true }).limit(5000);
    if (error) throw error;
    VAULT.rows = (data || []).map(vNorm); VAULT.loaded = true; VAULT.uid = ACCOUNT.user.id; VAULT.hist = null;
    VAULT.rows.forEach((r) => { if (!r.binance_sym || !BY_SYM[r.binance_sym]) trackExtra(r.asset_id); if (r.logo && !LOGOS[r.asset_id]) LOGOS[r.asset_id] = r.logo; });
  } catch (e) { VAULT.err = String((e && e.message) || e); }
  VAULT.loading = false;
  vaultDraw();
}
onAccount(() => { if (!ACCOUNT.user || ACCOUNT.user.id !== VAULT.uid) { VAULT.rows = []; VAULT.loaded = false; VAULT.hist = null; VAULT.uid = null; VAULT.draft = null; VAULT.dayPrices = null; VAULT.histKey = ''; } });

// ---------- contabilidade (custo médio) ----------
function fxNow() { const r = brlRate(); return r ? r.v : null; }
// ordem contábil: por data; no mesmo dia, compras antes das vendas (senão uma venda registrada antes da compra do mesmo dia seria ignorada)
const vaultSorted = (rows) => [...rows].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'buy' ? -1 : 1) || String(a.created_at).localeCompare(String(b.created_at)));
function holdings() {
  const by = {};
  const rows = vaultSorted(VAULT.rows);
  for (const e of rows) {
    const h = by[e.asset_id] || (by[e.asset_id] = { id: e.asset_id, sym: e.sym, name: e.name || e.sym, logo: e.logo || LOGOS[e.asset_id], color: e.color || (BY_CG[e.asset_id] && BY_CG[e.asset_id].c) || hashColor(e.asset_id), bsym: e.binance_sym && BY_SYM[e.binance_sym] ? e.binance_sym : (BY_CG[e.asset_id] && BY_CG[e.asset_id].s) || null, qty: 0, costUSD: 0, costBRL: 0, invUSD: 0, invBRL: 0, realUSD: 0, realBRL: 0, buys: 0, sells: 0, first: e.date, list: [] });
    const fx = e.fx_brl || (e.amount_usd > 0 ? e.amount_brl / e.amount_usd : fxNow() || 1);
    const feeU = e.currency === 'USD' ? e.fee : e.fee / fx, feeB = e.currency === 'BRL' ? e.fee : e.fee * fx;
    if (e.type === 'buy') {
      h.qty += e.qty; h.costUSD += e.amount_usd + feeU; h.costBRL += e.amount_brl + feeB;
      h.invUSD += e.amount_usd + feeU; h.invBRL += e.amount_brl + feeB; h.buys++;
    } else {
      if (e.qty > h.qty + 1e-9) h.over = (h.over || 0) + (e.qty - h.qty);
      const q = Math.min(e.qty, h.qty); const aU = h.qty > 0 ? h.costUSD / h.qty : 0, aB = h.qty > 0 ? h.costBRL / h.qty : 0;
      const part = e.qty > 0 ? q / e.qty : 0;
      h.realUSD += (e.amount_usd - feeU) * part - aU * q; h.realBRL += (e.amount_brl - feeB) * part - aB * q;
      h.costUSD -= aU * q; h.costBRL -= aB * q; h.qty -= q; h.sells++;
      if (h.qty < 1e-12) { h.qty = 0; h.costUSD = 0; h.costBRL = 0; }
    }
    h.list.push(e);
  }
  const fxn = fxNow();
  return Object.values(by).map((h) => {
    const q = priceOf(h.bsym || h.id);
    const p = q ? q.p : null;
    const vU = isNum(p) ? h.qty * p : null, vB = isNum(vU) && fxn ? vU * fxn : null;
    return { ...h, price: p, chg24: q ? q.chg : null, live: q ? q.live : false, valueUSD: vU, valueBRL: vB, avgUSD: h.qty > 0 ? h.costUSD / h.qty : null, avgBRL: h.qty > 0 ? h.costBRL / h.qty : null, plUSD: isNum(vU) ? vU - h.costUSD : null, plBRL: isNum(vB) ? vB - h.costBRL : null, priceBRL: isNum(p) && fxn ? p * fxn : null };
  }).sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0));
}
function totals(H) {
  const c = VAULT.cur, k = (x) => (c === 'BRL' ? x + 'BRL' : x + 'USD');
  const value = H.every((h) => h.qty === 0 || isNum(h[k('value')])) ? sum(H.map((h) => h[k('value')] || 0)) : null;
  const cost = sum(H.map((h) => h[k('cost')])), inv = sum(H.map((h) => h[k('inv')])), real = sum(H.map((h) => h[k('real')]));
  const unreal = isNum(value) ? value - cost : null;
  const total = isNum(unreal) ? unreal + real : null;
  return { value, cost, inv, real, unreal, total, pct: isNum(total) && inv > 0 ? total / inv * 100 : null };
}
const money = (v, d) => (VAULT.cur === 'BRL' ? brl(v, d) : usd(v, d));

// ---------- página ----------
function vaultHtml() { return `${pageHead(PAGES.vault, '', esc(L('Seus aportes ficam salvos na sua conta, com acesso só seu, e aparecem no PC e no celular.', 'Your entries are saved to your account, private to you, on PC and phone.')))}<div id="vault-body"></div>`; }
function vaultDraw() {
  const box = $('#vault-body'); if (!box) return;
  if (ACCOUNT.state === 'guest') { box.innerHTML = vaultGuest(); return; }
  if (!ACCOUNT.profile) { box.innerHTML = proGate(PAGES.vault); return; }
  if (VAULT.loaded && VAULT.uid !== ACCOUNT.user.id) { VAULT.loaded = false; VAULT.rows = []; VAULT.hist = null; VAULT.histKey = ''; }
  if (!VAULT.loaded) { box.innerHTML = VAULT.err ? `<div class="panel">${emptyBox('wifi-off', L('Não foi possível abrir seus aportes', 'Could not open your entries'), esc(VAULT.err), `<button class="btn sm" data-act="vaultRetry">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`)}</div>` : `<div class="panel">${skel(6, 20)}</div>`; vaultLoad(); return; }
  const pro = hasPro();
  const legacy = legacyEntries();
  const tools = `<div class="row wrap" style="gap:8px">${seg('vcur', [['BRL', 'R$'], ['USD', 'US$']], VAULT.cur)}
    <button class="btn pri" data-act="vaultAdd" ${pro ? '' : 'disabled'}>${ico('plus', 17)}${esc(L('Registrar aporte', 'Add entry'))}</button>
    <div class="rel"><button class="btn" data-act="menu" aria-haspopup="menu" aria-expanded="false">${ico('download', 16)}${esc(L('Exportar / importar', 'Export / import'))}</button><div class="menu" role="menu">
      <button class="menu-i" data-act="vaultCsv" role="menuitem">${ico('file-text', 17)}${esc(L('Baixar planilha (CSV)', 'Download spreadsheet (CSV)'))}</button>
      <button class="menu-i" data-act="vaultJson" role="menuitem">${ico('database', 17)}${esc(L('Baixar backup (JSON)', 'Download backup (JSON)'))}</button>
      <button class="menu-i" data-act="vaultImport" role="menuitem" ${pro ? '' : 'disabled'}>${ico('upload', 17)}${esc(L('Importar backup ou CSV', 'Import backup or CSV'))}</button></div></div></div>`;
  let html = '';
  if (!pro) html += `<div class="callout warn" style="margin-bottom:14px">${ico('lock', 18)}<span>${esc(L(`${planInfo().label}: seus aportes continuam salvos e visíveis. Para registrar novos, escolha um plano PRO.`, `${planInfo().label}: your entries stay saved and visible. To add new ones, pick a PRO plan.`))} <a href="#/plans" class="b">${esc(L('Ver planos', 'See plans'))}</a></span></div>`;
  if (legacy.length && pro) html += `<div class="callout info" style="margin-bottom:14px">${ico('history', 18)}<span class="grow">${esc(L(`Encontramos ${legacy.length} aporte(s) salvos neste navegador pela versão antiga do NEXUS HUB.`, `We found ${legacy.length} entr(ies) saved in this browser by the old NEXUS HUB.`))}</span><button class="btn sm pri" data-act="vaultLegacy">${esc(L('Importar para minha conta', 'Import to my account'))}</button></div>`;
  if (!VAULT.rows.length) {
    box.innerHTML = html + `<div class="row wrap between" style="gap:10px;margin-bottom:14px"><span></span>${tools}</div><div class="panel hero">${emptyBox('wallet', L('Comece registrando seu primeiro aporte', 'Start by adding your first entry'), esc(L('Informe a moeda, a data, a quantidade e quanto pagou no total. O preço unitário, o preço médio e o resultado são calculados para você.', 'Enter the coin, date, quantity and total paid. Unit price, average cost and P/L are calculated for you.')), pro ? `<button class="btn pri" data-act="vaultAdd">${ico('plus', 17)}${esc(L('Registrar aporte', 'Add entry'))}</button>` : '')}</div>`;
    return;
  }
  const H = holdings(), T = totals(H);
  if (!VAULT.asset || !H.some((h) => h.id === VAULT.asset)) VAULT.asset = (H.find((h) => h.qty > 0) || H[0]).id;
  html += `<div class="row wrap between" style="gap:10px;margin-bottom:14px"><span class="small faint">${esc(L(`${VAULT.rows.length} lançamento(s) · ${H.filter((h) => h.qty > 0).length} ativo(s) na carteira`, `${VAULT.rows.length} entr(ies) · ${H.filter((h) => h.qty > 0).length} asset(s) held`))}</span>${tools}</div>
  <div class="v-hero"><section class="panel hero">${panelHead('wallet', L('Patrimônio hoje', 'Portfolio today'), { right: stamp('px-rest', L('preços ao vivo', 'live prices')) })}
    <div class="v-big" id="v-val">${isNum(T.value) ? esc(money(T.value, [2, 2])) : '—'}</div>
    <div class="row wrap mt" style="gap:8px 18px" id="v-pl">${vaultPlHtml(T)}</div>
    <div class="grid g-3 mt">${kpiBox(L('Total aportado', 'Total invested'), esc(money(T.inv, [2, 2])))}${kpiBox(L('Custo do que você tem', 'Cost of current holdings'), esc(money(T.cost, [2, 2])))}${kpiBox(L('Lucro já realizado', 'Realized profit'), `<span class="${tone(T.real)}">${esc(money(T.real, [2, 2]))}</span>`, esc(L('em vendas', 'from sales')))}</div>
    ${VAULT.cur === 'BRL' ? note(L('Em reais, o custo usa o valor pago em R$ (ou o dólar do dia do aporte) e o patrimônio usa o dólar de agora — então a variação do câmbio entra no resultado.', 'In BRL, cost uses what you paid in R$ (or that day’s USD rate) and value uses today’s rate — FX moves are included.')) : ''}
  </section><section class="panel">${panelHead('chart-pie', L('Mapa de acumulação', 'Allocation map'))}<div id="v-donut"></div></section></div>
  <section class="panel mt">${panelHead('chart-line', L('Evolução do patrimônio', 'Portfolio over time'), { sub: esc(L('Quanto sua carteira valia em cada dia, comparado ao custo dos aportes.', 'What your portfolio was worth each day vs. the cost of entries.')), right: seg('vrange', [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['all', L('Tudo', 'All')]], VAULT.range) })}<div id="v-hist" style="height:340px"></div><div id="v-hist-note"></div></section>
  <div id="v-check"></div>
  <section class="panel flush mt" id="v-hold"></section>
  <section class="panel mt" id="v-asset"></section>
  <div class="grid g-2 mt"><section class="panel" id="v-month"></section><section class="panel" id="v-perf"></section></div>
  <section class="panel flush mt" id="v-list"></section>`;
  box.innerHTML = html;
  vaultDrawParts(H, T); vaultHist();
}
function vaultPlHtml(T) {
  return `<span class="chip ${tone(T.total) || 'flat'}" style="font-size:15px;padding:4px 12px">${isNum(T.total) ? (T.total >= 0 ? '▲ ' : '▼ ') + esc(money(Math.abs(T.total), [2, 2])) : '—'}</span><span class="b ${tone(T.pct)}" style="font-size:16px">${isNum(T.pct) ? esc(fmtPct(T.pct, 2)) : ''}</span><span class="small faint">${esc(L('resultado total (realizado + em aberto)', 'total P/L (realized + open)'))}</span>`;
}
function vaultDrawParts(H, T) {
  const held = H.filter((h) => h.qty > 0);
  const k = VAULT.cur === 'BRL' ? 'valueBRL' : 'valueUSD';
  const tot = sum(held.map((h) => h[k] || 0));
  setHTML('#v-donut', held.length ? `<div class="donut-wrap">${donutSVG(held.map((h) => ({ v: h[k] || 0, c: h.color, t: h.sym })), { label: L('Distribuição da carteira', 'Portfolio allocation') })}<div class="legend">${held.slice(0, 8).map((h) => `<div><i style="background:${esc(h.color)}"></i><span>${esc(h.sym)}</span><span class="lv">${tot > 0 ? esc(fmtPct((h[k] || 0) / tot * 100, 1, false)) : '—'}</span></div>`).join('')}${held.length > 8 ? `<div class="faint">+${held.length - 8} ${esc(L('outros', 'others'))}</div>` : ''}</div></div>` : emptyBox('chart-pie', L('Nada em carteira agora', 'Nothing held now')));
  // tabela de posições
  const c = VAULT.cur;
  const pr2 = (h) => (c === 'BRL' ? h.priceBRL : h.price);
  setHTML('#v-hold', `<div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('layers', 18)}${esc(L('Suas posições', 'Your positions'))}</h2><p class="panel-s">${esc(L('Preço médio = custo do que você ainda tem ÷ quantidade (compras somam; vendas tiram pelo preço médio, sem mudá-lo). Clique numa linha para ver no gráfico.', 'Avg. cost = cost of what you still hold ÷ quantity (buys add; sells remove at average cost without changing it). Click a row to see it on the chart.'))}</p></div></div><div class="tbl-wrap"><table class="tbl v-pos"><thead><tr><th>${esc(L('Ativo', 'Asset'))}</th><th class="r">${esc(L('Quantidade', 'Quantity'))}</th><th class="r">${esc(L('Preço médio', 'Avg. cost'))}</th><th class="r">${esc(L('Preço agora', 'Price now'))}</th><th class="r">${esc(L('Valor', 'Value'))}</th><th class="r">${esc(L('Em aberto', 'Open P/L'))}</th><th class="r">${esc(L('Realizado', 'Realized'))}</th><th class="r">${esc(L('Carteira', 'Weight'))}</th></tr></thead><tbody>${H.map((h) => {
    const val = c === 'BRL' ? h.valueBRL : h.valueUSD, pl = c === 'BRL' ? h.plBRL : h.plUSD, cost = c === 'BRL' ? h.costBRL : h.costUSD, avgp = c === 'BRL' ? h.avgBRL : h.avgUSD, real = c === 'BRL' ? h.realBRL : h.realUSD;
    const pr = pr2(h), closed = h.qty === 0;
    const avgVs = isNum(avgp) && isNum(pr) && avgp > 0 ? (pr / avgp - 1) * 100 : null;
    return `<tr class="click${closed ? ' closed' : ''}" data-act="vaultAsset" data-id="${esc(h.id)}"><td><div class="coin">${coinLogo({ b: h.sym, logo: h.logo || LOGOS[h.id], c: h.color, cg: h.id }, 28)}<div><div class="nm">${esc(h.name)}</div><div class="sy">${esc(h.sym)}${closed ? ' · ' + esc(L('posição encerrada', 'closed')) : h.live ? ' · ' + esc(L('ao vivo', 'live')) : ''}${h.over ? ` · <span style="color:var(--stale)" title="${esc(L('Há vendas maiores que a quantidade comprada até a data. Confira os lançamentos.', 'Some sells exceed what was bought up to that date. Check the entries.'))}">${esc(L('venda acima do saldo', 'oversold'))}</span>` : ''}</div></div></div></td><td class="r num">${closed ? '0' : esc(fmtQty(h.qty))}</td><td class="r num">${isNum(avgp) ? `<b>${esc(money(avgp))}</b>${isNum(c === 'BRL' ? h.avgUSD : h.avgBRL) ? `<div class="tiny faint" title="${esc(L('Na outra moeda: compras em dólar convertidas pelo PTAX do dia de cada aporte', 'In the other currency: converted at each entry’s PTAX rate'))}">${esc(c === 'BRL' ? usd(h.avgUSD) : brl(h.avgBRL))}</div>` : ''}` : '—'}${isNum(avgVs) ? `<div class="tiny ${tone(avgVs)}" title="${esc(L('Quanto o preço de agora está acima ou abaixo do seu preço médio', 'How far the current price is from your average cost'))}">${esc(fmtPct(avgVs, 1))} ${esc(L('vs. médio', 'vs. avg'))}</div>` : ''}</td><td class="r num">${isNum(pr) ? esc(money(pr)) : '—'}</td><td class="r num">${closed ? '—' : isNum(val) ? esc(money(val, [2, 2])) : '—'}</td><td class="r">${!closed && isNum(pl) ? `<span class="${tone(pl)} b">${esc(money(pl, [2, 2]))}</span><div class="tiny ${tone(pl)}">${cost > 0 ? esc(fmtPct(pl / cost * 100, 1)) : ''}</div>` : '—'}</td><td class="r">${h.sells ? `<span class="${tone(real)} b">${esc(money(real, [2, 2]))}</span><div class="tiny faint">${esc(L(`${h.sells} venda(s)`, `${h.sells} sell(s)`))}</div>` : '<span class="faint">—</span>'}</td><td class="r">${
tot > 0 && isNum(val) && !closed ? esc(fmtPct(val / tot * 100, 1, false)) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`);
  vaultDrawAsset(H); vaultDrawMonth(); vaultDrawPerf(H); vaultDrawList();
}
// ---------- gráfico do ativo com marcadores de compra/venda e preço médio ----------
async function vaultDrawAsset(H) {
  const box = $('#v-asset'); if (!box) return;
  const h = H.find((x) => x.id === VAULT.asset); if (!h) { box.innerHTML = ''; return; }
  const cur = VAULT.cur;
  const chips = H.map((x) => `<button class="btn xs ${x.id === h.id ? 'pri' : 'ghost'}" data-act="vaultAsset" data-id="${esc(x.id)}">${esc(x.sym)}</button>`).join('');
  const avgNow = cur === 'BRL' ? h.avgBRL : h.avgUSD;
  box.innerHTML = panelHead('chart-candlestick', L(`${h.name}: suas compras e vendas no gráfico`, `${h.name}: your buys and sells on the chart`), { sub: esc(L(`Pontos verdes = compras, vermelhos = vendas (o tamanho acompanha o valor). A linha âmbar em degraus é o seu preço médio ao longo do tempo, em ${cur === 'BRL' ? 'reais' : 'dólares'}. Passe o mouse para ver os detalhes do dia.`, `Green dots = buys, red = sells (size follows the amount). The amber step line is your average cost over time (${cur}). Hover for the day’s details.`)) }) +
    `<div class="row wrap" style="gap:6px;margin-bottom:10px">${chips}</div>
    <div class="row wrap v-asset-k" style="gap:6px 22px;margin-bottom:8px">${kpiBox(L('Seu preço médio', 'Your avg. cost'), isNum(avgNow) ? `<span style="color:var(--signal)">${esc(money(avgNow))}</span>` : '—')}${kpiBox(L('Preço agora', 'Price now'), isNum(cur === 'BRL' ? h.priceBRL : h.price) ? esc(money(cur === 'BRL' ? h.priceBRL : h.price)) : '—')}${kpiBox(L('Compras / vendas', 'Buys / sells'), `${h.buys} / ${h.sells}`)}</div>
    <div id="v-asset-ch" style="height:340px;position:relative"></div>`;
  const el = $('#v-asset-ch');
  try {
    const first = Date.parse(h.first + 'T00:00:00Z') - 30 * 86400e3;
    let pts;
    if (h.bsym && VALID.has(h.bsym)) pts = (await klinesSince(h.bsym, '1d', first)).map((k) => ({ t: k.t, v: k.c }));
    else pts = await cgDaily(h.id, first);
    const fxm = cur === 'BRL' ? await fxHistory(first).catch(() => null) : null;
    if (!$('#v-asset-ch')) return;
    if (!pts.length) throw new Error(L('sem histórico de preço para este ativo', 'no price history for this asset'));
    // preço diário na moeda escolhida (em reais, pelo dólar PTAX de cada dia)
    let lastFx = null; const fxKeys = fxm ? Object.keys(fxm).sort() : [];
    let fi = 0;
    const series = pts.map((p) => {
      const d = new Date(p.t).toISOString().slice(0, 10);
      if (fxm) { while (fi < fxKeys.length && fxKeys[fi] <= d) lastFx = fxm[fxKeys[fi++]]; }
      const v = cur === 'BRL' ? (lastFx || fxNow() ? p.v * (lastFx || fxNow()) : null) : p.v;
      return { t: p.t, d, v };
    }).filter((p) => isNum(p.v));
    const { ch, c } = await makeChart(el, { onTheme: () => vaultDrawAsset(holdings()) });
    ch.applyOptions({ crosshair: { mode: 0 } });
    // preço em azul-lavanda (destaque) e preço médio em âmbar: nunca se confundem, qualquer que seja a cor da moeda
    const s = ch.addAreaSeries({ lineColor: c.accent, topColor: 'rgba(142,152,255,.28)', bottomColor: 'rgba(142,152,255,0)', lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 4 });
    s.setData(series.map((p) => ({ time: ctime(p.t, false), value: p.v })));
    // preço médio passo a passo (mesma contabilidade da tabela)
    const t0 = series[0].t, byDay = {};
    let q = 0, cost = 0; const avgPts = [];
    for (const e of vaultSorted(h.list)) {
      const efx = e.fx_brl || (e.amount_usd > 0 ? e.amount_brl / e.amount_usd : fxNow() || 1);
      const amt = (cur === 'BRL' ? e.amount_brl : e.amount_usd) + (!e.fee ? 0 : e.currency === cur ? e.fee : cur === 'BRL' ? e.fee * efx : e.fee / efx);
      if (e.type === 'buy') { q += e.qty; cost += amt; } else { const sq = Math.min(e.qty, q); const a = q > 0 ? cost / q : 0; cost -= a * sq; q -= sq; if (q < 1e-12) { q = 0; cost = 0; } }
      const tt = Math.max(t0, Date.parse(e.date + 'T00:00:00Z'));
      const last = avgPts[avgPts.length - 1];
      const val = q > 0 ? cost / q : null;
      if (last && last.t === tt) last.v = val; else avgPts.push({ t: tt, v: val });
      (byDay[e.date] = byDay[e.date] || []).push(e);
    }
    const avgLine = [];
    for (let i = 0; i < avgPts.length; i++) {
      if (!isNum(avgPts[i].v)) { avgLine.push({ time: ctime(avgPts[i].t, false) }); continue; } // sem posição: a linha some até a próxima compra
      avgLine.push({ time: ctime(avgPts[i].t, false), value: avgPts[i].v });
      const nextT = avgPts[i + 1] ? avgPts[i + 1].t - 86400e3 : series[series.length - 1].t;
      if (nextT > avgPts[i].t) avgLine.push({ time: ctime(nextT, false), value: avgPts[i].v });
    }
    if (avgLine.length) {
      const al = ch.addLineSeries({ color: c.signal, lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      al.setData(avgLine);
    }
    // marcadores: um por dia e tipo, tamanho pelo valor
    const vals = h.list.map((e) => (cur === 'BRL' ? e.amount_brl : e.amount_usd)); const mx = Math.max(...vals, 1);
    const markers = [];
    for (const [d, list] of Object.entries(byDay)) {
      const tm = Date.parse(d + 'T00:00:00Z'); if (tm < t0) continue;
      for (const type of ['buy', 'sell']) {
        const es = list.filter((e) => e.type === type); if (!es.length) continue;
        const tot = sum(es.map((e) => (cur === 'BRL' ? e.amount_brl : e.amount_usd)));
        markers.push({ time: ctime(tm, false), position: type === 'buy' ? 'belowBar' : 'aboveBar', color: type === 'buy' ? c.up : c.down, shape: 'circle', size: 0.6 + 1.4 * Math.sqrt(tot / mx), text: es.length > 1 ? `${type === 'buy' ? L('C', 'B') : L('V', 'S')}×${es.length}` : '' });
      }
    }
    s.setMarkers(markers.sort((a, b) => a.time - b.time));
    if (isNum(avgNow) && h.qty > 0) s.createPriceLine({ price: avgNow, color: c.signal, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: L('preço médio', 'avg. cost') });
    ch.timeScale().fitContent();
    // dica ao passar o mouse
    const tip = document.createElement('div'); tip.className = 'ch-tip'; el.appendChild(tip);
    const avgAt = (d) => { let v = null; for (const p of avgPts) { if (new Date(p.t).toISOString().slice(0, 10) <= d) v = p.v; else break; } return v; };
    ch.subscribeCrosshairMove((pm) => {
      if (!pm || pm.time === undefined || !pm.point) { tip.style.display = 'none'; return; }
      const d = new Date(pm.time * 1000).toISOString().slice(0, 10);
      const p = series.find((x) => x.d === d); if (!p) { tip.style.display = 'none'; return; }
      const es = byDay[d] || []; const a = avgAt(d);
      tip.innerHTML = `<b>${esc(fmtDate(d + 'T12:00:00Z', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b><div>${esc(L('Fechamento', 'Close'))}: <b>${esc(money(p.v))}</b></div>${isNum(a) ? `<div style="color:var(--signal)">${esc(L('Seu preço médio', 'Your avg.'))}: ${esc(money(a))}</div>` : ''}${es.map((e) => { const amt = cur === 'BRL' ? e.amount_brl : e.amount_usd; return `<div class="${e.type === 'buy' ? 'up' : 'down'}">${esc(e.type === 'buy' ? L('Compra', 'Buy') : L('Venda', 'Sell'))} ${esc(fmtQty(e.qty))} ${esc(h.sym)} · ${esc(money(amt, [2, 2]))} (${esc(money(amt / e.qty))}/${esc(L('un.', 'unit'))})</div>`; }).join('')}`;
      tip.style.display = 'block';
      const w = el.clientWidth, tw = tip.offsetWidth;
      tip.style.left = Math.min(w - tw - 8, Math.max(8, pm.point.x + 14)) + 'px';
      tip.style.top = Math.max(8, Math.min(el.clientHeight - tip.offsetHeight - 30, pm.point.y - 20)) + 'px';
    });
  } catch (e) { el.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable'), esc(String(e.message || e))); }
}
const _cgDaily = {};
async function cgDaily(id, fromMs) {
  const key = id; const hit = _cgDaily[key];
  if (hit && Date.now() - hit.ts < 30 * 60e3) return hit.v.filter((p) => p.t >= fromMs);
  const days = Math.min(365, Math.max(30, Math.ceil((Date.now() - fromMs) / 86400e3) + 2));
  const j = await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`, { timeout: 15000 });
  // o CoinGecko manda os dias às 00:00 UTC e mais um ponto "agora": um ponto por dia (o último vale)
  const byDay = new Map(); (j.prices || []).forEach(([t, p]) => { if (isNum(p)) byDay.set(Math.floor(t / 86400e3) * 86400e3, p); });
  const v = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => ({ t, v: p }));
  _cgDaily[key] = { v, ts: Date.now() };
  return v.filter((p) => p.t >= fromMs);
}
// ---------- dólar histórico (PTAX, Banco Central série 1) ----------
async function fxHistory(fromMs) {
  const k = dayKey(fromMs);
  if (VAULT.fxHist.k && VAULT.fxHist.k <= k && Date.now() - VAULT.fxHist.ts < 6 * 3600e3) return VAULT.fxHist.map;
  const f = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const map = {};
  let from = new Date(fromMs - 10 * 86400e3);
  while (from.getTime() < Date.now()) { // a API aceita até 10 anos por pedido
    const to = new Date(Math.min(Date.now(), from.getTime() + 9.5 * 365 * 86400e3));
    const a = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados?formato=json&dataInicial=${f(from)}&dataFinal=${f(to)}`, { timeout: 15000 });
    a.forEach((x) => { const t = parseDate(x.data); if (validDate(t)) map[t.toISOString().slice(0, 10)] = num(x.valor); });
    from = new Date(to.getTime() + 86400e3);
  }
  VAULT.fxHist = { k, map, ts: Date.now() };
  return map;
}
async function fxOn(dateISO) {
  try { const m = await fxHistory(Date.parse(dateISO + 'T12:00:00Z')); let best = null; for (const d of Object.keys(m).sort()) { if (d <= dateISO) best = m[d]; else break; } return best ? { v: best, src: 'PTAX (BCB)' } : null; } catch { return null; }
}
// ---------- evolução do patrimônio ----------
async function vaultHist() {
  const box = $('#v-hist'); if (!box) return;
  const rows = VAULT.rows; if (!rows.length) return;
  const key = VAULT.rows.map((r) => r.id + r.updated_at).join('|') + VAULT.cur;
  const first = Date.parse(rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date) + 'T00:00:00Z');
  box.innerHTML = '<div class="skel" style="height:100%"></div>';
  try {
    if (VAULT.histKey !== key || !VAULT.hist) {
      const assets = [...new Set(rows.map((r) => r.asset_id))];
      const prices = {}; let partial = false;
      await Promise.all(assets.map(async (id) => {
        const r = rows.find((x) => x.asset_id === id); const bs = r.binance_sym && VALID.has(r.binance_sym) ? r.binance_sym : (BY_CG[id] && VALID.has(BY_CG[id].s) ? BY_CG[id].s : null);
        let pts = [];
        try { pts = bs ? (await klinesSince(bs, '1d', first)).map((k) => ({ t: k.t, v: k.c })) : await cgDaily(id, first); } catch { pts = []; }
        if (!pts.length || pts[0].t > first + 3 * 86400e3) partial = true;
        prices[id] = Object.fromEntries(pts.map((p) => [new Date(p.t).toISOString().slice(0, 10), p.v]));
      }));
      const fxm = VAULT.cur === 'BRL' ? await fxHistory(first).catch(() => ({})) : null;
      const sorted = vaultSorted(rows);
      const out = []; const qty = {}; const cost = { v: 0 }; const lastP = {}; let j = 0;
      const d0 = new Date(first).toISOString().slice(0, 10);
      let lastFx = fxm ? (Object.keys(fxm).filter((k) => k < d0).sort().map((k) => fxm[k]).pop() || null) : null;
      const tot = {}; // custo por ativo
      for (let t = first; t <= Date.now() + 1; t += 86400e3) {
        const d = new Date(t).toISOString().slice(0, 10);
        while (j < sorted.length && sorted[j].date <= d) {
          const e = sorted[j++]; const efx = e.fx_brl || (e.amount_usd > 0 ? e.amount_brl / e.amount_usd : 1);
          const feeC = !e.fee ? 0 : VAULT.cur === e.currency ? e.fee : VAULT.cur === 'BRL' ? e.fee * efx : e.fee / efx;
          const amt = (VAULT.cur === 'BRL' ? e.amount_brl : e.amount_usd) + feeC;
          qty[e.asset_id] = qty[e.asset_id] || 0; tot[e.asset_id] = tot[e.asset_id] || 0;
          if (e.type === 'buy') { qty[e.asset_id] += e.qty; tot[e.asset_id] += amt; }
          else { const q = Math.min(e.qty, qty[e.asset_id]); const a = qty[e.asset_id] > 0 ? tot[e.asset_id] / qty[e.asset_id] : 0; tot[e.asset_id] -= a * q; qty[e.asset_id] -= q; }
        }
        if (fxm && isNum(fxm[d])) lastFx = fxm[d];
        let val = 0, ok = true;
        for (const id in qty) {
          if (prices[id][d]) lastP[id] = prices[id][d];
          if (qty[id] > 0) { if (!isNum(lastP[id])) { ok = false; continue; } val += qty[id] * lastP[id] * (fxm ? (lastFx || fxNow() || NaN) : 1); }
        }
        cost.v = sum(Object.values(tot));
        if (ok) out.push({ t, v: val, c: cost.v });
      }
      // hoje: preço ao vivo
      const H = holdings(), T = totals(H);
      if (out.length && isNum(T.value)) { out[out.length - 1].v = T.value; }
      VAULT.hist = { pts: out, partial }; VAULT.histKey = key; VAULT.dayPrices = prices;
    }
    vaultDrawCheck();
    const from = { '1m': 30, '3m': 91, '6m': 182, '1y': 365, all: 1e5 }[VAULT.range] * 86400e3;
    const pts = VAULT.hist.pts.filter((p) => p.t >= Date.now() - from);
    if (pts.length < 2) { box.innerHTML = emptyBox('chart-line', L('Ainda há poucos dias de histórico', 'Not enough days of history yet'), esc(L('O gráfico aparece a partir do segundo dia de carteira.', 'The chart appears from the second day.'))); return; }
    const { ch, c, LWC } = await makeChart(box, { onTheme: () => { VAULT.histKey = ''; vaultHist(); } });
    const a = ch.addAreaSeries({ lineColor: c.accent, topColor: 'rgba(142,152,255,.25)', bottomColor: 'rgba(142,152,255,0)', lineWidth: 2, priceLineVisible: false, title: L('Patrimônio', 'Value') });
    a.setData(pts.map((p) => ({ time: ctime(p.t, false), value: p.v })));
    const l = ch.addLineSeries({ color: c.text3, lineWidth: 2, lineStyle: 2, lineType: LWC.LineType ? LWC.LineType.WithSteps : 1, priceLineVisible: false, lastValueVisible: false, title: L('Custo', 'Cost') });
    l.setData(pts.map((p) => ({ time: ctime(p.t, false), value: p.c })));
    ch.timeScale().fitContent();
    setHTML('#v-hist-note', note(L(`Preços diários de fechamento (Binance; CoinGecko para moedas fora da Binance)${VAULT.cur === 'BRL' ? ' convertidos pelo dólar PTAX do dia (Banco Central)' : ''}. Linha tracejada: custo dos aportes ainda em carteira. O último ponto usa os preços ao vivo.${VAULT.hist.partial ? ' Atenção: algum ativo tem histórico incompleto (o CoinGecko gratuito vai só até 1 ano).' : ''}`, `Daily closes (Binance; CoinGecko for others)${VAULT.cur === 'BRL' ? ' converted at that day’s PTAX rate' : ''}. Dashed: cost of current holdings. Last point uses live prices.`)));
  } catch (e) { box.innerHTML = emptyBox('wifi-off', L('Não foi possível montar o histórico', 'Could not build history'), esc(String(e.message || e)), `<button class="btn sm" data-act="vaultHistRetry">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`); }
}
// ---------- conferência dos lançamentos contra o preço de mercado do dia ----------
// Pega erro de digitação (ex.: "1.432,17" gravado como 1,43217 na versão antiga), que distorce o preço médio.
function vaultSuspects() {
  const P = VAULT.dayPrices || {}; const out = [];
  for (const r of VAULT.rows) {
    const ref = P[r.asset_id] && P[r.asset_id][r.date]; if (!isNum(ref) || !(r.qty > 0) || !(r.amount_usd > 0)) continue;
    const unit = r.amount_usd / r.qty, k = unit / ref;
    if (k > 0.6 && k < 1.6) continue;
    out.push({ r, unit, ref, k, fix: k > 250 && k < 4000 ? 'qty' : k < 1 / 250 && k > 1 / 4000 ? 'amt' : null });
  }
  return out.sort((a, b) => b.r.date.localeCompare(a.r.date));
}
function vaultDrawCheck() {
  const box = $('#v-check'); if (!box) return;
  const list = vaultSuspects();
  if (!list.length) { box.innerHTML = ''; return; }
  const pro = hasPro();
  box.innerHTML = `<section class="panel mt v-check">${panelHead('triangle-alert', L(`${list.length} lançamento(s) com preço muito diferente do mercado no dia`, `${list.length} entr(ies) far from that day’s market price`), { sub: esc(L('Isso costuma ser erro de digitação (ponto no lugar de vírgula) e deixa o preço médio e o resultado errados. Confira e corrija:', 'Usually a typo (dot vs comma); it skews average cost and P/L. Check and fix:')) })}
    <div class="list">${list.slice(0, 12).map((x) => {
      const r = x.r, cur = r.currency === 'USD' ? 'USD' : 'BRL', amt = cur === 'USD' ? r.amount_usd : r.amount_brl;
      const sug = x.fix === 'qty' ? L(`Quantidade provável: ${decOut(r.qty * 1000, 12)} ${r.sym}`, `Likely quantity: ${r.qty * 1000}`) : x.fix === 'amt' ? L(`Valor provável: perto de ${fmtMoney(amt * 1000, cur, [2, 2])}`, `Likely amount: about ${fmtMoney(amt * 1000, cur, [2, 2])}`) : L('Confira quantidade e valor.', 'Check quantity and amount.');
      return `<div class="li"><span class="grow"><span class="t" style="display:block">${esc(r.type === 'buy' ? L('Compra', 'Buy') : L('Venda', 'Sell'))} · ${esc(fmtQty(r.qty))} ${esc(r.sym)} · ${esc(fmtMoney(amt, cur, [2, 2]))} · ${esc(fmtDate(r.date + 'T12:00:00Z', { timeZone: 'UTC' }))}</span><span class="m">${esc(L('Você registrou', 'You recorded'))} ${esc(usd(x.unit))} ${esc(L('por unidade; o mercado fechou o dia em', 'per unit; market closed the day at'))} ${esc(usd(x.ref))}. <b>${esc(sug)}</b></span></span>${pro ? `<button class="btn xs pri" data-act="vaultFix" data-id="${esc(r.id)}" data-fix="${esc(x.fix || '')}">${ico('pencil', 14)}${esc(L('Corrigir', 'Fix'))}</button>` : ''}</div>`;
    }).join('')}</div>${note(L('Referência: fechamento diário (Binance; CoinGecko para moedas fora da Binance). Nada é alterado sem você salvar.', 'Reference: daily close (Binance; CoinGecko otherwise). Nothing changes until you save.'))}</section>`;
}
// abre o lançamento já com a correção sugerida preenchida (você confere e salva)
ACT.vaultFix = (el) => {
  const r = VAULT.rows.find((x) => x.id === el.dataset.id); if (!r) return;
  const e = { ...r };
  if (el.dataset.fix === 'qty') e._qty = decOut(r.qty * 1000, 12);
  if (el.dataset.fix === 'amt') e._amt = decOut((r.currency === 'USD' ? r.amount_usd : r.amount_brl) * 1000, 2);
  vaultForm(e, { focus: el.dataset.fix === 'amt' ? 'vf-amt' : 'vf-qty' });
};
ACT.vaultHistRetry = () => { VAULT.histKey = ''; vaultHist(); };
ACT.seg_vrange = (v) => { VAULT.range = v; vaultHist(); };
ACT.seg_vcur = (v) => { VAULT.cur = v; LS.set('vault-cur', v); VAULT.histKey = ''; vaultDraw(); };
ACT.vaultAsset = (el) => { VAULT.asset = el.dataset.id; vaultDrawAsset(holdings()); $('#v-asset') && $('#v-asset').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
ACT.vaultRetry = () => { VAULT.err = ''; vaultLoad(true); vaultDraw(); };
function vaultDrawMonth() {
  const box = $('#v-month'); if (!box) return;
  const m = {}; const now = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); m[d.toISOString().slice(0, 7)] = 0; }
  VAULT.rows.filter((r) => r.type === 'buy').forEach((r) => { const k = r.date.slice(0, 7); if (k in m) m[k] += VAULT.cur === 'BRL' ? r.amount_brl : r.amount_usd; });
  const mx = Math.max(...Object.values(m), 1);
  box.innerHTML = panelHead('chart-column', L('Aportes por mês', 'Contributions per month'), { sub: esc(L('Últimos 12 meses (compras).', 'Last 12 months (buys).')) }) + `<div class="acc-bars">${Object.entries(m).map(([k, v]) => `<div title="${esc(k)}: ${esc(money(v, [2, 2]))}"><i style="height:${Math.max(2, v / mx * 100)}%;${v ? '' : 'opacity:.3'}"></i><span>${esc(monthName(+k.slice(5, 7) - 1))}</span></div>`).join('')}</div><div class="small muted mt" style="margin-top:30px">${esc(L('Total nos 12 meses:', '12-month total:'))} <b>${esc(money(sum(Object.values(m)), [2, 2]))}</b></div>`;
}
function vaultDrawPerf(H) {
  const box = $('#v-perf'); if (!box) return;
  const buys = VAULT.rows.filter((r) => r.type === 'buy').map((r) => {
    const h = H.find((x) => x.id === r.asset_id); const unit = r.qty > 0 ? r.amount_usd / r.qty : null;
    const ch = h && isNum(h.price) && isNum(unit) && unit > 0 ? (h.price / unit - 1) * 100 : null;
    return { r, unit, ch };
  }).filter((x) => isNum(x.ch)).sort((a, b) => b.ch - a.ch);
  const row = (x) => `<div class="li"><span class="grow"><span class="t" style="display:block">${esc(x.r.sym)} · ${esc(fmtDate(x.r.date + 'T12:00:00Z', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</span><span class="m">${esc(fmtQty(x.r.qty))} @ ${esc(usd(x.unit))}</span></span>${chg(x.ch, 1)}</div>`;
  box.innerHTML = panelHead('trophy', L('Desempenho por aporte', 'Performance per entry'), { sub: esc(L('Quanto cada compra já subiu ou caiu (preço pago × preço agora, em US$).', 'How much each buy has moved (price paid vs. now, USD).')) }) +
    (buys.length ? `<div class="list">${buys.slice(0, 4).map(row).join('')}${buys.length > 4 ? `<div class="li tiny faint" style="justify-content:center">···</div>${buys.slice(-3).map(row).join('')}` : ''}</div>` : emptyBox('trophy', L('Sem compras com preço ao vivo', 'No buys with a live price')));
}
const VL = { q: '', n: 40 };
function vaultDrawList() {
  const box = $('#v-list'); if (!box) return;
  const q = VL.q.trim().toLowerCase();
  const rows = [...VAULT.rows].sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at))).filter((r) => !q || (r.sym + ' ' + (r.name || '') + ' ' + (r.exchange || '') + ' ' + (r.notes || '')).toLowerCase().includes(q));
  const pro = hasPro();
  box.innerHTML = `<div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('history', 18)}${esc(L('Histórico de lançamentos', 'Entry history'))}</h2></div><div class="inp-search" style="min-width:min(260px,100%)">${ico('search', 17)}<input class="inp" type="search" placeholder="${esc(L('Buscar ativo, corretora, nota', 'Search asset, exchange, note'))}" data-inp="vaultQ" value="${esc(VL.q)}" autocomplete="off" style="height:36px" aria-label="${esc(L('Buscar', 'Search'))}"></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(L('Data', 'Date'))}</th><th>${esc(L('Tipo', 'Type'))}</th><th>${esc(L('Ativo', 'Asset'))}</th><th class="r">${esc(L('Quantidade', 'Quantity'))}</th><th class="r">${esc(L('Valor', 'Amount'))}</th><th class="r">${esc(L('Preço unitário', 'Unit price'))}</th><th>${esc(L('Corretora', 'Exchange'))}</th><th>${esc(L('Nota', 'Note'))}</th><th class="r"></th></tr></thead><tbody>${rows.slice(0, VL.n).map((r) => {
    const amt = r.currency === 'USD' ? r.amount_usd : r.amount_brl, unit = r.qty > 0 ? amt / r.qty : null;
    return `<tr><td>${esc(fmtDate(r.date + 'T12:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }))}</td><td><span class="badge ${r.type === 'buy' ? 'live' : 'bad'}">${esc(r.type === 'buy' ? L('compra', 'buy') : L('venda', 'sell'))}</span></td><td><b>${esc(r.sym)}</b></td><td class="r num">${esc(fmtQty(r.qty))}</td><td class="r">${esc(fmtMoney(amt, r.currency, [2, 2]))}${r.fee ? `<div class="tiny faint">${esc(L('taxa', 'fee'))} ${esc(fmtMoney(r.fee, r.currency, [2, 2]))}</div>` : ''}</td><td class="r">${isNum(unit) ? esc(fmtMoney(unit, r.currency)) : '—'}</td><td class="muted">${esc(r.exchange || '')}</td><td class="muted" style="white-space:normal;max-width:220px">${esc(r.notes || '')}</td><td class="r nowrap">${pro ? `<button class="icon-btn" style="width:32px;height:32px;display:inline-grid" data-act="vaultEdit" data-id="${esc(r.id)}" aria-label="${esc(L('Editar', 'Edit'))}">${ico('pencil', 15)}</button> ` : ''}<button class="icon-btn" style="width:32px;height:32px;display:inline-grid" data-act="vaultDel" data-id="${esc(r.id)}" aria-label="${esc(L('Excluir', 'Delete'))}">${ico('trash-2', 15)}</button></td></tr>`;
  }).join('')}</tbody></table></div>${rows.length > VL.n ? `<div style="padding:12px 18px"><button class="btn sm block" data-act="vaultMore">${esc(L(`Mostrar mais (${rows.length - VL.n})`, `Show more (${rows.length - VL.n})`))}</button></div>` : ''}`;
}
ACT.vaultQ = debounce((el) => { VL.q = el.value; vaultDrawList(); const i = $('#v-list [data-inp=vaultQ]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
ACT.vaultMore = () => { VL.n += 60; vaultDrawList(); };
// ---------- formulário de aporte ----------
const EXCHANGES = ['Binance', 'Mercado Bitcoin', 'Foxbit', 'NovaDAX', 'Bitso', 'Coinbase', 'OKX', 'Bybit', 'Kraken', 'Nubank', 'Inter', 'XP', 'BTG', 'Bitpreço', 'Ripio', 'Carteira própria'];
// preço de mercado de um dia (vela diária da Binance ou CoinGecko) — referência para conferir o aporte
const _dayPx = {};
async function marketDay(coin, date) {
  if (!coin || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const key = (coin.s || coin.cg) + '|' + date; if (_dayPx[key]) return _dayPx[key];
  const t0 = Date.parse(date + 'T00:00:00Z');
  let r = null;
  try {
    if (coin.s && VALID.has(coin.s)) {
      const k = (await klines(coin.s, '1d', 1, { startTime: t0 }))[0];
      if (k && k.t === t0) r = { o: k.o, h: k.h, l: k.l, c: k.c, src: 'Binance' };
    }
    if (!r && coin.cg) {
      const pts = await cgDaily(coin.cg, t0 - 86400e3);
      const p = pts.find((x) => x.t === t0) || pts.find((x) => Math.abs(x.t - t0) <= 86400e3);
      if (p) r = { o: null, h: p.v, l: p.v, c: p.v, src: 'CoinGecko' };
    }
  } catch { r = null; }
  if (r) _dayPx[key] = r;
  return r;
}
// confere o preço unitário (US$) contra a faixa do dia; sugere a correção quando o erro é de casa decimal (×1000)
function priceCheck(unitUSD, day) {
  if (!isNum(unitUSD) || unitUSD <= 0 || !day) return null;
  const lo = Math.min(day.l, day.c), hi = Math.max(day.h, day.c), ref = day.c;
  if (unitUSD >= lo * 0.85 && unitUSD <= hi * 1.15) return { ok: true };
  const r = unitUSD / ref;
  const fix = r > 250 && r < 4000 ? 'qty' : r < 1 / 250 && r > 1 / 4000 ? 'amt' : null;
  return { ok: false, pct: (r - 1) * 100, fix, hard: unitUSD < lo * 0.5 || unitUSD > hi * 1.5 };
}
function vaultForm(entry, opts = {}) {
  const ed = !!(entry && entry.id);
  const orig = ed ? entry._orig || { type: entry.type, asset_id: entry.asset_id, qty: num(entry.qty) || 0 } : null;
  const st = { type: entry ? entry.type : 'buy', cur: entry ? entry.currency || VAULT.cur : VAULT.cur, coin: entry && entry.asset_id ? { kind: entry.binance_sym ? 'b' : 'g', s: entry.binance_sym, b: entry.sym, n: entry.name || entry.sym, cg: entry.asset_id, c: entry.color, logo: entry.logo || LOGOS[entry.asset_id] } : null, anchor: entry && entry._anchor ? entry._anchor : 'amt', day: null, dayFx: null, confirm: false, dirty: !!(entry && entry._draft) };
  const amt0 = entry ? (entry._amt !== undefined ? entry._amt : decOut(entry.currency === 'USD' ? entry.amount_usd : entry.amount_brl, 2)) : '';
  const qty0 = entry ? (entry._qty !== undefined ? entry._qty : decOut(entry.qty, 12)) : '';
  const unit0 = entry && entry._unit !== undefined ? entry._unit : '';
  const fee0 = entry ? (entry._fee !== undefined ? entry._fee : entry.fee ? decOut(entry.fee, 2) : '') : '';
  const txt = (id, val, ph, extra = '') => `<input class="inp" id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}" value="${esc(val)}" ${extra}>`;
  const body = `<form id="vf" class="stack" style="gap:12px" novalidate autocomplete="off">
    ${seg('vft', [['buy', L('Compra', 'Buy'), 'plus'], ['sell', L('Venda', 'Sell'), 'arrow-down-right']], st.type, 'lg')}
    <div class="fld"><span class="lbl-t">${esc(L('Moeda', 'Coin'))}</span><button type="button" class="btn block" id="vf-coin" style="justify-content:flex-start;height:46px"></button></div>
    <div class="grid g-2" style="gap:12px"><div class="fld"><label for="vf-date">${esc(L('Data', 'Date'))}</label><input class="inp" id="vf-date" type="date" max="${todayISO()}" min="2009-01-03" value="${esc(entry && entry.date ? entry.date : todayISO())}" required></div>
    <div class="fld"><label for="vf-qty">${esc(L('Quantidade', 'Quantity'))}</label>${txt('vf-qty', qty0, '0,005')}<span class="hint" id="vf-qty-h"></span></div></div>
    <div class="grid g-2" style="gap:12px"><div class="fld"><label for="vf-unit">${esc(L('Preço por unidade', 'Price per unit'))} <span class="faint vf-cl"></span></label>${txt('vf-unit', unit0, L('opcional', 'optional'))}<span class="hint" id="vf-unit-h">${esc(L('Preencha este OU o valor total — o outro é calculado.', 'Fill this OR the total — the other is calculated.'))}</span></div>
    <div class="fld"><label for="vf-amt">${esc(L('Valor total', 'Total amount'))} <span class="faint vf-cl"></span></label><div class="inp-group">${txt('vf-amt', amt0, '500,00')}${seg('vfc', [['BRL', 'R$'], ['USD', 'US$']], st.cur)}</div><span class="hint" id="vf-amt-h">${esc(L('Quanto pagou (compra) ou recebeu (venda), sem a taxa.', 'What you paid (buy) or received (sell), excluding fees.'))}</span></div></div>
    <div class="grid g-2" style="gap:12px"><div class="fld"><label for="vf-fee">${esc(L('Taxa (opcional)', 'Fee (optional)'))} <span class="faint vf-cl"></span></label>${txt('vf-fee', fee0, '0,00')}</div>
    <div class="fld"><label for="vf-ex">${esc(L('Corretora (opcional)', 'Exchange (optional)'))}</label><input class="inp" id="vf-ex" list="vf-exl" maxlength="40" autocomplete="off" value="${esc(entry ? entry.exchange || '' : '')}"><datalist id="vf-exl">${EXCHANGES.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
    <div class="fld"><label for="vf-note">${esc(L('Observação (opcional)', 'Note (optional)'))}</label><input class="inp" id="vf-note" maxlength="200" autocomplete="off" value="${esc(entry ? entry.notes || '' : '')}"></div>
    <div class="callout" id="vf-prev">${ico('calculator', 18)}<span>${esc(L('Preencha moeda, quantidade e valor para ver o preço unitário.', 'Fill coin, quantity and amount to see the unit price.'))}</span></div>
    <div class="form-msg" id="vf-msg" role="alert"></div>
  </form>`;
  const foot = `<button class="btn ghost" id="vf-cancel">${esc(L('Cancelar', 'Cancel'))}</button>${ed ? '' : `<button class="btn" id="vf-again">${esc(L('Salvar e registrar outro', 'Save & add another'))}</button>`}<button class="btn pri" id="vf-save">${ico('check', 17)}${esc(ed ? L('Salvar alterações', 'Save changes') : L('Salvar aporte', 'Save entry'))}</button>`;
  openModal({ title: ed ? L('Editar lançamento', 'Edit entry') : L('Registrar aporte', 'Add entry'), body, foot, guard: () => st.dirty, onOpen: (m) => {
    const $f = (id) => m.querySelector('#' + id);
    const coinBtn = $f('vf-coin');
    const vals = () => ({ date: $f('vf-date').value, qty: $f('vf-qty').value, unit: $f('vf-unit').value, amt: $f('vf-amt').value, fee: $f('vf-fee').value, ex: $f('vf-ex').value, note: $f('vf-note').value });
    // rascunho em memória: se a janela fechar sem querer, "Registrar aporte" volta com tudo preenchido
    const snapshot = () => { const v = vals(); return { ...(ed ? { id: entry.id, created_at: entry.created_at, _orig: orig } : {}), type: st.type, currency: st.cur, date: v.date, _qty: v.qty, _unit: v.unit, _amt: v.amt, _fee: v.fee, _anchor: st.anchor, exchange: v.ex, notes: v.note, asset_id: st.coin && st.coin.cg, sym: st.coin && st.coin.b, name: st.coin && st.coin.n, binance_sym: st.coin && st.coin.s, logo: st.coin && st.coin.logo, color: st.coin && st.coin.c, _draft: true }; };
    const keepDraft = () => { st.dirty = true; if (!ed) VAULT.draft = snapshot(); };
    const drawCoin = () => { coinBtn.innerHTML = st.coin ? `${coinLogo({ b: st.coin.b, logo: st.coin.logo, c: st.coin.c, cg: st.coin.cg }, 28)}<span><b>${esc(st.coin.n)}</b> <span class="faint">${esc(st.coin.b)}</span></span><span style="margin-left:auto" class="small faint">${esc(L('trocar', 'change'))}</span>` : `${ico('search', 17)}<span>${esc(L('Escolher moeda (qualquer cripto)', 'Pick a coin (any crypto)'))}</span>`; };
    drawCoin();
    coinBtn.onclick = () => {
      const draft = snapshot();
      openCoinPicker({ title: L('Moeda do aporte', 'Entry coin'), onPick: (p) => { if (p.kind === 'g') trackExtra(p.cg); vaultForm({ ...draft, asset_id: p.cg, sym: p.b, name: p.n, binance_sym: p.kind === 'b' ? p.s : null, logo: p.logo, color: p.c }); }, onCancel: () => vaultForm(draft) });
    };
    // a roda do mouse não muda data nem número (antes ela alterava o valor sem você perceber)
    m.querySelectorAll('input').forEach((i) => i.addEventListener('wheel', (e) => { if (document.activeElement === i) { e.preventDefault(); i.blur(); } }, { passive: false }));
    // Enter passa para o próximo campo (não salva sem querer ao escolher a corretora na lista)
    const order = ['vf-date', 'vf-qty', 'vf-unit', 'vf-amt', 'vf-fee', 'vf-ex', 'vf-note'];
    m.querySelector('#vf').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault(); const i = order.indexOf(e.target.id); const nx = i >= 0 && order[i + 1] ? $f(order[i + 1]) : $f('vf-save'); if (nx) nx.focus();
    });
    m.querySelector('#vf').addEventListener('submit', (e) => e.preventDefault());
    const curSym = () => (st.cur === 'BRL' ? 'R$' : 'US$');
    const init = { 'vf-qty-h': $f('vf-qty').value, 'vf-amt-h': $f('vf-amt').value, 'vf-unit-h': $f('vf-unit').value };
    const hint = (id, info, unitTxt) => {
      const el = $f(id); if (!el) return;
      const inp = $f(id.replace(/-h$/, ''));
      if (info.amb && ed && inp && inp.value === init[id]) info = { ...info, amb: false }; // valor que veio do próprio lançamento
      if (info.bad) { el.innerHTML = `<span style="color:var(--down)">${esc(L('Use só números, ponto e vírgula (ex.: 1.432,17).', 'Use digits, dot and comma only (e.g. 1,432.17).'))}</span>`; return; }
      if (!isNum(info.v)) return;
      el.innerHTML = `${esc(L('Entendido:', 'Read as:'))} <b>${esc(decOut(info.v, 12))}</b> ${esc(unitTxt)}${info.amb ? ` <span style="color:var(--stale)">· ${esc(info.alt >= info.v ? L(`se quis dizer ${decOut(info.alt, 12)} (mil…), digite ${decOut(info.alt, 12)} com ponto ou ${info.alt} sem vírgula`, `if you meant ${info.alt}, type it without the comma`) : L(`se quis dizer ${decOut(info.alt, 12)}, digite com vírgula (${String(info.alt).replace('.', ',')})`, `if you meant ${info.alt}, type it with a comma`))}</span>` : ''}`;
    };
    const read = () => { const v = vals(); return { qi: parseDecInfo(v.qty), ui: parseDecInfo(v.unit), ai: parseDecInfo(v.amt), fi: parseDecInfo(v.fee) }; };
    const preview = () => {
      m.querySelectorAll('.vf-cl').forEach((x) => { x.textContent = `(${curSym()})`; });
      const { qi, ui, ai } = read();
      const sym = st.coin ? st.coin.b : '';
      hint('vf-qty-h', qi, sym);
      if (st.anchor === 'unit') hint('vf-unit-h', ui, curSym()); else if (isNum(ai.v)) hint('vf-amt-h', ai, curSym());
      const box = $f('vf-prev');
      const qty = qi.v, amt = ai.v;
      if (!st.coin || !(qty > 0) || !isNum(amt) || amt < 0) { box.className = 'callout'; box.innerHTML = `${ico('calculator', 18)}<span>${esc(L('Preencha moeda, quantidade e valor (ou preço por unidade) para conferir.', 'Fill coin, quantity and amount (or unit price) to check.'))}</span>`; return; }
      const unit = amt / qty;
      const fx = st.dayFx || fxNow();
      const unitUSD = st.cur === 'USD' ? unit : fx ? unit / fx : null;
      const conv = (u) => (st.cur === 'USD' ? u : fx ? u * fx : null);
      const held = holdings().find((h) => h.id === st.coin.cg);
      const heldQty = (held ? held.qty : 0) + (orig && orig.asset_id === st.coin.cg ? (orig.type === 'sell' ? orig.qty : -orig.qty) : 0);
      const warnSell = st.type === 'sell' && qty > heldQty + 1e-9 ? `<div class="tiny" style="color:var(--stale);margin-top:4px">${esc(L(`Atenção: você tem ${fmtQty(Math.max(0, heldQty))} ${sym} registrados — a venda não pode ser maior.`, `Note: you have ${fmtQty(Math.max(0, heldQty))} ${sym} recorded.`))}</div>` : '';
      const chk = priceCheck(unitUSD, st.day);
      let dayTxt = '';
      if (st.day) {
        const lo = conv(Math.min(st.day.l, st.day.c)), hi = conv(Math.max(st.day.h, st.day.c));
        dayTxt = `<div class="tiny faint" style="margin-top:4px">${esc(L(`Mercado em ${fmtDate($f('vf-date').value + 'T12:00:00Z', { timeZone: 'UTC' })}`, `Market on ${$f('vf-date').value}`))}: ${isNum(lo) && isNum(hi) && Math.abs(hi - lo) > 1e-12 ? `${esc(fmtMoney(lo, st.cur))} – ${esc(fmtMoney(hi, st.cur))}` : esc(fmtMoney(conv(st.day.c), st.cur))} (${esc(st.day.src)}${st.cur === 'BRL' && st.dayFx ? ', ' + esc(L('dólar PTAX do dia', 'PTAX rate of the day')) : ''})</div>`;
      }
      let warnPx = '';
      if (chk && !chk.ok) {
        const sug = chk.fix === 'qty' ? L(`Parece erro de casa decimal: a quantidade seria ${decOut(qty * 1000, 12)} ${sym}?`, `Looks like a decimal slip: quantity ${qty * 1000}?`) : chk.fix === 'amt' ? L(`Parece erro de casa decimal: o valor seria ${curSym()} ${decOut(amt * 1000, 2)}?`, `Looks like a decimal slip: amount ${amt * 1000}?`) : L('Confira a quantidade e o valor.', 'Check quantity and amount.');
        warnPx = `<div class="vf-warn${chk.hard ? '' : ' soft'}">${ico('triangle-alert', 16)}<span>${esc(L(`O preço por unidade está ${fmtPct(Math.abs(chk.pct), 0, false)} ${chk.pct > 0 ? 'acima' : 'abaixo'} do mercado nesse dia.`, `Unit price is ${fmtPct(Math.abs(chk.pct), 0, false)} ${chk.pct > 0 ? 'above' : 'below'} the market that day.`))} ${esc(sug)}${chk.fix ? ` <button type="button" class="btn xs" id="vf-fix">${esc(L('Corrigir', 'Fix'))}</button>` : ''}</span></div>`;
      }
      const q = priceOf(st.coin.s || st.coin.cg); const nowCur = q ? (st.cur === 'BRL' ? toBRL(q.p) : q.p) : null;
      const diff = isNum(nowCur) && unit > 0 ? (nowCur / unit - 1) * 100 : null;
      box.className = 'callout' + (chk && !chk.ok && chk.hard ? ' warn' : '');
      box.innerHTML = `${ico('calculator', 18)}<span style="flex:1;min-width:0">${esc(L('Preço por unidade:', 'Unit price:'))} <b>${esc(fmtMoney(unit, st.cur))}</b>${isNum(nowCur) ? ` · ${esc(L('agora:', 'now:'))} ${esc(fmtMoney(nowCur, st.cur))} <span class="${tone(diff)}">(${esc(fmtPct(diff, 1))})</span>` : ''}${dayTxt}${warnPx}${warnSell}</span>`;
      const fixB = $f('vf-fix');
      if (fixB) fixB.onclick = () => { if (chk.fix === 'qty') { $f('vf-qty').value = decOut(qty * 1000, 12); if (st.anchor === 'unit') st.anchor = 'amt'; } else { $f('vf-amt').value = decOut(amt * 1000, 2); st.anchor = 'amt'; } sync('fix'); keepDraft(); };
    };
    // preço por unidade × quantidade = total (o último campo que você mexeu manda)
    const sync = (from) => {
      const { qi, ui, ai } = read();
      // nunca reescreve o campo que você está digitando
      if (from === 'unit') st.anchor = 'unit';
      if (from === 'amt') st.anchor = 'amt';
      if (st.anchor === 'unit') { if (isNum(ui.v) && qi.v > 0) $f('vf-amt').value = decOut(ui.v * qi.v, 2); else if (from === 'unit') $f('vf-amt').value = ''; }
      else if (isNum(ai.v) && qi.v > 0) { if (from !== 'unit') $f('vf-unit').value = decOut(ai.v / qi.v, 8); } else if (from === 'amt') $f('vf-unit').value = '';
      st.confirm = false; preview();
    };
    $f('vf-qty').addEventListener('input', () => { sync('qty'); keepDraft(); });
    $f('vf-unit').addEventListener('input', () => { sync('unit'); keepDraft(); });
    $f('vf-amt').addEventListener('input', () => { sync('amt'); keepDraft(); });
    ['vf-fee', 'vf-ex', 'vf-note'].forEach((i) => $f(i).addEventListener('input', keepDraft));
    const loadDay = async () => {
      const date = $f('vf-date').value; st.day = null; st.dayFx = null;
      if (!st.coin || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { preview(); return; }
      const [d, fx] = await Promise.all([marketDay(st.coin, date), st.cur === 'BRL' ? fxOn(date) : Promise.resolve(null)]);
      if (!$f('vf-date') || $f('vf-date').value !== date) return;
      st.day = d; st.dayFx = fx ? fx.v : null; preview();
    };
    $f('vf-date').addEventListener('change', () => { keepDraft(); loadDay(); });
    ACT.seg_vft = (v) => { st.type = v; st.confirm = false; keepDraft(); preview(); };
    ACT.seg_vfc = (v) => { st.cur = v; st.confirm = false; keepDraft(); loadDay(); };
    if (!unit0 && !ed) sync('amt'); else if (ed && !unit0) sync('amt'); else preview();
    loadDay();
    if (opts.focus && $f(opts.focus)) setTimeout(() => { const el = $f(opts.focus); el.focus(); el.select && el.select(); }, 60);
    $f('vf-cancel').onclick = () => { if (!ed) VAULT.draft = null; st.dirty = false; closeModal(); };
    const save = async (again) => {
      const msg = $f('vf-msg'); msg.className = 'form-msg err'; msg.textContent = '';
      const v = vals(); const { qi, ai, fi } = read();
      const date = v.date, qty = qi.v, amt = ai.v, fee = fi.v || 0;
      if (!st.coin) { msg.textContent = L('Escolha a moeda.', 'Pick the coin.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO() || date < '2009-01-03') { msg.textContent = L('Confira a data (não pode ser no futuro).', 'Check the date (cannot be in the future).'); return; }
      if (qi.bad || !(qty > 0)) { msg.textContent = L('Informe a quantidade (maior que zero).', 'Enter the quantity (above zero).'); $f('vf-qty').focus(); return; }
      if (ai.bad || !isNum(amt) || amt < 0) { msg.textContent = L('Informe o valor total ou o preço por unidade.', 'Enter the total amount or the unit price.'); $f('vf-amt').focus(); return; }
      if (fi.bad || fee < 0) { msg.textContent = L('Confira a taxa.', 'Check the fee.'); return; }
      const fxGuess = st.dayFx || fxNow();
      const chk = priceCheck(st.cur === 'USD' ? amt / qty : fxGuess ? amt / qty / fxGuess : null, st.day);
      if (chk && !chk.ok && chk.hard && !st.confirm) { st.confirm = true; msg.className = 'form-msg warn'; msg.textContent = L('O preço por unidade está muito longe do mercado nesse dia (veja o aviso acima). Corrija, ou clique em salvar de novo para gravar assim mesmo.', 'Unit price is far from that day’s market (see above). Fix it, or click save again to keep it.'); return; }
      const btns = [$f('vf-save'), $f('vf-again')].filter(Boolean); btns.forEach((b) => b.classList.add('busy'));
      try {
        // dólar do dia do aporte (PTAX); sem ele, o dólar de agora
        const fx = (await fxOn(date)) || (fxNow() ? { v: fxNow(), src: 'agora' } : null);
        if (!fx) throw new Error(L('Sem cotação do dólar para converter. Tente de novo em instantes.', 'No USD rate to convert. Try again shortly.'));
        const r6 = (x) => Math.round(x * 1e6) / 1e6;
        const row = {
          type: st.type, asset_id: st.coin.cg, sym: String(st.coin.b).toUpperCase().slice(0, 15), name: String(st.coin.n).slice(0, 60),
          binance_sym: st.coin.s && /^[A-Z0-9]{2,20}$/.test(st.coin.s) ? st.coin.s : null,
          logo: st.coin.logo && /^https:\/\//.test(st.coin.logo) && st.coin.logo.length <= 300 ? st.coin.logo : null,
          color: /^#[0-9a-fA-F]{6}$/.test(st.coin.c || '') ? st.coin.c : null,
          date, qty, currency: st.cur, fee: round2(fee),
          // o valor digitado é gravado como está; o convertido guarda mais casas para não distorcer o preço médio de aportes pequenos
          amount_usd: st.cur === 'USD' ? round2(amt) : r6(amt / fx.v), amount_brl: st.cur === 'BRL' ? round2(amt) : r6(amt * fx.v), fx_brl: r6(fx.v),
          exchange: v.ex.trim().slice(0, 40) || null, notes: v.note.trim().slice(0, 200) || null,
        };
        const sb = await sbClient();
        const q = ed ? sb.from('vault_entries').update(row).eq('id', entry.id).select().single() : sb.from('vault_entries').insert(row).select().single();
        const { data, error } = await q;
        if (error) throw error;
        const r = vNorm(data);
        const i = VAULT.rows.findIndex((x) => x.id === r.id);
        if (i >= 0) VAULT.rows[i] = r; else VAULT.rows.push(r);
        VAULT.histKey = ''; VAULT.asset = r.asset_id; VAULT.draft = null; st.dirty = false;
        if (!r.binance_sym) trackExtra(r.asset_id);
        toast(ed ? L('Lançamento atualizado.', 'Entry updated.') : L('Aporte salvo.', 'Entry saved.'), { type: 'ok' });
        if (again) { vaultDraw(); vaultForm({ type: st.type, currency: st.cur, date, asset_id: st.coin.cg, sym: st.coin.b, name: st.coin.n, binance_sym: st.coin.s, logo: st.coin.logo, color: st.coin.c, exchange: row.exchange, _draft: false }); }
        else { closeModal(); vaultDraw(); }
      } catch (e) {
        const t = String((e && e.message) || e);
        msg.className = 'form-msg err';
        msg.textContent = /row-level security|permission|42501/i.test(t) ? L('Seu plano não permite novos lançamentos. Veja os planos PRO.', 'Your plan does not allow new entries. See PRO plans.') : t;
        btns.forEach((b) => b.classList.remove('busy'));
      }
    };
    $f('vf-save').onclick = () => save(false);
    const ag = $f('vf-again'); if (ag) ag.onclick = () => save(true);
  } });
}
ACT.vaultAdd = () => { if (!hasPro()) { go('plans'); return; } vaultForm(VAULT.draft || null); };
ACT.vaultEdit = (el) => { const r = VAULT.rows.find((x) => x.id === el.dataset.id); if (r) vaultForm(r, { focus: el.dataset.focus }); };
ACT.vaultDel = async (el) => {
  const r = VAULT.rows.find((x) => x.id === el.dataset.id); if (!r) return;
  if (!(await confirmBox(L(`Excluir o lançamento de ${fmtQty(r.qty)} ${r.sym} de ${fmtDate(r.date + 'T12:00:00Z', { timeZone: 'UTC' })}?`, `Delete the ${fmtQty(r.qty)} ${r.sym} entry of ${fmtDate(r.date + 'T12:00:00Z', { timeZone: 'UTC' })}?`), { ok: L('Excluir', 'Delete'), danger: true }))) return;
  try {
    const sb = await sbClient(); const { data, error } = await sb.rpc('vault_remove', { p_id: r.id });
    if (error) throw error; if (!data || !data.ok) throw new Error(L('lançamento não encontrado', 'entry not found'));
    VAULT.rows = VAULT.rows.filter((x) => x.id !== r.id); VAULT.histKey = ''; vaultDraw();
    toast(L('Lançamento excluído.', 'Entry deleted.'), { action: { label: L('Desfazer', 'Undo'), fn: async () => { try { const { data: d2, error: e2 } = await sb.rpc('vault_restore', { p_id: r.id }); if (e2 || !d2 || !d2.ok) throw e2 || new Error('restore'); VAULT.rows.push(r); VAULT.histKey = ''; vaultDraw(); toast(L('Lançamento restaurado.', 'Entry restored.'), { type: 'ok' }); } catch (e) { toast(String(e.message || e), { type: 'err' }); } } } });
  } catch (e) { toast(String(e.message || e), { type: 'err' }); }
};
// ---------- exportar / importar ----------
ACT.vaultCsv = () => {
  closeMenus();
  const n = (v, d = 2) => (isNum(v) ? v.toFixed(d).replace('.', ',') : '');
  const head = ['Data', 'Tipo', 'Ativo', 'Nome', 'Quantidade', 'Valor', 'Moeda', 'Valor US$', 'Valor R$', 'Dólar usado', 'Preço unitário US$', 'Taxa', 'Corretora', 'Observação'];
  const lines = [...VAULT.rows].sort((a, b) => a.date.localeCompare(b.date)).map((r) => [r.date, r.type === 'buy' ? 'compra' : 'venda', r.sym, r.name || '', n(r.qty, 10), n(r.currency === 'USD' ? r.amount_usd : r.amount_brl), r.currency, n(r.amount_usd), n(r.amount_brl), n(r.fx_brl, 4), n(r.qty > 0 ? r.amount_usd / r.qty : null, 8), n(r.fee), r.exchange || '', (r.notes || '').replace(/[\r\n;]+/g, ' ')]);
  const csv = '﻿' + [head, ...lines].map((l) => l.map((x) => (/[";]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(';')).join('\r\n');
  downloadFile(`nexus-vault-${todayISO()}.csv`, csv, 'text/csv');
};
ACT.vaultJson = () => {
  closeMenus();
  const out = { app: 'NEXUS HUB', kind: 'vault-backup', version: 1, exportedAt: new Date().toISOString(), entries: VAULT.rows.map(({ user_id, removed_at, ...r }) => r) };
  downloadFile(`nexus-vault-backup-${todayISO()}.json`, JSON.stringify(out, null, 2));
};
function rowFromAny(x, i) {
  // aceita o backup novo, o formato antigo (coinId/coinSym…) e linhas de CSV já convertidas
  const asset = String(x.asset_id || x.coinId || '').trim(); if (!asset) return null;
  const qty = num(x.qty), usdv = num(x.amount_usd ?? x.amountUSD), brlv = num(x.amount_brl ?? x.amountBRL);
  if (!(qty > 0) || (!isNum(usdv) && !isNum(brlv))) return null;
  const date = String(x.date || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const fx = num(x.fx_brl) || (isNum(usdv) && usdv > 0 && isNum(brlv) ? brlv / usdv : fxNow());
  const c = BY_CG[asset];
  return {
    type: x.type === 'sell' ? 'sell' : 'buy', asset_id: asset.slice(0, 80), sym: String(x.sym || x.coinSym || (c && c.b) || asset).toUpperCase().slice(0, 15), name: String(x.name || (c && c.n) || x.coinSym || asset).slice(0, 60),
    binance_sym: x.binance_sym && /^[A-Z0-9]{2,20}$/.test(x.binance_sym) ? x.binance_sym : c ? c.s : null,
    logo: /^https:\/\//.test(x.logo || '') && x.logo.length <= 300 ? x.logo : null, color: /^#[0-9a-fA-F]{6}$/.test(x.color || x.coinColor || '') ? (x.color || x.coinColor) : null,
    date, qty, amount_usd: round2(isNum(usdv) ? usdv : brlv / fx), amount_brl: round2(isNum(brlv) ? brlv : usdv * fx), fx_brl: fx ? Math.round(fx * 1e6) / 1e6 : null,
    currency: x.currency === 'USD' ? 'USD' : 'BRL', fee: round2(Math.max(0, num(x.fee) || 0)), exchange: x.exchange ? String(x.exchange).slice(0, 40) : null, notes: x.notes ? String(x.notes).slice(0, 200) : null,
    legacy_id: String(x.legacy_id || x.id || `imp-${date}-${asset}-${qty}-${i}`).slice(0, 60),
  };
}
async function vaultBulk(rows, label) {
  rows = rows.filter(Boolean);
  if (!rows.length) { toast(L('Nenhum lançamento válido encontrado no arquivo.', 'No valid entry found in the file.'), { type: 'warn' }); return 0; }
  const sb = await sbClient();
  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await sb.from('vault_entries').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,legacy_id', ignoreDuplicates: true }).select('id');
    if (error) throw error; done += (data || []).length;
  }
  await vaultLoad(true);
  toast(L(`${label}: ${done} lançamento(s) novo(s) importado(s).${done < rows.length ? ` ${rows.length - done} já existiam.` : ''}`, `${label}: ${done} new entr(ies) imported.`), { type: 'ok', ms: 7000 });
  return done;
}
ACT.vaultImport = () => {
  closeMenus();
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,.csv,application/json,text/csv';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 3e6) { toast(L('Arquivo grande demais (máx. 3 MB).', 'File too large (max 3 MB).'), { type: 'err' }); return; }
    try {
      const text = await f.text(); let list = [];
      if (/\.json$/i.test(f.name) || /^\s*[[{]/.test(text)) { const j = JSON.parse(text); list = Array.isArray(j) ? j : j.entries || j.vault_entries || []; }
      else list = parseVaultCsv(text);
      await vaultBulk(list.map(rowFromAny), L('Importação', 'Import'));
    } catch (e) { toast(L('Não foi possível importar: ', 'Import failed: ') + (e.message || e), { type: 'err', ms: 8000 }); }
  };
  inp.click();
};
function parseVaultCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const ci = { d: col(/^data|date/), t: col(/^tipo|type/), a: col(/^ativo|asset|sym/), q: col(/^quant|qty/), u: col(/us\$|usd/), b: col(/r\$|brl/), f: col(/^taxa|fee/), e: col(/corretora|exchange/), n: col(/observa|note/) };
  const dec = (s) => { s = String(s || '').trim(); if (!s) return null; if (sep === ';') s = s.replace(/\./g, '').replace(',', '.'); return num(s); };
  return lines.slice(1).map((l) => {
    const c = split(l); const sym = (c[ci.a] || '').toUpperCase(); const u = BY_BASE[sym];
    let d = c[ci.d] || ''; const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) d = `${br[3]}-${br[2]}-${br[1]}`;
    return { date: d, type: /vend|sell/i.test(c[ci.t] || '') ? 'sell' : 'buy', asset_id: u ? u.cg : sym.toLowerCase(), sym, qty: dec(c[ci.q]), amount_usd: ci.u >= 0 ? dec(c[ci.u]) : null, amount_brl: ci.b >= 0 ? dec(c[ci.b]) : null, fee: ci.f >= 0 ? dec(c[ci.f]) : 0, exchange: ci.e >= 0 ? c[ci.e] : null, notes: ci.n >= 0 ? c[ci.n] : null, currency: ci.b >= 0 ? 'BRL' : 'USD' };
  });
}
// aportes da versão antiga (salvos só no navegador)
function legacyEntries() {
  if (!ACCOUNT.user || LS.get('legacy-done:' + ACCOUNT.user.id)) return [];
  const out = [];
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('nx-vault-entries-')).forEach((k) => {
      let a = []; try { a = JSON.parse(localStorage.getItem(k) || '[]'); } catch { /* */ }
      if (Array.isArray(a)) a.forEach((e) => { if (e && e.id && !/^d\d+$/.test(String(e.id))) out.push(e); });
    });
  } catch { /* sem acesso ao armazenamento */ }
  return out;
}
ACT.vaultLegacy = async (el) => {
  el.classList.add('busy');
  try { const list = legacyEntries(); await vaultBulk(list.map(rowFromAny), L('Versão antiga', 'Old version')); LS.set('legacy-done:' + ACCOUNT.user.id, true); vaultDraw(); }
  catch (e) { toast(String(e.message || e), { type: 'err' }); el.classList.remove('busy'); }
};
function vaultGuest() {
  const step = (n, icon, t, d) => `<div class="panel" style="background:var(--panel-2);border-color:transparent"><div class="row" style="gap:10px"><span class="badge pro">${n}</span>${ico(icon, 18)}<b>${esc(t)}</b></div><p class="small muted mt" style="margin-top:8px;line-height:1.55">${esc(d)}</p></div>`;
  return `<section class="panel hero"><div class="grid g-2" style="gap:24px;align-items:center"><div>
    <h2 style="font-size:24px;font-weight:800;line-height:1.2">${esc(L('Sua carteira de cripto, organizada e sempre com preço ao vivo', 'Your crypto portfolio, organized, always at live prices'))}</h2>
    <p class="muted mt" style="line-height:1.6">${esc(L('Registre compras e vendas de qualquer moeda. O Vault calcula preço médio, lucro realizado e em aberto, mostra a evolução do patrimônio em reais ou dólares e marca cada aporte no gráfico. Seus dados ficam na sua conta, com acesso só seu, no PC e no celular.', 'Record buys and sells of any coin. The Vault computes average cost, realized and open P/L, shows portfolio value over time in BRL or USD and marks each entry on the chart. Your data lives in your account, private to you, on PC and phone.'))}</p>
    <div class="row wrap mt" style="gap:10px"><button class="btn pri" data-act="signup">${ico('user', 17)}${esc(L('Criar conta grátis (15 dias de PRO)', 'Create free account (15 days PRO)'))}</button><button class="btn" data-act="login">${ico('log-in', 17)}${esc(L('Já tenho conta', 'I have an account'))}</button></div></div>
    <div class="stack" style="gap:10px">${step(1, 'plus', L('Registre o aporte', 'Record the entry'), L('Moeda, data, quantidade e quanto pagou. O preço unitário é calculado.', 'Coin, date, quantity and amount paid. Unit price is computed.'))}${step(2, 'chart-line', L('Acompanhe ao vivo', 'Track it live'), L('Patrimônio, resultado e distribuição com preços em tempo real.', 'Value, P/L and allocation at real-time prices.'))}${step(3, 'download', L('Leve seus dados', 'Take your data'), L('Baixe planilha ou backup quando quiser. Você é dono dos seus dados.', 'Download a spreadsheet or backup any time. You own your data.'))}</div></div></section>`;
}
let _vT = 0;
onPrice((set) => {
  if (S.page !== 'vault' || !VAULT.loaded || !VAULT.rows.length || !$('#v-val')) return;
  if (Date.now() - _vT < 2000) return; _vT = Date.now();
  const H = holdings(), T = totals(H);
  setHTML('#v-val', isNum(T.value) ? esc(money(T.value, [2, 2])) : '—');
  setHTML('#v-pl', vaultPlHtml(T));
  if (set.has('FX') || set.has('XP') || set.has('CGM')) vaultDrawParts(H, T);
});
page({
  id: 'vault', group: 'conta', icon: 'wallet', pt: 'Portfolio Vault', en: 'Portfolio Vault', pro: true, acct: true, proWhat: 'o Portfolio Vault', proWhatEn: 'Portfolio Vault',
  sub: 'Sua carteira de cripto com preço médio, resultado e evolução — salva na sua conta.',
  subEn: 'Your crypto portfolio with average cost, P/L and history — saved to your account.',
  init(el) { el.innerHTML = vaultHtml(); vaultDraw(); },
  show() { if (ACCOUNT.user && !VAULT.loaded) vaultLoad(); vaultDraw(); },
});
