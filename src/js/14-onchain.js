// =====================================================================
// ON-CHAIN BTC — a rede ao vivo (mempool.space), halving e oferta pela
// altura do bloco, MVRV e preço realizado (Coin Metrics), Mayer e médias
// (Binance), CVDD (bitcoin-data.com). Tudo com data da leitura.
// BITCOIN LAB (PRO) — gráfico de ciclo com indicadores reais e leituras.
// =====================================================================
const HALVING_EVERY = 210000;
// oferta emitida até a altura h (inclui o bloco gênese), em BTC
function supplyAt(h) {
  let left = h + 1, era = 0, s = 0;
  while (left > 0 && era < 64) { const n = Math.min(left, HALVING_EVERY); s += n * 50 / 2 ** era; left -= n; era++; }
  return s;
}
const rewardAt = (h) => 50 / 2 ** Math.floor(h / HALVING_EVERY);
function registerOnchainSources() {
  source({
    id: 'mempool', label: L('Rede Bitcoin', 'Bitcoin network'), provider: 'mempool.space', every: 60e3,
    need: () => ['onchain', 'whales', 'lab'].includes(S.page),
    run: async () => {
      const base = 'https://mempool.space/api';
      const [h, da, hr, fee, mp] = await Promise.allSettled([
        getText(base + '/blocks/tip/height', { timeout: 10000 }), getJSON(base + '/v1/difficulty-adjustment'),
        getJSON(base + '/v1/mining/hashrate/3d'), getJSON(base + '/v1/fees/recommended'), getJSON(base + '/mempool'),
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
    id: 'cm', label: L('Métricas on-chain', 'On-chain metrics'), provider: 'Coin Metrics', every: 6 * 3600e3, kind: 'daily',
    need: () => ['onchain', 'lab'].includes(S.page),
    run: async () => {
      const j = await getJSON('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD,CapMVRVCur,SplyCur,AdrActCnt,TxCnt,HashRate&frequency=1d&page_size=8&paging_from=end', { timeout: 15000 });
      const rows = (j.data || []).map((r) => ({ t: Date.parse(r.time), price: num(r.PriceUSD), mvrv: num(r.CapMVRVCur), supply: num(r.SplyCur), addr: num(r.AdrActCnt), tx: num(r.TxCnt), hash: num(r.HashRate) })).sort((a, b) => a.t - b.t);
      return rows;
    },
    validate: (a) => a.length && isNum(a[a.length - 1].mvrv),
    onData: (a) => { HEALTH.cm.dataTs = a[a.length - 1].t; _markDirty('CM'); },
  });
  source({
    id: 'btc-ma', label: L('Médias do BTC', 'BTC averages'), provider: 'Binance', every: 30 * 60e3,
    need: () => ['onchain'].includes(S.page),
    run: async () => {
      const [d, w] = await Promise.all([klines('BTCUSDT', '1d', 1000), klines('BTCUSDT', '1w', 400)]);
      const dc = d.map((k) => k.c), wc = w.map((k) => k.c);
      return { ma200: lastOf(sma(dc, 200)), ma50: lastOf(sma(dc, 50)), ma200w: lastOf(sma(wc, 200)), ma111: lastOf(sma(dc, 111)), ma350: lastOf(sma(dc, 350)) };
    },
    validate: (d) => isNum(d.ma200) && isNum(d.ma200w),
    onData: () => _markDirty('BTCMA'),
  });
  source({
    id: 'bd', label: 'CVDD / STH-MVRV', provider: 'bitcoin-data.com', every: 12 * 3600e3, kind: 'daily',
    need: () => ['onchain'].includes(S.page),
    run: async () => {
      const c = await getJSON('https://bitcoin-data.com/v1/cvdd/last', { timeout: 12000 });
      let sth = null; try { sth = await getJSON('https://bitcoin-data.com/v1/sth-mvrv/last', { timeout: 12000 }); } catch { /* opcional */ }
      return { cvdd: num(c.cvdd), d: c.d, sth: sth ? num(sth.sthMvrv) : null, sthD: sth && sth.d, sthDelayed: !!(sth && sth.delayed) };
    },
    validate: (d) => isNum(d.cvdd) && d.cvdd > 100,
    onData: (d) => { HEALTH.bd.dataTs = parseDate(d.d).getTime(); _markDirty('BD'); },
  });
}
function onchainHtml() {
  return `${pageHead(PAGES.onchain, `<button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>`)}
  <section class="panel" id="oc-net"></section>
  <div class="grid g-2 mt"><section class="panel" id="oc-halv"></section><section class="panel" id="oc-fee"></section></div>
  <section class="panel mt" id="oc-val"></section>
  <section class="panel mt" id="oc-links"></section>`;
}
function hashFmt(h) { return isNum(h) ? `${fmtNum(h / 1e18, 0, 0)} EH/s` : '—'; }
function drawOcNet() {
  const m = CACHE.get('mempool'); const M = m && m.v;
  const da = M && M.da;
  const head = panelHead('blocks', L('Rede Bitcoin agora', 'Bitcoin network now'), { sub: esc(L('Blocos, poder de mineração e próximo ajuste de dificuldade.', 'Blocks, mining power and next difficulty adjustment.')), right: stamp('mempool') });
  if (!M) { setHTML('#oc-net', head + skel(3, 20)); return; }
  const strip = `<div class="strip" style="margin:0 -18px">${[
    [L('Último bloco', 'Latest block'), esc(fmtNum(M.height, 0, 0)), ''],
    [L('Poder de mineração', 'Hashrate'), esc(hashFmt(M.hr && M.hr.cur)), L('média de 3 dias', '3-day average')],
    [L('Próximo ajuste de dificuldade', 'Next difficulty adjustment'), da ? `<span class="${tone(da.difficultyChange)}">${esc(fmtPct(da.difficultyChange, 2))}</span>` : '—', da ? esc(L(`${fmtNum(da.remainingBlocks, 0, 0)} blocos · ~${fmtDate(da.estimatedRetargetDate, { day: '2-digit', month: 'short' })}`, `${fmtNum(da.remainingBlocks, 0, 0)} blocks · ~${fmtDate(da.estimatedRetargetDate, { day: '2-digit', month: 'short' })}`)) : ''],
    [L('Tempo médio por bloco', 'Average block time'), da ? esc(`${fmtNum(da.timeAvg / 60000, 1, 1)} min`) : '—', L('meta: 10 min', 'target: 10 min')],
    [L('Transações esperando', 'Pending transactions'), M.mp ? esc(fmtNum(M.mp.count, 0, 0)) : '—', M.mp ? esc(`${fmtNum(M.mp.vsize / 1e6, 1, 1)} vMB`) : ''],
  ].map(([k, v, s]) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s faint">${s || '&nbsp;'}</div></div>`).join('')}</div>`;
  setHTML('#oc-net', head + strip + (da ? `<div class="mt"><div class="row between tiny faint"><span>${esc(L('Progresso do período de dificuldade', 'Difficulty epoch progress'))}</span><span>${esc(fmtPct(da.progressPercent, 1, false))}</span></div><div class="bar mt" style="margin-top:6px"><i style="width:${clamp(da.progressPercent, 0, 100)}%"></i></div></div>` : ''));
}
function drawOcHalving() {
  const m = CACHE.get('mempool'); const M = m && m.v;
  const head = panelHead('clock', L('Halving e oferta', 'Halving & supply'), { sub: esc(L('A recompensa por bloco cai pela metade a cada 210.000 blocos.', 'The block reward halves every 210,000 blocks.')), right: stamp('mempool') });
  if (!M) { setHTML('#oc-halv', head + skel(4, 18)); return; }
  const h = M.height, next = (Math.floor(h / HALVING_EVERY) + 1) * HALVING_EVERY, left = next - h;
  const avgMs = M.da && isNum(M.da.timeAvg) ? M.da.timeAvg : 600000;
  const eta = Date.now() + left * avgMs;
  const sup = supplyAt(h), pct = sup / 21e6 * 100;
  const cm = CACHE.get('cm'); const cmLast = cm && cm.v[cm.v.length - 1];
  setHTML('#oc-halv', head + `<div class="grid g-2" style="gap:14px">
    ${kpiBox(L('Blocos até o próximo halving', 'Blocks to next halving'), esc(fmtNum(left, 0, 0)), esc(L(`bloco ${fmtNum(next, 0, 0)} · ~${fmtDate(eta, { month: 'short', year: 'numeric' })}`, `block ${fmtNum(next, 0, 0)} · ~${fmtDate(eta, { month: 'short', year: 'numeric' })}`)))}
    ${kpiBox(L('Recompensa por bloco', 'Block reward'), esc(`${fmtNum(rewardAt(h), 0, 4)} BTC`), esc(L(`depois: ${fmtNum(rewardAt(next), 0, 5)} BTC`, `then: ${fmtNum(rewardAt(next), 0, 5)} BTC`)))}
    ${kpiBox(L('Bitcoins já emitidos', 'Bitcoins issued'), esc(fmtNum(sup, 0, 0)), `${esc(fmtPct(pct, 2, false))} ${esc(L('dos 21 milhões', 'of 21 million'))}`)}
    ${kpiBox(L('Faltam emitir', 'Left to issue'), esc(fmtNum(21e6 - sup, 0, 0)), esc(L('até ~2140', 'until ~2140')))}
  </div><div class="bar mt"><i style="width:${pct}%;background:var(--signal)"></i></div>
  ${note(L(`Oferta calculada pela altura do bloco (regra do protocolo). Data do halving estimada pelo tempo médio recente de ${fmtNum(avgMs / 60000, 1, 1)} min por bloco.${cmLast && isNum(cmLast.supply) ? ` Coin Metrics registrou ${fmtNum(cmLast.supply, 0, 0)} BTC no dia ${fmtDate(cmLast.t, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}.` : ''}`, `Supply computed from block height (protocol rule). Halving date estimated from the recent ${fmtNum(avgMs / 60000, 1, 1)}-min average block time.`))}`);
}
function drawOcFees() {
  const m = CACHE.get('mempool'); const F = m && m.v && m.v.fee;
  const head = panelHead('zap', L('Taxas para enviar BTC agora', 'Fees to send BTC now'), { sub: esc(L('Em satoshis por vbyte (sat/vB). Uma transação simples tem ~140 vB.', 'In satoshis per vbyte (sat/vB). A simple transaction is ~140 vB.')), right: stamp('mempool') });
  if (!F) { setHTML('#oc-fee', head + skel(4, 18)); return; }
  const btc = PX.BTCUSDT && PX.BTCUSDT.p;
  const cost = (r) => (btc ? `≈ ${usd(r * 140 / 1e8 * btc, [2, 2])}` : '');
  setHTML('#oc-fee', head + `<div class="list">${[[L('Prioritária (próximo bloco)', 'Priority (next block)'), F.fastestFee], [L('Em ~30 minutos', 'Within ~30 min'), F.halfHourFee], [L('Em ~1 hora', 'Within ~1 hour'), F.hourFee], [L('Econômica', 'Economy'), F.economyFee]].map(([k, v]) => `<div class="li"><span class="grow t">${esc(k)}</span><span class="b">${esc(fmtNum(v, 0, 1))} sat/vB</span><span class="small faint" style="width:90px;text-align:right">${esc(cost(v))}</span></div>`).join('')}</div>`);
}
function drawOcVal() {
  const cm = CACHE.get('cm'), ma = CACHE.get('btc-ma'), bd = CACHE.get('bd');
  const last = cm && cm.v[cm.v.length - 1];
  const live = PX.BTCUSDT && PX.BTCUSDT.p;
  const rp = last && isNum(last.price) && isNum(last.mvrv) ? last.price / last.mvrv : null;
  const mvrvLive = rp && live ? live / rp : null;
  const M = ma && ma.v;
  const mayer = M && live ? live / M.ma200 : null;
  const pi = M && isNum(M.ma111) && isNum(M.ma350) ? M.ma111 / (2 * M.ma350) : null;
  const zone = (v, lo, hi) => (!isNum(v) ? '' : v < lo ? `<span class="badge live">${esc(L('zona historicamente barata', 'historically cheap zone'))}</span>` : v > hi ? `<span class="badge bad">${esc(L('zona historicamente cara', 'historically expensive zone'))}</span>` : `<span class="badge">${esc(L('faixa intermediária', 'middle range'))}</span>`);
  const card = (title, value, sub, desc, src) => `<div class="panel" style="background:var(--panel-2);border-color:transparent"><div class="small muted b">${esc(title)}</div><div class="kpi" style="margin-top:6px"><span class="v sm">${value}</span><span class="s">${sub || '&nbsp;'}</span></div><p class="tiny faint" style="margin-top:8px;line-height:1.5">${esc(desc)}</p><div style="margin-top:8px">${src}</div></div>`;
  const html = panelHead('scale', L('Preço justo e ciclo', 'Fair value & cycle'), { sub: esc(L('Indicadores clássicos para saber se o BTC está caro ou barato em relação à própria história.', 'Classic indicators of whether BTC is expensive or cheap versus its own history.')) }) + `<div class="grid g-auto">
    ${card(L('MVRV (valor de mercado ÷ valor realizado)', 'MVRV (market ÷ realized value)'), isNum(mvrvLive) ? esc(fmtNum(mvrvLive, 2, 2)) : '—', zone(mvrvLive, 1, 3.5), L('Compara o preço atual com o custo médio de todos os bitcoins (o preço pago na última movimentação de cada moeda). Abaixo de 1: o mercado médio está no prejuízo.', 'Compares price with the average cost of all coins. Below 1: the average holder is at a loss.'), stamp('cm'))}
    ${card(L('Preço realizado (custo médio da rede)', 'Realized price (network cost basis)'), rp ? esc(usd(rp, [0, 0])) : '—', rp && live ? `${esc(L('preço atual', 'price'))} <b class="${tone(live - rp)}">${esc(fmtPct((live / rp - 1) * 100, 1))}</b>` : '', L('Valor realizado ÷ moedas em circulação. Funcionou como piso nos fundos de ciclo.', 'Realized cap ÷ supply. Acted as a floor at cycle bottoms.'), stamp('cm'))}
    ${card(L('Múltiplo de Mayer', 'Mayer multiple'), isNum(mayer) ? esc(fmtNum(mayer, 2, 2)) : '—', zone(mayer, 0.8, 2.4), L('Preço ÷ média móvel de 200 dias. Acima de 2,4 costumou marcar euforia; abaixo de 0,8, pânico.', 'Price ÷ 200-day MA. Above 2.4 marked euphoria; below 0.8, panic.'), stamp('btc-ma'))}
    ${card(L('Média de 200 semanas', '200-week average'), M ? esc(usd(M.ma200w, [0, 0])) : '—', M && live ? `${esc(L('preço atual', 'price'))} <b class="${tone(live - M.ma200w)}">${esc(fmtPct((live / M.ma200w - 1) * 100, 1))}</b>` : '', L('A média de ~4 anos (um ciclo inteiro). Historicamente, o preço raramente ficou abaixo dela.', 'The ~4-year average (a full cycle). Price rarely stayed below it.'), stamp('btc-ma'))}
    ${card('Pi Cycle (MM111 ÷ 2×MM350)', isNum(pi) ? esc(fmtNum(pi, 3, 3)) : '—', isNum(pi) ? (pi >= 1 ? `<span class="badge bad">${esc(L('cruzou: sinal histórico de topo', 'crossed: historical top signal'))}</span>` : `<span class="badge">${esc(L(`${fmtPct((1 - pi) * 100, 1, false)} abaixo do cruzamento`, `${fmtPct((1 - pi) * 100, 1, false)} below the cross`))}</span>`) : '', L('Quando a média de 111 dias cruza o dobro da de 350 dias (razão ≥ 1), o mercado esteve perto de topos de ciclo.', 'When the 111-day MA crosses 2× the 350-day MA (ratio ≥ 1), the market was near cycle tops.'), stamp('btc-ma'))}
    ${card('CVDD', bd ? esc(usd(bd.v.cvdd, [0, 0])) : '—', bd && live ? `${esc(L('preço atual', 'price'))} ${esc(fmtNum(live / bd.v.cvdd, 1, 1))}× CVDD` : '', L('Modelo de "valor destruído por dia" usado para achar fundos de ciclo. Fórmulas variam entre provedores; este é o valor publicado pela bitcoin-data.com.', 'Coin-days-destroyed model used to spot cycle bottoms. Formulas vary across providers; this is bitcoin-data.com’s value.'), stamp('bd'))}
    ${card(L('MVRV dos detentores de curto prazo', 'Short-term holder MVRV'), bd && isNum(bd.v.sth) ? esc(fmtNum(bd.v.sth, 2, 2)) : '—', bd && bd.v.sthD ? `<span class="faint">${esc(L('dado de', 'data from'))} ${esc(fmtDate(bd.v.sthD, { day: '2-digit', month: 'short', timeZone: 'UTC' }))}${bd.v.sthDelayed ? ' · ' + esc(L('atraso de 7 dias da fonte grátis', '7-day delay on free source')) : ''}</span>` : '', L('Lucro ou prejuízo médio de quem comprou nos últimos ~155 dias. Abaixo de 1: novos compradores no prejuízo.', 'Average profit/loss of coins bought in the last ~155 days. Below 1: new buyers at a loss.'), stamp('bd'))}
    ${card(L('Endereços ativos por dia', 'Daily active addresses'), last && isNum(last.addr) ? esc(fmtNum(last.addr, 0, 0)) : '—', last && isNum(last.tx) ? `${esc(fmtNum(last.tx, 0, 0))} ${esc(L('transações', 'transactions'))}` : '', L('Quantos endereços enviaram ou receberam BTC no dia. Mede o uso da rede.', 'Addresses that sent or received BTC that day. Measures network use.'), stamp('cm'))}
  </div>` + note(L('As faixas "barata/cara" são referências históricas de cada indicador, não recomendação. MVRV ao vivo = preço atual ÷ preço realizado do último dia publicado.', '"Cheap/expensive" ranges are historical references, not advice. Live MVRV = current price ÷ latest published realized price.'));
  setHTML('#oc-val', html);
}
function drawOcLinks() {
  setHTML('#oc-links', panelHead('link', L('Para ir mais fundo', 'Go deeper')) + `<div class="row wrap" style="gap:8px 18px">${[
    ['https://mempool.space/pt/', 'mempool.space'], ['https://charts.checkonchain.com/', 'Checkonchain'], ['https://www.bitcoinmagazinepro.com/charts/', 'Bitcoin Magazine Pro'],
    ['https://studio.glassnode.com/', 'Glassnode Studio'], ['https://charts.coinmetrics.io/', 'Coin Metrics Charts'], ['https://bitcoin-data.com/', 'bitcoin-data.com'],
  ].map(([u, t]) => extLink(u, t)).join('')}</div>`);
}
function onchainDraw() { drawOcNet(); drawOcHalving(); drawOcFees(); drawOcVal(); drawOcLinks(); }
let _ocT = 0;
onPrice((set) => {
  if (S.page !== 'onchain') return;
  if (set.has('MEMPOOL')) { drawOcNet(); drawOcHalving(); drawOcFees(); }
  if (set.has('CM') || set.has('BTCMA') || set.has('BD')) { drawOcVal(); drawOcHalving(); }
  if (set.has('BTCUSDT') && Date.now() - _ocT > 5000) { _ocT = Date.now(); drawOcVal(); drawOcFees(); }
});
page({
  id: 'onchain', group: 'analise', icon: 'link', pt: 'On-chain BTC', en: 'On-chain BTC',
  sub: 'A saúde da rede Bitcoin e os indicadores de ciclo mais usados, com dados reais e datados.',
  subEn: 'Bitcoin network health and the most used cycle indicators, with real, dated data.',
  init(el) { el.innerHTML = onchainHtml(); onchainDraw(); },
  show() { onchainDraw(); },
});

// =====================================================================
// BITCOIN LAB (PRO)
// =====================================================================
const LAB = { on: { price: true, realized: true, ma200w: true, ma200: false, pi: false, cvdd: false, mayer: false }, log: true, range: '4y', seq: 0 };
const labInd = () => [
  ['realized', L('Preço realizado', 'Realized price'), '#62b4ff', L('Custo médio de todos os BTC na rede (Coin Metrics). Fundos de ciclo costumam tocar perto dele.', 'Average cost of all BTC (Coin Metrics). Cycle bottoms tend to touch it.')],
  ['ma200w', L('Média de 200 semanas', '200-week MA'), '#f4b43f', L('Média de ~4 anos. Piso histórico de longo prazo.', '~4-year average. Long-term historical floor.')],
  ['ma200', L('Média de 200 dias', '200-day MA'), '#c084fc', L('Tendência de médio prazo; base do Múltiplo de Mayer.', 'Medium-term trend; base of the Mayer multiple.')],
  ['mayer', L('Bandas de Mayer (0,8× e 2,4×)', 'Mayer bands (0.8× and 2.4×)'), '#2dd4bf', L('0,8× a média de 200 dias marcou pânico; 2,4× marcou euforia.', '0.8× the 200-day MA marked panic; 2.4× marked euphoria.')],
  ['pi', 'Pi Cycle (MM111 e 2×MM350)', '#ff6170', L('O cruzamento da MM111 acima de 2×MM350 coincidiu com topos de ciclo.', 'MA111 crossing above 2×MA350 coincided with cycle tops.')],
  ['cvdd', 'CVDD', '#9aa3b5', L('Modelo de fundo de ciclo (bitcoin-data.com; fórmula do provedor).', 'Cycle-bottom model (bitcoin-data.com; provider formula).')],
];
function registerLabSources() {
  source({
    id: 'lab-cm', label: L('Histórico on-chain', 'On-chain history'), provider: 'Coin Metrics', every: 12 * 3600e3, kind: 'daily', persist: false,
    need: () => S.page === 'lab' && hasPro(),
    run: async () => {
      const j = await getJSON('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD,CapMVRVCur&frequency=1d&page_size=10000&start_time=2012-01-01', { timeout: 25000 });
      return (j.data || []).map((r) => ({ t: Date.parse(r.time), p: num(r.PriceUSD), m: num(r.CapMVRVCur) })).filter((r) => isNum(r.p) && r.p > 0);
    },
    validate: (a) => a.length > 1000,
    onData: (a) => { HEALTH['lab-cm'].dataTs = a[a.length - 1].t; _markDirty('LAB'); },
  });
  source({
    id: 'lab-cvdd', label: L('Histórico CVDD', 'CVDD history'), provider: 'bitcoin-data.com', every: 24 * 3600e3, kind: 'daily', persist: false,
    need: () => S.page === 'lab' && hasPro() && LAB.on.cvdd,
    run: async () => (await getJSON('https://bitcoin-data.com/v1/cvdd', { timeout: 20000 })).map((r) => ({ t: parseDate(r.d).getTime(), v: num(r.cvdd) })).filter((r) => isNum(r.v)),
    validate: (a) => a.length > 100,
    onData: () => _markDirty('LAB'),
  });
}
function labSeries() {
  const c = CACHE.get('lab-cm'); if (!c) return null;
  if (LAB._D && LAB._Dts === c.ts && Date.now() - LAB._Dat < 30000) return LAB._D;
  LAB._D = _labSeries(c); LAB._Dts = c.ts; LAB._Dat = Date.now();
  return LAB._D;
}
function _labSeries(c) {
  const rows = c.v.slice();
  const live = PX.BTCUSDT && PX.BTCUSDT.p;
  const lastT = rows[rows.length - 1].t, today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  if (live && today > lastT) rows.push({ t: today, p: live, m: null, live: true });
  const p = rows.map((r) => r.p);
  const ma200 = sma(p, 200), ma1400 = sma(p, 1400), ma111 = sma(p, 111), ma350 = sma(p, 350);
  // preço realizado diário = preço ÷ MVRV; no ponto ao vivo repete o último publicado
  let lastRp = null; const rp = rows.map((r) => { if (isNum(r.m) && r.m > 0) lastRp = r.p / r.m; return lastRp; });
  return { rows, p, ma200, ma1400, ma111, ma350, rp };
}
function labRangeFrom() { const y = { '1y': 1, '2y': 2, '4y': 4, '8y': 8, all: 30 }[LAB.range] || 4; return Date.now() - y * 365.25 * 86400e3; }
function percentile(arr, v) { const a = arr.filter(isNum); if (!a.length || !isNum(v)) return null; return a.filter((x) => x <= v).length / a.length * 100; }
function labReadings(D) {
  const n = D.rows.length - 1, price = D.p[n];
  const mvrv = isNum(D.rp[n]) ? price / D.rp[n] : null;
  const mayer = isNum(D.ma200[n]) ? price / D.ma200[n] : null;
  const pi = isNum(D.ma111[n]) && isNum(D.ma350[n]) ? D.ma111[n] / (2 * D.ma350[n]) : null;
  // posição no ciclo (modelo NEXUS): média dos percentis históricos de MVRV, Mayer e Pi (desde 2012)
  const mvrvH = D.rows.map((r, i) => (isNum(D.rp[i]) ? D.p[i] / D.rp[i] : null));
  const mayerH = D.p.map((x, i) => (isNum(D.ma200[i]) ? x / D.ma200[i] : null));
  const piH = D.ma111.map((x, i) => (isNum(x) && isNum(D.ma350[i]) ? x / (2 * D.ma350[i]) : null));
  const parts = [percentile(mvrvH, mvrv), percentile(mayerH, mayer), percentile(piH, pi)].filter(isNum);
  const score = parts.length ? avg(parts) : null;
  return { price, mvrv, mayer, pi, score, rp: D.rp[n], ma200w: D.ma1400[n], ma200: D.ma200[n] };
}
function labHtml() {
  return `${pageHead(PAGES.lab, '')}<div id="lab-body"></div>`;
}
function labDraw() {
  const box = $('#lab-body'); if (!box) return;
  if (!hasPro()) { box.innerHTML = proGate(PAGES.lab); return; }
  if (!$('#lab-chart')) {
    box.innerHTML = `<section class="panel" id="lab-score"></section>
    <section class="panel mt"><div class="row wrap between" style="gap:10px">${seg('labr', [['1y', '1A'], ['2y', '2A'], ['4y', '4A'], ['8y', '8A'], ['all', L('Tudo', 'All')]], LAB.range)}<div class="row wrap" style="gap:8px"><label class="check small" style="align-items:center"><input type="checkbox" data-chg="labLog" ${LAB.log ? 'checked' : ''}>${esc(L('Escala logarítmica', 'Log scale'))}</label>${stamp('lab-cm')}</div></div>
      <div id="lab-legend" class="small faint mt" style="min-height:20px"></div>
      <div id="lab-chart" style="height:clamp(360px,60vh,640px);margin-top:6px"></div>
      ${note(L('Histórico diário: Coin Metrics (preço e MVRV, desde 2012) e bitcoin-data.com (CVDD). O último ponto usa o preço ao vivo da Binance.', 'Daily history: Coin Metrics (price and MVRV, since 2012) and bitcoin-data.com (CVDD). The last point uses the live Binance price.'))}
    </section>
    <section class="panel mt"><h2 class="panel-t">${ico('layers', 18)}${esc(L('Indicadores no gráfico', 'Chart indicators'))}</h2><div class="grid g-auto mt" id="lab-ind"></div></section>`;
  }
  labDrawScore(); labDrawInd(); labChart();
}
function labDrawScore() {
  const D = labSeries(); const box = $('#lab-score'); if (!box) return;
  const head = panelHead('gauge', L('Posição no ciclo', 'Cycle position'), { sub: esc(L('Onde o BTC está hoje em relação a toda a sua história (0 = mais barato já visto, 100 = mais caro).', 'Where BTC sits versus its whole history (0 = cheapest ever, 100 = most expensive).')), right: modelBadge(L('Média dos percentis históricos (desde 2012) de MVRV, Múltiplo de Mayer e razão Pi Cycle. Cálculo do NEXUS HUB; não é previsão.', 'Average of historical percentiles (since 2012) of MVRV, Mayer multiple and Pi Cycle ratio. NEXUS HUB calculation; not a forecast.')) });
  if (!D) { box.innerHTML = head + (HEALTH['lab-cm'] && HEALTH['lab-cm'].ok === false ? emptyBox('wifi-off', L('Histórico indisponível agora', 'History unavailable'), esc(L('A Coin Metrics não respondeu. Tentando de novo.', 'Coin Metrics did not respond. Retrying.'))) : skel(3, 22)); return; }
  const R = labReadings(D);
  const s = R.score, col = isNum(s) ? (s < 25 ? 'var(--up)' : s < 60 ? 'var(--signal)' : s < 85 ? '#ff9a52' : 'var(--down)') : 'var(--text-3)';
  const word = !isNum(s) ? '—' : s < 25 ? L('Zona de acumulação', 'Accumulation zone') : s < 60 ? L('Meio do ciclo', 'Mid-cycle') : s < 85 ? L('Mercado aquecido', 'Heated market') : L('Euforia histórica', 'Historical euphoria');
  box.innerHTML = head + `<div class="row wrap" style="gap:18px 28px;align-items:center">
    <div style="min-width:160px"><div style="font-size:52px;font-weight:800;line-height:1;color:${col}">${isNum(s) ? fmtNum(s, 0, 0) : '—'}</div><div class="b" style="color:${col};margin-top:4px">${esc(word)}</div></div>
    <div class="grow" style="min-width:240px"><div class="bar" style="height:12px;background:linear-gradient(90deg,var(--up),var(--signal),#ff9a52,var(--down));opacity:.9;position:relative">${isNum(s) ? `<i style="position:absolute;left:calc(${s}% - 7px);top:-3px;width:14px;height:18px;border-radius:5px;background:var(--text);border:2px solid var(--panel)"></i>` : ''}</div>
    <div class="row between tiny faint" style="margin-top:6px"><span>${esc(L('barato', 'cheap'))}</span><span>${esc(L('caro', 'expensive'))}</span></div></div>
    <div class="row wrap" style="gap:6px 22px">${kpiBox('MVRV', isNum(R.mvrv) ? fmtNum(R.mvrv, 2, 2) : '—')}${kpiBox('Mayer', isNum(R.mayer) ? fmtNum(R.mayer, 2, 2) : '—')}${kpiBox('Pi Cycle', isNum(R.pi) ? fmtNum(R.pi, 3, 3) : '—')}</div></div>`;
}
function labDrawInd() {
  const box = $('#lab-ind'); if (!box) return;
  const D = labSeries(); const R = D ? labReadings(D) : {};
  const cv = CACHE.get('lab-cvdd');
  const val = { realized: R.rp, ma200w: R.ma200w, ma200: R.ma200, mayer: R.ma200, pi: D ? D.ma111[D.ma111.length - 1] : null, cvdd: cv ? cv.v[cv.v.length - 1].v : null };
  box.innerHTML = labInd().map(([k, t, col, desc]) => `<label class="panel" style="background:var(--panel-2);border-color:${LAB.on[k] ? col : 'transparent'};cursor:pointer;display:block">
    <div class="row between"><span class="row" style="gap:8px"><i style="width:14px;height:4px;border-radius:2px;background:${col};display:inline-block"></i><b class="small">${esc(t)}</b></span><span class="sw" style="--sw:${col}"><input type="checkbox" data-chg="labInd" data-k="${k}" ${LAB.on[k] ? 'checked' : ''} aria-label="${esc(t)}"><span></span></span></div>
    <div class="b mt" style="margin-top:8px">${k === 'mayer' && isNum(val.mayer) ? `${esc(usd(val.mayer * 0.8, [0, 0]))} – ${esc(usd(val.mayer * 2.4, [0, 0]))}` : isNum(val[k]) ? esc(usd(val[k], [0, 0])) : '—'}</div>
    <p class="tiny faint" style="margin-top:6px;line-height:1.5">${esc(desc)}</p></label>`).join('');
}
ACT.labInd = (el) => { LAB.on[el.dataset.k] = el.checked; LS.set('lab', { on: LAB.on, log: LAB.log, range: LAB.range }); if (el.dataset.k === 'cvdd' && el.checked) runSource('lab-cvdd'); labDrawInd(); labChart(); };
ACT.labLog = (el) => { LAB.log = el.checked; LS.set('lab', { on: LAB.on, log: LAB.log, range: LAB.range }); labChart(); };
ACT.seg_labr = (v) => { LAB.range = v; LS.set('lab', { on: LAB.on, log: LAB.log, range: LAB.range }); labChart(); };
async function labChart() {
  const box = $('#lab-chart'); if (!box) return;
  const D = labSeries();
  if (!D) { box.innerHTML = `<div class="skel" style="height:100%"></div>`; return; }
  const seq = ++LAB.seq;
  let r;
  try { r = await makeChart(box, { onTheme: () => labChart() }); } catch (e) { box.innerHTML = emptyBox('wifi-off', L('Gráfico indisponível', 'Chart unavailable'), esc(e.message)); return; }
  if (seq !== LAB.seq) return;
  const { ch, LWC } = r;
  ch.applyOptions({ rightPriceScale: { mode: LAB.log ? LWC.PriceScaleMode.Logarithmic : LWC.PriceScaleMode.Normal } });
  const from = labRangeFrom();
  const idx = D.rows.findIndex((x) => x.t >= from); const i0 = Math.max(0, idx);
  const ks = D.rows.slice(i0);
  const sl = (a) => a.slice(i0);
  const add = (vals, color, opts = {}) => { const s = ch.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...opts }); s.setData(lineData(ks, vals, false)); return s; };
  const area = ch.addAreaSeries({ lineColor: cssVar('--text'), topColor: 'rgba(142,152,255,.18)', bottomColor: 'rgba(142,152,255,0)', lineWidth: 2, priceLineVisible: false });
  area.setData(lineData(ks, sl(D.p), false));
  const col = Object.fromEntries(labInd().map((x) => [x[0], x[2]]));
  if (LAB.on.realized) add(sl(D.rp), col.realized);
  if (LAB.on.ma200w) add(sl(D.ma1400), col.ma200w);
  if (LAB.on.ma200) add(sl(D.ma200), col.ma200);
  if (LAB.on.mayer) { add(sl(D.ma200).map((v) => (isNum(v) ? v * 0.8 : null)), col.mayer, { lineStyle: 2, lineWidth: 1 }); add(sl(D.ma200).map((v) => (isNum(v) ? v * 2.4 : null)), col.mayer, { lineStyle: 2, lineWidth: 1 }); }
  if (LAB.on.pi) { add(sl(D.ma111), col.pi, { lineWidth: 1 }); add(sl(D.ma350).map((v) => (isNum(v) ? v * 2 : null)), '#ffb3ba', { lineWidth: 1 }); }
  if (LAB.on.cvdd) { const cv = CACHE.get('lab-cvdd'); if (cv) { const s = ch.addLineSeries({ color: col.cvdd, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); s.setData(cv.v.filter((x) => x.t >= from).map((x) => ({ time: ctime(x.t, false), value: x.v }))); } }
  ch.timeScale().fitContent();
  const legend = (i) => {
    const k = ks[i]; if (!k) return;
    const gi = i0 + i; const bits = [`<b style="color:var(--text)">${esc(fmtDate(k.t, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b>`, `BTC ${esc(usd(k.p, [0, 0]))}`];
    if (LAB.on.realized && isNum(D.rp[gi])) bits.push(`<span style="color:${col.realized}">${esc(L('Realizado', 'Realized'))} ${esc(usd(D.rp[gi], [0, 0]))}</span>`);
    if (LAB.on.ma200w && isNum(D.ma1400[gi])) bits.push(`<span style="color:${col.ma200w}">200S ${esc(usd(D.ma1400[gi], [0, 0]))}</span>`);
    if (LAB.on.ma200 && isNum(D.ma200[gi])) bits.push(`<span style="color:${col.ma200}">200D ${esc(usd(D.ma200[gi], [0, 0]))}</span>`);
    if (isNum(D.rp[gi])) bits.push(`MVRV ${esc(fmtNum(k.p / D.rp[gi], 2, 2))}`);
    setHTML('#lab-legend', bits.join(' &nbsp; '));
  };
  legend(ks.length - 1);
  ch.subscribeCrosshairMove((param) => { if (!param || param.time === undefined) { legend(ks.length - 1); return; } const i = ks.findIndex((k) => ctime(k.t, false) === param.time); if (i >= 0) legend(i); });
}
onPrice((set) => {
  if (S.page !== 'lab') return;
  if (set.has('LAB')) { labDrawScore(); labDrawInd(); labChart(); }
});
page({
  id: 'lab', group: 'analise', icon: 'flask-conical', pt: 'Bitcoin Lab', en: 'Bitcoin Lab', pro: true, proWhat: 'o Bitcoin Lab', proWhatEn: 'Bitcoin Lab',
  sub: 'O ciclo do Bitcoin em um gráfico: preço realizado, médias de longo prazo, Mayer, Pi Cycle e CVDD — com a leitura de cada um.',
  subEn: 'The Bitcoin cycle in one chart: realized price, long-term averages, Mayer, Pi Cycle and CVDD — with what each one says.',
  init(el) { const p = LS.get('lab'); if (p) { Object.assign(LAB.on, p.on || {}); LAB.log = p.log !== false; LAB.range = p.range || '4y'; } el.innerHTML = labHtml(); labDraw(); },
  show() { labDraw(); },
});
