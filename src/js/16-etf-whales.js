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
const WH = { asset: 'bitcoin' };
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
}
function whalesHtml() {
  return `${pageHead(PAGES.whales, seg('wh', [['bitcoin', 'Bitcoin'], ['ethereum', 'Ethereum']], WH.asset, 'lg'))}
  <section class="panel" id="wh-sum"></section>
  <section class="panel flush mt" id="wh-tbl"></section>
  <section class="panel mt" id="wh-links"></section>`;
}
function drawWhales() {
  const c = CACHE.get('tre-' + WH.asset); const D = c && c.v;
  const sym = WH.asset === 'bitcoin' ? 'BTC' : 'ETH', pair = sym + 'USDT';
  const live = PX[pair] && PX[pair].p;
  const head = panelHead('building-2', L(`Empresas de capital aberto com ${sym} no caixa`, `Public companies holding ${sym}`), { sub: esc(L('Quantidade declarada por cada empresa (CoinGecko). O valor usa o preço ao vivo.', 'Holdings reported by each company (CoinGecko). Value uses the live price.')), right: stamp('tre-' + WH.asset) });
  if (!D) { setHTML('#wh-sum', head + (HEALTH['tre-' + WH.asset] && HEALTH['tre-' + WH.asset].ok === false ? emptyBox('wifi-off', L('Lista indisponível agora', 'List unavailable'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : skel(3, 20))); setHTML('#wh-tbl', ''); return; }
  const tot = num(D.total_holdings);
  const m = CACHE.get('mempool'); const supply = sym === 'BTC' && m ? supplyAt(m.v.height) : (CGM[WH.asset] && CGM[WH.asset].circulating_supply);
  setHTML('#wh-sum', head + `<div class="grid g-3" style="gap:14px">${kpiBox(L('Total em empresas', 'Held by companies'), esc(`${fmtNum(tot, 0, 0)} ${sym}`), live ? esc(L(`vale ${fmtCompact(tot * live)} agora`, `worth ${fmtCompact(tot * live)} now`)) : '')}${kpiBox(L('Fatia da oferta', 'Share of supply'), isNum(supply) && supply > 0 ? esc(fmtPct(tot / supply * 100, 2, false)) : '—', esc(L('de todas as moedas em circulação', 'of all circulating coins')))}${kpiBox(L('Empresas na lista', 'Companies listed'), esc(fmtNum(D.companies.length, 0, 0)))}</div>`);
  const rows = D.companies.slice(0, 60).map((x, i) => {
    const val = live ? x.total_holdings * live : x.total_current_value_usd;
    const entry = num(x.total_entry_value_usd);
    const pl = entry > 0 && val ? (val / entry - 1) * 100 : null;
    return `<tr><td class="r rank">${i + 1}</td><td><b>${esc(x.name)}</b><div class="tiny faint">${esc(x.symbol || '')}</div></td><td>${esc(x.country || '')}</td><td class="r num">${esc(fmtNum(x.total_holdings, 0, 2))}</td><td class="r">${esc(fmtCompact(val))}</td><td class="r">${entry > 0 ? esc(fmtCompact(entry)) : '—'}</td><td class="r">${isNum(pl) ? chg(pl, 1, 'sm') : '—'}</td><td class="r">${esc(fmtPct(x.percentage_of_total_supply, 3, false))}</td></tr>`;
  }).join('');
  setHTML('#wh-tbl', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="r">#</th><th>${esc(L('Empresa', 'Company'))}</th><th>${esc(L('País', 'Country'))}</th><th class="r">${esc(sym)}</th><th class="r">${esc(L('Valor agora', 'Value now'))}</th><th class="r">${esc(L('Custo declarado', 'Reported cost'))}</th><th class="r">${esc(L('Resultado', 'P/L'))}</th><th class="r">${esc(L('% da oferta', '% of supply'))}</th></tr></thead><tbody>${rows}</tbody></table></div><div style="padding:0 18px 16px">${note(L('Custo e quantidade são os declarados pelas empresas, compilados pelo CoinGecko; podem atrasar alguns dias em relação aos comunicados oficiais.', 'Cost and holdings as reported by companies, compiled by CoinGecko; may lag official filings by a few days.'))}</div>`);
}
function drawWhaleLinks() {
  setHTML('#wh-links', panelHead('fish', L('Carteiras gigantes e movimentações', 'Giant wallets & movements'), { sub: esc(L('Ranking de endereços e alertas de transações grandes, nas fontes que acompanham isso em tempo real.', 'Address rankings and large-transaction alerts, at the sources that track them in real time.')) }) +
    `<div class="list">${[['https://bitinfocharts.com/pt/top-100-richest-bitcoin-addresses.html', L('100 maiores endereços de bitcoin', 'Top 100 bitcoin addresses'), 'BitInfoCharts'], ['https://bitcointreasuries.net/', L('Tesourarias: empresas, fundos e governos', 'Treasuries: companies, funds and governments'), 'BitcoinTreasuries'], ['https://whale-alert.io/', L('Alertas de transações grandes', 'Large-transaction alerts'), 'Whale Alert'], ['https://intel.arkm.com/', L('Quem é quem nas carteiras (entidades)', 'Who’s who in wallets (entities)'), 'Arkham']].map(([u, t, s]) => `<a class="li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m">${esc(s)}</span></span>${ico('external-link', 15)}</a>`).join('')}</div>`);
}
ACT.seg_wh = (v) => { WH.asset = v; drawWhales(); runSource('tre-' + v); };
let _whT = 0;
onPrice((set) => {
  if (S.page !== 'whales') return;
  if (set.has('TRE') || set.has('MEMPOOL')) drawWhales();
  else if ((set.has('BTCUSDT') || set.has('ETHUSDT')) && Date.now() - _whT > 5000) { _whT = Date.now(); drawWhales(); }
});
page({
  id: 'whales', group: 'analise', icon: 'fish', pt: 'Baleias e tesourarias', en: 'Whales & treasuries',
  sub: 'Quem guarda mais bitcoin e ether: empresas de capital aberto e as maiores carteiras.',
  subEn: 'Who holds the most bitcoin and ether: public companies and the largest wallets.',
  init(el) { el.innerHTML = whalesHtml(); drawWhales(); drawWhaleLinks(); },
  show() { drawWhales(); },
});
