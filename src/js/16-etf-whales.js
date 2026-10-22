// =====================================================================
// ETFs — o que são, lista de fundos à vista (BTC e ETH, EUA e B3), cotação
// das cotas pelo robô e calculadora. Fluxos diários: links para quem mede.
// BALEIAS E TESOURARIAS — empresas que guardam BTC/ETH (CoinGecko),
// avaliadas pelo preço ao vivo, e links para carteiras gigantes.
// =====================================================================
// ETFs à vista por moeda — lista conferida em out/2026 (sites das gestoras, CoinDesk, TokenPost).
// [ticker, fundo, gestora, bolsa]; ticker sem cota no Yahoo aparece com "—" (nunca número inventado)
const ETF_ASSETS = [
  { k: 'btc', n: 'Bitcoin', b: 'BTC', s: 'BTCUSDT', cg: 'bitcoin', funds: [
    ['IBIT', 'iShares Bitcoin Trust', 'BlackRock'], ['FBTC', 'Fidelity Wise Origin Bitcoin Fund', 'Fidelity'], ['GBTC', 'Grayscale Bitcoin Trust', 'Grayscale'], ['BTC', 'Grayscale Bitcoin Mini Trust', 'Grayscale'],
    ['ARKB', 'ARK 21Shares Bitcoin ETF', 'ARK Invest & 21Shares'], ['BITB', 'Bitwise Bitcoin ETF', 'Bitwise'], ['HODL', 'VanEck Bitcoin ETF', 'VanEck'], ['BTCO', 'Invesco Galaxy Bitcoin ETF', 'Invesco & Galaxy'],
    ['BTCW', 'WisdomTree Bitcoin Fund', 'WisdomTree'], ['EZBC', 'Franklin Bitcoin ETF', 'Franklin Templeton'], ['BRRR', 'CoinShares Bitcoin ETF', 'CoinShares'],
    ['BITH11', 'Hashdex Bitcoin', 'Hashdex', 'br'], ['QBTC11', 'QR CME CF Bitcoin Reference Rate', 'QR Asset', 'br']] },
  { k: 'eth', n: 'Ethereum', b: 'ETH', s: 'ETHUSDT', cg: 'ethereum', funds: [
    ['ETHA', 'iShares Ethereum Trust', 'BlackRock'], ['FETH', 'Fidelity Ethereum Fund', 'Fidelity'], ['ETHE', 'Grayscale Ethereum Trust', 'Grayscale'], ['ETH', 'Grayscale Ethereum Mini Trust', 'Grayscale'],
    ['ETHW', 'Bitwise Ethereum ETF', 'Bitwise'], ['CETH', '21Shares Core Ethereum ETF', '21Shares'], ['ETHV', 'VanEck Ethereum ETF', 'VanEck'], ['QETH', 'Invesco Galaxy Ethereum ETF', 'Invesco & Galaxy'], ['EZET', 'Franklin Ethereum ETF', 'Franklin Templeton'],
    ['ETHE11', 'Hashdex Ethereum', 'Hashdex', 'br'], ['QETH11', 'QR CME CF Ether Reference Rate', 'QR Asset', 'br']] },
  { k: 'sol', n: 'Solana', b: 'SOL', s: 'SOLUSDT', cg: 'solana', funds: [
    ['BSOL', 'Bitwise Solana Staking ETF', 'Bitwise'], ['GSOL', 'Grayscale Solana Trust ETF', 'Grayscale'], ['FSOL', 'Fidelity Solana Fund', 'Fidelity'], ['VSOL', 'VanEck Solana ETF', 'VanEck'], ['TSOL', '21Shares Solana ETF', '21Shares'], ['QSOL', 'Invesco Galaxy Solana ETF', 'Invesco & Galaxy'],
    ['SOLH11', 'Hashdex Solana', 'Hashdex', 'br'], ['QSOL11', 'QR Solana', 'QR Asset', 'br']] },
  { k: 'xrp', n: 'XRP', b: 'XRP', s: 'XRPUSDT', cg: 'ripple', funds: [
    ['XRP', 'Bitwise XRP ETF', 'Bitwise'], ['XRPC', 'Canary XRP ETF', 'Canary Capital'], ['XRPZ', 'Franklin XRP ETF', 'Franklin Templeton'], ['GXRP', 'Grayscale XRP Trust ETF', 'Grayscale'], ['TOXR', '21Shares XRP ETF', '21Shares'], ['XRPR', 'REX-Osprey XRP ETF', 'REX-Osprey'],
    ['XRPH11', 'Hashdex XRP', 'Hashdex', 'br']] },
  { k: 'doge', n: 'Dogecoin', b: 'DOGE', s: 'DOGEUSDT', cg: 'dogecoin', funds: [['GDOG', 'Grayscale Dogecoin Trust ETF', 'Grayscale'], ['BWOW', 'Bitwise Dogecoin ETF', 'Bitwise'], ['TDOG', '21Shares Dogecoin ETF', '21Shares'], ['DOJE', 'REX-Osprey DOGE ETF', 'REX-Osprey']] },
  { k: 'link', n: 'Chainlink', b: 'LINK', s: 'LINKUSDT', cg: 'chainlink', funds: [['CLNK', 'Bitwise Chainlink ETF', 'Bitwise'], ['GLNK', 'Grayscale Chainlink Trust ETF', 'Grayscale']] },
  { k: 'ltc', n: 'Litecoin', b: 'LTC', s: 'LTCUSDT', cg: 'litecoin', funds: [['LTCC', 'Canary Litecoin ETF', 'Canary Capital']] },
  { k: 'hbar', n: 'Hedera', b: 'HBAR', s: 'HBARUSDT', cg: 'hedera-hashgraph', funds: [['HBR', 'Canary HBAR ETF', 'Canary Capital']] },
  { k: 'dot', n: 'Polkadot', b: 'DOT', s: 'DOTUSDT', cg: 'polkadot', funds: [['TDOT', '21Shares Polkadot ETF', '21Shares']] },
  { k: 'near', n: 'NEAR', b: 'NEAR', s: 'NEARUSDT', cg: 'near', funds: [['NRR', 'Bitwise NEAR ETF', 'Bitwise']] },
  { k: 'hype', n: 'Hyperliquid', b: 'HYPE', s: 'HYPEUSDT', cg: 'hyperliquid', funds: [['BHYP', 'Bitwise Hyperliquid ETF', 'Bitwise']] },
  { k: 'bnb', n: 'BNB', b: 'BNB', s: 'BNBUSDT', cg: 'binancecoin', funds: [['VBNB', 'VanEck BNB ETF', 'VanEck']] },
  { k: 'trx', n: 'TRON', b: 'TRX', s: 'TRXUSDT', cg: 'tron', funds: [['TRXS', 'Canary TRX ETF', 'Canary Capital']] },
  { k: 'zec', n: 'Zcash', b: 'ZEC', s: 'ZECUSDT', cg: 'zcash', funds: [['ZCSH', 'Grayscale Zcash Trust ETF', 'Grayscale']] },
  { k: 'idx', n: L('Cesta (índice)', 'Basket (index)'), b: 'IDX', s: null, cg: null, funds: [['HASH11', 'Hashdex Nasdaq Crypto Index', 'Hashdex', 'br']] },
];
const ETF = { asset: LS.get('etf-asset', 'btc'), calc: 1, date: '', view: 'aum' };
function registerEtfSources() {
  source({
    id: 'etfq', label: L('Cotas dos ETFs', 'ETF quotes'), provider: L('robô NEXUS', 'NEXUS bot'), every: 10 * 60e3,
    need: onPage('etf'),
    run: async () => { const j = await getPipeline('markets', 3 * 3600e3); if (!j.etfs || !Object.keys(j.etfs).length) throw new Error(L('sem cotas', 'no quotes')); return { q: j.etfs, aum: j.etfAum || null, aumAt: Date.parse(j.etfAumAt || '') || null, gen: Date.parse(j.generatedAt) }; },
    onData: (d) => { HEALTH.etfq.dataTs = d.gen; _markDirty('ETFQ'); },
  });
  source({
    id: 'etfhist', label: L('Histórico das cotas dos ETFs', 'ETF quote history'), provider: 'Yahoo Finance (robô NEXUS)', every: 60 * 60e3, persist: false,
    need: () => S.page === 'etf' && !!ETF.date,
    run: async () => { const j = await getPipeline('etfhist', 30 * 3600e3); if (!j.h || !Object.keys(j.h).length) throw new Error(L('sem histórico', 'no history')); return { h: j.h, gen: Date.parse(j.generatedAt) }; },
    onData: (d) => { HEALTH.etfhist.dataTs = d.gen; _markDirty('ETFQ'); },
  });
}
function etfHtml() {
  return `${pageHead(PAGES.etf, '')}
  <section class="panel hero"><div class="grid g-3" style="gap:18px">
    <div><h2 class="panel-t">${ico('package', 18)}${esc(L('O que é um ETF de cripto?', 'What is a crypto ETF?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('É um fundo negociado na bolsa, como uma ação. Quem compra uma cota tem exposição ao preço da moeda sem precisar guardá-la: o fundo compra e custodia as moedas de verdade.', 'An exchange-traded fund, like a stock. A share gives exposure to the coin without holding it: the fund buys and custodies the real coins.'))}</p></div>
    <div><h2 class="panel-t">${ico('database', 18)}${esc(L('O que é AUM (patrimônio)?', 'What is AUM?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('AUM (Assets Under Management) é o patrimônio sob gestão: quanto vale tudo o que o fundo guarda. Quanto maior, mais moedas o fundo tem em custódia.', 'AUM (Assets Under Management) is what all of the fund’s holdings are worth.'))}</p></div>
    <div><h2 class="panel-t">${ico('arrow-left-right', 18)}${esc(L('O que são entradas e saídas?', 'What are inflows/outflows?'))}</h2><p class="muted small mt" style="line-height:1.6">${esc(L('Entrada = dinheiro novo aplicado no fundo (ele compra moedas). Saída = resgates (ele vende). É o termômetro da demanda institucional.', 'Inflow = new money into the fund (it buys coins). Outflow = redemptions (it sells). A gauge of institutional demand.'))}</p></div>
  </div></section>
  <section class="panel mt" id="etf-list"></section>
  <div class="grid g-2 mt"><section class="panel" id="etf-flows"></section><section class="panel" id="etf-calc"></section></div>`;
}
const etfAsset = () => ETF_ASSETS.find((a) => a.k === ETF.asset) || ETF_ASSETS[0];
const etfYahoo = (f) => (f[3] === 'br' ? f[0] + '.SA' : f[0]);
// cota de um dia (ou do último pregão antes dele)
function etfCloseOn(sym, iso) {
  const H = CACHE.get('etfhist'); const h = H && H.v.h && H.v.h[sym]; if (!h || !iso) return null;
  const day = Math.floor(Date.parse(iso + 'T23:59:59Z') / 86400e3);
  let k = -1; for (let i = 0; i < h.d.length; i++) { if (h.d[i] <= day) k = i; else break; }
  return k >= 0 ? { c: h.c[k], day: new Date(h.d[k] * 86400e3).toISOString().slice(0, 10) } : null;
}
function drawEtfList() {
  const box = $('#etf-list'); if (!box) return;
  const q = CACHE.get('etfq'); const Q = q && q.v.q, AUM = (q && q.v.aum) || {};
  const A = etfAsset(); const fxr = brlRate(); const fx = fxr ? fxr.v : null;
  const rows = A.funds.map((f) => {
    const x = Q && Q[etfYahoo(f)]; const br = f[3] === 'br'; const cur = br ? 'BRL' : 'USD';
    const volCur = x && isNum(x.vol) && x.vol > 0 ? x.vol * x.p : null;
    const volUSD = isNum(volCur) ? (br ? (fx ? volCur / fx : null) : volCur) : null;
    const aum = !br && isNum(AUM[f[0]]) ? AUM[f[0]] : null;
    const then = ETF.date ? etfCloseOn(etfYahoo(f), ETF.date) : null;
    return { f, x, br, cur, volCur, volUSD, aum, then };
  });
  const view = ETF.view === 'aum' && rows.filter((r) => r.aum).length >= 1 ? 'aum' : 'vol';
  const key = view === 'aum' ? 'aum' : 'volUSD';
  const tot = sum(rows.map((r) => r[key] || 0));
  const ranked = rows.filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  const pal = ['var(--accent)', 'var(--signal)', 'var(--info)', 'var(--up)', '#c084fc', '#2dd4bf', '#fb923c', '#f472b6'];
  const colOf = (i) => (i < pal.length ? pal[i] : 'var(--text-3)');
  const totAum = sum(rows.map((r) => r.aum || 0)), totVol = sum(rows.map((r) => r.volUSD || 0));
  const withQ = rows.filter((r) => r.x).length;
  const avgChg = withQ ? avg(rows.filter((r) => r.x && isNum(r.x.chg)).map((r) => r.x.chg)) : null;
  const px = A.s ? priceOf(A.s) : null;
  const chips = ETF_ASSETS.map((a) => `<button class="btn xs ${a.k === A.k ? 'pri' : 'ghost'}" data-act="etfAsset" data-k="${a.k}">${a.cg ? coinLogo({ b: a.b, cg: a.cg }, 16) : ico('layers', 14)}${esc(a.n)}<span class="faint" style="margin-left:2px">${a.funds.length}</span></button>`).join('');
  const kpis = `<div class="grid g-4 mt etf-k">
    ${kpiBox(L('Fundos', 'Funds'), `${A.funds.filter((f) => f[3] !== 'br').length} <span class="small faint">EUA</span>${A.funds.some((f) => f[3] === 'br') ? ` · ${A.funds.filter((f) => f[3] === 'br').length} <span class="small faint">B3</span>` : ''}`, esc(L(`${withQ} com cota agora`, `${withQ} quoted now`)))}
    ${kpiBox(L('Patrimônio somado (EUA)', 'Combined AUM (US)'), totAum > 0 ? esc(fmtCompact(totAum)) : '—', totAum > 0 && fx ? esc(fmtCompact(totAum * fx, 'BRL')) : esc(L('sem dado de patrimônio', 'no AUM data')))}
    ${kpiBox(L('Negociado hoje', 'Traded today'), totVol > 0 ? esc(fmtCompact(totVol)) : '—', isNum(avgChg) ? `${chg(avgChg)} <span class="faint">${esc(L('média das cotas', 'avg. share move'))}</span>` : '')}
    ${kpiBox(L(`${A.b} agora`, `${A.b} now`), px ? esc(usd(px.p)) : '—', px && toBRL(px.p) ? `${esc(brl(toBRL(px.p), toBRL(px.p) >= 1 ? [2, 2] : undefined))} · ${chg(px.chg)}` : '')}
  </div>`;
  const stack = ranked.length ? `<div class="etf-stack-h"><span class="small b">${esc(view === 'aum' ? L('Quem guarda mais (patrimônio)', 'Who holds most (AUM)') : L('Quem negociou mais hoje (volume)', 'Most traded today (volume)'))}</span>${rows.some((r) => r.aum) ? seg('etfv', [['aum', L('Patrimônio', 'AUM')], ['vol', L('Volume do dia', 'Day volume')]], view) : ''}</div>
    <div class="etf-stack" role="img" aria-label="${esc(L('Fatia de cada fundo', 'Share of each fund'))}">${ranked.map((r, i) => `<i style="flex:${(r[key] / tot * 100).toFixed(3)};background:${colOf(i)}" title="${esc(r.f[0])}: ${esc(fmtPct(r[key] / tot * 100, 1, false))}"></i>`).join('')}</div>
    <div class="etf-bars">${ranked.slice(0, 8).map((r, i) => `<div class="etf-bar"><span class="t"><i style="background:${colOf(i)}"></i><b>${esc(r.f[0])}</b> <span class="faint">${esc(r.f[2])}</span></span><span class="bar"><span style="width:${(r[key] / ranked[0][key] * 100).toFixed(1)}%;background:${colOf(i)}"></span></span><span class="v">${esc(fmtCompact(r[key]))} <span class="faint">${esc(fmtPct(r[key] / tot * 100, 1, false))}</span></span></div>`).join('')}${ranked.length > 8 ? `<div class="tiny faint">+${ranked.length - 8} ${esc(L('fundos menores', 'smaller funds'))}</div>` : ''}</div>
    ${view === 'aum' && q && q.v.aumAt ? `<div class="tiny faint">${esc(L(`Patrimônio = valor de mercado do fundo (companiesmarketcap.com), lido em ${fmtDateTime(q.v.aumAt)}.`, `AUM = fund market value (companiesmarketcap.com), read ${fmtDateTime(q.v.aumAt)}.`))}</div>` : view === 'vol' ? `<div class="tiny faint">${esc(L('Volume = cotas negociadas × preço, no dia (B3 convertido pelo dólar de agora). Não é entrada de dinheiro no fundo.', 'Volume = shares traded × price that day (B3 converted at today’s USD rate). Not fund inflows.'))}</div>` : ''}` : '';
  const dateCol = !!ETF.date;
  const hasHist = !!CACHE.get('etfhist');
  const tbl = `<div class="tbl-wrap"><table class="tbl etf-tbl"><thead><tr><th>Ticker</th><th>${esc(L('Fundo', 'Fund'))}</th><th class="r">${esc(L('Cota', 'Price'))}</th><th class="r">${esc(L('Dia', 'Day'))}</th><th class="r">${esc(L('Patrimônio', 'AUM'))}</th><th class="r">${esc(L('Negociado', 'Traded'))}</th>${dateCol ? `<th class="r">${esc(L('Cota em', 'Price on'))} ${esc(fmtDate(ETF.date + 'T12:00:00Z', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }))}</th><th class="r">${esc(L('Desde então', 'Since then'))}</th>` : ''}<th class="r">${esc(L('Cotação de', 'Quote at'))}</th></tr></thead><tbody>${rows.map((r) => {
    const x = r.x; const chgSince = r.then && x && r.then.c > 0 ? (x.p / r.then.c - 1) * 100 : null;
    return `<tr><td><b>${esc(r.f[0])}</b><div class="tiny faint">${r.br ? 'B3' : 'EUA'}</div></td><td style="white-space:normal;min-width:180px">${esc(r.f[1])}<div class="tiny faint">${esc(r.f[2])}</div></td><td class="r num">${x ? esc(fmtMoney(x.p, r.cur, [2, 2])) : '—'}${x && !r.br && fx ? `<div class="tiny faint">${esc(brl(x.p * fx, [2, 2]))}</div>` : ''}</td><td class="r">${x ? chg(x.chg, 2, 'sm') : '—'}</td><td class="r num">${r.aum ? esc(fmtCompact(r.aum)) : '—'}</td><td class="r num">${isNum(r.volCur) ? esc(fmtCompact(r.volCur, r.cur)) : '—'}</td>${dateCol ? `<td class="r num">${r.then ? `${esc(fmtMoney(r.then.c, r.cur, [2, 2]))}${r.then.day !== ETF.date ? `<div class="tiny faint">${esc(L('pregão de', 'session of'))} ${esc(fmtDate(r.then.day + 'T12:00:00Z', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }))}</div>` : ''}` : `<span class="faint">${hasHist ? '—' : '…'}</span>`}</td><td class="r">${isNum(chgSince) ? chg(chgSince, 1, 'sm') : '—'}</td>` : ''}<td class="r small faint">${x && x.t ? esc(fmtDateTime(x.t)) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
  const today = todayISO(); const minD = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  box.innerHTML = panelHead('building-2', L('ETFs à vista', 'Spot ETFs'), { sub: esc(L('Escolha a moeda. Cotas com atraso de até 30 min (robô do NEXUS). Lista de fundos conferida em out/2026.', 'Pick the coin. Quotes delayed up to 30 min (NEXUS bot). Fund list checked Oct/2026.')), right: stamp('etfq') }) +
    `<div class="row wrap etf-chips" style="gap:6px">${chips}</div>${kpis}<div class="etf-viz mt">${stack || `<div class="small faint">${esc(L('Sem cotas para montar o gráfico desta moeda ainda.', 'No quotes to chart this coin yet.'))}</div>`}</div>
    <div class="row wrap between mt" style="gap:10px;align-items:flex-end"><div class="fld" style="max-width:260px"><label for="etf-date">${esc(L('Ver a cota de um dia', 'See the price on a day'))}</label><div class="row" style="gap:6px"><input class="inp" id="etf-date" type="date" min="${minD}" max="${today}" value="${esc(ETF.date)}" data-chg="etfDate">${ETF.date ? `<button class="btn sm ghost" data-act="etfDateClear">${esc(L('Limpar', 'Clear'))}</button>` : ''}</div></div>${ETF.date ? stamp('etfhist', 'Yahoo Finance') : ''}</div>` + tbl +
    note(L('"Negociado" é quanto as cotas giraram na bolsa no dia — não é entrada nem saída de dinheiro do fundo. Novos fundos podem estrear e gestoras podem mudar; confirme nos sites das gestoras. Cota de um dia: fechamento do pregão (até 1 ano).', '"Traded" is how much the shares changed hands that day — not fund flows. Price on a day: session close (up to 1 year).'));
}
ACT.etfAsset = (el) => { ETF.asset = el.dataset.k; LS.set('etf-asset', ETF.asset); drawEtfList(); };
ACT.seg_etfv = (v) => { ETF.view = v; drawEtfList(); };
ACT.etfDate = (el) => { ETF.date = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : ''; drawEtfList(); if (ETF.date && !CACHE.get('etfhist')) runSource('etfhist', { force: true }); };
ACT.etfDateClear = () => { ETF.date = ''; drawEtfList(); };
function drawEtfFlows() {
  setHTML('#etf-flows', panelHead('chart-column', L('Entradas e saídas diárias', 'Daily inflows & outflows')) + `<div class="callout">${ico('info', 18)}<span>${esc(L('Os fluxos diários só são publicados por empresas especializadas, sem acesso gratuito pelo navegador. Para não mostrar número estimado como se fosse real, deixamos os links de quem mede de verdade:', 'Daily flows are published by specialist firms, without free browser access. Rather than show estimates as real, here are the sources that measure them:'))}</span></div>
    <div class="list mt">${[['https://farside.co.uk/btc/', 'Farside Investors', L('tabela diária por fundo (BTC)', 'daily table per fund (BTC)')], ['https://farside.co.uk/eth/', 'Farside Investors', L('tabela diária por fundo (ETH)', 'daily table per fund (ETH)')], ['https://sosovalue.com/assets/etf/us-btc-spot', 'SoSoValue', L('gráficos de fluxo e patrimônio (AUM)', 'flow and AUM charts')], ['https://www.theblock.co/data/crypto-markets/bitcoin-etf', 'The Block', L('painel de dados dos ETFs', 'ETF data dashboard')]].map(([u, t, s]) => `<a class="li" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="grow"><span class="t" style="display:block">${esc(t)}</span><span class="m">${esc(s)}</span></span>${ico('external-link', 15)}</a>`).join('')}</div>`);
}
function drawEtfCalc() {
  const btc = PX.BTCUSDT && PX.BTCUSDT.p, r = brlRate();
  const v = ETF.calc;
  setHTML('#etf-calc', panelHead('calculator', L('Quanto vale uma quantidade de BTC hoje', 'What an amount of BTC is worth today'), { sub: esc(L('Útil para estimar o AUM de um fundo a partir dos BTC que ele declara.', 'Handy to estimate a fund’s AUM from the BTC it reports.')), right: stamp('px-rest', 'Binance') }) +
    `<div class="fld"><label for="etf-q">${esc(L('Quantidade de BTC', 'BTC amount'))}</label><input class="inp" id="etf-q" type="text" inputmode="decimal" autocomplete="off" value="${esc(decOut(v, 8))}" data-inp="etfCalc"></div>
    <div class="grid g-2 mt" id="etf-calc-out">${kpiBox(L('Em dólar', 'In USD'), btc ? esc(usd(v * btc, [0, 2])) : '—')}${kpiBox(L('Em reais', 'In BRL'), btc && r ? esc(brl(v * btc * r.v, [0, 2])) : '—')}</div>`);
}
ACT.etfCalc = (el) => {
  ETF.calc = Math.max(0, parseDec(el.value) || 0);
  const btc = PX.BTCUSDT && PX.BTCUSDT.p, r = brlRate();
  setHTML('#etf-calc-out', kpiBox(L('Em dólar', 'In USD'), btc ? esc(usd(ETF.calc * btc, [0, 2])) : '—') + kpiBox(L('Em reais', 'In BRL'), btc && r ? esc(brl(ETF.calc * btc * r.v, [0, 2])) : '—'));
};
onPrice((set) => { if (S.page === 'etf' && (set.has('ETFQ') || set.has('FX'))) drawEtfList(); });
page({
  id: 'etf', group: 'analise', icon: 'building-2', pt: 'ETFs', en: 'ETFs',
  sub: 'Os fundos de cripto negociados em bolsa (bitcoin, ethereum, solana, XRP e outras), explicados em linguagem simples.',
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
