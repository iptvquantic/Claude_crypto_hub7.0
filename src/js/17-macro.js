// =====================================================================
// MACRO — Fed e Copom: juros ao vivo, última decisão DERIVADA dos dados
// oficiais (NY Fed e Banco Central), contagem para a próxima reunião,
// calendário que avança sozinho e apostas do Polymarket para o Fed.
// AGENDA — calendário econômico (data, país, impacto, previsão, anterior,
// atual): calendários oficiais + IBGE ao vivo + robô (ForexFactory).
// =====================================================================
const MONTHS_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CTRY = { US: ['EUA', 'US'], BR: ['BR', 'BR'], EU: ['UE', 'EU'], DE: ['ALE', 'DE'], GB: ['RU', 'UK'], JP: ['JP', 'JP'], CN: ['CN', 'CN'], CA: ['CA', 'CA'], AU: ['AU', 'AU'], NZ: ['NZ', 'NZ'], CH: ['CH', 'CH'], WD: ['Global', 'Global'] };
const FF_CTRY = { USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CNY: 'CN', CAD: 'CA', AUD: 'AU', NZD: 'NZ', CHF: 'CH', BRL: 'BR', ALL: 'WD' };
const ctryTag = (c) => `<span class="flag" title="${esc(c)}">${esc(L(...(CTRY[c] || [c, c])))}</span>`;
function registerMacroSources() {
  const need = () => ['macro', 'agenda', 'dash'].includes(S.page);
  source({
    id: 'fedhist', label: L('Histórico de juros (Fed)', 'Fed rate history'), provider: 'NY Fed', every: 6 * 3600e3, kind: 'daily',
    need: () => ['macro', 'agenda'].includes(S.page),
    run: async () => {
      const start = new Date(Date.now() - 900 * 86400e3).toISOString().slice(0, 10), end = todayISO();
      const j = await getJSON(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${start}&endDate=${end}`, { timeout: 15000 });
      return (j.refRates || []).map((r) => ({ d: r.effectiveDate, lo: num(r.targetRateFrom), hi: num(r.targetRateTo), e: num(r.percentRate) })).filter((r) => isNum(r.hi)).sort((a, b) => a.d.localeCompare(b.d));
    },
    validate: (a) => a.length > 100,
    onData: (a) => { HEALTH.fedhist.dataTs = parseDate(a[a.length - 1].d).getTime(); _markDirty('FEDHIST'); },
  });
  source({
    id: 'selichist', label: L('Histórico da Selic', 'Selic history'), provider: 'Banco Central', every: 6 * 3600e3,
    need: () => ['macro', 'agenda'].includes(S.page),
    run: async () => {
      const f = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const a = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${f(new Date(Date.now() - 900 * 86400e3))}&dataFinal=${f(new Date(Date.now() + 120 * 86400e3))}`, { timeout: 15000 });
      return a.map((x) => ({ t: parseDate(x.data).getTime(), v: num(x.valor) })).filter((x) => isNum(x.v)).sort((p, q) => p.t - q.t);
    },
    validate: (a) => a.length > 100,
    onData: () => _markDirty('SELICHIST'),
  });
  source({
    id: 'ibge', label: L('Calendário do IBGE', 'IBGE calendar'), provider: 'IBGE', every: 6 * 3600e3, need,
    run: async () => {
      const f = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
      const j = await getJSON(`https://servicodados.ibge.gov.br/api/v3/calendario/?de=${f(new Date(Date.now() - 10 * 86400e3))}&ate=${f(new Date(Date.now() + 120 * 86400e3))}&qtd=300`, { timeout: 15000 });
      return (j.items || []).map((x) => ibgeEvent(x)).filter(Boolean);
    },
    validate: (a) => Array.isArray(a),
    onData: () => _markDirty('AGENDA'),
  });
  source({
    id: 'ffcal', label: L('Calendário econômico global', 'Global economic calendar'), provider: L('robô NEXUS · ForexFactory', 'NEXUS bot · ForexFactory'), every: 30 * 60e3, need,
    run: async () => { const j = await getPipeline('calendar', 8 * 3600e3); if (!Array.isArray(j.events)) throw new Error('calendar'); return { ev: j.events, gen: Date.parse(j.generatedAt), src: j.src || 'ForexFactory' }; },
    onData: (d) => { HEALTH.ffcal.dataTs = d.gen; SRC.ffcal.provider = L(`robô NEXUS · ${d.src}`, `NEXUS bot · ${d.src}`); _markDirty('AGENDA'); },
  });
  source({
    id: 'pm-fed', label: L('Apostas sobre o Fed', 'Fed bets'), provider: 'Polymarket', every: 10 * 60e3,
    need: () => S.page === 'macro',
    run: async () => getJSON('https://gamma-api.polymarket.com/events?tag_slug=fed&active=true&closed=false&order=volume24hr&ascending=false&limit=20', { timeout: 12000 }),
    validate: (a) => Array.isArray(a),
    persist: false,
    onData: () => _markDirty('PMFED'),
  });
}
// ---------- IBGE: só as divulgações que mexem com o mercado ----------
const IBGE_PICK = [ // títulos exatos do calendário do IBGE (conferidos em 15/10/2026)
  [/^Índice Nacional de Preços ao Consumidor Amplo 15$/i, 'Prévia da inflação (IPCA-15)', 'Inflation preview (IPCA-15)', 2],
  [/^Índice Nacional de Preços ao Consumidor Amplo$/i, 'Inflação oficial (IPCA)', 'Official inflation (IPCA)', 3],
  [/^Sistema de Contas Nacionais Trimestrais$/i, 'PIB trimestral', 'Quarterly GDP', 3],
  [/^Pesquisa Nacional por Amostra de Domicílios Contínua Mensal$/i, 'Desemprego (PNAD Contínua)', 'Unemployment (PNAD)', 2],
  [/^Pesquisa Industrial Mensal: Produção Física - Brasil$/i, 'Produção industrial', 'Industrial production', 1],
  [/^Pesquisa Mensal de Comércio$/i, 'Vendas no varejo', 'Retail sales', 1],
  [/^Pesquisa Mensal de Serviços$/i, 'Volume de serviços', 'Services volume', 1],
];
function ibgeEvent(x) {
  const title = String(x.titulo || '');
  const hit = IBGE_PICK.find(([re]) => re.test(title.trim()));
  if (!hit) return null;
  const at = parseDate(x.data_divulgacao).getTime();
  if (!isNum(at)) return null;
  return { id: 'ibge-' + x.id, at, t: L(hit[1], hit[2]), country: 'BR', imp: hit[3], src: 'IBGE', url: 'https://www.ibge.gov.br/calendario.html', kind: 'ibge', ref: x.descricao ? stripHtml(x.descricao).slice(0, 80) : '' };
}
// ---------- tradução dos títulos do calendário global ----------
const FF_PT = [
  [/^Fed Interest Rate Decision$/, 'Juros do Fed (decisão)'], [/^Interest Rate Decision$/, 'Decisão de juros'], [/^ECB Interest Rate Decision$/, 'Juros do Banco Central Europeu'], [/^BoE Interest Rate Decision$/, 'Juros do Banco da Inglaterra'], [/^BoJ Interest Rate Decision$/, 'Juros do Banco do Japão'],
  [/^Inflation Rate YoY$/, 'Inflação em 12 meses'], [/^Inflation Rate MoM$/, 'Inflação no mês'], [/^Core Inflation Rate YoY$/, 'Núcleo da inflação em 12 meses'], [/^Core Inflation Rate MoM$/, 'Núcleo da inflação no mês'],
  [/^Mid-month Inflation Rate YoY$/, 'Prévia da inflação (IPCA-15) em 12 meses'], [/^Mid-month Inflation Rate MoM$/, 'Prévia da inflação (IPCA-15) no mês'],
  [/^Non Farm Payrolls$/, 'Criação de empregos (payroll)'], [/^GDP Growth Rate QoQ( Adv| Final| 2nd Est)?$/, 'PIB no trimestre'], [/^GDP Growth Rate YoY( Adv| Final)?$/, 'PIB em 12 meses'],
  [/^Retail Sales MoM$/, 'Vendas no varejo, mensal'], [/^Retail Sales YoY$/, 'Vendas no varejo em 12 meses'], [/^PPI MoM$/, 'Inflação ao produtor, mensal'], [/^Industrial Production MoM$/, 'Produção industrial, mensal'],
  [/^Initial Jobless Claims$/, 'Pedidos de seguro-desemprego'], [/^Michigan Consumer Sentiment( Prel| Final)?$/, 'Confiança do consumidor (Michigan)'], [/^ISM Manufacturing PMI$/, 'PMI industrial (ISM)'], [/^ISM Services PMI$/, 'PMI de serviços (ISM)'],
  [/^Core PCE Price Index MoM$/, 'Núcleo do PCE (inflação preferida do Fed), mensal'], [/^PCE Price Index MoM$/, 'Inflação PCE, mensal'], [/^Balance of Trade$/, 'Balança comercial'], [/^Unemployment Rate$/, 'Taxa de desemprego'],
  [/^Copom Meeting Minutes$/, 'Ata do Copom'], [/^BCB Focus Market Readout$/, 'Boletim Focus (Banco Central)'], [/^BCB National Monetary Council Meeting$/, 'Reunião do Conselho Monetário Nacional'],
  [/^Presidential Elections? - 2nd Round$/, 'Eleição presidencial: 2º turno'], [/^Presidential Elections?$/, 'Eleição presidencial'], [/^Exports YoY$/, 'Exportações em 12 meses'], [/^Imports YoY$/, 'Importações em 12 meses'],
  [/^Business Confidence$/, 'Confiança empresarial'], [/^Consumer Confidence$/, 'Confiança do consumidor'], [/^S&P Global Services PMI$/, 'PMI de serviços (S&P Global)'], [/^S&P Global Manufacturing PMI$/, 'PMI industrial (S&P Global)'],
  [/^S&P Global Composite PMI$/, 'PMI composto (S&P Global)'], [/^RBA Meeting Minutes$/, 'Ata do banco central australiano'], [/^ECB President Lagarde Speech$/, 'Discurso: Lagarde (BCE)'], [/^BoE Gov Bailey Speech$/, 'Discurso: Bailey (Banco da Inglaterra)'],
  [/^Fed Chair Warsh Speech$/, 'Discurso: Warsh (presidente do Fed)'], [/^(.*) Speech$/, 'Discurso: $1'], [/^Existing Home Sales$/, 'Vendas de imóveis usados'], [/^New Home Sales$/, 'Vendas de imóveis novos'], [/^Housing Starts$/, 'Início de obras residenciais'],
  [/^Industrial Production YoY$/, 'Produção industrial em 12 meses'], [/^House Price Index YoY$/, 'Preço dos imóveis em 12 meses'], [/^Fixed Asset Investment \(YTD\) YoY$/, 'Investimento em ativos fixos no ano'],
  [/^Export Prices MoM$/, 'Preços de exportação, mensal'], [/^Import Prices MoM$/, 'Preços de importação, mensal'], [/^Monthly Budget Statement$/, 'Resultado fiscal mensal'], [/^Net Long-term TIC Flows$/, 'Fluxo de capital estrangeiro (TIC)'],
  [/^ZEW Economic Sentiment Index$/, 'Índice ZEW de confiança econômica'], [/^Ifo Business Climate$/, 'Clima de negócios Ifo'], [/^Current Account$/, 'Conta corrente'], [/^Foreign Direct Investment$/, 'Investimento estrangeiro direto'], [/^FOMC Minutes$/, 'Ata do Fed (FOMC)'], [/^(Fed )?Chair .* Speech$|^Fed Chair .*$/, 'Discurso do presidente do Fed'],
  [/^Federal Funds Rate$/, 'Juros do Fed (decisão)'], [/^FOMC Statement$/, 'Comunicado do Fed (FOMC)'], [/^FOMC Press Conference$/, 'Entrevista do presidente do Fed'],
  [/^FOMC Meeting Minutes$/, 'Ata da reunião do Fed'], [/^FOMC Economic Projections$/, 'Projeções do Fed (dot plot)'],
  [/^Core CPI m\/m$/, 'Núcleo da inflação ao consumidor (CPI), mensal'], [/^CPI m\/m$/, 'Inflação ao consumidor (CPI), mensal'], [/^CPI y\/y$/, 'Inflação ao consumidor (CPI), em 12 meses'],
  [/^Core PPI m\/m$/, 'Núcleo da inflação ao produtor (PPI), mensal'], [/^PPI m\/m$/, 'Inflação ao produtor (PPI), mensal'],
  [/^Core PCE Price Index m\/m$/, 'Núcleo do PCE (inflação preferida do Fed), mensal'], [/^PCE Price Index m\/m$/, 'Inflação PCE, mensal'],
  [/^Non-Farm Employment Change$/, 'Criação de empregos (payroll)'], [/^Unemployment Rate$/, 'Taxa de desemprego'], [/^Average Hourly Earnings m\/m$/, 'Salário médio por hora, mensal'],
  [/^Unemployment Claims$/, 'Pedidos de seguro-desemprego'], [/^JOLTS Job Openings$/, 'Vagas de emprego abertas (JOLTS)'], [/^ADP Non-Farm Employment Change$/, 'Empregos no setor privado (ADP)'],
  [/^Advance GDP q\/q$/, 'PIB (prévia trimestral)'], [/^Prelim GDP q\/q$/, 'PIB (revisão trimestral)'], [/^Final GDP q\/q$/, 'PIB (final trimestral)'], [/^GDP q\/q$/, 'PIB trimestral'], [/^GDP y\/y$/, 'PIB em 12 meses'],
  [/^Core Retail Sales m\/m$/, 'Vendas no varejo (núcleo), mensal'], [/^Retail Sales m\/m$/, 'Vendas no varejo, mensal'],
  [/^ISM Manufacturing PMI$/, 'PMI industrial (ISM)'], [/^ISM Services PMI$/, 'PMI de serviços (ISM)'], [/Manufacturing PMI$/, 'PMI industrial'], [/Services PMI$/, 'PMI de serviços'],
  [/^Prelim UoM Consumer Sentiment$/, 'Confiança do consumidor (Michigan, prévia)'], [/^Revised UoM Consumer Sentiment$/, 'Confiança do consumidor (Michigan, final)'], [/^CB Consumer Confidence$/, 'Confiança do consumidor (Conference Board)'],
  [/^Crude Oil Inventories$/, 'Estoques de petróleo dos EUA'], [/^Main Refinancing Rate$/, 'Juros do Banco Central Europeu'], [/^Monetary Policy Statement$/, 'Comunicado de política monetária'],
  [/^Official Bank Rate$/, 'Juros do Banco da Inglaterra'], [/^BOJ Policy Rate$/, 'Juros do Banco do Japão'], [/^Overnight Rate$/, 'Juros do Banco do Canadá'], [/^Cash Rate$/, 'Juros do banco central australiano'],
  [/^Trade Balance$/, 'Balança comercial'], [/^Building Permits$/, 'Licenças de construção'], [/^Housing Starts$/, 'Início de obras residenciais'], [/^Existing Home Sales$/, 'Vendas de imóveis usados'], [/^New Home Sales$/, 'Vendas de imóveis novos'],
  [/^Durable Goods Orders m\/m$/, 'Encomendas de bens duráveis, mensal'], [/^Industrial Production m\/m$/, 'Produção industrial, mensal'], [/^Empire State Manufacturing Index$/, 'Índice industrial de Nova York'], [/^Philly Fed Manufacturing Index$/, 'Índice industrial da Filadélfia'],
  [/^(.*) Speaks$/, 'Discurso: $1'], [/^Bank Holiday$/, 'Feriado bancário'],
];
const tvPeriod = (p) => (S.lang === 'en' ? p : String(p).replace(/\bSept\b/g, 'Sep').replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTHS_PT[MONTHS_EN.indexOf(m)]).replace(/\bQ([1-4])\b/, '$1º tri'));
const ffNum = (v) => (S.lang === 'en' || !v ? v || '' : String(v).replace(/(\d)\.(\d)/g, '$1,$2'));
function ffTitle(t) { if (S.lang === 'en') return t; for (const [re, pt] of FF_PT) if (re.test(t)) return t.replace(re, pt); return t; }
const FF_IMP = { High: 3, Medium: 2, Low: 1, Holiday: 0 };
// ---------- eventos oficiais (datas publicadas pelos próprios órgãos) ----------
function officialEvents() {
  const ev = [];
  FOMC.forEach((at) => { const d = at.slice(0, 10); ev.push({ id: 'fomc-' + d, at: Date.parse(at), t: L('Decisão de juros do Fed (FOMC)', 'Fed rate decision (FOMC)') + (FOMC_SEP.includes(d) ? L(' · com projeções', ' · with projections') : ''), country: 'US', imp: 3, src: 'Federal Reserve', url: FED_FACTS.calendarUrl, kind: 'fomc' }); });
  COPOM.forEach((at) => ev.push({ id: 'copom-' + at.slice(0, 10), at: Date.parse(at), t: L('Decisão da Selic (Copom)', 'Selic decision (Copom)'), country: 'BR', imp: 3, src: 'Banco Central', url: 'https://www.bcb.gov.br/publicacoes/calendariocopom', kind: 'copom', approx: true }));
  US_CPI.forEach(([at, ref]) => ev.push({ id: 'cpi-' + at.slice(0, 10), at: Date.parse(at), t: L(`Inflação dos EUA (CPI) de ${ref}`, `US inflation (CPI), ${ref}`), country: 'US', imp: 3, src: 'BLS', url: 'https://www.bls.gov/schedule/news_release/cpi.htm', kind: 'cpi' }));
  US_NFP.forEach(([at, ref]) => ev.push({ id: 'nfp-' + at.slice(0, 10), at: Date.parse(at), t: L(`Emprego nos EUA (payroll) de ${ref}`, `US jobs report (payroll), ${ref}`), country: 'US', imp: 3, src: 'BLS', url: 'https://www.bls.gov/schedule/news_release/empsit.htm', kind: 'nfp' }));
  const ib = CACHE.get('ibge'); if (ib) ev.push(...ib.v);
  return ev.sort((a, b) => a.at - b.at);
}
// todos os eventos: oficiais + calendário global do robô (sem duplicar CPI/payroll/Fed)
function allEvents() {
  const ev = officialEvents();
  const ff = CACHE.get('ffcal');
  if (ff) {
    for (const x of ff.v.ev) {
      const at = Date.parse(x.date); if (!isNum(at)) continue;
      const country = FF_CTRY[x.country] || x.country;
      const near = ev.find((e) => e.country === country && Math.abs(e.at - at) < 4 * 3600e3 && (
        (e.kind === 'cpi' && /CPI|Inflation Rate/.test(x.title)) || (e.kind === 'nfp' && /Non.?Farm|Unemployment Rate|Average Hourly/.test(x.title)) ||
        (e.kind === 'fomc' && /Federal Funds Rate|FOMC|Fed Interest Rate|Interest Rate Decision/.test(x.title)) || (e.kind === 'copom' && /Interest Rate Decision|Selic/.test(x.title)) ||
        (e.kind === 'ibge' && /IPCA|Inflation Rate|Mid-month Inflation|GDP Growth|Unemployment Rate|Retail Sales|Industrial Production|Services/.test(x.title) && Math.abs(e.at - at) < 2 * 3600e3)));
      if (near) { // completa o evento oficial com previsão, anterior e resultado
        if (/^CPI y\/y$|^Inflation Rate YoY$|^Federal Funds Rate$|^Fed Interest Rate Decision$|^Interest Rate Decision$|^Non-Farm Employment Change$|^Non Farm Payrolls$|^Mid-month Inflation Rate YoY$|^GDP Growth Rate QoQ|^Unemployment Rate$/.test(x.title) && !near.metric) Object.assign(near, { fc: x.forecast || near.fc, prev: x.previous || near.prev, act: x.actual || near.act, metric: x.title });
        continue;
      }
      const tv = ff.v.src === 'TradingView';
      ev.push({ id: 'ff-' + x.country + '-' + x.date + '-' + x.title, at, t: ffTitle(x.title) + (x.period ? ` (${tvPeriod(x.period)})` : ''), tEn: x.title, country, imp: FF_IMP[x.impact] ?? 1, src: tv ? 'TradingView' : 'ForexFactory', url: tv ? 'https://www.tradingview.com/economic-calendar/' : 'https://www.forexfactory.com/calendar', kind: 'ff', fc: x.forecast || '', prev: x.previous || '', act: x.actual || '', allDay: /^(All Day|Tentative)$/i.test(x.time || '') });
    }
  }
  return ev.sort((a, b) => a.at - b.at);
}
// ---------- decisões passadas derivadas dos dados oficiais ----------
function fedDecisions() {
  const h = CACHE.get('fedhist'); if (!h) return null;
  const a = h.v; const at = (d) => { let r = null; for (const x of a) { if (x.d <= d) r = x; else break; } return r; };
  return FOMC.map((iso) => {
    const d = iso.slice(0, 10), t = Date.parse(iso);
    if (t > Date.now()) return { d, t, future: true };
    const next = new Date(t + 86400e3 * 3).toISOString().slice(0, 10);
    const before = at(d), after = at(next);
    if (!before || !after || after.d <= d) return { d, t, unknown: true };
    return { d, t, from: before, to: after, bp: Math.round((after.hi - before.hi) * 100) };
  });
}
function copomDecisions() {
  const h = CACHE.get('selichist'); if (!h) return null;
  const a = h.v; const at = (ms) => { let r = null; for (const x of a) { if (x.t <= ms) r = x; else break; } return r; };
  return COPOM.map((iso) => {
    const t = Date.parse(iso), day = Date.parse(iso.slice(0, 10) + 'T12:00:00Z');
    if (t > Date.now()) return { d: iso.slice(0, 10), t, future: true };
    const before = at(day), after = at(day + 86400e3);
    if (!before || !after || after.t <= day) return { d: iso.slice(0, 10), t, unknown: true };
    return { d: iso.slice(0, 10), t, from: before.v, to: after.v, bp: Math.round((after.v - before.v) * 100) };
  });
}
const moveTxt = (bp) => (bp > 0 ? L(`alta de ${fmtNum(bp / 100, 2, 2)} p.p.`, `hike of ${bp} bp`) : bp < 0 ? L(`corte de ${fmtNum(-bp / 100, 2, 2)} p.p.`, `cut of ${-bp} bp`) : L('juros mantidos', 'rates held'));
const moveCls = (bp) => (bp > 0 ? 'bad' : bp < 0 ? 'live' : '');

