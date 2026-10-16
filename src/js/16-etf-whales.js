// =====================================================================
// ETFs — o que são, lista de fundos à vista (BTC e ETH, EUA e B3), cotação
// das cotas pelo robô e calculadora. Fluxos diários: links para quem mede.
// BALEIAS E TESOURARIAS — empresas que guardam BTC/ETH (CoinGecko),
// avaliadas pelo preço ao vivo, e links para carteiras gigantes.
// =====================================================================
const ETF_LIST = {
  btc: [
    ['IBIT', 'iShares Bitcoin Trust', 'BlackRock'], ['FBTC', 'Fidelity Wise Origin Bitcoin Fund', 'Fidelity'],
    ['GBTC', 'Grayscale Bitcoin Trust', 'Grayscale'], ['BTC', 'Grayscale Bitcoin Mini Trust', 'Grayscale'],
    ['ARKB', 'ARK 21Shares Bitcoin ETF', 'ARK Invest & 21Shares'], ['BITB', 'Bitwise Bitcoin ETF', 'Bitwise'],
    ['HODL', 'VanEck Bitcoin ETF', 'VanEck'], ['BTCO', 'Invesco Galaxy Bitcoin ETF', 'Invesco & Galaxy'],
    ['BTCW', 'WisdomTree Bitcoin Fund', 'WisdomTree'], ['EZBC', 'Franklin Bitcoin ETF', 'Franklin Templeton'],
    ['BRRR', 'CoinShares Bitcoin ETF', 'CoinShares (ex-Valkyrie)'],
  ],
  eth: [
    ['ETHA', 'iShares Ethereum Trust', 'BlackRock'], ['FETH', 'Fidelity Ethereum Fund', 'Fidelity'],
    ['ETHE', 'Grayscale Ethereum Trust', 'Grayscale'], ['ETH', 'Grayscale Ethereum Mini Trust', 'Grayscale'],
    ['ETHW', 'Bitwise Ethereum ETF', 'Bitwise'], ['CETH', '21Shares Core Ethereum ETF', '21Shares'],
    ['ETHV', 'VanEck Ethereum ETF', 'VanEck'], ['QETH', 'Invesco Galaxy Ethereum ETF', 'Invesco & Galaxy'],
    ['EZET', 'Franklin Ethereum ETF', 'Franklin Templeton'],
  ],
  br: [
    ['HASH11', 'Hashdex Nasdaq Crypto Index', 'Hashdex'], ['BITH11', 'Hashdex Bitcoin', 'Hashdex'],
    ['ETHE11', 'Hashdex Ethereum', 'Hashdex'], ['QBTC11', 'QR CME CF Bitcoin Reference Rate', 'QR Asset'],
    ['QETH11', 'QR CME CF Ether Reference Rate', 'QR Asset'],
  ],
};
const ETF = { tab: 'btc', calc: 1 };
function registerEtfSources() {
  source({
    id: 'etfq', label: L('Cotas dos ETFs', 'ETF quotes'), provider: L('robô NEXUS', 'NEXUS bot'), every: 10 * 60e3,
    need: onPage('etf'),
    run: async () => { const j = await getPipeline('markets', 3 * 3600e3); if (!j.etfs || !Object.keys(j.etfs).length) throw new Error(L('sem cotas', 'no quotes')); return { q: j.etfs, gen: Date.parse(j.generatedAt) }; },
    onData: (d) => { HEALTH.etfq.dataTs = d.gen; _markDirty('ETFQ'); },
  });
}
function etfHtml() {
  return `${pageHead(PAGES.etf, '')}
  <section class="panel hero"><div class="grid g-3" style="gap:18px">
    <div><h2 class="panel-t">${ico('package', 18)}${esc(L('O que é um ETF de bitcoin?', 'What is a bitcoin ETF?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('É um fundo negociado na bolsa, como uma ação. Quem compra uma cota tem exposição ao preço do bitcoin sem precisar guardar a moeda: o fundo compra e custodia os BTC de verdade.', 'An exchange-traded fund, like a stock. Buying a share gives bitcoin price exposure without holding the coin: the fund buys and custodies real BTC.'))}</p></div>
    <div><h2 class="panel-t">${ico('database', 18)}${esc(L('O que é AUM?', 'What is AUM?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('AUM (Assets Under Management) é o patrimônio sob gestão: quanto vale tudo o que o fundo guarda. Num ETF de bitcoin, AUM ≈ quantidade de BTC do fundo × preço do BTC.', 'AUM (Assets Under Management) is what all of the fund’s holdings are worth. For a bitcoin ETF, AUM ≈ BTC held × BTC price.'))}</p></div>
    <div><h2 class="panel-t">${ico('arrow-left-right', 18)}${esc(L('O que são entradas e saídas?', 'What are inflows/outflows?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('Entrada = dinheiro novo aplicado no fundo (ele compra BTC). Saída = resgates (ele vende BTC). É o termômetro da demanda institucional.', 'Inflow = new money into the fund (it buys BTC). Outflow = redemptions (it sells BTC). A gauge of institutional demand.'))}</p></div>
  </div></section>
  <section class="panel mt" id="etf-list"></section>
  <div class="grid g-2 mt"><section class="panel" id="etf-flows"></section><section class="panel" id="etf-calc"></section></div>`;
}
function drawEtfList() {
  const box = $('#etf-list'); if (!box) return;
  const q = CACHE.get('etfq'); const Q = q && q.v.q;
  const rows = ETF_LIST[ETF.tab];
  const yahoo = (t) => (ETF.tab === 'br' ? t + '.SA' : t);
  const tbl = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ticker</th><th>${esc(L('Fundo', 'Fund'))}</th><th>${esc(L('Gestora', 'Issuer'))}</th><th class="r">${esc(L('Cota', 'Price'))}</th><th class="r">${esc(L('Dia', 'Day'))}</th><th class="r">${esc(L('Volume negociado', 'Traded volume'))}</th><th class="r">${esc(L('Cotação de', 'Quote at'))}</th></tr></thead><tbody>${rows.map(([t, n, i]) => {
    const x = Q && Q[yahoo(t)];
    const cur = ETF.tab === 'br' ? 'BRL' : 'USD';
    return `<tr><td><b>${esc(t)}</b></td><td>${esc(n)}</td><td class="muted">${esc(i)}</td><td class="r num">${x ? esc(fmtMoney(x.p, cur, [2, 2])) : '—'}</td><td class="r">${x ? chg(x.chg, 2, 'sm') : '—'}</td><td class="r">${x && isNum(x.vol) ? esc(fmtCompact(x.vol * x.p, cur)) : '—'}</td><td class="r small faint">${x && x.t ? esc(fmtDateTime(x.t)) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  box.innerHTML = panelHead('building-2', L('ETFs à vista', 'Spot ETFs'), { sub: esc(L('Lista de fundos conferida em out/2026. Cotas com atraso de até 30 min, trazidas pelo robô do NEXUS.', 'Fund list checked in Oct/2026. Quotes delayed up to 30 min, via the NEXUS bot.')), right: `<div class="row wrap" style="gap:8px">${seg('etft', [['btc', 'Bitcoin (EUA)'], ['eth', 'Ethereum (EUA)'], ['br', L('Brasil (B3)', 'Brazil (B3)')]], ETF.tab)}${stamp('etfq')}</div>` }) + tbl +
    note(L('"Volume negociado" é quanto as cotas giraram na bolsa no dia — não é entrada nem saída de dinheiro do fundo. Novos fundos podem estrear e emissores podem mudar; confirme nos sites das gestoras.', '"Traded volume" is how much the shares traded that day — not fund inflows/outflows. New funds may launch and issuers may change; confirm on issuer sites.'));
}
ACT.seg_etft = (v) => { ETF.tab = v; drawEtfList(); };
function drawEtfFlows() {
  setHTML('#etf-flows', panelHead('chart-column', L('Entradas e saídas diárias', 'Daily inflows & outflows')) + `<div class="callout">${ico('info', 18)}<span>${esc(L('Os fluxos diários só são publicados por empresas especializadas, sem acesso gratuito pelo navegador. Para não mostrar número estimado como se fosse real, deixamos os links de quem mede de verdade:', 'Daily flows are published by specialist firms, without free browser access. Rather than show estimates as real, here are the sources that measure them:'))}</span></div>
    <div class="list mt">${[['https://farside.co.uk/btc/', 'Farside Investors', L('tabela diária por fundo (BTC)', 'daily table per fund (BTC)')], ['https://farside.co.uk/eth/', 'Farside Investors', L('tabela diária por fundo (ETH)', 'daily table per fund (ETH)')], ['https://sosovalue.com/assets/etf/us-btc-spot', 'SoSoValue', L('gráficos de fluxo e patrimônio (AUM)', 'flow and AUM charts')], ['https://www.theblock.co/data/crypto-markets/bitcoin-etf', 'The Block', L('painel de dados dos ETFs', 'ETF data dashboard')]].map(([u, t, s]) => `<a class="li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m">${esc(s)}</span></span>${ico('external-link', 15)}</a>`).join('')}</div>`);
}
function drawEtfCalc() {
  const btc = PX.BTCUSDT && PX.BTCUSDT.p, r = brlRate();
  const v = ETF.calc;
  setHTML('#etf-calc', panelHead('calculator', L('Quanto vale uma quantidade de BTC hoje', 'What an amount of BTC is worth today'), { sub: esc(L('Útil para estimar o AUM de um fundo a partir dos BTC que ele declara.', 'Handy to estimate a fund’s AUM from the BTC it reports.')), right: stamp('px-rest', 'Binance') }) +
    `<div class="fld"><label for="etf-q">${esc(L('Quantidade de BTC', 'BTC amount'))}</label><input class="inp" id="etf-q" type="number" min="0" step="any" inputmode="decimal" value="${esc(v)}" data-inp="etfCalc"></div>
    <div class="grid g-2 mt" id="etf-calc-out">${kpiBox(L('Em dólar', 'In USD'), btc ? esc(usd(v * btc, [0, 2])) : '—')}${kpiBox(L('Em reais', 'In BRL'), btc && r ? esc(brl(v * btc * r.v, [0, 2])) : '—')}</div>`);
}
ACT.etfCalc = (el) => {
  ETF.calc = Math.max(0, num(el.value) || 0);
  const btc = PX.BTCUSDT && PX.BTCUSDT.p, r = brlRate();
  setHTML('#etf-calc-out', kpiBox(L('Em dólar', 'In USD'), btc ? esc(usd(ETF.calc * btc, [0, 2])) : '—') + kpiBox(L('Em reais', 'In BRL'), btc && r ? esc(brl(ETF.calc * btc * r.v, [0, 2])) : '—'));
};
onPrice((set) => { if (S.page === 'etf' && set.has('ETFQ')) drawEtfList(); });
page({
  id: 'etf', group: 'analise', icon: 'building-2', pt: 'ETFs', en: 'ETFs',
  sub: 'Os fundos de bitcoin e ethereum negociados em bolsa, explicados em linguagem simples.',
  subEn: 'Bitcoin and ether exchange-traded funds, explained in plain language.',
  init(el) { el.innerHTML = etfHtml(); drawEtfList(); drawEtfFlows(); drawEtfCalc(); },
  show() { drawEtfList(); },
});

// ---------- BALEIAS E TESOURARIAS ----------
// BTC: distribuição por tamanho de carteira e os 100 maiores endereços (BitInfoCharts, pelo robô)
// e as empresas com BTC no caixa (CoinGecko). ETH: empresas com ETH no caixa.
const WH = { asset: 'bitcoin', filt: 'all', all: false, coAll: false };
function registerWhaleSources() {
  for (const a of ['bitcoin', 'ethereum']) {
    source({
      id: 'tre-' + a, label: L(`Tesourarias (${a === 'bitcoin' ? 'BTC' : 'ETH'})`, `Treasuries (${a === 'bitcoin' ? 'BTC' : 'ETH'})`), provider: 'CoinGecko', every: 6 * 3600e3, persist: false,
      need: () => S.page === 'whales' && WH.asset === a,
      run: async () => getJSON(`https://api.coingecko.com/api/v3/companies/public_treasury/${a}`, { timeout: 15000 }),
      validate: (d) => Array.isArray(d.companies) && d.companies.length > 3,
      onData: () => _markDirty('TRE'),
    });
  }
  source({
    id: 'whales', label: L('Maiores endereços de BTC', 'Largest BTC addresses'), provider: 'BitInfoCharts', every: 60 * 60e3, persist: false,
    need: () => S.page === 'whales' && WH.asset === 'bitcoin',
    run: async () => getPipeline('whales', 30 * 3600e3),
    validate: (d) => Array.isArray(d.top) && d.top.length > 50 && Array.isArray(d.dist) && d.dist.length > 5,
    onData: (d) => { if (HEALTH.whales) HEALTH.whales.dataTs = Date.parse(d.generatedAt); _markDirty('WHALES'); },
  });
}
function whalesHtml() {
  return `${pageHead(PAGES.whales, seg('wh', [['bitcoin', 'Bitcoin'], ['ethereum', 'Ethereum']], WH.asset, 'lg'))}
  <div id="wh-btc"${WH.asset === 'bitcoin' ? '' : ' hidden'}>
    <section class="panel" id="wh-sum"></section>
    <section class="panel mt" id="wh-dist"></section>
    <section class="panel flush mt" id="wh-top"></section>
  </div>
  <section class="panel flush mt" id="wh-tbl"></section>
  <section class="panel mt" id="wh-links"></section>`;
}
const WH_EXCH = /(binance|bitfinex|robinhood|okx|okex|kraken|coinbase|bybit|huobi|htx|gemini|bitstamp|crypto\.com|upbit|bithumb|kucoin|gate\.io|gateio|mexc|bitget|cash ?app|bittrex|poloniex|bitflyer|coincheck|deribit|bitmex|bitpanda|luno|bitso|mercado ?bitcoin|foxbit|novadax)/i;
function whLabel(raw) {
  if (!raw) return { n: '', exch: false };
  const parts = String(raw).split('-');
  const kind = (parts.length > 1 ? parts.pop() : '').toLowerCase();
  const name = parts.join(' ').trim() || raw;
  const k = { coldwallet: L('carteira fria', 'cold wallet'), wallet: L('carteira', 'wallet'), hotwallet: L('carteira quente', 'hot wallet'), reserve: L('reserva', 'reserve'), recovery: L('recuperação', 'recovery'), confiscated: L('confiscado', 'confiscated'), hack: 'hack' }[kind] || kind;
  return { n: k ? `${name} (${k})` : name, exch: WH_EXCH.test(raw) && !/hack|fbi|government|governo|confiscat/i.test(raw) };
}
const whDate = (s) => { const t = Date.parse(String(s || '').replace(' UTC', 'Z').replace(' ', 'T')); return isNum(t) ? t : null; };
function whAgeTxt(t) {
  if (!t) return L('nunca enviou', 'never sent');
  const d = (Date.now() - t) / 86400e3;
  if (d < 1) return L('hoje', 'today');
  if (d < 60) { const n = Math.max(1, Math.round(d)); return L(`há ${n} ${n === 1 ? 'dia' : 'dias'}`, `${n} ${n === 1 ? 'day' : 'days'} ago`); }
  if (d < 730) return L(`há ${Math.round(d / 30.4)} meses`, `${Math.round(d / 30.4)} months ago`);
  return L(`há ${fmtNum(d / 365.25, 0, 1)} anos`, `${fmtNum(d / 365.25, 0, 1)} years ago`);
}
// faixas da BitInfoCharts agrupadas nos apelidos que o mercado usa
const WH_TIERS = () => [
  { n: L('Camarões', 'Shrimps'), r: L('menos de 1 BTC', 'under 1 BTC'), max: 1, c: '#7dd3fc' },
  { n: L('Caranguejos', 'Crabs'), r: '1–10 BTC', max: 10, c: '#5eead4' },
  { n: L('Peixes', 'Fish'), r: '10–100 BTC', max: 100, c: '#86efac' },
  { n: L('Tubarões', 'Sharks'), r: '100–1.000 BTC', max: 1000, c: '#fbbf24' },
  { n: L('Baleias', 'Whales'), r: '1.000–10.000 BTC', max: 10000, c: '#fb923c' },
  { n: L('Megabaleias', 'Mega whales'), r: L('10.000 BTC ou mais', '10,000 BTC or more'), max: Infinity, c: '#f87171' },
];
function whRangeMin(r) { const m = String(r).match(/[[(]\s*([\d.,]+)/); return m ? parseFloat(m[1].replace(/,/g, '')) : 0; }
function whTiers(dist) {
  const T = WH_TIERS().map((t) => ({ ...t, addr: 0, coins: 0 }));
  for (const d of dist) { const lo = whRangeMin(d.range); const t = T.find((x) => lo < x.max); if (t) { t.addr += d.addr || 0; t.coins += d.coins || 0; } }
  return T;
}
function drawWhSum() {
  const box = $('#wh-sum'); if (!box) return;
  const w = CACHE.get('whales'); const W = w && w.v;
  const head = panelHead('fish', L('Quem guarda os bitcoins', 'Who holds the bitcoins'), { sub: esc(L('Endereços grandes, corretoras e empresas. Um endereço não é uma pessoa: corretoras guardam as moedas de milhões de clientes em poucos endereços.', 'Large addresses, exchanges and companies. An address is not a person: exchanges keep millions of clients’ coins in a few addresses.')), right: stamp('whales') });
  if (!W) { setHTML(box, head + (HEALTH.whales && HEALTH.whales.ok === false ? `<div class="callout">${ico('wifi-off', 18)}<span>${esc(L('O ranking de endereços não chegou agora. Veja direto na fonte:', 'The address ranking is not available right now. See it at the source:'))} ${extLink('https://bitinfocharts.com/pt/top-100-richest-bitcoin-addresses.html', 'BitInfoCharts')}</span></div>` : skel(3, 22))); return; }
  const live = PX.BTCUSDT && PX.BTCUSDT.p;
  const m = CACHE.get('mempool'); const supply = m ? supplyAt(m.v.height) : W.dist.reduce((s, d) => s + (d.coins || 0), 0);
  const T = whTiers(W.dist); const big = T.slice(4);
  const bigAddr = big.reduce((s, t) => s + t.addr, 0), bigCoins = big.reduce((s, t) => s + t.coins, 0);
  const topSum = W.top.reduce((s, x) => s + (x.bal || 0), 0);
  const exch = W.top.filter((x) => whLabel(x.label).exch);
  const exchSum = exch.reduce((s, x) => s + (x.bal || 0), 0);
  const tre = CACHE.get('tre-bitcoin'); const coTot = tre && num(tre.v.total_holdings);
  const pct = (v) => (isNum(v) && supply ? fmtPct(v / supply * 100, 1, false) : '—');
  setHTML(box, head + `<div class="wh-kpis">
    ${kpiBox(L('Baleias (1.000 BTC ou mais)', 'Whales (1,000+ BTC)'), esc(fmtNum(bigAddr, 0, 0)) + ` <small class="faint">${esc(L('endereços', 'addresses'))}</small>`, `${esc(L('guardam', 'hold'))} <b>${esc(fmtNum(bigCoins, 0, 0))} BTC</b> · ${esc(pct(bigCoins))} ${esc(L('da oferta', 'of supply'))}`)}
    ${kpiBox(L('100 maiores endereços', 'Top 100 addresses'), esc(fmtNum(topSum, 0, 0)) + ' BTC', `${esc(pct(topSum))} ${esc(L('da oferta', 'of supply'))}${live ? ` · ${esc(fmtCompact(topSum * live))}` : ''}`)}
    ${kpiBox(L('Corretoras no top 100', 'Exchanges in the top 100'), esc(fmtNum(exch.length, 0, 0)) + ` <small class="faint">${esc(L('endereços', 'addresses'))}</small>`, `${esc(fmtNum(exchSum, 0, 0))} BTC · ${esc(pct(exchSum))} ${esc(L('da oferta', 'of supply'))}`)}
    ${kpiBox(L('Empresas de capital aberto', 'Public companies'), isNum(coTot) ? esc(fmtNum(coTot, 0, 0)) + ' BTC' : '—', isNum(coTot) ? `${esc(pct(coTot))} ${esc(L('da oferta', 'of supply'))} · CoinGecko` : esc(L('carregando…', 'loading…')))}
  </div>`);
}
function drawWhDist() {
  const box = $('#wh-dist'); if (!box) return;
  const w = CACHE.get('whales'); const W = w && w.v;
  const head = panelHead('chart-bar-big', L('Quanto cada tamanho de carteira guarda', 'How much each wallet size holds'), { sub: esc(L('Endereços agrupados pelo saldo, com os apelidos que o mercado usa. A barra mostra a fatia de todos os bitcoins.', 'Addresses grouped by balance, with the nicknames the market uses. The bar shows the share of all bitcoins.')), right: stamp('whales') });
  if (!W) { setHTML(box, head + skel(4, 20)); return; }
  const live = PX.BTCUSDT && PX.BTCUSDT.p;
  const T = whTiers(W.dist); const tot = T.reduce((s, t) => s + t.coins, 0) || 1; const totA = T.reduce((s, t) => s + t.addr, 0) || 1;
  const stack = `<div class="wh-stack">${T.map((t) => `<i style="width:${t.coins / tot * 100}%;background:${t.c}" title="${esc(`${t.n}: ${fmtPct(t.coins / tot * 100, 1, false)}`)}"></i>`).join('')}</div>`;
  const rows = T.map((t) => `<div class="wh-tier"><span class="sw" style="background:${t.c}"></span><span class="grow"><b>${esc(t.n)}</b><span class="faint tiny">${esc(t.r)}</span></span>
    <span class="c"><b>${esc(fmtPct(t.coins / tot * 100, 1, false))}</b><span class="tiny faint">${esc(fmtNum(t.coins, 0, 0))} BTC</span></span>
    <span class="c hide-m"><b>${esc(fmtCompact(t.addr, ''))}</b><span class="tiny faint">${esc(L('endereços', 'addresses'))} · ${esc(t.addr / totA * 100 < 0.001 ? '<0,001%' : fmtPct(t.addr / totA * 100, t.addr / totA < 0.001 ? 3 : 1, false))}</span></span>
    <span class="c hide-m">${live ? `<b>${esc(fmtCompact(t.coins * live))}</b><span class="tiny faint">${esc(L('valor agora', 'value now'))}</span>` : ''}</span></div>`).join('');
  const det = `<details class="wh-det"><summary>${esc(L('Ver as 12 faixas detalhadas', 'See the 12 detailed ranges'))}</summary><div class="tbl-wrap" style="margin:8px 0 0"><table class="tbl"><thead><tr><th>${esc(L('Saldo (BTC)', 'Balance (BTC)'))}</th><th class="r">${esc(L('Endereços', 'Addresses'))}</th><th class="r">${esc(L('% dos endereços', '% of addresses'))}</th><th class="r">BTC</th><th class="r">${esc(L('% das moedas', '% of coins'))}</th></tr></thead><tbody>${W.dist.map((d) => `<tr><td>${esc(d.range)}</td><td class="r">${esc(fmtNum(d.addr, 0, 0))}</td><td class="r">${esc(fmtPct(d.addrPct, 2, false))}</td><td class="r">${esc(fmtNum(d.coins, 0, d.coins < 100 ? 2 : 0))}</td><td class="r">${esc(fmtPct(d.coinsPct, 2, false))}</td></tr>`).join('')}</tbody></table></div></details>`;
  setHTML(box, head + stack + `<div class="wh-tiers">${rows}</div>` + det + note(L('Fonte: BitInfoCharts (atualizado pelo robô a cada 6 horas). O valor em dólar usa o preço ao vivo. Endereços de corretoras e custodiantes de ETFs aparecem como "megabaleias", mas guardam moedas de muitos clientes.', 'Source: BitInfoCharts (updated by the robot every 6 hours). Dollar value uses the live price. Exchange and ETF-custodian addresses show up as "mega whales" but hold many clients’ coins.')));
}
function drawWhTop() {
  const box = $('#wh-top'); if (!box) return;
  const w = CACHE.get('whales'); const W = w && w.v;
  const head = `<div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('crown', 18)}${esc(L('Os 100 maiores endereços de bitcoin', 'The 100 largest bitcoin addresses'))}</h2><p class="panel-s">${esc(L('Saldo, dono conhecido (quando identificado) e quando o endereço enviou moedas pela última vez.', 'Balance, known owner (when identified) and when the address last sent coins.'))}</p></div>${seg('whf', [['all', L('Todos', 'All')], ['exch', L('Corretoras', 'Exchanges')], ['other', L('Outros donos', 'Other owners')], ['anon', L('Sem dono conhecido', 'Unknown owner')]], WH.filt)}</div>`;
  if (!W) { setHTML(box, head + `<div style="padding:0 18px 18px">${skel(6, 18)}</div>`); return; }
  const live = PX.BTCUSDT && PX.BTCUSDT.p;
  const list = W.top.map((x) => ({ ...x, lb: whLabel(x.label) })).filter((x) => WH.filt === 'all' || (WH.filt === 'exch' ? x.lb.exch : WH.filt === 'other' ? x.lb.n && !x.lb.exch : !x.lb.n));
  const shown = WH.all ? list : list.slice(0, 20);
  const short = (a) => (a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  const rows = shown.map((x) => {
    const out = whDate(x.lastOut); const inn = whDate(x.lastIn);
    const dormant = !out || Date.now() - out > 3 * 365.25 * 86400e3;
    return `<tr><td class="r rank">${x.r}</td><td><a class="mono" href="${esc(safeUrl('https://mempool.space/pt/address/' + x.a))}" target="_blank" rel="noopener noreferrer" title="${esc(x.a)}">${esc(short(x.a))}</a>${x.lb.n ? `<div class="tiny ${x.lb.exch ? 'wh-ex' : 'muted'}">${x.lb.exch ? ico('landmark', 12) : ''}${esc(x.lb.n)}</div>` : ''}</td>
      <td class="r num">${esc(fmtNum(x.bal, 0, 0))}</td><td class="r">${esc(fmtPct(x.pct, 2, false))}</td><td class="r">${live ? esc(fmtCompact(x.bal * live)) : '—'}</td>
      <td>${dormant ? `<span class="badge">${esc(L('parado', 'dormant'))}</span> ` : ''}<span class="small">${esc(whAgeTxt(out))}</span></td><td class="small muted">${inn ? esc(whAgeTxt(inn)) : '—'}</td></tr>`;
  }).join('');
  setHTML(box, head + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="r">#</th><th>${esc(L('Endereço', 'Address'))}</th><th class="r">BTC</th><th class="r">${esc(L('% da oferta', '% of supply'))}</th><th class="r">${esc(L('Valor agora', 'Value now'))}</th><th>${esc(L('Última saída', 'Last sent'))}</th><th>${esc(L('Última entrada', 'Last received'))}</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="center faint">${esc(L('Nenhum endereço neste filtro.', 'No address in this filter.'))}</td></tr>`}</tbody></table></div>
    <div class="row wrap between" style="padding:10px 18px 16px;gap:8px">${list.length > 20 ? `<button class="btn sm" data-act="whAll">${ico(WH.all ? 'chevron-up' : 'chevron-down', 15)}${esc(WH.all ? L('Mostrar menos', 'Show less') : L(`Mostrar todos (${list.length})`, `Show all (${list.length})`))}</button>` : '<span></span>'}<span class="tiny faint">${esc(L('"Parado" = não envia moedas há mais de 3 anos. Clique no endereço para ver no mempool.space. Fonte: BitInfoCharts.', '"Dormant" = has not sent coins for over 3 years. Click an address to open it on mempool.space. Source: BitInfoCharts.'))}</span></div>`);
}
function drawWhales() {
  const isBtc = WH.asset === 'bitcoin';
  const bx = $('#wh-btc'); if (bx) bx.hidden = !isBtc;
  if (isBtc) { drawWhSum(); drawWhDist(); drawWhTop(); }
  drawWhCompanies();
}
function drawWhCompanies() {
  const c = CACHE.get('tre-' + WH.asset); const D = c && c.v;
  const sym = WH.asset === 'bitcoin' ? 'BTC' : 'ETH', pair = sym + 'USDT';
  const live = PX[pair] && PX[pair].p;
  const head = `<div class="panel-h" style="padding:16px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('building-2', 18)}${esc(L(`Empresas de capital aberto com ${sym} no caixa`, `Public companies holding ${sym}`))}</h2><p class="panel-s">${esc(L('Quantidade declarada por cada empresa (CoinGecko). O valor usa o preço ao vivo.', 'Holdings reported by each company (CoinGecko). Value uses the live price.'))}</p></div>${stamp('tre-' + WH.asset)}</div>`;
  if (!D) { setHTML('#wh-tbl', head + `<div style="padding:0 18px 18px">${HEALTH['tre-' + WH.asset] && HEALTH['tre-' + WH.asset].ok === false ? emptyBox('wifi-off', L('Lista indisponível agora', 'List unavailable'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : skel(5, 20)}</div>`); return; }
  const tot = num(D.total_holdings);
  const m = CACHE.get('mempool'); const supply = sym === 'BTC' && m ? supplyAt(m.v.height) : (CGM[WH.asset] && CGM[WH.asset].circulating_supply);
  const first = num(D.companies[0] && D.companies[0].total_holdings) || 1;
  const list = WH.coAll ? D.companies : D.companies.slice(0, 15);
  const rows = list.map((x, i) => {
    const val = live ? x.total_holdings * live : x.total_current_value_usd;
    const entry = num(x.total_entry_value_usd);
    const pl = entry > 0 && val ? (val / entry - 1) * 100 : null;
    return `<tr><td class="r rank">${i + 1}</td><td><b>${esc(x.name)}</b><div class="tiny faint">${esc(x.symbol || '')}${x.country ? ' · ' + esc(x.country) : ''}</div></td><td class="wh-barc"><div class="bar"><i style="width:${clamp(x.total_holdings / first * 100, 1, 100)}%;background:${sym === 'BTC' ? '#f7931a' : '#8e98ff'}"></i></div></td><td class="r num">${esc(fmtNum(x.total_holdings, 0, 0))}</td><td class="r">${esc(fmtCompact(val))}</td><td class="r">${entry > 0 ? esc(fmtCompact(entry)) : '—'}</td><td class="r">${isNum(pl) ? chg(pl, 1, 'sm') : '—'}</td><td class="r">${esc(fmtPct(x.percentage_of_total_supply, 3, false))}</td></tr>`;
  }).join('');
  const sum = `<div class="row wrap" style="gap:8px 26px;padding:0 18px 12px">${kpiBox(L('Total em empresas', 'Held by companies'), esc(`${fmtNum(tot, 0, 0)} ${sym}`), live ? esc(L(`vale ${fmtCompact(tot * live)} agora`, `worth ${fmtCompact(tot * live)} now`)) : '')}${kpiBox(L('Fatia da oferta', 'Share of supply'), isNum(supply) && supply > 0 ? esc(fmtPct(tot / supply * 100, 2, false)) : '—', esc(L('de todas as moedas em circulação', 'of all circulating coins')))}${kpiBox(L('Empresas na lista', 'Companies listed'), esc(fmtNum(D.companies.length, 0, 0)))}</div>`;
  setHTML('#wh-tbl', head + sum + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="r">#</th><th>${esc(L('Empresa', 'Company'))}</th><th class="hide-m"></th><th class="r">${esc(sym)}</th><th class="r">${esc(L('Valor agora', 'Value now'))}</th><th class="r">${esc(L('Custo declarado', 'Reported cost'))}</th><th class="r">${esc(L('Resultado', 'P/L'))}</th><th class="r">${esc(L('% da oferta', '% of supply'))}</th></tr></thead><tbody>${rows}</tbody></table></div><div class="row wrap between" style="padding:10px 18px 16px;gap:8px">${D.companies.length > 15 ? `<button class="btn sm" data-act="whCoAll">${ico(WH.coAll ? 'chevron-up' : 'chevron-down', 15)}${esc(WH.coAll ? L('Mostrar menos', 'Show less') : L(`Mostrar todas (${D.companies.length})`, `Show all (${D.companies.length})`))}</button>` : '<span></span>'}<span class="tiny faint">${esc(L('Custo e quantidade são os declarados pelas empresas, compilados pelo CoinGecko; podem atrasar alguns dias em relação aos comunicados oficiais.', 'Cost and holdings as reported by companies, compiled by CoinGecko; may lag official filings by a few days.'))}</span></div>`);
}
function drawWhaleLinks() {
  setHTML('#wh-links', panelHead('radar', L('Acompanhar em tempo real', 'Track in real time'), { sub: esc(L('Fontes que mostram movimentações grandes e quem é quem nas carteiras.', 'Sources that show large movements and who’s who in wallets.')) }) +
    `<div class="list">${[['https://bitinfocharts.com/pt/top-100-richest-bitcoin-addresses.html', L('100 maiores endereços de bitcoin', 'Top 100 bitcoin addresses'), 'BitInfoCharts'], ['https://bitcointreasuries.net/', L('Tesourarias: empresas, fundos e governos', 'Treasuries: companies, funds and governments'), 'BitcoinTreasuries'], ['https://whale-alert.io/', L('Alertas de transações grandes', 'Large-transaction alerts'), 'Whale Alert'], ['https://intel.arkm.com/', L('Quem é quem nas carteiras (entidades)', 'Who’s who in wallets (entities)'), 'Arkham'], ['https://etherscan.io/accounts', L('Maiores contas de Ethereum', 'Largest Ethereum accounts'), 'Etherscan']].map(([u, t, s]) => `<a class="li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m">${esc(s)}</span></span>${ico('external-link', 15)}</a>`).join('')}</div>`);
}
ACT.seg_wh = (v) => { WH.asset = v; drawWhales(); runSource('tre-' + v); if (v === 'bitcoin') runSource('whales'); };
ACT.seg_whf = (v) => { WH.filt = v; drawWhTop(); };
ACT.whAll = () => { WH.all = !WH.all; drawWhTop(); };
ACT.whCoAll = () => { WH.coAll = !WH.coAll; drawWhCompanies(); };
let _whT = 0;
onPrice((set) => {
  if (S.page !== 'whales') return;
  if (set.has('TRE') || set.has('MEMPOOL') || set.has('WHALES')) drawWhales();
  else if ((set.has('BTCUSDT') || set.has('ETHUSDT')) && Date.now() - _whT > 8000) { _whT = Date.now(); drawWhales(); }
});
page({
  id: 'whales', group: 'analise', icon: 'fish', pt: 'Baleias e tesourarias', en: 'Whales & treasuries',
  sub: 'Quem guarda mais bitcoin e ether: baleias, corretoras, os 100 maiores endereços e as empresas com cripto no caixa.',
  subEn: 'Who holds the most bitcoin and ether: whales, exchanges, the 100 largest addresses and companies holding crypto.',
  init(el) { el.innerHTML = whalesHtml(); drawWhales(); drawWhaleLinks(); },
  show() { drawWhales(); },
});
