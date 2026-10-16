// =====================================================================
// TOKENOMICS E DESBLOQUEIOS (PRO) — oferta, diluição, distância do topo,
// receita do protocolo (DefiLlama), incidentes de segurança, notícias da
// moeda e pesquisa de desbloqueios com IA. Nada de data ou quantidade inventada.
// =====================================================================
const TK = { id: 'ondo-finance', seq: 0, data: null, err: '', fees: null, hacks: null };
// slug da DefiLlama quando difere do id do CoinGecko
const LLAMA_SLUG = { 'lido-dao': 'lido', 'jupiter-exchange-solana': 'jupiter', 'curve-dao-token': 'curve-finance', 'ondo-finance': 'ondo-finance', 'pendle': 'pendle', 'ethena': 'ethena', 'aave': 'aave', 'uniswap': 'uniswap', 'sky': 'sky', 'hyperliquid': 'hyperliquid', 'raydium': 'raydium', 'gmx': 'gmx', 'maker': 'sky', 'pancakeswap-token': 'pancakeswap', 'dydx-chain': 'dydx', 'compound-governance-token': 'compound-finance', 'jito-governance-token': 'jito', 'eigenlayer': 'eigenlayer', 'ethereum-name-service': 'ens', 'gmx-2': 'gmx' };
async function tkLoad(id) {
  const seq = ++TK.seq; TK.id = id; TK.data = null; TK.err = ''; TK.fees = null; LS.set('tk', id);
  tkDraw();
  try {
    const d = await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, { timeout: 15000 });
    if (seq !== TK.seq) return;
    TK.data = d; TK.at = Date.now();
    if (d.image && d.image.large) LOGOS[id] = d.image.large;
  } catch (e) { if (seq !== TK.seq) return; TK.err = e.status === 429 ? L('O CoinGecko pediu uma pausa (muitas consultas). Tente em 1 minuto.', 'CoinGecko asked for a pause (rate limit). Try again in 1 minute.') : String(e.message || e); }
  tkDraw();
  tkFees(seq); tkHacks(); tkPx(seq); if (typeof ensureNews === 'function') ensureNews('cripto');
}
async function tkFees(seq) {
  const bbt = tkBurn(); const slug = (bbt && bbt.src[0] && bbt.src[0].id) || LLAMA_SLUG[TK.id] || TK.id;
  const get = async (type) => { try { return await getJSON(`https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}?dataType=${type}&excludeTotalDataChartBreakdown=true`, { timeout: 20000 }); } catch (e) { if (e.status === 404 || e.status === 400 || e.status === 500) return null; throw e; } };
  try {
    const [fees, rev, hold] = await Promise.all([get('dailyFees'), get('dailyRevenue'), get('dailyHoldersRevenue')]);
    if (seq !== TK.seq) return;
    TK.fees = { fees, rev, hold, slug, at: Date.now() };
  } catch { if (seq === TK.seq) TK.fees = { err: true, slug }; }
  tkDrawFees();
}
async function tkHacks() {
  if (TK.hacks) { tkDrawSec(); return; }
  const c = CACHE.get('llama-hacks');
  if (c && Date.now() - c.ts < 24 * 3600e3) { TK.hacks = c.v; tkDrawSec(); return; }
  try { const a = await getJSON('https://api.llama.fi/hacks', { timeout: 20000 }); TK.hacks = a.map((h) => ({ d: h.date * 1000, n: h.name, c: h.classification, t: h.technique, a: h.amount, r: h.returnedFunds, ch: h.chain })); CACHE.set('llama-hacks', TK.hacks, false); } catch { TK.hacks = []; TK.hacksErr = true; }
  tkDrawSec();
}
function tkHtml() {
  return `${pageHead(PAGES.tokenomics, '')}<div id="tk-body"></div>`;
}
function tkDraw() {
  const box = $('#tk-body'); if (!box) return;
  if (!hasPro()) { box.innerHTML = proGate(PAGES.tokenomics); return; }
  const d = TK.data;
  const logo = d ? (d.image && d.image.large) : LOGOS[TK.id];
  const pickBtn = `<button class="btn" data-act="tkPick" style="height:46px;padding:0 14px 0 10px">${coinLogo({ b: d ? d.symbol.toUpperCase() : '?', logo, cg: TK.id }, 30)}<span style="text-align:left;line-height:1.2"><b style="display:block">${esc(d ? d.name : TK.id)}</b><span class="tiny faint">${esc(d ? d.symbol.toUpperCase() : '')} · ${esc(L('trocar moeda', 'change coin'))}</span></span>${ico('chevron-down', 16)}</button>`;
  if (TK.err) { box.innerHTML = `<div class="row">${pickBtn}</div><div class="panel mt">${emptyBox('wifi-off', L('Não foi possível ler os dados da moeda', 'Could not read coin data'), esc(TK.err), `<button class="btn sm" data-act="tkRetry">${ico('refresh-cw', 16)}${esc(L('Tentar de novo', 'Try again'))}</button>`)}</div>`; return; }
  if (!d) { box.innerHTML = `<div class="row">${pickBtn}</div><div class="grid g-2 mt"><div class="panel">${skel(6, 18)}</div><div class="panel">${skel(6, 18)}</div></div>`; return; }
  const m = d.market_data || {};
  const u = BY_CG[TK.id]; const live = u && PX[u.s];
  const price = live ? live.p : num(m.current_price && m.current_price.usd);
  const circ = num(m.circulating_supply), total = num(m.total_supply), max = num(m.max_supply);
  const mcap = isNum(price) && isNum(circ) ? price * circ : num(m.market_cap && m.market_cap.usd);
  const fullSupply = isNum(max) && max > 0 ? max : total;
  const fdv = isNum(price) && isNum(fullSupply) ? price * fullSupply : num(m.fully_diluted_valuation && m.fully_diluted_valuation.usd);
  const ratio = isNum(fdv) && isNum(mcap) && mcap > 0 ? fdv / mcap : null;
  const pctCirc = isNum(circ) && isNum(fullSupply) && fullSupply > 0 ? circ / fullSupply * 100 : null;
  const ath = num(m.ath && m.ath.usd), athD = m.ath_date && m.ath_date.usd;
  const toAth = isNum(ath) && isNum(price) ? ath / price : null;
  const stampTk = `<span class="stamp live"><i class="dot"></i><b>CoinGecko</b><span class="st">${esc(ago(TK.at))}</span></span>`;
  const dil = !isNum(ratio) ? '' : ratio >= 3 ? `<span class="badge bad">${esc(L('diluição alta', 'high dilution'))}</span>` : ratio >= 1.5 ? `<span class="badge warn">${esc(L('diluição moderada', 'moderate dilution'))}</span>` : `<span class="badge live">${esc(L('diluição baixa', 'low dilution'))}</span>`;
  box.innerHTML = `${tkChips()}<div class="row wrap between" style="gap:12px">${pickBtn}<div class="row wrap" style="gap:6px 22px">${kpiBox(L('Preço', 'Price'), isNum(price) ? esc(usd(price)) : '—', live ? chg(live.chg) + ` <span class="faint">${esc(L('Binance ao vivo', 'Binance live'))}</span>` : chg(num(m.price_change_percentage_24h)))}${kpiBox(L('Ranking', 'Rank'), d.market_cap_rank ? '#' + d.market_cap_rank : '—')}</div></div>
  <div class="grid g-2 mt">
    <section class="panel">${panelHead('package', L('Oferta e diluição', 'Supply & dilution'), { sub: esc(L('Quanto da moeda já circula e quanto ainda pode entrar no mercado.', 'How much already circulates and how much can still hit the market.')), right: stampTk })}
      <div class="grid g-2" style="gap:14px">
        ${kpiBox(L('Em circulação', 'Circulating'), isNum(circ) ? esc(fmtCompact(circ, null)) : '—', isNum(pctCirc) ? `${esc(fmtPct(pctCirc, 1, false))} ${esc(L('do total possível', 'of max'))}` : '')}
        ${kpiBox(L('Oferta máxima', 'Max supply'), isNum(max) && max > 0 ? esc(fmtCompact(max, null)) : esc(L('sem limite', 'no cap')), isNum(total) ? `${esc(L('total emitido:', 'total:'))} ${esc(fmtCompact(total, null))}` : '')}
        ${kpiBox(L('Valor de mercado', 'Market cap'), esc(fmtCompact(mcap)), esc(L('preço × circulante', 'price × circulating')))}
        ${kpiBox(L('Valor totalmente diluído (FDV)', 'Fully diluted value (FDV)'), esc(fmtCompact(fdv)), isNum(ratio) ? `${esc(fmtNum(ratio, 2, 2))}× ${esc(L('o valor de mercado', 'market cap'))} ${dil}` : '')}
      </div>
      ${isNum(pctCirc) ? `<div class="donut-wrap mt">${donutSVG([{ v: pctCirc, c: 'var(--accent)', t: L('Em circulação', 'Circulating') }, { v: 100 - pctCirc, c: 'var(--panel-3)', t: L('Bloqueado ou por emitir', 'Locked or unissued') }], { size: 120, thick: 18, label: L('Oferta', 'Supply') })}<div class="legend"><div><i style="background:var(--accent)"></i>${esc(L('Em circulação', 'Circulating'))}<span class="lv">${esc(fmtPct(pctCirc, 1, false))}</span></div><div><i style="background:var(--panel-3);box-shadow:0 0 0 1px var(--line-2) inset"></i>${esc(L('Bloqueado ou por emitir', 'Locked or unissued'))}<span class="lv">${esc(fmtPct(100 - pctCirc, 1, false))}</span></div>${isNum(circ) && isNum(fullSupply) ? `<div class="tiny faint" style="margin-top:2px">${esc(L(`${fmtCompact(fullSupply - circ, null)} ${d.symbol.toUpperCase()} ainda podem entrar no mercado`, `${fmtCompact(fullSupply - circ, null)} ${d.symbol.toUpperCase()} can still hit the market`))}</div>` : ''}</div></div>` : ''}
      ${note(L('FDV alto em relação ao valor de mercado indica que muitas moedas ainda vão entrar em circulação (desbloqueios e emissões), o que pode pressionar o preço.', 'High FDV vs market cap means many tokens will still enter circulation (unlocks/emissions), which can pressure price.'))}
    </section>
    <section class="panel">${panelHead('target', L('Distância da máxima histórica', 'Distance from all-time high'), { right: stampTk })}
      <div class="grid g-2" style="gap:14px">
        ${kpiBox(L('Máxima histórica (ATH)', 'All-time high'), isNum(ath) ? esc(usd(ath)) : '—', athD ? esc(fmtDate(athD)) : '')}
        ${kpiBox(L('Queda desde o topo', 'Drop from top'), isNum(toAth) ? `<span class="down">${esc(fmtPct((1 / toAth - 1) * 100, 1))}</span>` : '—', isNum(toAth) ? `${esc(L('precisa subir', 'needs to rise'))} <b class="up">${esc(fmtPct((toAth - 1) * 100, 0))}</b>` : '')}
        ${kpiBox(L('Valor de mercado no ATH (oferta atual)', 'Market cap at ATH (current supply)'), isNum(ath) && isNum(circ) ? esc(fmtCompact(ath * circ)) : '—', modelBadge(L('ATH × moedas em circulação hoje.', 'ATH × circulating supply today.')))}
        ${kpiBox(L('Valor no ATH com tudo emitido', 'Value at ATH, fully diluted'), isNum(ath) && isNum(fullSupply) ? esc(fmtCompact(ath * fullSupply)) : '—', modelBadge(L('ATH × oferta máxima (ou total).', 'ATH × max (or total) supply.')))}
      </div>
      ${note(L('Para voltar ao topo com mais moedas em circulação, o mercado precisa colocar mais dinheiro do que no topo anterior. São contas, não previsão.', 'To return to the top with more tokens circulating, the market must put in more money than at the prior top. Math, not a forecast.'))}
    </section>
  </div>
  <section class="panel mt" id="tk-px"></section>
  <section class="panel mt" id="tk-bb"></section>
  <section class="panel mt" id="tk-fees"></section>
  <div class="grid g-2 mt"><section class="panel" id="tk-unl"></section><section class="panel" id="tk-sec"></section></div>
  <section class="panel mt" id="tk-news"></section>`;
  tkDrawFees(); tkDrawUnlocks(); tkDrawSec(); tkDrawNews(); tkDrawPx(); tkDrawBurn();
}
function tkDrawFees() {
  const box = $('#tk-fees'); if (!box || !TK.data) return;
  const F = TK.fees;
  const head = panelHead('banknote', L('Receita do protocolo, recompras e queimas', 'Protocol revenue, buybacks & burns'), { sub: esc(L('Quanto os usuários pagam ao protocolo e quanto volta para quem tem a moeda (recompra, queima ou distribuição).', 'What users pay the protocol and how much goes back to holders (buybacks, burns or distributions).')), right: F && !F.err && F.fees ? `<span class="stamp live"><i class="dot"></i><b>DefiLlama</b><span class="st">${esc(ago(F.at))}</span></span>` : '' });
  if (!F) { box.innerHTML = head + skel(3, 18); return; }
  if (F.err || (!F.fees && !F.rev && !F.hold)) { box.innerHTML = head + `<div class="callout">${ico('info', 18)}<span>${esc(L('A DefiLlama não tem dados de taxas e receita para esta moeda (comum em moedas de rede, memecoins e tokens sem receita).', 'DefiLlama has no fee/revenue data for this coin (common for L1s, memecoins and tokens without revenue).'))} ${extLink(`https://defillama.com/search?q=${encodeURIComponent(TK.data.name)}`, L('Buscar na DefiLlama', 'Search DefiLlama'))}</span></div>`; return; }
  const m = TK.data.market_data || {}; const mcap = num(m.market_cap && m.market_cap.usd);
  const col = (t, o) => (o ? kpiBox(t, esc(fmtCompact(o.total30d)), `${esc(L('24h:', '24h:'))} ${esc(fmtCompact(o.total24h))} · ${esc(L('1 ano:', '1y:'))} ${esc(fmtCompact(o.total1y))}`) : kpiBox(t, '—', esc(L('sem dado', 'no data'))));
  const yearHold = F.hold && num(F.hold.total1y), yearRev = F.rev && num(F.rev.total1y);
  box.innerHTML = head + `<div class="grid g-3" style="gap:14px">${col(L('Taxas pagas pelos usuários (30 dias)', 'Fees paid by users (30d)'), F.fees)}${col(L('Receita do protocolo (30 dias)', 'Protocol revenue (30d)'), F.rev)}${col(L('Repassado aos detentores (30 dias)', 'To holders (30d)'), F.hold)}</div>
    <div class="row wrap mt" style="gap:8px 22px">${isNum(yearHold) && isNum(mcap) && mcap > 0 ? `<span class="small">${esc(L('Retorno anual aos detentores:', 'Annual yield to holders:'))} <b>${esc(fmtPct(yearHold / mcap * 100, 2, false))}</b> ${esc(L('do valor de mercado', 'of market cap'))} ${modelBadge(L('Repasse aos detentores nos últimos 12 meses ÷ valor de mercado atual.', 'Holder revenue over 12 months ÷ current market cap.'))}</span>` : ''}${isNum(yearRev) && yearRev > 0 && isNum(mcap) ? `<span class="small">${esc(L('Valor de mercado ÷ receita anual:', 'Market cap ÷ annual revenue:'))} <b>${esc(fmtNum(mcap / yearRev, 1, 1))}×</b> ${modelBadge(L('Parecido com o P/L de ações: quantos anos de receita o mercado paga.', 'Similar to a P/E ratio: how many years of revenue the market pays.'))}</span>` : ''}</div>
    ${tkMonthlyHtml(F)}
    ${note(L(`Fonte: DefiLlama (${esc(F.slug)}). "Repassado aos detentores" inclui recompras, queimas e distribuições, conforme a metodologia da DefiLlama.`, `Source: DefiLlama (${esc(F.slug)}). "To holders" includes buybacks, burns and distributions per DefiLlama’s methodology.`))}`;
}
function tkMonthlyHtml(F) {
  const fm = tkMonthly(F.fees), rm = tkMonthly(F.rev), hm = tkMonthly(F.hold);
  const keys = [...new Set([...Object.keys(fm), ...Object.keys(rm)])].sort().slice(-12);
  if (keys.length < 2) return '';
  const cur = new Date(); const curK = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`;
  const mx = Math.max(...keys.map((k) => Math.max(fm[k] || 0, rm[k] || 0, hm[k] || 0)), 1);
  const bar = (v, c, lb, k) => `<i style="height:${Math.max(isNum(v) && v > 0 ? 2 : 0, (v || 0) / mx * 100)}%;background:${c}" title="${esc(`${lb} · ${monthName(+k.slice(5) - 1)}/${k.slice(2, 4)}: ${isNum(v) ? fmtCompact(v) : '—'}`)}"></i>`;
  const lf = L('Taxas pagas', 'Fees paid'), lr = L('Receita do protocolo', 'Protocol revenue'), lh = L('Repassado aos detentores', 'To holders');
  return `<h3 class="lab-h3">${esc(L('Mês a mês (últimos 12 meses)', 'Month by month (last 12 months)'))}</h3>
    <div class="tk-mbars">${keys.map((k) => `<div class="mb"><div class="bs">${bar(fm[k], 'var(--info)', lf, k)}${bar(rm[k], 'var(--accent)', lr, k)}${bar(hm[k], '#ff8a4c', lh, k)}</div><span>${esc(monthName(+k.slice(5) - 1))}${k === curK ? '*' : ''}</span></div>`).join('')}</div>
    <div class="row wrap tiny faint" style="gap:4px 16px;margin-top:6px"><span><i class="oc-lg" style="background:var(--info)"></i>${esc(L('taxas pagas pelos usuários', 'fees paid by users'))}</span><span><i class="oc-lg" style="background:var(--accent)"></i>${esc(L('receita do protocolo', 'protocol revenue'))}</span><span><i class="oc-lg" style="background:#ff8a4c"></i>${esc(L('repassado aos detentores', 'paid to holders'))}</span><span>${esc(L('* mês em andamento', '* month in progress'))}</span></div>`;
}
function tkDrawUnlocks() {
  const box = $('#tk-unl'); if (!box || !TK.data) return;
  const slug = TK.data.id, name = TK.data.name;
  const ai = TK.ai;
  box.innerHTML = panelHead('calendar-days', L('Desbloqueios programados', 'Scheduled unlocks')) + `<div class="callout">${ico('info', 18)}<span>${esc(L('Não existe fonte gratuita e confiável de cronograma de desbloqueios que funcione direto no navegador. Para não mostrar data ou quantidade errada, consulte as fontes especializadas abaixo — ou peça uma pesquisa com IA (usa sua chave da Anthropic e cita os links).', 'There is no free, reliable unlock-schedule source that works in the browser. To avoid wrong dates or amounts, check the specialist sources below — or run an AI search (uses your Anthropic key and cites links).'))}</span></div>
    <div class="row wrap mt" style="gap:8px 18px">${extLink(`https://tokenomist.ai/${encodeURIComponent(slug)}`, 'Tokenomist')}${extLink(`https://defillama.com/unlocks`, 'DefiLlama Unlocks')}${extLink(`https://cryptorank.io/price/${encodeURIComponent(slug)}/vesting`, 'CryptoRank')}</div>
    <div class="mt"><button class="btn sm" data-act="tkAi">${ico('sparkles', 16)}${esc(L(`Pesquisar desbloqueios e segurança de ${name} com IA`, `Research ${name} unlocks & security with AI`))}</button></div>
    ${ai ? `<div class="ai-m mt" style="max-height:420px;overflow:auto">${esc(ai.text)}</div><p class="tiny faint mt">${esc(L(`Pesquisa feita por IA em ${fmtDateTime(ai.at)}. Confira nos links citados antes de decidir.`, `AI research at ${fmtDateTime(ai.at)}. Check the cited links before deciding.`))}</p>` : ''}`;
}
ACT.tkAi = async (el) => {
  if (!aiKey()) { toast(L('Cole sua chave da Anthropic em Configurações para usar a IA.', 'Paste your Anthropic key in Settings to use AI.'), { type: 'warn', action: { label: L('Abrir', 'Open'), fn: () => go('settings') } }); return; }
  const d = TK.data; el.classList.add('busy');
  try {
    const text = await aiCall([{ role: 'user', content: `Pesquise na web, com fontes, sobre a criptomoeda ${d.name} (${d.symbol.toUpperCase()}, CoinGecko id ${d.id}). Hoje é ${new Date().toLocaleDateString('pt-BR')}.\n1) Próximos desbloqueios de tokens (data, quantidade, % da oferta, para quem) nos próximos 6 meses.\n2) Programas de recompra ou queima ativos.\n3) Incidentes de segurança, invasões ou falhas relevantes nos últimos 2 anos.\nPara cada item, cite o link da fonte. Se não encontrar fonte confiável, diga "não encontrado" — não invente datas nem números. Responda em ${S.lang === 'en' ? 'English' : 'português do Brasil'}, em tópicos curtos.` }], { max: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] });
    TK.ai = { text: text || '—', at: Date.now() };
  } catch (e) { TK.ai = { text: '⚠ ' + e.message, at: Date.now() }; }
  el.classList.remove('busy'); tkDrawUnlocks();
};
function tkDrawSec() {
  const box = $('#tk-sec'); if (!box || !TK.data) return;
  const head = panelHead('shield', L('Segurança: incidentes registrados', 'Security: recorded incidents'), { right: TK.hacks && !TK.hacksErr ? `<span class="stamp live"><i class="dot"></i><b>DefiLlama</b><span class="st">${esc(L('base de invasões', 'hacks database'))}</span></span>` : '' });
  if (!TK.hacks) { box.innerHTML = head + skel(3, 18); return; }
  const name = TK.data.name.toLowerCase(), sym = TK.data.symbol.toLowerCase();
  // nome exato, id do CoinGecko ou o nome seguido de versão/sufixo do mesmo projeto (ex.: "Aave V2")
  const idw = TK.data.id.replace(/-/g, ' ');
  const same = (n) => n === name || n === idw || n === sym || [name, idw].some((w) => n.startsWith(w + ' ') && /^\s*(v\d+|protocol|finance|bridge|exchange|dao|labs|markets)\b/.test(n.slice(w.length)));
  const hits = TK.hacks.filter((h) => same(String(h.n).toLowerCase())).sort((a, b) => b.d - a.d).slice(0, 6);
  box.innerHTML = head + (TK.hacksErr ? `<div class="callout">${ico('wifi-off', 18)}<span>${esc(L('Base de incidentes indisponível agora.', 'Incident database unavailable now.'))}</span></div>`
    : hits.length ? `<div class="list">${hits.map((h) => `<div class="li"><span class="grow"><span class="t" style="display:block">${esc(h.n)} · ${esc(fmtDate(h.d))}</span><span class="m">${esc([h.c, h.t, (h.ch || []).join(', ')].filter(Boolean).join(' · '))}</span></span><span class="b down">${isNum(h.a) ? esc(fmtCompact(h.a)) : '—'}</span></div>`).join('')}</div>`
      : `<div class="callout ok">${ico('shield-check', 18)}<span>${esc(L('Nenhum incidente com este nome na base da DefiLlama. Isso não garante segurança: confira auditorias e o histórico do projeto.', 'No incident under this name in DefiLlama’s database. That does not guarantee safety: check audits and project history.'))}</span></div>`) +
    `<div class="row wrap mt" style="gap:8px 18px">${extLink('https://rekt.news/leaderboard/', 'Rekt News')}${extLink('https://defillama.com/hacks', 'DefiLlama Hacks')}</div>`;
}
function tkDrawNews() {
  const box = $('#tk-news'); if (!box || !TK.data) return;
  const d = TK.data; const items = typeof newsFor === 'function' ? newsFor(d.name, d.symbol) : [];
  box.innerHTML = panelHead('newspaper', L(`Notícias sobre ${d.name}`, `${d.name} news`), { sub: esc(L('Das últimas manchetes de cripto (PT e EN) que citam a moeda.', 'From the latest crypto headlines (PT and EN) that mention the coin.')) }) +
    (items.length ? `<div class="list">${items.slice(0, 8).map((n) => `<a class="li" href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer"><span class="grow"><span class="t" style="display:block">${esc(n.t)}</span><span class="m">${esc(n.src)} · ${esc(ago(n.d))}</span></span>${ico('external-link', 15)}</a>`).join('')}</div>`
      : `<div class="callout">${ico('newspaper', 18)}<span>${esc(L('Nenhuma manchete recente cita esta moeda.', 'No recent headline mentions this coin.'))} ${extLink(`https://news.google.com/search?q=${encodeURIComponent(d.name + ' crypto')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, 'Google Notícias')}</span></div>`);
}
// ---------- atalhos de moedas ----------
const TK_QUICK = ['hyperliquid', 'ethereum', 'solana', 'chainlink', 'uniswap', 'aave', 'pump-fun', 'sky', 'ondo-finance', 'pendle', 'jupiter-exchange-solana', 'ethena', 'arbitrum', 'tron', 'binancecoin'];
function tkChips() {
  const sym = (id) => { const m = CGM[id]; const u = BY_CG[id]; return (m && String(m.symbol || '').toUpperCase()) || (u && u.b) || id.split('-')[0].toUpperCase().slice(0, 5); };
  return `<div class="tk-chips" role="group" aria-label="${esc(L('Moedas mais procuradas', 'Popular coins'))}">${TK_QUICK.map((id) => `<button class="tk-chip${id === TK.id ? ' on' : ''}" data-act="go" data-to="tokenomics" data-params='${esc(JSON.stringify({ id }))}'>${coinLogo({ b: sym(id), cg: id, logo: LOGOS[id] || (CGM[id] && CGM[id].image) }, 18)}${esc(sym(id))}</button>`).join('')}</div>`;
}
// ---------- preço em 1 ano (Binance quando a moeda é listada lá; senão CoinGecko) ----------
async function tkPx(seq) {
  TK.px = null; tkDrawPx();
  try {
    const u = BY_CG[TK.id];
    let pts;
    if (u) pts = (await klines(u.s, '1d', 366)).map((k) => ({ t: k.t, v: k.c }));
    else pts = ((await getJSON(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(TK.id)}/market_chart?vs_currency=usd&days=365&interval=daily`, { timeout: 15000 })).prices || []).map(([t, v]) => ({ t, v })).filter((x) => isNum(x.v) && x.v > 0);
    if (seq !== TK.seq) return;
    TK.px = { pts, src: u ? 'Binance' : 'CoinGecko', at: Date.now() };
  } catch (e) { if (seq === TK.seq) TK.px = { err: String(e.message || e) }; }
  tkDrawPx();
}
async function tkDrawPx() {
  const box = $('#tk-px'); if (!box || !TK.data) return;
  const P = TK.px;
  const src = P && P.src ? `<span class="stamp live"><i class="dot"></i><b>${esc(P.src)}</b><span class="st">${esc(ago(P.at))}</span></span>` : '';
  const head = panelHead('chart-line', L('Preço no último ano', 'Price over the last year'), { sub: esc(L('Fechamento diário, com a máxima histórica (ATH) tracejada para comparar.', 'Daily close, with the all-time high (ATH) dashed for comparison.')), right: src });
  if (!P) { setHTML(box, head + '<div class="skel" style="height:260px"></div>'); return; }
  if (P.err || !P.pts.length) { setHTML(box, head + emptyBox('wifi-off', L('Histórico de preço indisponível agora', 'Price history unavailable'), esc(P.err || ''))); return; }
  const pts = P.pts; const last = pts[pts.length - 1].v;
  const ret = (days) => { const t0 = pts[pts.length - 1].t - days * 86400e3; const a = pts.find((x) => x.t >= t0); return a ? (last / a.v - 1) * 100 : null; };
  const hi = Math.max(...pts.map((x) => x.v)), lo = Math.min(...pts.map((x) => x.v));
  const m = TK.data.market_data || {}; const ath = num(m.ath && m.ath.usd);
  if (!$('#tk-pxc')) setHTML(box, head + `<div class="row wrap" style="gap:6px 22px" id="tk-pxk"></div><div id="tk-pxc" style="height:280px;margin-top:10px"></div>`);
  setHTML('#tk-pxk', [[L('30 dias', '30 days'), ret(30)], [L('90 dias', '90 days'), ret(90)], [L('1 ano', '1 year'), ret(365)]].map(([k, v]) => kpiBox(k, isNum(v) ? `<span class="${tone(v)}">${esc(fmtPct(v, 1))}</span>` : '—')).join('') + kpiBox(L('Máxima e mínima do ano', 'Year high and low'), `<span class="small">${esc(usd(hi))} · ${esc(usd(lo))}</span>`));
  const el = $('#tk-pxc'); const key = TK.id + pts.length + S.theme;
  if (el.dataset.k === key && el.querySelector('canvas')) return; el.dataset.k = key;
  let r; try { r = await makeChart(el, { onTheme: () => { el.dataset.k = ''; tkDrawPx(); } }); } catch { return; }
  const { ch, c } = r;
  const up = last >= pts[0].v;
  const s1 = ch.addAreaSeries({ lineColor: up ? c.up : c.down, topColor: up ? 'rgba(49,214,127,.18)' : 'rgba(255,97,112,.16)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 2, priceLineVisible: false });
  s1.setData(pts.map((x) => ({ time: ctime(x.t, false), value: x.v })));
  if (isNum(ath)) s1.createPriceLine({ price: ath, color: c.signal, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'ATH' });
  ch.timeScale().fitContent();
}
// ---------- recompra e queima do token (dados do Burn, Baby, Burn) ----------
function tkBurn() { const D = typeof bbData === 'function' ? bbData() : null; return D ? D.toks.find((t) => t.cg === TK.id) || null : null; }
function tkDrawBurn() {
  const box = $('#tk-bb'); if (!box || !TK.data) return;
  const D = typeof bbData === 'function' ? bbData() : null; const t = tkBurn();
  const head = panelHead('flame', 'Burn, Baby, Burn', { sub: esc(L('Quanto do que o protocolo fatura volta para este token: recompra, queima ou repasse.', 'How much of the protocol’s revenue goes back to this token: buybacks, burns or payouts.')), right: D ? stamp('buybacks') : '' });
  if (!D) { setHTML(box, head + skel(2, 18)); return; }
  if (!t) { setHTML(box, head + `<div class="callout">${ico('info', 18)}<span>${esc(L(`A DefiLlama não registra recompra, queima ou repasse de ${TK.data.name} nos últimos 60 dias.`, `DefiLlama records no buyback, burn or payout for ${TK.data.name} in the last 60 days.`))} <button class="link-btn" data-act="go" data-to="buybacks">${esc(L('Ver as moedas que têm', 'See the coins that do'))}</button></span></div>`); return; }
  const w = (n) => bbWin(t, D, n, 0, 'all');
  const d30 = w(30); const mcap = bbMcap(t); const y1 = t.src.map((x) => x.y1).filter(isNum).reduce((a, b) => a + b, 0) || null;
  const spark = new Array(90).fill(0).map((_, k) => { const i = Math.min(t.end, D.N - 1) - 89 + k; let v = null; for (const s of t.src) { const x = s.arr[i]; if (isNum(x)) v = (v || 0) + x; } return v; });
  const col = (BB_MECH()[t.src[0].type] || BB_MECH().share).c;
  setHTML(box, head + `<div class="row wrap" style="gap:8px 18px;align-items:center"><div class="bb-mechs">${[...new Set(t.src.map((s) => s.type))].map(bbPill).join('')}</div><div class="grow"></div>${bbBars(spark, col, 220, 36)}</div>
    <div class="bb-ks" style="margin-top:12px">${[[L('Último dia', 'Last day'), w(1)], [L('7 dias', '7 days'), w(7)], [L('30 dias', '30 days'), d30], [L('1 ano', '1 year'), y1]].map(([k, v]) => `<div class="bb-k"><span>${esc(k)}</span><b>${isNum(v) ? esc(fmtCompact(v)) : '—'}</b></div>`).join('')}
    <div class="bb-k"><span>${esc(L('% do valor de mercado por ano', '% of market cap per year'))}</span><b>${isNum(d30) && mcap ? esc(fmtNum(d30 / 30 * 365 / mcap * 100, 2, 2) + '%') : '—'}</b><small>${esc(L('no ritmo de 30 dias', 'at the 30-day pace'))}</small></div>
    <div class="bb-k"><span>${esc(L('Desde o início', 'All time'))}</span><b>${esc(fmtCompact(t.src.map((x) => x.all).filter(isNum).reduce((a, b) => a + b, 0)))}</b></div></div>
    <div class="row wrap mt" style="gap:8px"><button class="btn sm" data-act="bbOpen" data-k="${esc(t.k)}">${ico('chart-column', 15)}${esc(L('Gráfico diário e metodologia', 'Daily chart & methodology'))}</button><button class="btn sm ghost" data-act="go" data-to="buybacks">${ico('flame', 15)}${esc(L('Comparar no Burn, Baby, Burn', 'Compare in Burn, Baby, Burn'))}</button></div>`);
}
// receita mês a mês (DefiLlama): taxas pagas × receita do protocolo
function tkMonthly(sum) {
  const ch = (sum && sum.totalDataChart) || []; const out = {};
  for (const [t, v] of ch) { if (!isNum(v)) continue; const d = new Date((t < 1e12 ? t * 1000 : t)); const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; out[k] = (out[k] || 0) + v; }
  return out;
}
ACT.tkPick = () => openCoinPicker({ title: L('Escolher moeda', 'Pick a coin'), onPick: (p) => go('tokenomics', { id: p.cg }) });
ACT.tkRetry = () => tkLoad(TK.id);
onPrice((set) => {
  if (S.page !== 'tokenomics' || !TK.data) return;
  if (set.has('NEWS')) tkDrawNews();
  if (set.has('BUYBACKS')) tkDrawBurn();
  const u = BY_CG[TK.id]; if (u && set.has(u.s) && Date.now() - (TK.t || 0) > 4000) { TK.t = Date.now(); tkDraw(); }
});
page({
  id: 'tokenomics', group: 'analise', icon: 'package', pt: 'Tokenomics', en: 'Tokenomics', pro: true, proWhat: 'o Tokenomics', proWhatEn: 'Tokenomics',
  sub: 'Escolha uma moeda e veja oferta, diluição, preço no ano, distância do topo, receita mês a mês, recompra e queima, segurança e notícias.',
  subEn: 'Pick a coin and see supply, dilution, distance from the top, revenue, buybacks, security and news.',
  init(el, params) { el.innerHTML = tkHtml(); if (!hasPro()) { tkDraw(); return; } tkLoad(params.id || LS.get('tk') || 'hyperliquid'); },
  show(el, params) { if (!hasPro()) { tkDraw(); return; } if (params.id && params.id !== TK.id) tkLoad(params.id); else if (!TK.data && !TK.err) tkLoad(TK.id); },
});
