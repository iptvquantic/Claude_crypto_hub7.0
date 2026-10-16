// =====================================================================
// ON-CHAIN BTC — a rede ao vivo (mempool.space: blocos, mempool, taxas,
// dificuldade, pools), halving e oferta pela regra do protocolo, termômetro
// do ciclo, custo médio de cada grupo de detentores, corretoras e uso da rede
// (histórico diário do robô: Coin Metrics e BGeometrics). Tudo com fonte e data.
// =====================================================================
const HALVING_EVERY = 210000;
// oferta emitida até a altura h (inclui o bloco gênese), em BTC
function supplyAt(h) {
  let left = h + 1, era = 0, s = 0;
  while (left > 0 && era < 64) { const n = Math.min(left, HALVING_EVERY); s += n * 50 / 2 ** era; left -= n; era++; }
  return s;
}
const rewardAt = (h) => 50 / 2 ** Math.floor(h / HALVING_EVERY);
const MP = 'https://mempool.space/api';
function registerOnchainSources() {
  source({
    id: 'mempool', label: L('Rede Bitcoin', 'Bitcoin network'), provider: 'mempool.space', every: 60e3,
    need: () => ['onchain', 'whales'].includes(S.page),
    run: async () => {
      const [h, da, hr, fee, mp] = await Promise.allSettled([
        getText(MP + '/blocks/tip/height', { timeout: 10000 }), getJSON(MP + '/v1/difficulty-adjustment'),
        getJSON(MP + '/v1/mining/hashrate/3d'), getJSON(MP + '/v1/fees/recommended'), getJSON(MP + '/mempool'),
      ]);
      let height = h.status === 'fulfilled' ? parseInt(h.value, 10) : NaN;
      if (!isNum(height)) height = parseInt(await getText('https://blockstream.info/api/blocks/tip/height', { timeout: 10000 }), 10);
      const v = (r) => (r.status === 'fulfilled' ? r.value : null);
      return { height, da: v(da), hr: v(hr) && { cur: v(hr).currentHashrate, diff: v(hr).currentDifficulty }, fee: v(fee), mp: v(mp) && { count: v(mp).count, vsize: v(mp).vsize, fee: v(mp).total_fee } };
    },
    validate: (d) => isNum(d.height) && d.height > 900000 && d.height < 3e6,
    onData: () => _markDirty('MEMPOOL'),
  });
  source({
    id: 'mp-blocks', label: L('Blocos e fila', 'Blocks & queue'), provider: 'mempool.space', every: 60e3, persist: false,
    need: () => S.page === 'onchain',
    run: async () => {
      const [b, nb, rw] = await Promise.allSettled([getJSON(MP + '/v1/blocks', { timeout: 12000 }), getJSON(MP + '/v1/fees/mempool-blocks', { timeout: 12000 }), getJSON(MP + '/v1/mining/reward-stats/144', { timeout: 12000 })]);
      if (b.status !== 'fulfilled') throw b.reason;
      const ex = (x) => x.extras || {};
      return {
        blocks: b.value.slice(0, 8).map((x) => ({ h: x.height, t: x.timestamp * 1000, n: x.tx_count, size: x.size, fee: num(ex(x).medianFee), range: ex(x).feeRange || [], pool: ex(x).pool && ex(x).pool.name, fees: num(ex(x).totalFees), reward: num(ex(x).reward) })),
        next: nb.status === 'fulfilled' ? nb.value.slice(0, 3).map((x) => ({ n: x.nTx, vsize: x.blockVSize, fee: num(x.medianFee), range: x.feeRange || [], fees: num(x.totalFees) })) : [],
        rw: rw.status === 'fulfilled' ? { reward: num(rw.value.totalReward), fee: num(rw.value.totalFee), tx: num(rw.value.totalTx), from: rw.value.startBlock, to: rw.value.endBlock } : null,
      };
    },
    validate: (d) => d.blocks.length > 0 && isNum(d.blocks[0].h),
    onData: () => _markDirty('MPBLK'),
  });
  source({
    id: 'mp-mining', label: L('Mineração (1 ano)', 'Mining (1 year)'), provider: 'mempool.space', every: 3 * 3600e3, persist: false,
    need: () => S.page === 'onchain',
    run: async () => {
      const [h, p] = await Promise.all([getJSON(MP + '/v1/mining/hashrate/1y', { timeout: 15000 }), getJSON(MP + '/v1/mining/pools/1w', { timeout: 15000 })]);
      return { hash: (h.hashrates || []).map((x) => ({ t: x.timestamp * 1000, v: x.avgHashrate })), diff: (h.difficulty || []).map((x) => ({ t: x.time * 1000, h: x.height, v: x.difficulty, adj: x.adjustment })), pools: (p.pools || []).map((x) => ({ n: x.name, b: x.blockCount, empty: x.emptyBlocks })), blocks: p.blockCount };
    },
    validate: (d) => d.hash.length > 100 && d.pools.length > 3,
    onData: () => _markDirty('MPMIN'),
  });
}
function onchainHtml() {
  return `${pageHead(PAGES.onchain, `<button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>`)}
  <section class="panel" id="oc-net"></section>
  <section class="panel mt" id="oc-blocks"></section>
  <div class="grid g-2 mt"><section class="panel" id="oc-halv"></section><section class="panel" id="oc-fee"></section></div>
  <section class="panel mt" id="oc-thermo"></section>
  <div class="grid oc-g2 mt"><section class="panel" id="oc-ladder"></section><section class="panel" id="oc-flow"></section></div>
  <section class="panel mt" id="oc-mining"></section>
  <section class="panel mt" id="oc-links"></section>`;
}
function hashFmt(h) { return isNum(h) ? `${fmtNum(h / 1e18, 0, 0)} EH/s` : '—'; }
// ---------- rede agora ----------
function drawOcNet() {
  const m = CACHE.get('mempool'); const M = m && m.v;
  const da = M && M.da;
  const head = panelHead('blocks', L('Rede Bitcoin agora', 'Bitcoin network now'), { sub: esc(L('Blocos, poder de mineração e próximo ajuste de dificuldade.', 'Blocks, mining power and next difficulty adjustment.')), right: stamp('mempool') });
  if (!M) { setHTML('#oc-net', head + skel(3, 20)); return; }
  const strip = `<div class="strip" style="margin:0 -18px">${[
    [L('Último bloco', 'Latest block'), esc(fmtNum(M.height, 0, 0)), ''],
    [L('Poder de mineração (hashrate)', 'Hashrate'), esc(hashFmt(M.hr && M.hr.cur)), L('média de 3 dias', '3-day average')],
    [L('Próximo ajuste de dificuldade', 'Next difficulty adjustment'), da ? `<span class="${tone(da.difficultyChange)}">${esc(fmtPct(da.difficultyChange, 2))}</span>` : '—', da ? esc(L(`${fmtNum(da.remainingBlocks, 0, 0)} blocos · ~${fmtDate(da.estimatedRetargetDate, { day: '2-digit', month: 'short' })}`, `${fmtNum(da.remainingBlocks, 0, 0)} blocks · ~${fmtDate(da.estimatedRetargetDate, { day: '2-digit', month: 'short' })}`)) : ''],
    [L('Tempo médio por bloco', 'Average block time'), da ? esc(`${fmtNum(da.timeAvg / 60000, 1, 1)} min`) : '—', L('meta: 10 min', 'target: 10 min')],
    [L('Transações esperando (mempool)', 'Pending transactions (mempool)'), M.mp ? esc(fmtNum(M.mp.count, 0, 0)) : '—', M.mp ? esc(`${fmtNum(M.mp.vsize / 1e6, 1, 1)} vMB · ~${fmtNum(M.mp.vsize / 1e6, 0, 0)} ${L('blocos', 'blocks')}`) : ''],
  ].map(([k, v, s]) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s faint">${s || '&nbsp;'}</div></div>`).join('')}</div>`;
  setHTML('#oc-net', head + strip + (da ? `<div class="mt"><div class="row between tiny faint"><span>${esc(L('Progresso do período de dificuldade (2.016 blocos)', 'Difficulty epoch progress (2,016 blocks)'))}</span><span>${esc(fmtPct(da.progressPercent, 1, false))}</span></div><div class="bar mt" style="margin-top:6px"><i style="width:${clamp(da.progressPercent, 0, 100)}%"></i></div></div>` : ''));
}
// ---------- blocos: fila (mempool) e minerados ----------
// cores por faixa de taxa (texto branco legível em todas: contraste ≥ 4,5:1)
function feeTone(f) { return !isNum(f) ? '#3a4560' : f < 2 ? '#1d6b4f' : f < 5 ? '#2b6e3c' : f < 10 ? '#6e6a1d' : f < 30 ? '#8f5419' : '#9b2c33'; }
function drawOcBlocks() {
  const c = CACHE.get('mp-blocks'); const B = c && c.v;
  const head = panelHead('square-stack', L('Blocos: fila e minerados', 'Blocks: queue and mined'), { sub: esc(L('À esquerda, os próximos blocos montados com as transações que esperam na fila (taxa mediana em sat/vB). À direita, os últimos blocos minerados e quem minerou.', 'Left: the next blocks assembled from waiting transactions (median fee in sat/vB). Right: the latest mined blocks and who mined them.')), right: stamp('mp-blocks') });
  if (!B) { setHTML('#oc-blocks', head + `<div class="oc-chain">${'<div class="skel oc-cube"></div>'.repeat(7)}</div>`); return; }
  const btc = PX.BTCUSDT && PX.BTCUSDT.p;
  const fd = (v) => fmtNum(v, 0, v < 10 ? 1 : 0);
  const range = (r) => (r && r.length > 1 ? `${fd(r[0])}–${fd(r[r.length - 1])} sat/vB` : '');
  const next = B.next.slice().reverse().map((x, i, a) => `<div class="oc-cube next" style="--fc:${feeTone(x.fee)}" title="${esc(L('Bloco projetado com as transações da fila', 'Projected block from queued transactions'))}">
    <span class="h">${esc(L(`em ~${(a.length - i) * 10} min`, `in ~${(a.length - i) * 10} min`))}</span><b>~${esc(fmtNum(x.fee, 0, x.fee < 10 ? 1 : 0))} sat/vB</b><span>${esc(range(x.range))}</span><span>${esc(fmtNum(x.n, 0, 0))} ${esc(L('transações', 'txs'))}</span>${isNum(x.fees) ? `<span>${esc(fmtNum(x.fees / 1e8, 3, 3))} BTC ${esc(L('em taxas', 'in fees'))}</span>` : ''}</div>`).join('');
  const mined = B.blocks.slice(0, 6).map((x) => `<a class="oc-cube" style="--fc:${feeTone(x.fee)}" href="${esc(safeUrl('https://mempool.space/pt/block/' + x.h))}" target="_blank" rel="noopener noreferrer">
    <span class="h">${esc(fmtNum(x.h, 0, 0))}</span><b>~${esc(fmtNum(x.fee, 0, x.fee < 10 ? 1 : 0))} sat/vB</b><span>${esc(fmtNum(x.n, 0, 0))} ${esc(L('transações', 'txs'))} · ${esc(fmtNum(x.size / 1e6, 2, 2))} MB</span><span class="p">${esc(x.pool || '—')}</span><span class="t">${esc(ago(x.t))}</span></a>`).join('');
  const rw = B.rw;
  const feeShare = rw && rw.reward > 0 ? rw.fee / rw.reward * 100 : null;
  setHTML('#oc-blocks', head + `<div class="oc-chain"><div class="oc-q">${next}</div><div class="oc-sep" aria-hidden="true"></div><div class="oc-m">${mined}</div></div>
    ${rw ? `<div class="row wrap mt" style="gap:8px 22px"><span class="small">${esc(L('Últimos 144 blocos (~24 h):', 'Last 144 blocks (~24 h):'))} <b>${esc(fmtNum(rw.tx, 0, 0))}</b> ${esc(L('transações', 'transactions'))}</span><span class="small">${esc(L('mineradores receberam', 'miners earned'))} <b>${esc(fmtNum(rw.reward / 1e8, 2, 2))} BTC</b>${btc ? ` (${esc(fmtCompact(rw.reward / 1e8 * btc))})` : ''}</span><span class="small">${esc(L('taxas foram', 'fees were'))} <b>${esc(fmtPct(feeShare, 1, false))}</b> ${esc(L('disso', 'of it'))}</span></div>` : ''}`);
}
// ---------- halving e oferta ----------
function drawOcHalving() {
  const m = CACHE.get('mempool'); const M = m && m.v;
  const head = panelHead('clock', L('Halving e oferta', 'Halving & supply'), { sub: esc(L('A recompensa por bloco cai pela metade a cada 210.000 blocos.', 'The block reward halves every 210,000 blocks.')), right: stamp('mempool') });
  if (!M) { setHTML('#oc-halv', head + skel(4, 18)); return; }
  const h = M.height, next = (Math.floor(h / HALVING_EVERY) + 1) * HALVING_EVERY, left = next - h;
  const avgMs = M.da && isNum(M.da.timeAvg) ? M.da.timeAvg : 600000;
  const eta = Date.now() + left * avgMs;
  const sup = supplyAt(h), pct = sup / 21e6 * 100;
  const infl = rewardAt(h) * 144 * 365 / sup * 100;
  const epochPct = (1 - left / HALVING_EVERY) * 100;
  setHTML('#oc-halv', head + `<div class="grid g-2" style="gap:14px">
    ${kpiBox(L('Blocos até o próximo halving', 'Blocks to next halving'), esc(fmtNum(left, 0, 0)), esc(L(`bloco ${fmtNum(next, 0, 0)} · ~${fmtDate(eta, { month: 'short', year: 'numeric' })}`, `block ${fmtNum(next, 0, 0)} · ~${fmtDate(eta, { month: 'short', year: 'numeric' })}`)))}
    ${kpiBox(L('Recompensa por bloco', 'Block reward'), esc(`${fmtNum(rewardAt(h), 0, 4)} BTC`), esc(L(`depois: ${fmtNum(rewardAt(next), 0, 5)} BTC`, `then: ${fmtNum(rewardAt(next), 0, 5)} BTC`)))}
    ${kpiBox(L('Bitcoins já emitidos', 'Bitcoins issued'), esc(fmtNum(sup, 0, 0)), `${esc(fmtPct(pct, 2, false))} ${esc(L('dos 21 milhões', 'of 21 million'))}`)}
    ${kpiBox(L('Inflação anual agora', 'Annual inflation now'), esc(fmtPct(infl, 2, false)), esc(L(`~${fmtNum(rewardAt(h) * 144 * 365, 0, 0)} BTC novos por ano`, `~${fmtNum(rewardAt(h) * 144 * 365, 0, 0)} new BTC per year`)))}
  </div>
  <div class="mt"><div class="row between tiny faint"><span>${esc(L('Oferta emitida', 'Supply issued'))}</span><span>${esc(L(`faltam ${fmtNum(21e6 - sup, 0, 0)} BTC (até ~2140)`, `${fmtNum(21e6 - sup, 0, 0)} BTC left (until ~2140)`))}</span></div><div class="bar" style="margin-top:6px"><i style="width:${pct}%;background:var(--signal)"></i></div></div>
  <div class="mt"><div class="row between tiny faint"><span>${esc(L('Ciclo atual de halving', 'Current halving epoch'))}</span><span>${esc(fmtPct(epochPct, 1, false))}</span></div><div class="bar" style="margin-top:6px"><i style="width:${epochPct}%"></i></div></div>
  ${note(L(`Oferta e inflação calculadas pela regra do protocolo a partir da altura do bloco. Data do halving estimada pelo tempo médio recente de ${fmtNum(avgMs / 60000, 1, 1)} min por bloco.`, `Supply and inflation computed from block height using the protocol rule. Halving date estimated from the recent ${fmtNum(avgMs / 60000, 1, 1)}-min average block time.`))}`);
}
function drawOcFees() {
  const m = CACHE.get('mempool'); const F = m && m.v && m.v.fee;
  const head = panelHead('zap', L('Taxas para enviar BTC agora', 'Fees to send BTC now'), { sub: esc(L('Em satoshis por vbyte (sat/vB). Uma transação simples tem ~140 vB.', 'In satoshis per vbyte (sat/vB). A simple transaction is ~140 vB.')), right: stamp('mempool') });
  if (!F) { setHTML('#oc-fee', head + skel(4, 18)); return; }
  const btc = PX.BTCUSDT && PX.BTCUSDT.p, r = brlRate();
  const cost = (v) => (btc ? `≈ ${usd(v * 140 / 1e8 * btc, [2, 2])}${r ? ` · ${brl(v * 140 / 1e8 * btc * r.v, [2, 2])}` : ''}` : '');
  const mx = Math.max(F.fastestFee || 1, 1);
  setHTML('#oc-fee', head + `<div class="list">${[[L('Prioritária (próximo bloco)', 'Priority (next block)'), F.fastestFee, 'var(--down)'], [L('Em ~30 minutos', 'Within ~30 min'), F.halfHourFee, 'var(--fg-2)'], [L('Em ~1 hora', 'Within ~1 hour'), F.hourFee, 'var(--signal)'], [L('Econômica', 'Economy'), F.economyFee, 'var(--up)']].map(([k, v, c]) => `<div class="li" style="flex-wrap:wrap;row-gap:6px"><span class="grow t">${esc(k)}</span><span class="b">${esc(fmtNum(v, 0, 1))} sat/vB</span><span class="small faint" style="min-width:150px;text-align:right">${esc(cost(v))}</span><div class="bar" style="flex-basis:100%;height:6px"><i style="width:${clamp(v / mx * 100, 3, 100)}%;background:${c}"></i></div></div>`).join('')}</div>`);
}
// ---------- termômetro do ciclo (dados do robô) ----------
const OC_THERMO = () => [
  { id: 'mvrv', n: 'MVRV Ratio', s: L('preço ÷ custo médio da rede', 'price ÷ network cost basis'), lo: 0.5, hi: 4, z: [[1, 'up'], [2.5, ''], [3.5, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'mvrvZ', n: 'MVRV Z-Score', s: L('desvio do valor realizado', 'deviation from realized value'), lo: -1, hi: 8, z: [[0, 'up'], [3, ''], [6, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'nupl', n: 'NUPL', s: L('lucro não realizado da rede', 'network unrealized profit'), lo: -0.5, hi: 1, z: [[0, 'up'], [0.5, ''], [0.75, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'mayer', n: 'Mayer Multiple', s: L('preço ÷ média de 200 dias', 'price ÷ 200-day average'), lo: 0.4, hi: 3, z: [[0.8, 'up'], [1.8, ''], [2.4, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'puell', n: 'Puell Multiple', s: L('receita dos mineradores vs. média de 1 ano', 'miner revenue vs 1-year average'), lo: 0.2, hi: 5, z: [[0.5, 'up'], [2.4, ''], [4, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'sthMvrv', n: 'STH MVRV', s: L('lucro de quem comprou nos últimos ~155 dias', 'profit of recent (~155d) buyers'), lo: 0.6, hi: 1.8, z: [[1, 'up'], [1.3, ''], [1.5, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'aviv', n: 'AVIV Ratio', s: L('MVRV sem moedas perdidas (Cointime)', 'MVRV without lost coins (Cointime)'), lo: 0.4, hi: 3, z: [[0.55, 'up'], [1.8, ''], [2.5, 'warn'], [99, 'down']], f: 'x2' },
  { id: 'piR', n: 'Pi Cycle Top Ratio', s: L('1,0 = cruzamento das médias (topo)', '1.0 = averages cross (top)'), lo: 0.3, hi: 1.1, z: [[0.9, ''], [1, 'warn'], [99, 'down']], f: 'x3' },
];
function ocLabEmpty(head) {
  const h = HEALTH.lab;
  return head + (h && h.ok === false && !LAB.raw ? emptyBox('wifi-off', L('Histórico on-chain indisponível agora', 'On-chain history unavailable'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : skel(5, 18));
}
function drawOcThermo() {
  const box = $('#oc-thermo'); if (!box) return;
  const head = panelHead('gauge', L('Termômetro do ciclo', 'Cycle thermometer'), { sub: esc(L('Onde cada indicador clássico está hoje entre a zona de fundo (verde) e a de topo (vermelho).', 'Where each classic indicator sits today between the bottom zone (green) and the top zone (red).')), right: stamp('lab') });
  const D = labData(); if (!D) { setHTML(box, ocLabEmpty(head)); return; }
  const im = labIndMap();
  const rows = OC_THERMO().map((t) => {
    const x = im[t.id]; const cur = x ? labCur(x, D) : null; const v = cur && cur.v;
    const span = t.hi - t.lo, pos = (val) => clamp((val - t.lo) / span * 100, 0, 100);
    let prev = t.lo, grad = [];
    for (const [lim, tn] of t.z) { const a = pos(prev), b = pos(Math.min(lim, t.hi)); const col = tn === 'up' ? 'var(--up)' : tn === 'down' ? 'var(--down)' : tn === 'warn' ? 'var(--signal)' : 'var(--panel-3)'; grad.push(`${col} ${a}% ${b}%`); prev = Math.min(lim, t.hi); if (lim >= t.hi) break; }
    const rd = isNum(v) && x.rd ? x.rd(v) : { t: '', c: '' };
    const date = cur ? (x.src === 'bd' ? (D.bdLast[x.bdk] ? fmtDate(parseDate(D.bdLast[x.bdk]), { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '') : labDateOf(D, cur.i)) : '';
    return `<div class="oc-th"><div class="n"><b>${esc(x ? x.n : t.n)}</b><span>${esc(t.s)}</span></div>
      <div class="bw"><div class="oc-tbar" style="background:linear-gradient(90deg,${grad.join(',')})">${isNum(v) ? `<i style="left:${pos(v)}%"></i>` : ''}</div></div>
      <div class="v"><b>${esc(labFmt(t.f, v))}</b><span class="${rd.c || ''}">${esc(rd.t || '')}</span></div>
      <div class="d tiny faint">${esc(date)}${cur && cur.est ? ` · ${esc(L('ao vivo', 'live'))}` : ''}</div></div>`;
  }).join('');
  const pro = hasPro();
  setHTML(box, head + `<div class="oc-ths">${rows}</div>
    <div class="row wrap between mt" style="gap:10px">${note(L('Faixas de referência explicadas no Bitcoin Lab (cada indicador tem a tabela de picos e fundos por ciclo). Termômetro não é recomendação.', 'Reference ranges are explained in Bitcoin Lab (each indicator has its table of peaks and troughs per cycle). Not a recommendation.'))}<button class="btn sm ${pro ? '' : 'pri'}" data-act="go" data-to="lab">${ico('flask-conical', 16)}${esc(pro ? L('Ver gráficos e sinais no Bitcoin Lab', 'See charts and signals in Bitcoin Lab') : L('Gráficos e sinais: Bitcoin Lab (PRO)', 'Charts and signals: Bitcoin Lab (PRO)'))}</button></div>`);
}
// ---------- escada de preços: custo médio de cada grupo ----------
function drawOcLadder() {
  const box = $('#oc-ladder'); if (!box) return;
  const head = panelHead('layers', L('Custo médio de cada grupo', 'Cost basis of each group'), { sub: esc(L('O preço de hoje comparado ao custo médio dos detentores e às médias de longo prazo. Abaixo do custo, o grupo está no prejuízo.', 'Today’s price versus holders’ cost basis and long-term averages. Below the cost basis, that group is at a loss.')), right: stamp('lab') });
  const D = labData(); if (!D) { setHTML(box, ocLabEmpty(head)); return; }
  const A = D.A; const price = (lastPt(A.p) || {}).v;
  const pick = (a) => { const p = lastPt(a); return p ? p.v : null; };
  const items = [
    ['Terminal Price', L('modelo de topo de ciclo', 'cycle-top model'), pick(A.terminalPrice), '#f87171'],
    ['STH Realized Price', L('quem comprou nos últimos ~155 dias', 'bought in the last ~155 days'), pick(A.sthRealizedPrice), '#f472b6'],
    ['True Market Mean', L('investidores ativos (Cointime)', 'active investors (Cointime)'), pick(A.trueMarketMean), '#e879f9'],
    ['200D SMA', L('média de 200 dias', '200-day average'), pick(A.sma200), '#c084fc'],
    ['200W SMA', L('média de 200 semanas', '200-week average'), pick(A.sma1400), '#f4b43f'],
    ['Realized Price', L('custo médio de toda a rede', 'whole-network cost basis'), pick(A.rpF), '#62b4ff'],
    ['LTH Realized Price', L('quem segura há mais de ~155 dias', 'held for more than ~155 days'), pick(A.lthRealizedPrice), '#818cf8'],
    ['CVDD', L('modelo de piso (BGeometrics)', 'floor model (BGeometrics)'), pick(A.cvdd), '#94a3b8'],
  ].filter((x) => isNum(x[2]));
  items.push(['BTC', L('preço agora', 'price now'), price, 'var(--text)', true]);
  items.sort((a, b) => b[2] - a[2]);
  const max = Math.max(...items.map((x) => x[2])), min = Math.min(...items.map((x) => x[2]));
  const lg = (v) => Math.log(v);
  const pos = (v) => (max > min ? (lg(v) - lg(min)) / (lg(max) - lg(min)) * 100 : 50);
  const rows = items.map(([n, s, v, c, me]) => {
    const d = isNum(price) && !me ? (price / v - 1) * 100 : null;
    return `<div class="oc-lr${me ? ' me' : ''}" style="--c:${c}"><span class="dot"></span><span class="grow"><b>${esc(n)}</b><span class="s">${esc(s)}</span></span><span class="val">${esc(usd(v, [0, 0]))}</span><span class="dd ${me ? '' : tone(d)}">${me ? esc(L('agora', 'now')) : esc(L(`preço ${fmtPct(d, 0)}`, `price ${fmtPct(d, 0)}`))}</span><span class="track"><i style="left:${pos(v)}%"></i></span></div>`;
  }).join('');
  setHTML(box, head + `<div class="oc-ladder">${rows}</div>` + note(L('"Preço +X%" = quanto o preço de hoje está acima (verde) ou abaixo (vermelho) de cada nível. Fontes: Coin Metrics, BGeometrics (atraso de até 7 dias) e médias calculadas pelo NEXUS HUB; o preço é o ao vivo.', '"Price +X%" = how far today’s price is above (green) or below (red) each level. Sources: Coin Metrics, BGeometrics (up to 7 days delay) and averages computed by NEXUS HUB; price is live.')));
}
// ---------- corretoras e uso da rede ----------
function drawOcFlow() {
  const box = $('#oc-flow'); if (!box) return;
  const head = panelHead('arrow-left-right', L('Corretoras e uso da rede', 'Exchanges & network use'), { sub: esc(L('Moedas guardadas nas corretoras, o fluxo líquido e a atividade na rede (Coin Metrics).', 'Coins held on exchanges, net flows and on-chain activity (Coin Metrics).')), right: stamp('lab') });
  const D = labData(); if (!D) { setHTML(box, ocLabEmpty(head)); return; }
  const A = D.A;
  const ch30 = (a) => { const p = lastPt(a); if (!p || p.i < 30 || !isNum(a[p.i - 30]) || !a[p.i - 30]) return null; return (p.v / a[p.i - 30] - 1) * 100; };
  const spark = (a, color) => { const p = lastPt(a); if (!p) return ''; return sparkSVG(a.slice(Math.max(0, p.i - 365), p.i + 1).filter(isNum), { w: 160, h: 34, color }); };
  const sup = lastPt(A.sup), ex = lastPt(A.exch), net = lastPt(A.net7), ad = lastPt(A.addr7), tx = lastPt(A.tx7), bal = lastPt(A.bal);
  const card = (k, v, s, sp, d) => `<div class="oc-fc"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${s}</div>${sp ? `<div class="sp">${sp}</div>` : ''}<div class="d tiny faint">${esc(d || '')}</div></div>`;
  const dt = (p) => (p ? labDateOf(D, p.i) : '');
  const cards = [
    card(L('BTC nas corretoras', 'BTC on exchanges'), ex ? esc(fmtNum(ex.v, 0, 0)) : '—', ex ? `${ex && sup ? esc(fmtPct(ex.v / sup.v * 100, 1, false)) + ' ' + esc(L('da oferta', 'of supply')) + ' · ' : ''}${isNum(ch30(A.exch)) ? `<span class="${tone(-ch30(A.exch))}">${esc(fmtPct(ch30(A.exch), 1))}</span> ${esc(L('em 30 dias', 'in 30 days'))}` : ''}` : '', spark(A.exch, 'var(--fg-2)'), dt(ex)),
    card(L('Fluxo líquido (7 dias)', 'Net flow (7 days)'), net ? `<span class="${net.v > 0 ? 'down' : 'up'}">${esc(labFmt('btcs', net.v))}</span>` : '—', net ? esc(net.v > 0 ? L('mais entradas: moedas chegando às corretoras', 'net inflow: coins arriving on exchanges') : L('mais saídas: moedas indo para guarda própria', 'net outflow: coins leaving to self-custody')) : '', '', dt(net)),
    card(L('Endereços ativos por dia', 'Daily active addresses'), ad ? esc(fmtCompact(ad.v, '')) : '—', isNum(ch30(A.addr7)) ? `<span class="${tone(ch30(A.addr7))}">${esc(fmtPct(ch30(A.addr7), 1))}</span> ${esc(L('em 30 dias · média de 7 dias', 'in 30 days · 7-day average'))}` : '', spark(A.addr7, 'var(--info)'), dt(ad)),
    card(L('Transações por dia', 'Transactions per day'), tx ? esc(fmtCompact(tx.v, '')) : '—', isNum(ch30(A.tx7)) ? `<span class="${tone(ch30(A.tx7))}">${esc(fmtPct(ch30(A.tx7), 1))}</span> ${esc(L('em 30 dias · média de 7 dias', 'in 30 days · 7-day average'))}` : '', spark(A.tx7, 'var(--accent)'), dt(tx)),
  ];
  if (bal) cards.push(card(L('Endereços com saldo', 'Addresses with balance'), esc(fmtCompact(bal.v, '')), isNum(ch30(A.bal)) ? `<span class="${tone(ch30(A.bal))}">${esc(fmtPct(ch30(A.bal), 2))}</span> ${esc(L('em 30 dias', 'in 30 days'))}` : '', spark(A.bal, 'var(--up)'), dt(bal)));
  setHTML(box, head + `<div class="oc-fcs">${cards.join('')}</div>` + note(L('Saldos de corretoras = carteiras conhecidas pela Coin Metrics (nem todas as corretoras são cobertas). Gráficos: último ano.', 'Exchange balances = wallets known to Coin Metrics (not every exchange is covered). Charts: last year.')));
}
// ---------- mineração ----------
async function drawOcMining() {
  const box = $('#oc-mining'); if (!box) return;
  const c = CACHE.get('mp-mining'); const M = c && c.v;
  const head = panelHead('pickaxe', L('Mineração', 'Mining'), { sub: esc(L('Poder de mineração e dificuldade no último ano e quem minerou os blocos na última semana.', 'Hashrate and difficulty over the last year and who mined the blocks last week.')), right: stamp('mp-mining') });
  if (!M) { setHTML(box, head + (HEALTH['mp-mining'] && HEALTH['mp-mining'].ok === false ? emptyBox('wifi-off', L('Dados de mineração indisponíveis agora', 'Mining data unavailable'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : skel(5, 20))); return; }
  const tot = M.pools.reduce((s, p) => s + p.b, 0) || 1;
  const top = M.pools.slice(0, 8); const rest = M.pools.slice(8).reduce((s, p) => s + p.b, 0);
  const pc = ['#8e98ff', '#f4b43f', '#31d67f', '#62b4ff', '#ff6170', '#c084fc', '#2dd4bf', '#fb923c', '#94a3b8'];
  const pools = top.map((p, i) => [p.n, p.b, pc[i]]).concat(rest ? [[L('Outros', 'Others'), rest, pc[8]]] : []);
  const top2 = top.slice(0, 2).reduce((s, p) => s + p.b, 0) / tot * 100;
  const lastAdj = M.diff[M.diff.length - 1];
  if (!$('#oc-mchart')) setHTML(box, head + `<div class="oc-mg"><div><div class="row wrap" style="gap:6px 22px" id="oc-mk"></div><div id="oc-mchart" style="height:260px;margin-top:10px"></div><div class="row wrap tiny faint" style="gap:4px 16px;margin-top:6px"><span><i class="oc-lg" style="background:var(--info)"></i>${esc(L('hashrate diário (EH/s)', 'daily hashrate (EH/s)'))}</span><span><i class="oc-lg" style="background:var(--signal)"></i>${esc(L('média de 30 dias', '30-day average'))}</span><span><i class="oc-lg" style="background:var(--text-3)"></i>${esc(L('dificuldade (T, escala da esquerda)', 'difficulty (T, left scale)'))}</span></div></div><div id="oc-pools"></div></div>`);
  setHTML('#oc-mk', `${kpiBox(L('Hashrate (média de 3 dias)', 'Hashrate (3-day average)'), esc(hashFmt(CACHE.get('mempool') && CACHE.get('mempool').v.hr && CACHE.get('mempool').v.hr.cur)))}${kpiBox(L('Dificuldade', 'Difficulty'), lastAdj ? esc(fmtNum(lastAdj.v / 1e12, 1, 1) + ' T') : '—', lastAdj ? `${esc(L('último ajuste', 'last adjustment'))} <b class="${tone(lastAdj.adj - 1)}">${esc(fmtPct((lastAdj.adj - 1) * 100, 2))}</b>` : '')}`);
  setHTML('#oc-pools', `<div class="small b" style="margin-bottom:8px">${esc(L(`Pools na última semana (${fmtNum(M.blocks, 0, 0)} blocos)`, `Pools last week (${fmtNum(M.blocks, 0, 0)} blocks)`))}</div>${pools.map(([n, b, col]) => `<div class="oc-pool"><span class="grow">${esc(n)}</span><b>${esc(fmtPct(b / tot * 100, 1, false))}</b><div class="bar"><i style="width:${b / tot * 100}%;background:${col}"></i></div></div>`).join('')}<p class="tiny faint mt">${esc(L(`As 2 maiores pools mineraram ${fmtPct(top2, 0, false)} dos blocos.`, `The top 2 pools mined ${fmtPct(top2, 0, false)} of blocks.`))}</p>`);
  const el = $('#oc-mchart'); if (!el) return;
  const key = M.hash.length + ':' + (M.hash[M.hash.length - 1] || {}).t + ':' + S.theme;
  if (el.dataset.k === key && el.querySelector('canvas')) return;
  el.dataset.k = key;
  let r; try { r = await makeChart(el, { onTheme: () => { el.dataset.k = ''; drawOcMining(); }, priceFmt: (v) => fmtNum(v, 0, 0) }); } catch { el.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable')); return; }
  const { ch, c: cc } = r;
  ch.applyOptions({ leftPriceScale: { visible: true, borderColor: cssVar('--line') }, rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.08 } }, timeScale: { rightOffset: 2 } });
  const hs = ch.addAreaSeries({ lineColor: cc.info, topColor: labRGBA('#62b4ff', 0.22), bottomColor: labRGBA('#62b4ff', 0), lineWidth: 2, priceLineVisible: false, title: 'EH/s' });
  hs.setData(M.hash.map((x) => ({ time: ctime(x.t, false), value: x.v / 1e18 })));
  const ma = rollMean(M.hash.map((x) => x.v / 1e18), 30);
  const ms = ch.addLineSeries({ color: cc.signal, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  ms.setData(M.hash.map((x, i) => (isNum(ma[i]) ? { time: ctime(x.t, false), value: ma[i] } : null)).filter(Boolean));
  const ds = ch.addLineSeries({ color: cc.text3, lineWidth: 2, lineType: 1, priceScaleId: 'left', priceLineVisible: false, lastValueVisible: true, title: L('dificuldade (T)', 'difficulty (T)') });
  const first = M.hash[0] && M.hash[0].t;
  const dd = M.diff.filter((x) => x.t >= first - 30 * 86400e3).map((x) => ({ time: ctime(x.t, false), value: x.v / 1e12 }));
  const seen = new Set(); ds.setData(dd.filter((x) => (seen.has(x.time) ? false : seen.add(x.time))).sort((a, b) => a.time - b.time));
  ch.timeScale().fitContent();
}
function drawOcLinks() {
  setHTML('#oc-links', panelHead('link', L('Para ir mais fundo', 'Go deeper')) + `<div class="row wrap" style="gap:8px 18px">${[
    ['https://mempool.space/pt/', 'mempool.space'], ['https://charts.checkonchain.com/', 'Checkonchain'], ['https://www.bitcoinmagazinepro.com/charts/', 'Bitcoin Magazine Pro'],
    ['https://studio.glassnode.com/', 'Glassnode Studio'], ['https://charts.coinmetrics.io/', 'Coin Metrics Charts'], ['https://charts.bgeometrics.com/', 'BGeometrics'],
  ].map(([u, t]) => extLink(u, t)).join('')}</div>`);
}
function onchainDraw() { drawOcNet(); drawOcBlocks(); drawOcHalving(); drawOcFees(); drawOcThermo(); drawOcLadder(); drawOcFlow(); drawOcMining(); drawOcLinks(); }
let _ocT = 0;
onPrice((set) => {
  if (S.page !== 'onchain') return;
  if (set.has('MEMPOOL')) { drawOcNet(); drawOcHalving(); drawOcFees(); }
  if (set.has('MPBLK')) drawOcBlocks();
  if (set.has('MPMIN')) drawOcMining();
  if (set.has('LAB')) { LAB.D = null; drawOcThermo(); drawOcLadder(); drawOcFlow(); }
  if (set.has('BTCUSDT') && Date.now() - _ocT > 15000) { _ocT = Date.now(); LAB.D = null; drawOcFees(); drawOcThermo(); drawOcLadder(); }
});
page({
  id: 'onchain', group: 'analise', icon: 'link', pt: 'On-chain BTC', en: 'On-chain BTC',
  sub: 'A rede Bitcoin ao vivo, a fila de transações, a mineração e os indicadores de ciclo mais usados — com fonte e data em cada número.',
  subEn: 'The Bitcoin network live, the transaction queue, mining and the most used cycle indicators — with source and date on every number.',
  init(el) { el.innerHTML = onchainHtml(); onchainDraw(); },
  show() { onchainDraw(); },
});