// ---------- página Macro ----------
const MAC = { past: false };
function macroHtml() {
  return `${pageHead(PAGES.macro, `<button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>`)}
  <div class="grid g-2"><section class="panel hero" id="mc-fed"></section><section class="panel hero" id="mc-copom"></section></div>
  <section class="panel mt" id="mc-pm"></section>
  <div class="grid g-2 mt"><section class="panel" id="mc-fedcal"></section><section class="panel" id="mc-copcal"></section></div>
  <section class="panel mt" id="mc-next"></section>`;
}
function countdownHtml(at) {
  const s = Math.max(0, Math.round((at - Date.now()) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `<div class="cd" data-cd="${at}"><div><b>${d}</b><span>${esc(L('dias', 'days'))}</span></div><div><b>${String(h).padStart(2, '0')}</b><span>${esc(L('horas', 'hours'))}</span></div><div><b>${String(m).padStart(2, '0')}</b><span>min</span></div><div><b>${String(sec).padStart(2, '0')}</b><span>seg</span></div></div>`;
}
function tickCountdowns() {
  $$('.cd[data-cd]').forEach((el) => {
    const at = +el.dataset.cd; const s = Math.max(0, Math.round((at - Date.now()) / 1000));
    const v = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
    $$('b', el).forEach((b, i) => { const t = i === 0 ? String(v[0]) : String(v[i]).padStart(2, '0'); if (b.textContent !== t) b.textContent = t; });
    if (s === 0 && !el.dataset.done) { el.dataset.done = '1'; setTimeout(() => { if (S.page === 'macro') macroDraw(); if (S.page === 'agenda') agendaDraw(); }, 1500); }
  });
  $$('[data-until]').forEach((el) => { const t = until(+el.dataset.until); if (el.textContent !== t) el.textContent = t; });
}
function drawFed() {
  const f = CACHE.get('fed'), dec = fedDecisions();
  const next = FOMC.map(Date.parse).find((t) => t > Date.now());
  const last = dec && [...dec].reverse().find((x) => !x.future && !x.unknown);
  const lastChange = dec && [...dec].reverse().find((x) => x.bp);
  const F = f && f.v;
  setHTML('#mc-fed', panelHead('landmark', L('Fed (EUA)', 'Fed (US)'), { sub: esc(L(`Presidente: ${FED_FACTS.chair} (desde ${fmtDate(FED_FACTS.chairSince)})`, `Chair: ${FED_FACTS.chair} (since ${fmtDate(FED_FACTS.chairSince)})`)), right: stamp('fed') }) +
    `<div class="row wrap" style="gap:16px 30px">${kpiBox(L('Juros (faixa-alvo)', 'Target range'), F ? `${esc(fmtNum(F.from, 2, 2))}–${esc(fmtNum(F.to, 2, 2))}%` : '—', F ? `${esc(L('taxa efetiva', 'effective'))} ${esc(fmtNum(F.effr, 2, 2))}%` : '')}
    ${kpiBox(L('Última reunião', 'Last meeting'), last ? `<span class="badge ${moveCls(last.bp)}" style="font-size:14px;padding:4px 10px">${esc(moveTxt(last.bp))}</span>` : '—', last ? esc(fmtDate(last.t)) : '')}
    ${lastChange && lastChange !== last ? kpiBox(L('Última mudança', 'Last change'), esc(moveTxt(lastChange.bp)), esc(fmtDate(lastChange.t))) : ''}</div>
    <h3 class="small muted b mt">${esc(L('Próxima decisão', 'Next decision'))}: ${next ? esc(fmtDate(next, { weekday: 'long', day: '2-digit', month: 'long' })) + ', ' + esc(fmtTime(next)) : '—'}</h3>
    <div class="mt" style="margin-top:8px">${next ? countdownHtml(next) : ''}</div>
    ${note(L('Decisões passadas calculadas pela faixa-alvo publicada diariamente pelo Fed de Nova York. Datas: calendário oficial do Fed.', 'Past decisions computed from the target range published daily by the New York Fed. Dates: official Fed calendar.') + ' ' + `<a href="${esc(FED_FACTS.calendarUrl)}" target="_blank" rel="noopener noreferrer">federalreserve.gov</a>`)}`);
}
function drawCopom() {
  const b = CACHE.get('bcb'), dec = copomDecisions();
  const next = COPOM.map(Date.parse).find((t) => t > Date.now());
  const last = dec && [...dec].reverse().find((x) => !x.future && !x.unknown);
  const B = b && b.v;
  setHTML('#mc-copom', panelHead('landmark', L('Copom (Brasil)', 'Copom (Brazil)'), { sub: esc(L('Comitê de Política Monetária do Banco Central', 'Central Bank Monetary Policy Committee')), right: stamp('bcb') }) +
    `<div class="row wrap" style="gap:16px 30px">${kpiBox(L('Selic (meta)', 'Selic (target)'), B ? esc(fmtPct(B.selic.v, 2, false)) : '—', B && B.focus && isNum(B.focus.selic) ? `Focus ${esc(L('fim de', 'end of'))} ${B.focus.y}: ${esc(fmtPct(B.focus.selic, 2, false))}` : '')}
    ${kpiBox(L('Última reunião', 'Last meeting'), last ? `<span class="badge ${moveCls(last.bp)}" style="font-size:14px;padding:4px 10px">${esc(moveTxt(last.bp))}</span>` : '—', last ? `${esc(fmtDate(last.t))}${isNum(last.from) ? ` · ${esc(fmtPct(last.from, 2, false))} → ${esc(fmtPct(last.to, 2, false))}` : ''}` : '')}</div>
    <h3 class="small muted b mt">${esc(L('Próxima decisão', 'Next decision'))}: ${next ? esc(fmtDate(next, { weekday: 'long', day: '2-digit', month: 'long' })) + ', ' + esc(L('após as 18h', 'after 6 pm')) : '—'}</h3>
    <div class="mt" style="margin-top:8px">${next ? countdownHtml(next) : ''}</div>
    ${note(L('Decisões passadas calculadas pela série oficial da Selic (Banco Central, série 432). Horário da contagem: estimado em 18h30 de Brasília.', 'Past decisions computed from the official Selic series (BCB 432). Countdown time estimated at 6:30 pm Brasília.'))}`);
}
function drawPmFed() {
  const box = $('#mc-pm'); if (!box) return;
  const c = CACHE.get('pm-fed');
  const next = FOMC.map(Date.parse).find((t) => t > Date.now());
  const mon = next ? MONTHS_EN_FULL[new Date(next).getUTCMonth()] : '';
  const head = panelHead('target', L('O que o mercado aposta para a próxima reunião do Fed', 'What the market bets for the next Fed meeting'), { sub: esc(L('Probabilidades implícitas nos preços do Polymarket (dinheiro real apostado).', 'Implied probabilities from Polymarket prices (real money at stake).')), right: stamp('pm-fed') });
  if (!c) { box.innerHTML = head + skel(4, 18); return; }
  const ev = c.v.find((e) => new RegExp(`^Fed Decision in ${mon}`, 'i').test(e.title)) || c.v.find((e) => /^Fed Decision in/i.test(e.title));
  if (!ev) { box.innerHTML = head + `<div class="callout">${ico('info', 18)}<span>${esc(L('Nenhum mercado aberto para a próxima reunião no momento.', 'No open market for the next meeting right now.'))}</span></div>`; return; }
  const tr = (s) => (S.lang === 'en' ? s : String(s).replace(/No change/i, 'Manter os juros').replace(/(\d+)\+? bps decrease/i, (m, n) => `Corte de ${n}${/\+/.test(m) ? '+' : ''} pontos-base`).replace(/(\d+)\+? bps increase/i, (m, n) => `Alta de ${n}${/\+/.test(m) ? '+' : ''} pontos-base`));
  const outs = ev.markets.filter((m) => m.active && !m.closed).map((m) => { let p = null; try { p = num(JSON.parse(m.outcomePrices)[0]); } catch { /* */ } return { n: tr(m.groupItemTitle || m.question), p }; }).filter((o) => isNum(o.p)).sort((a, b) => b.p - a.p);
  box.innerHTML = head + `<a class="b" href="https://polymarket.com/event/${esc(encodeURIComponent(ev.slug))}" target="_blank" rel="noopener noreferrer" style="color:var(--text)">${esc(ev.title)}</a>
    <div class="stack mt" style="gap:10px">${outs.map((o, i) => `<div class="pm-o"><span class="nm" style="color:var(--text)">${esc(o.n)}</span><span class="pv" style="color:${i === 0 ? 'var(--accent)' : 'var(--text-2)'}">${esc(fmtPct(o.p * 100, o.p < 0.01 ? 1 : 0, false))}</span><div class="bar"><i style="width:${clamp(o.p * 100, 0.5, 100)}%;background:${i === 0 ? 'var(--accent)' : 'var(--text-3)'}"></i></div></div>`).join('')}</div>
    ${note(L(`Volume nas últimas 24 h: ${fmtCompact(ev.volume24hr)}. 1 ponto-base = 0,01 p.p. Probabilidade de mercado não é certeza.`, `24h volume: ${fmtCompact(ev.volume24hr)}. 1 bp = 0.01 pp. Market probability is not certainty.`))}`;
}
function meetingList(dec, all, kind) {
  const now = Date.now();
  const rows = all.map((iso, i) => ({ iso, t: Date.parse(iso), d: dec && dec[i] }));
  const nextI = rows.findIndex((r) => r.t > now);
  const show = MAC.past ? rows : rows.filter((r, i) => i >= nextI - 1);
  return show.map((r) => {
    const i = rows.indexOf(r);
    const status = r.t <= now ? (r.d && !r.d.unknown && !r.d.future ? `<span class="badge ${moveCls(r.d.bp)}">${esc(moveTxt(r.d.bp))}</span>` : `<span class="badge">${esc(L('realizada', 'held'))}</span>`) : i === nextI ? `<span class="badge pro" data-until="${r.t}">${esc(until(r.t))}</span>` : `<span class="badge">${esc(L('programada', 'scheduled'))}</span>`;
    const sep = kind === 'fomc' && FOMC_SEP.includes(r.iso.slice(0, 10)) ? ` <span class="tiny faint">${esc(L('· com projeções', '· with projections'))}</span>` : '';
    return `<div class="ev ${i === nextI ? 'next' : r.t <= now ? 'past' : ''}"><div class="ev-d">${esc(fmtDate(r.t, { day: '2-digit', month: 'short' }))}<small>${esc(new Date(r.t).getFullYear())}</small></div><div class="ev-t">${esc(kind === 'fomc' ? L('Reunião do FOMC', 'FOMC meeting') : L('Reunião do Copom', 'Copom meeting'))}${sep}</div>${status}</div>`;
  }).join('');
}
function drawMeetingCals() {
  const tog = `<button class="btn xs ghost" data-act="macPast">${ico(MAC.past ? 'eye' : 'history', 14)}${esc(MAC.past ? L('Esconder passadas', 'Hide past') : L('Ver passadas', 'Show past'))}</button>`;
  setHTML('#mc-fedcal', panelHead('calendar-days', L('Calendário do Fed', 'Fed calendar'), { right: tog }) + meetingList(fedDecisions(), FOMC, 'fomc') + note(L('As datas de 2027 são provisórias até o Fed confirmar.', '2027 dates are tentative until the Fed confirms them.')));
  setHTML('#mc-copcal', panelHead('calendar-days', L('Calendário do Copom', 'Copom calendar'), { right: tog }) + meetingList(copomDecisions(), COPOM, 'copom'));
}
ACT.macPast = () => { MAC.past = !MAC.past; drawMeetingCals(); };
function drawMacroNext() {
  const evs = officialEvents().filter((e) => e.at > Date.now() && e.kind !== 'fomc' && e.kind !== 'copom').slice(0, 6);
  setHTML('#mc-next', panelHead('activity', L('Próximos dados de inflação e emprego', 'Upcoming inflation & jobs data'), { right: `<a class="link-btn" href="#/agenda">${esc(L('Agenda completa', 'Full calendar'))}${ico('chevron-right', 15)}</a>` }) +
    (evs.length ? evs.map((e) => `<div class="ev"><div class="ev-d">${esc(fmtDate(e.at, { day: '2-digit', month: 'short' }))}<small>${esc(fmtTime(e.at))}</small></div><div><div class="ev-t">${ctryTag(e.country)}${esc(e.t)}</div><div class="ev-m"><span>${esc(e.src)}</span></div></div><span class="badge" data-until="${e.at}">${esc(until(e.at))}</span></div>`).join('') : skel(3, 18)));
}
function macroDraw() { drawFed(); drawCopom(); drawPmFed(); drawMeetingCals(); drawMacroNext(); }
onPrice((set) => {
  if (S.page !== 'macro') return;
  if (set.has('FED') || set.has('FEDHIST')) { drawFed(); drawMeetingCals(); }
  if (set.has('BCB') || set.has('SELICHIST')) { drawCopom(); drawMeetingCals(); }
  if (set.has('PMFED')) drawPmFed();
  if (set.has('AGENDA')) drawMacroNext();
});
page({
  id: 'macro', group: 'macro', icon: 'landmark', pt: 'Juros: Fed e Copom', en: 'Rates: Fed & Copom',
  sub: 'Juros dos EUA e do Brasil ao vivo, o resultado das últimas reuniões e quanto falta para a próxima.',
  subEn: 'Live US and Brazil rates, the outcome of the last meetings and the countdown to the next.',
  init(el) { el.innerHTML = macroHtml(); macroDraw(); },
  show() { macroDraw(); },
});

// ---------- página Agenda ----------
const AG = { ctry: 'all', imp: 2, past: false, range: 'week' };
function agendaHtml() {
  return `${pageHead(PAGES.agenda, '')}
  <section class="panel hero" id="ag-next"></section>
  <div class="row wrap between mt" style="gap:10px">
    <div class="row wrap" style="gap:8px">${seg('agc', [['all', L('Todos', 'All')], ['US', L('EUA', 'US')], ['BR', L('Brasil', 'Brazil')], ['EU', L('Europa', 'Europe')], ['AS', L('Ásia', 'Asia')]], AG.ctry)}${seg('agi', [['3', L('Alto impacto', 'High impact')], ['2', L('Médio e alto', 'Medium+')], ['1', L('Todos', 'All')]], AG.imp)}</div>
    <div class="row wrap" style="gap:8px">${seg('agr', [['week', L('Próximos 7 dias', 'Next 7 days')], ['month', L('Próximos 30 dias', 'Next 30 days')]], AG.range)}<button class="btn sm ghost" data-act="agPast">${ico(AG.past ? 'eye' : 'history', 15)}<span id="ag-past-l">${esc(AG.past ? L('Esconder passados', 'Hide past') : L('Ver últimos 7 dias', 'Show last 7 days'))}</span></button></div>
  </div>
  <section class="panel mt flush" id="ag-list"></section>`;
}
function agFiltered() {
  const now = Date.now(), end = now + (AG.range === 'week' ? 7 : 30) * 86400e3, start = AG.past ? now - 7 * 86400e3 : now - 3 * 3600e3;
  const asia = ['JP', 'CN', 'AU', 'NZ'], eu = ['EU', 'GB', 'CH'];
  return allEvents().filter((e) => e.at >= start && e.at <= end && e.imp >= AG.imp && (AG.ctry === 'all' || (AG.ctry === 'AS' ? asia.includes(e.country) : AG.ctry === 'EU' ? eu.includes(e.country) : e.country === AG.ctry)));
}
function drawAgendaNext() {
  const nx = allEvents().find((e) => e.at > Date.now() && e.imp >= 3);
  setHTML('#ag-next', panelHead('clock', L('Próximo evento de alto impacto', 'Next high-impact event'), { right: `<div class="row wrap" style="gap:6px">${stamp('ibge')}${stamp('ffcal')}</div>` }) + (nx ? `<div class="row wrap between" style="gap:14px"><div><div class="b" style="font-size:18px">${ctryTag(nx.country)} ${esc(nx.t)}</div><div class="muted small mt" style="margin-top:4px">${esc(fmtDate(nx.at, { weekday: 'long', day: '2-digit', month: 'long' }))}, ${esc(fmtTime(nx.at))} · ${esc(nx.src)}${nx.fc ? ` · ${esc(L('previsão', 'forecast'))} ${esc(ffNum(nx.fc))}` : ''}</div></div><div style="min-width:min(380px,100%)">${countdownHtml(nx.at)}</div></div>` : emptyBox('calendar-days', L('Nenhum evento de alto impacto programado', 'No high-impact event scheduled'))));
}
function drawAgendaList() {
  const box = $('#ag-list'); if (!box) return;
  const evs = agFiltered(); const now = Date.now();
  if (!evs.length) { box.innerHTML = `<div style="padding:18px">${emptyBox('calendar-days', L('Nenhum evento com esses filtros', 'No events for these filters'), esc(L('Tente incluir médio impacto ou ampliar para 30 dias.', 'Try including medium impact or widening to 30 days.')))}</div>`; return; }
  const nextId = (evs.find((e) => e.at > now) || {}).id;
  let html = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(L('Hora', 'Time'))}</th><th>${esc(L('País', 'Country'))}</th><th>${esc(L('Evento', 'Event'))}</th><th class="c">${esc(L('Impacto', 'Impact'))}</th><th class="r">${esc(L('Atual', 'Actual'))}</th><th class="r">${esc(L('Previsão', 'Forecast'))}</th><th class="r">${esc(L('Anterior', 'Previous'))}</th></tr></thead><tbody>`;
  let day = '';
  for (const e of evs) {
    const dk = dayKey(e.at);
    if (dk !== day) { day = dk; html += `<tr><td colspan="7" style="background:var(--panel-2);font-weight:750;color:var(--text)">${esc(fmtDate(e.at, { weekday: 'long', day: '2-digit', month: 'long' }))}${dk === todayISO() ? ` <span class="badge pro">${esc(L('hoje', 'today'))}</span>` : ''}</td></tr>`; }
    const past = e.at < now;
    html += `<tr style="${past ? 'opacity:.62' : ''}${e.id === nextId ? ';box-shadow:inset 3px 0 0 var(--accent)' : ''}"><td class="b">${e.allDay ? esc(L('dia todo', 'all day')) : esc(fmtTime(e.at))}</td><td>${ctryTag(e.country)}</td><td style="white-space:normal;min-width:220px"><a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer" style="color:var(--text)">${esc(e.t)}</a>${e.metric && S.lang !== 'en' ? ` <span class="tiny faint">(${esc(ffTitle(e.metric))})</span>` : ''}<div class="tiny faint">${esc(e.src)}${e.approx ? ' · ' + esc(L('horário estimado', 'estimated time')) : ''}</div></td><td class="c"><span class="imp i${e.imp}" title="${esc(['', L('baixo', 'low'), L('médio', 'medium'), L('alto', 'high')][e.imp] || '')}"><i></i><i></i><i></i></span></td><td class="r b">${esc(ffNum(e.act))}</td><td class="r">${esc(ffNum(e.fc))}</td><td class="r muted">${esc(ffNum(e.prev))}</td></tr>`;
  }
  html += '</tbody></table></div>';
  const ffOk = CACHE.get('ffcal');
  box.innerHTML = html + `<div style="padding:0 18px 16px">${note(L(`Horários no seu fuso. Fed, Copom, CPI e payroll: calendários oficiais. IBGE: API oficial ao vivo. Demais eventos, previsões e números anteriores: ForexFactory via robô do NEXUS${ffOk ? ` (lido em ${fmtDateTime(ffOk.v.gen)})` : ' (indisponível agora)'}. Quando um evento passa, ele sai da lista e o próximo assume.`, `Times in your time zone. Fed, Copom, CPI and payroll: official calendars. IBGE: live official API. Other events, forecasts and prior figures: ForexFactory via NEXUS bot. Past events drop off automatically.`))}</div>`;
}
ACT.seg_agc = (v) => { AG.ctry = v; drawAgendaList(); };
ACT.seg_agi = (v) => { AG.imp = +v; drawAgendaList(); };
ACT.seg_agr = (v) => { AG.range = v; drawAgendaList(); };
ACT.agPast = () => { AG.past = !AG.past; setHTML('#ag-past-l', esc(AG.past ? L('Esconder passados', 'Hide past') : L('Ver últimos 7 dias', 'Show last 7 days'))); drawAgendaList(); };
function agendaDraw() { drawAgendaNext(); drawAgendaList(); }
onPrice((set) => { if (S.page === 'agenda' && set.has('AGENDA')) agendaDraw(); });
// a cada minuto: eventos que passaram saem sozinhos
setInterval(() => { if (document.hidden) return; if (S.page === 'agenda') drawAgendaList(); if (S.page === 'dash' && typeof drawEvents === 'function') drawEvents(); }, 60000);
page({
  id: 'agenda', group: 'macro', icon: 'calendar-days', pt: 'Agenda econômica', en: 'Economic calendar',
  sub: 'Os indicadores e decisões que mexem com o mercado, com previsão, número anterior e resultado.',
  subEn: 'The indicators and decisions that move markets, with forecast, previous and actual.',
  init(el) { el.innerHTML = agendaHtml(); agendaDraw(); },
  show() { agendaDraw(); },
});
