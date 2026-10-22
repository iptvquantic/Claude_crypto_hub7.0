// =====================================================================
// ÍNDICES E CÂMBIO — câmbio ao vivo, ouro e prata, juros e inflação do
// Brasil (Banco Central), juros dos EUA (Fed de Nova York) e índices globais
// (bolsas, dólar global, petróleo) trazidos pelo robô com o horário da cotação.
// =====================================================================
function registerMarketSources() {
  source({
    id: 'bcb', label: L('Juros e inflação (BCB)', 'Rates & inflation (BCB)'), provider: 'Banco Central', every: 60 * 60e3,
    need: () => ['markets', 'macro', 'agenda'].includes(S.page),
    run: async () => {
      // "ultimos/N" aceita no máximo 20 valores; a Selic (432) vem preenchida até a próxima reunião, então usa período
      const br = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
      const sgs = async (n, q) => {
        const a = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${n}/dados${q}${q.includes('?') ? '&' : '?'}formato=json`, { timeout: 12000 });
        return a.map((x) => ({ d: parseDate(x.data).getTime(), v: num(x.valor) })).filter((x) => isNum(x.v)).sort((a, b) => a.d - b.d);
      };
      const [selic, cdi, ipca] = await Promise.all([
        sgs(432, `?dataInicial=${br(Date.now() - 400 * 86400e3)}&dataFinal=${br(Date.now() + 60 * 86400e3)}`),
        sgs(4389, '/ultimos/5'), sgs(13522, '/ultimos/13'),
      ]);
      const today = Date.now();
      const selicNow = [...selic].reverse().find((x) => x.d <= today + 12 * 3600e3) || selic[selic.length - 1];
      const selicPrev = [...selic].reverse().find((x) => x.v !== selicNow.v && x.d < selicNow.d);
      let focus = null;
      try {
        const f = encodeURIComponent("(Indicador eq 'IPCA' or Indicador eq 'Selic') and baseCalculo eq 0");
        const j = await getJSON(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=30&$filter=${f}&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana`, { timeout: 12000 });
        const rows = j.value || []; const last = rows.length ? rows[0].Data : null;
        const y = new Date().getFullYear();
        const pick = (ind, ref) => { const r = rows.find((x) => x.Indicador === ind && x.Data === last && String(x.DataReferencia) === String(ref)); return r ? num(r.Mediana) : null; };
        if (last) focus = { date: last, ipca: pick('IPCA', y), ipcaNext: pick('IPCA', y + 1), selic: pick('Selic', y), selicNext: pick('Selic', y + 1), y };
      } catch { /* Focus é complemento */ }
      return { selic: selicNow, selicPrev, cdi: cdi[cdi.length - 1], ipca: ipca[ipca.length - 1], ipcaPrev: ipca[ipca.length - 2], ipcaSeries: ipca, focus };
    },
    validate: (d) => d.selic && d.selic.v > 1 && d.selic.v < 60,
    onData: () => _markDirty('BCB'),
  });
  source({
    id: 'fed', label: L('Juros dos EUA', 'US rates'), provider: 'NY Fed', every: 60 * 60e3,
    need: () => ['markets', 'macro', 'agenda', 'dash'].includes(S.page),
    run: async () => {
      const j = await getJSON('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json', { timeout: 12000 });
      const r = j.refRates && j.refRates[0];
      return { from: num(r.targetRateFrom), to: num(r.targetRateTo), effr: num(r.percentRate), date: r.effectiveDate };
    },
    validate: (d) => isNum(d.from) && isNum(d.to) && d.to >= d.from && d.to < 25,
    onData: (d) => { HEALTH.fed.dataTs = parseDate(d.date).getTime(); _markDirty('FED'); },
  });
  // outras moedas (opcional): um pedido por par, para que um par indisponível não derrube os outros
  source({
    id: 'fx2', label: L('Outras moedas', 'Other currencies'), provider: 'AwesomeAPI', every: 5 * 60e3,
    need: () => S.page === 'markets',
    run: async () => {
      const pairs = ['JPY-BRL', 'CNY-BRL', 'CHF-BRL', 'CAD-BRL', 'AUD-BRL', 'ARS-BRL', 'HKD-BRL'];
      const res = await Promise.allSettled(pairs.map((p) => getJSON('https://economia.awesomeapi.com.br/json/last/' + p, { timeout: 10000 })));
      const out = {};
      res.forEach((r, i) => { if (r.status !== 'fulfilled') return; const k = pairs[i].replace('-', ''); const x = r.value && r.value[k]; if (x && num(x.bid) > 0) { out[k.toLowerCase()] = num(x.bid); out['c_' + k.toLowerCase()] = num(x.pctChange); } });
      if (!Object.keys(out).length) throw new Error('awesomeapi');
      return out;
    },
    onData: (d) => { FX.more = d; _markDirty('FX'); },
  });
  source({
    id: 'quotes', label: L('Bolsas e índices', 'Indices'), provider: L('robô NEXUS', 'NEXUS bot'), every: 10 * 60e3,
    need: () => ['markets', 'macro'].includes(S.page),
    run: async () => { const j = await getPipeline('markets', 3 * 3600e3); if (!j.quotes || !Object.keys(j.quotes).length) throw new Error(L('sem cotações', 'no quotes')); return { q: j.quotes, gen: Date.parse(j.generatedAt) }; },
    onData: (d) => { HEALTH.quotes.dataTs = d.gen; _markDirty('QUOTES'); },
  });
}
const QUOTE_GROUPS = [
  ['br', 'Brasil', 'Brazil'], ['us', 'Estados Unidos', 'United States'], ['world', 'Europa e Ásia', 'Europe & Asia'],
  ['rates', 'Juros e dólar global', 'Rates & dollar'], ['cmd', 'Commodities', 'Commodities'],
];
// card: título (pode quebrar linha), valor, valor em reais, variação, rodapé e o selo da fonte embaixo (nunca vaza do card)
function mkCard(title, value, sub, { stampId, foot = '', icon, brlv = '' } = {}) {
  return `<div class="panel mk-card"><div class="mk-t">${icon ? ico(icon, 16) : ''}<span>${esc(title)}</span></div><div class="mk-v">${value}</div>${brlv ? `<div class="mk-brl">${brlv}</div>` : ''}<div class="mk-s">${sub || ''}</div>${foot ? `<div class="mk-f">${foot}</div>` : ''}${stampId ? `<div class="mk-st">${stamp(stampId)}</div>` : ''}</div>`;
}
// valor convertido em reais pelo câmbio de agora (rótulo explica a conta)
const inBRL = (v, rate, unit = '') => (isNum(v) && isNum(rate) && rate > 0 ? `<b>${esc(brl(v * rate, [2, 2]))}</b>${unit ? ` <span class="faint">${esc(unit)}</span>` : ''}` : '');
function marketsHtml() {
  return `${pageHead(PAGES.markets, `<button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>`)}
  <h2 class="panel-t mt">${ico('banknote', 18)}${esc(L('Câmbio', 'FX'))}</h2><div class="grid g-cards mt" id="mk-fx"></div>
  <h2 class="panel-t mt-lg">${ico('gem', 18)}${esc(L('Ouro e prata', 'Gold & silver'))}</h2><div class="grid g-cards mt" id="mk-metal"></div>
  <h2 class="panel-t mt-lg">${ico('landmark', 18)}${esc(L('Juros e inflação', 'Rates & inflation'))}</h2><div class="grid g-cards mt" id="mk-rates"></div>
  <h2 class="panel-t mt-lg">${ico('globe', 18)}${esc(L('Bolsas, índices e commodities', 'Stocks, indices & commodities'))}</h2><div id="mk-quotes" class="mt"></div>`;
}
const FX_MORE = [['jpybrl', 'Iene (JPY/BRL)', 'Yen (JPY/BRL)', 4], ['cnybrl', 'Yuan (CNY/BRL)', 'Yuan (CNY/BRL)', 4], ['chfbrl', 'Franco suíço (CHF/BRL)', 'Swiss franc (CHF/BRL)', 4], ['cadbrl', 'Dólar canadense (CAD/BRL)', 'Canadian dollar (CAD/BRL)', 4], ['audbrl', 'Dólar australiano (AUD/BRL)', 'Australian dollar (AUD/BRL)', 4], ['arsbrl', 'Peso argentino (ARS/BRL)', 'Argentine peso (ARS/BRL)', 5]];
function drawFx() {
  const r = brlRate(); const u = PX.USDTBRL;
  const prem = r && u && FX.usdbrl ? (u.p / FX.usdbrl - 1) * 100 : null;
  const fxSub = (k) => (isNum(FX.chg[k]) ? chg(FX.chg[k]) + ' <span class="faint">' + esc(L('no dia', 'today')) + '</span>' : '');
  const X = FX.more || {};
  const html = [
    mkCard(L('Dólar comercial (USD/BRL)', 'US dollar (USD/BRL)'), FX.usdbrl ? esc(brl(FX.usdbrl, [4, 4])) : '—', fxSub('usdbrl'), { stampId: 'fx', foot: FX.usdbrl ? esc(L(`US$ 100 = ${brl(FX.usdbrl * 100, [2, 2])}`, `US$ 100 = ${brl(FX.usdbrl * 100, [2, 2])}`)) : '' }),
    mkCard(L('Euro (EUR/BRL)', 'Euro (EUR/BRL)'), FX.eurbrl ? esc(brl(FX.eurbrl, [4, 4])) : '—', fxSub('eurbrl'), { stampId: 'fx', foot: FX.eurbrl ? esc(`€ 100 = ${brl(FX.eurbrl * 100, [2, 2])}`) : '' }),
    mkCard(L('Libra (GBP/BRL)', 'Pound (GBP/BRL)'), FX.gbpbrl ? esc(brl(FX.gbpbrl, [4, 4])) : '—', fxSub('gbpbrl'), { stampId: 'fx', foot: FX.gbpbrl ? esc(`£ 100 = ${brl(FX.gbpbrl * 100, [2, 2])}`) : '' }),
    mkCard('EUR/USD', FX.eurusd ? esc(fmtNum(FX.eurusd, 4, 4)) : '—', fxSub('eurusd'), { stampId: 'fx', brlv: FX.eurbrl ? `€ 1 = ${inBRL(1, FX.eurbrl)}` : '' }),
    mkCard(L('Dólar cripto (USDT/BRL)', 'Crypto dollar (USDT/BRL)'), u ? esc(brl(u.p, [3, 3])) : '—', u ? chg(u.chg) + ' <span class="faint">24h</span>' : '', { stampId: 'px-rest', foot: isNum(prem) ? `${esc(L('Ágio sobre o comercial:', 'Premium over spot:'))} <b class="${tone(prem)}">${esc(fmtPct(prem, 2))}</b> ${modelBadge(L('USDT/BRL da Binance dividido pelo dólar comercial, menos 1.', 'Binance USDT/BRL divided by spot USD/BRL, minus 1.'))}` : '' }),
    ...FX_MORE.filter(([k]) => isNum(X[k])).map(([k, pt, en, d]) => mkCard(L(pt, en), esc(brl(X[k], [d, d])), isNum(X['c_' + k]) ? chg(X['c_' + k]) + ' <span class="faint">' + esc(L('no dia', 'today')) + '</span>' : '', { stampId: 'fx2' })),
  ].join('');
  setHTML('#mk-fx', html);
}
function drawMetals() {
  const OZ = 31.1034768; const r = brlRate(); const rv = r ? r.v : null;
  const xau = METAL.xau, xag = METAL.xag, pax = PX.PAXGUSDT;
  const premium = pax && xau ? (pax.p / xau - 1) * 100 : null;
  const gram = (v) => (isNum(v) && rv ? `${esc(brl(v * rv / OZ, [2, 2]))} ${esc(L('por grama', 'per gram'))}` : '');
  const html = [
    mkCard(L('Ouro (onça troy)', 'Gold (troy oz)'), xau ? esc(usd(xau, [2, 2])) : '—', gram(xau), { stampId: 'metals', brlv: inBRL(xau, rv, L('a onça', 'per oz')) }),
    mkCard(L('Prata (onça troy)', 'Silver (troy oz)'), xag ? esc(usd(xag, [2, 2])) : '—', gram(xag), { stampId: 'metals', brlv: inBRL(xag, rv, L('a onça', 'per oz')) }),
    mkCard(L('Relação ouro/prata', 'Gold/silver ratio'), xau && xag ? esc(fmtNum(xau / xag, 1, 1)) : '—', `<span class="faint">${esc(L('quantas onças de prata compram 1 de ouro', 'silver ounces per gold ounce'))}</span>`, { foot: modelBadge(L('Ouro ÷ prata, ambos à vista.', 'Gold ÷ silver, both spot.')) }),
    mkCard(L('PAXG (ouro tokenizado)', 'PAXG (tokenized gold)'), pax ? esc(usd(pax.p, [2, 2])) : '—', pax ? chg(pax.chg) + ' <span class="faint">24h</span>' : '', { stampId: 'px-rest', brlv: inBRL(pax && pax.p, rv), foot: isNum(premium) ? `${esc(L('Diferença para o ouro à vista:', 'vs spot gold:'))} <b class="${tone(premium)}">${esc(fmtPct(premium, 2))}</b>` : '' }),
  ].join('');
  setHTML('#mk-metal', html);
}
function drawRates() {
  const b = CACHE.get('bcb'), f = CACHE.get('fed');
  const B = b && b.v, F = f && f.v;
  const ipcaRef = B && B.ipca ? new Date(B.ipca.d) : null;
  const html = [
    mkCard('Selic (meta)', B ? esc(fmtPct(B.selic.v, 2, false)) + ` <span class="small faint">${esc(L('ao ano', 'a year'))}</span>` : '—', B && B.selicPrev ? `${esc(L('antes:', 'previous:'))} ${esc(fmtPct(B.selicPrev.v, 2, false))}` : '', { stampId: 'bcb', foot: esc(L('Definida pelo Copom. Série 432 do Banco Central.', 'Set by Copom. Central Bank series 432.')) }),
    mkCard(L('CDI', 'CDI'), B && B.cdi ? esc(fmtPct(B.cdi.v, 2, false)) + ` <span class="small faint">${esc(L('ao ano', 'a year'))}</span>` : '—', B && B.cdi ? `<span class="faint">${esc(L('taxa de', 'rate of'))} ${esc(fmtDate(B.cdi.d, { day: '2-digit', month: 'short', timeZone: 'UTC' }))}</span>` : '', { stampId: 'bcb', foot: esc(L('Referência da renda fixa. Série 4389 do Banco Central.', 'Fixed-income benchmark. Series 4389.')) }),
    mkCard(L('Inflação (IPCA 12 meses)', 'Inflation (IPCA 12m)'), B && B.ipca ? esc(fmtPct(B.ipca.v, 2, false)) : '—', B && B.ipcaPrev ? `${esc(L('mês anterior:', 'prior month:'))} ${esc(fmtPct(B.ipcaPrev.v, 2, false))}` : '', { stampId: 'bcb', foot: ipcaRef ? esc(L(`Acumulado até ${monthName(ipcaRef.getUTCMonth())}/${ipcaRef.getUTCFullYear()}. Série 13522.`, `12 months to ${monthName(ipcaRef.getUTCMonth())}/${ipcaRef.getUTCFullYear()}. Series 13522.`)) : '' }),
    mkCard(L('Expectativa do mercado (Focus)', 'Market expectations (Focus)'), B && B.focus && isNum(B.focus.ipca) ? `IPCA ${B.focus.y}: ${esc(fmtPct(B.focus.ipca, 2, false))}` : '—', B && B.focus && isNum(B.focus.selic) ? `Selic ${esc(L('fim de', 'end of'))} ${B.focus.y}: <b>${esc(fmtPct(B.focus.selic, 2, false))}</b>` : '', { stampId: 'bcb', foot: B && B.focus ? esc(L(`Mediana do boletim Focus de ${fmtDate(B.focus.date, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}.`, `Focus survey median of ${fmtDate(B.focus.date)}.`)) : '' }),
    mkCard(L('Juros dos EUA (Fed)', 'US rate (Fed)'), F ? `${esc(fmtNum(F.from, 2, 2))}–${esc(fmtNum(F.to, 2, 2))}%` : '—', F ? `${esc(L('taxa efetiva (EFFR):', 'effective rate (EFFR):'))} <b>${esc(fmtNum(F.effr, 2, 2))}%</b>` : '', { stampId: 'fed', foot: F ? esc(L(`Faixa-alvo do Fed. Leitura de ${fmtDate(F.date, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} (Fed de Nova York).`, `Fed target range, as of ${fmtDate(F.date)} (New York Fed).`)) : '' }),
  ].join('');
  setHTML('#mk-rates', html);
}
// moeda de cada índice para converter em reais (S&P em reais é o que o IVVB11 acompanha)
const QUOTE_CUR = { '^GSPC': 'usd', '^IXIC': 'usd', '^DJI': 'usd', '^GDAXI': 'eur', '^STOXX50E': 'eur', '^FTSE': 'gbp', '^N225': 'jpy', '^HSI': 'hkd' };
const QUOTE_UNIT = { 'BZ=F': ['por barril', 'per barrel'], 'CL=F': ['por barril', 'per barrel'], 'NG=F': ['por MMBtu', 'per MMBtu'], 'HG=F': ['por libra-peso', 'per pound'], 'GC=F': ['a onça', 'per oz'], 'SI=F': ['a onça', 'per oz'] };
function curRate(c) { const X = FX.more || {}; return { usd: FX.usdbrl, eur: FX.eurbrl, gbp: FX.gbpbrl, jpy: X.jpybrl, hkd: X.hkdbrl }[c] || null; }
function drawQuotes() {
  const box = $('#mk-quotes'); if (!box) return;
  const q = CACHE.get('quotes');
  if (!q) {
    box.innerHTML = `<div class="panel">${HEALTH.quotes && HEALTH.quotes.ok === false ? emptyBox('database', L('Cotações de bolsas ainda não disponíveis', 'Index quotes not available yet'), esc(L('Bolsas e índices não liberam acesso direto pelo navegador; o robô do NEXUS traz esses números a cada 30 min. Assim que ele publicar, eles aparecem aqui com o horário da cotação.', 'Exchanges do not allow direct browser access; the NEXUS bot brings these numbers every 30 min. As soon as it publishes, they appear here with the quote time.')), extLink('https://www.google.com/finance/markets/indexes', 'Google Finance')) : skel(4, 22)}</div>`;
    return;
  }
  const all = Object.entries(q.v.q).map(([k, x]) => ({ k, ...x }));
  const usdr = FX.usdbrl;
  box.innerHTML = QUOTE_GROUPS.map(([g, pt, en]) => {
    const items = all.filter((x) => x.g === g); if (!items.length) return '';
    return `<h3 class="small muted b" style="margin:14px 0 8px">${esc(L(pt, en))}</h3><div class="grid g-cards">${items.map((x) => {
      // fmt: 'pts' (índice), 'pct' (rendimento de título), 'usd' (preço em dólar)
      const v = x.fmt === 'pct' ? fmtNum(x.p, 2, 3) + '%' : x.fmt === 'usd' ? usd(x.p, [2, 2]) : fmtNum(x.p, 2, 2);
      const age = x.t ? Date.now() - x.t : null;
      let brlv = '';
      if (x.fmt === 'usd') { const u = QUOTE_UNIT[x.k]; brlv = inBRL(x.p, usdr, u ? L(u[0], u[1]) : ''); }
      else if (x.fmt === 'pts' && QUOTE_CUR[x.k]) { const rt = curRate(QUOTE_CUR[x.k]); if (isNum(rt) && rt > 0) brlv = `<span class="faint">${esc(L('em reais:', 'in BRL:'))}</span> <b>${esc(fmtNum(x.p * rt, 0, 0))}</b> <span class="faint" title="${esc(L(`Pontos × ${QUOTE_CUR[x.k].toUpperCase()}/BRL de agora — o mesmo que um fundo que acompanha o índice em reais (ex.: IVVB11 para o S&P 500).`, `Points × ${QUOTE_CUR[x.k].toUpperCase()}/BRL now.`))}">pts·R$ ⓘ</span>`; }
      return `<div class="panel mk-card"><div class="mk-t"><span>${esc(L(x.n, x.nEn || x.n))}</span></div><div class="mk-v sm">${esc(v)}</div>${brlv ? `<div class="mk-brl">${brlv}</div>` : ''}<div class="mk-s">${chg(x.chg)}</div><div class="mk-f">${x.t ? esc(fmtDateTime(x.t)) : ''}${age && age > 3 * 86400e3 ? ` · <span style="color:var(--stale)">${esc(L('cotação antiga (mercado fechado?)', 'old quote (market closed?)'))}</span>` : ''}</div></div>`;
    }).join('')}</div>`;
  }).join('') + `<div class="row wrap mt" style="gap:8px">${stamp('quotes')}<span class="tiny faint">${esc(L('Cotações com atraso de até 30 min (robô do NEXUS, fonte pública). Fins de semana e feriados mostram o último fechamento. Valores em reais usam o câmbio de agora (AwesomeAPI).', 'Quotes delayed up to 30 min (NEXUS bot, public source). Weekends and holidays show the last close. BRL values use the current FX rate.'))}</span></div>`;
}
function marketsDraw() { drawFx(); drawMetals(); drawRates(); drawQuotes(); }
onPrice((set) => {
  if (S.page !== 'markets') return;
  if (set.has('FX') || set.has('USDTBRL')) drawFx();
  if (set.has('METAL') || set.has('PAXGUSDT') || set.has('FX')) drawMetals();
  if (set.has('BCB') || set.has('FED')) drawRates();
  if (set.has('QUOTES') || set.has('FX')) drawQuotes();
});
page({
  id: 'markets', group: 'mercado', icon: 'landmark', pt: 'Índices e câmbio', en: 'Indices & FX',
  sub: 'Dólar, euro, ouro, juros, inflação e as principais bolsas do mundo — com fonte e horário em cada número.',
  subEn: 'Dollar, euro, gold, rates, inflation and the main world indices — with source and time on every number.',
  init(el) { el.innerHTML = marketsHtml(); marketsDraw(); },
  show() { marketsDraw(); },
});
