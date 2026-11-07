// =====================================================================
// EVENTOS DO MERCADO — o que mexe com o cripto, guiado pela data de hoje:
// juros (Fed e Copom), inflação, emprego e atividade (EUA e Brasil),
// vencimento de opções (Deribit), ajuste de dificuldade e halving
// (mempool.space). Contagem regressiva, semana em colunas, lista com
// filtros, histórico real (previsto × divulgado: TradingView via robô) e
// como o Bitcoin reagiu a cada divulgação (velas de 5 min da Binance).
// =====================================================================
const EVS = { cat: LS.get('ev-cat', 'all'), ctry: LS.get('ev-ctry', 'all'), imp: LS.get('ev-imp', 3) === 2 ? 2 : 3, wk: 0, past: false, fam: LS.get('ev-fam', 'cpi'), react: LS.get('ev-react', {}) || {}, busy: {} };
const EV_CATS = () => [
  ['all', L('Todos', 'All'), 'layers', 'var(--accent)'], ['juros', L('Juros', 'Rates'), 'landmark', 'var(--accent)'], ['infl', L('Inflação', 'Inflation'), 'trending-up', 'var(--signal)'],
  ['emp', L('Emprego', 'Jobs'), 'users', 'var(--info)'], ['ativ', L('Atividade', 'Activity'), 'factory', '#2dd4bf'], ['cripto', L('Cripto', 'Crypto'), 'bitcoin', '#f7931a'],
];
// famílias de indicadores: ligam o evento futuro ao histórico (mesmo título e país no TradingView)
const EV_FAM = [
  { k: 'fomc', c: 'US', re: /^(Fed Interest Rate Decision|Federal Funds Rate)$/, kind: 'fomc', cat: 'juros', good: 'low', pt: 'Juros do Fed (FOMC)', en: 'Fed rate decision (FOMC)',
    why: ['O Fed decide o juro básico dos EUA. Juro mais alto deixa o dólar mais atraente e drena dinheiro de ativos de risco como o Bitcoin; corte ou sinal de corte costuma ajudar. O mercado reage também ao comunicado e à entrevista do presidente do Fed, 30 minutos depois.', 'The Fed sets the US policy rate. Higher rates make the dollar more attractive and drain money from risk assets like Bitcoin; a cut or a hint of one usually helps. Markets also react to the statement and the chair’s press conference 30 minutes later.'] },
  { k: 'cpi', c: 'US', re: /^(Inflation Rate YoY|CPI y\/y)$/, kind: 'cpi', cat: 'infl', good: 'low', pt: 'Inflação dos EUA (CPI) em 12 meses', en: 'US CPI inflation YoY',
    why: ['A inflação ao consumidor dos EUA é o dado que mais mexe com a expectativa de juros. Abaixo do previsto = mais chance de corte do Fed (bom para cripto); acima = juros altos por mais tempo.', 'US consumer inflation moves rate expectations the most. Below forecast = better odds of Fed cuts (good for crypto); above = higher rates for longer.'] },
  { k: 'ccpi', c: 'US', re: /^(Core Inflation Rate YoY|Core CPI y\/y)$/, cat: 'infl', good: 'low', pt: 'Núcleo da inflação dos EUA (CPI)', en: 'US core CPI YoY',
    why: ['O núcleo tira alimentos e energia, que oscilam muito: é o que o Fed mais observa para decidir os juros.', 'Core strips out volatile food and energy: it is what the Fed watches most to set rates.'] },
  { k: 'nfp', c: 'US', re: /^(Non Farm Payrolls|Non-Farm Employment Change)$/, kind: 'nfp', cat: 'emp', pt: 'Emprego nos EUA (payroll)', en: 'US payrolls',
    why: ['Quantos empregos a economia dos EUA criou no mês. Número muito forte afasta corte de juros; muito fraco acende o medo de recessão. Sai sempre às 8h30 de Nova York, junto com a taxa de desemprego.', 'How many jobs the US economy added in the month. Too strong pushes rate cuts away; too weak raises recession fears. Always out at 8:30 New York time, with the unemployment rate.'] },
  { k: 'unemp', c: 'US', re: /^Unemployment Rate$/, cat: 'emp', pt: 'Desemprego nos EUA', en: 'US unemployment rate',
    why: ['Desemprego subindo indica economia esfriando: aumenta a chance de corte de juros, mas também o medo de recessão.', 'Rising unemployment signals a cooling economy: better odds of rate cuts, but also recession fears.'] },
  { k: 'pce', c: 'US', re: /^Core PCE Price Index (MoM|m\/m|YoY|y\/y)$/, cat: 'infl', good: 'low', pt: 'Núcleo do PCE (inflação preferida do Fed)', en: 'Core PCE (Fed’s preferred inflation)',
    why: ['É a medida de inflação que o próprio Fed usa na meta de 2%. Costuma confirmar ou corrigir o que o CPI mostrou.', 'The inflation gauge the Fed itself targets at 2%. It tends to confirm or correct what CPI showed.'] },
  { k: 'ppi', c: 'US', re: /^(PPI MoM|PPI m\/m)$/, cat: 'infl', good: 'low', pt: 'Inflação ao produtor dos EUA (PPI)', en: 'US PPI',
    why: ['Preços na porta da fábrica: antecipa parte da inflação que chega ao consumidor.', 'Factory-gate prices: an early read of inflation that reaches consumers.'] },
  { k: 'gdp', c: 'US', re: /^GDP Growth Rate QoQ/, cat: 'ativ', pt: 'PIB dos EUA', en: 'US GDP',
    why: ['O crescimento da maior economia do mundo. Muito fraco reforça medo de recessão; muito forte afasta cortes de juros.', 'Growth of the world’s largest economy. Very weak feeds recession fears; very strong pushes rate cuts away.'] },
  { k: 'retail', c: 'US', re: /^(Retail Sales MoM|Retail Sales m\/m)$/, cat: 'ativ', pt: 'Vendas no varejo dos EUA', en: 'US retail sales',
    why: ['Mostra a força do consumidor americano, motor de dois terços da economia dos EUA.', 'Shows the strength of US consumers, who drive two thirds of the US economy.'] },
  { k: 'claims', c: 'US', re: /^(Initial Jobless Claims|Unemployment Claims)$/, cat: 'emp', pt: 'Pedidos de seguro-desemprego (EUA)', en: 'US jobless claims',
    why: ['Sai toda quinta-feira: é o termômetro mais rápido do mercado de trabalho dos EUA.', 'Out every Thursday: the fastest gauge of the US job market.'] },
  { k: 'ism', c: 'US', re: /^ISM Manufacturing PMI$/, cat: 'ativ', pt: 'PMI industrial (ISM)', en: 'ISM manufacturing PMI',
    why: ['Pesquisa com gerentes de compras: acima de 50 a indústria cresce, abaixo de 50 encolhe.', 'Purchasing managers survey: above 50 manufacturing grows, below 50 it shrinks.'] },
  { k: 'copom', c: 'BR', re: /^Interest Rate Decision$/, kind: 'copom', cat: 'juros', good: 'low', pt: 'Selic (Copom)', en: 'Selic (Copom)',
    why: ['O Banco Central decide a Selic. Juro alto no Brasil segura o dólar e torna a renda fixa mais atraente que o cripto; cortes costumam ajudar ativos de risco em reais.', 'Brazil’s central bank sets the Selic. High rates hold the real and make fixed income more attractive than crypto; cuts usually help risk assets in BRL.'] },
  { k: 'ipca', c: 'BR', re: /^Inflation Rate YoY$/, ibge: /IPCA\)$|^Inflação oficial|^Official inflation/, cat: 'infl', good: 'low', pt: 'Inflação oficial do Brasil (IPCA)', en: 'Brazil IPCA inflation',
    why: ['A inflação oficial do Brasil guia a Selic: abaixo do previsto abre espaço para cortes.', 'Brazil’s official inflation guides the Selic: below forecast opens room for cuts.'] },
  { k: 'ipca15', c: 'BR', re: /^Mid-month Inflation Rate YoY$/, ibge: /IPCA-15/, cat: 'infl', good: 'low', pt: 'Prévia da inflação (IPCA-15)', en: 'IPCA-15 (mid-month inflation)',
    why: ['A prévia da inflação do mês: antecipa o IPCA.', 'The month’s inflation preview: an early read of IPCA.'] },
  { k: 'brgdp', c: 'BR', re: /^GDP Growth Rate QoQ/, ibge: /^PIB|GDP/, cat: 'ativ', pt: 'PIB do Brasil', en: 'Brazil GDP',
    why: ['O crescimento da economia brasileira no trimestre.', 'Brazil’s quarterly economic growth.'] },
  { k: 'brunemp', c: 'BR', re: /^Unemployment Rate$/, ibge: /PNAD/, cat: 'emp', pt: 'Desemprego no Brasil (PNAD)', en: 'Brazil unemployment (PNAD)',
    why: ['A taxa de desemprego do IBGE (PNAD Contínua).', 'IBGE’s unemployment rate (PNAD).'] },
];
const EV_CRYPTO_WHY = {
  opt: ['No vencimento, contratos de opções de bilhões de dólares deixam de existir. Nos dias anteriores o preço costuma ser "puxado" para perto do preço de dor máxima (onde a maior parte das opções vence sem valor); vencimentos trimestrais e de fim de mês são os maiores.', 'At expiry, billions of dollars of option contracts cease to exist. In the days before, price is often "pulled" toward max pain (where most options expire worthless); quarterly and month-end expiries are the largest.'],
  diff: ['A cada 2.016 blocos (cerca de 2 semanas) a rede do Bitcoin recalibra a dificuldade de mineração. Uma alta forte aperta a margem dos mineradores, que às vezes vendem mais BTC; uma queda alivia.', 'Every 2,016 blocks (about 2 weeks) the Bitcoin network recalibrates mining difficulty. A big increase squeezes miner margins, who sometimes sell more BTC; a drop eases it.'],
  halv: ['O halving corta pela metade a recompensa de cada bloco: menos bitcoins novos entram no mercado. Historicamente os grandes ciclos de alta começaram nos 12 a 18 meses seguintes.', 'The halving cuts the block reward in half: fewer new bitcoins reach the market. Historically the big bull cycles started 12 to 18 months later.'],
};
const famBy = (k) => EV_FAM.find((f) => f.k === k) || null;
const famName = (f) => (f ? L(f.pt, f.en) : '');
function evFamOf(e) {
  if (!e) return null;
  if (e.fam) return famBy(e.fam);
  if (e.kind === 'fomc' || e.kind === 'cpi' || e.kind === 'nfp' || e.kind === 'copom') return famBy(e.kind);
  if (e.kind === 'ibge') return EV_FAM.find((f) => f.ibge && f.ibge.test(e.t)) || null;
  const t = e.tEn || e.metric || '';
  return EV_FAM.find((f) => f.c === e.country && f.re.test(t)) || null;
}
function evCatOf(e) {
  if (e.cat) return e.cat;
  const f = evFamOf(e); if (f) return f.cat;
  const t = (e.tEn || '') + ' ' + e.t;
  if (/Interest Rate|Juros|Selic|FOMC|Copom|Rate Decision|Monetary Policy/i.test(t)) return 'juros';
  if (/Inflation|CPI|PPI|PCE|IPCA|Inflação|Price Index/i.test(t)) return 'infl';
  if (/Payroll|Employment|Unemployment|Jobless|Desemprego|Emprego|JOLTS|ADP|Claims/i.test(t)) return 'emp';
  if (/GDP|PIB|Retail|Varejo|PMI|Production|Produção|Sales|Vendas|Confidence|Confiança/i.test(t)) return 'ativ';
  return 'outros';
}
// ---------- fontes ----------
const EV_MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
// vencimentos de opções da Deribit: contratos em aberto, valor, put/call e preço de dor máxima por data
async function deribitCur(cur) {
  const j = await getJSON(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${cur}&kind=option`, { timeout: 15000 });
  const a = (j && j.result) || []; const by = new Map(); let px = null;
  for (const x of a) {
    const m = /^[A-Z]+-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/.exec(x.instrument_name || ''); if (!m || !(x.open_interest > 0)) continue;
    const t = Date.UTC(2000 + +m[3], EV_MON[m[2]], +m[1], 8, 0, 0); if (!isNum(t)) continue;
    const e = by.get(t) || { t, c: 0, p: 0, k: new Map() }; by.set(t, e);
    const k = +m[4]; const o = e.k.get(k) || { c: 0, p: 0 }; e.k.set(k, o);
    if (m[5] === 'C') { e.c += x.open_interest; o.c += x.open_interest; } else { e.p += x.open_interest; o.p += x.open_interest; }
    if (isNum(x.estimated_delivery_price)) px = x.estimated_delivery_price;
  }
  const exp = [...by.values()].filter((e) => e.t > Date.now() - 3600e3).sort((a, b) => a.t - b.t).map((e) => {
    const ks = [...e.k.keys()].sort((a, b) => a - b); let mp = null, best = Infinity;
    for (const K of ks) { let pay = 0; for (const [k, o] of e.k) pay += o.c * Math.max(0, K - k) + o.p * Math.max(0, k - K); if (pay < best) { best = pay; mp = K; } }
    return { t: e.t, c: +e.c.toFixed(1), p: +e.p.toFixed(1), n: isNum(px) ? Math.round((e.c + e.p) * px) : null, pcr: e.c > 0 ? +(e.p / e.c).toFixed(3) : null, mp };
  });
  return { px, exp };
}
function registerEventSources() {
  const need = () => S.page === 'events' || S.page === 'alerts';
  source({
    id: 'deribit', label: L('Vencimentos de opções', 'Option expiries'), provider: 'Deribit', every: 15 * 60e3, need,
    run: async () => { const [btc, eth] = await Promise.all([deribitCur('BTC'), deribitCur('ETH').catch(() => null)]); return { btc, eth }; },
    validate: (d) => d && d.btc && d.btc.exp.length > 0,
    onData: () => _markDirty('EVENTS'),
  });
  source({
    id: 'mp-diff', label: L('Ajuste de dificuldade e halving', 'Difficulty adjustment & halving'), provider: 'mempool.space', every: 10 * 60e3, need,
    run: async () => { const [d, h] = await Promise.all([getJSON('https://mempool.space/api/v1/difficulty-adjustment', { timeout: 12000 }), getJSON('https://mempool.space/api/blocks/tip/height', { timeout: 12000 })]); return { ...d, height: num(h) }; },
    validate: (d) => isNum(d.remainingBlocks) && isNum(d.height),
    onData: () => _markDirty('EVENTS'),
  });
  source({
    id: 'calhist', label: L('Histórico dos indicadores', 'Indicator history'), provider: L('robô NEXUS · TradingView', 'NEXUS bot · TradingView'), every: 6 * 3600e3, kind: 'daily', need,
    run: async () => getPipeline('calhist', 10 * 86400e3),
    validate: (j) => Array.isArray(j.ev) && j.ev.length >= 10,
    onData: (j) => { if (HEALTH.calhist) HEALTH.calhist.dataTs = Date.parse(j.generatedAt); _markDirty('EVENTS'); },
  });
}
// ---------- eventos cripto (do dia de hoje em diante) ----------
const EV_HALVING = 1050000;
function cryptoEvents() {
  const ev = []; const now = Date.now();
  const dr = CACHE.get('deribit');
  if (dr && dr.v.btc) {
    const ex = dr.v.btc.exp.filter((e) => e.t > now - 3600e3);
    const big = ex.filter((e) => e.t < now + 45 * 86400e3).sort((a, b) => (b.n || 0) - (a.n || 0))[0];
    for (const e of ex.filter((x) => x.t < now + 70 * 86400e3)) {
      const eth = dr.v.eth && dr.v.eth.exp.find((x) => x.t === e.t);
      const tot = (e.n || 0) + ((eth && eth.n) || 0);
      if (tot < 1e9 && e !== big) continue; // só os vencimentos relevantes (acima de US$ 1 bi) e o maior do próximo mês e meio
      ev.push({ id: 'opt-' + e.t, at: e.t, t: L(`Vencimento de opções de BTC e ETH · ${fmtCompact(tot)}`, `BTC & ETH options expiry · ${fmtCompact(tot)}`), country: 'CR', imp: tot >= 5e9 || e === big ? 3 : 2, src: 'Deribit', url: 'https://www.deribit.com/statistics/BTC/options-open-interest', kind: 'opt', cat: 'cripto', opt: { btc: e, eth } });
    }
  }
  const md = CACHE.get('mp-diff');
  if (md && isNum(md.v.estimatedRetargetDate)) {
    const d = md.v;
    ev.push({ id: 'diff-' + d.nextRetargetHeight, at: d.estimatedRetargetDate, t: L(`Ajuste de dificuldade do Bitcoin (estimativa ${fmtPct(d.difficultyChange, 1)})`, `Bitcoin difficulty adjustment (est. ${fmtPct(d.difficultyChange, 1)})`), country: 'CR', imp: Math.abs(d.difficultyChange) >= 5 ? 2 : 1, src: 'mempool.space', url: 'https://mempool.space/pt/mining', kind: 'diff', cat: 'cripto', approx: true });
    if (isNum(d.height) && d.height < EV_HALVING) {
      const blk = isNum(d.timeAvg) && d.timeAvg > 0 ? d.timeAvg : 600e3;
      ev.push({ id: 'halving-' + EV_HALVING, at: now + (EV_HALVING - d.height) * blk, t: L('Halving do Bitcoin (bloco 1.050.000)', 'Bitcoin halving (block 1,050,000)'), country: 'CR', imp: 3, src: 'mempool.space', url: 'https://mempool.space/pt/', kind: 'halv', cat: 'cripto', approx: true });
    }
  }
  return ev;
}
function evAll() { return [...allEvents(), ...cryptoEvents()].sort((a, b) => a.at - b.at); }
function evFiltered(list) {
  return list.filter((e) => (EVS.cat === 'all' || evCatOf(e) === EVS.cat) && (EVS.ctry === 'all' || e.country === EVS.ctry || (EVS.ctry === 'CR' && e.cat === 'cripto')) && (e.imp >= EVS.imp));
}
const evTag = (e) => (e.country === 'CR' ? `<span class="flag ev-cr">${esc(L('Cripto', 'Crypto'))}</span>` : ctryTag(e.country));
const evImp = (i) => `<span class="imp i${i}" title="${esc(['', L('impacto baixo', 'low impact'), L('impacto médio', 'medium impact'), L('impacto alto', 'high impact')][i] || '')}"><i></i><i></i><i></i></span>`;
const evCatChip = (e) => { const c = EV_CATS().find((x) => x[0] === evCatOf(e)); return c ? `<span class="ev-cat" style="--cc:${c[3]}">${ico(c[2], 12)}${esc(c[1])}</span>` : ''; };
// valor divulgado contra o previsto: verde/vermelho só quando a leitura para o cripto é clara (inflação e juros: abaixo = bom)
function evSurprise(f, a, fc) {
  if (!isNum(a) || !isNum(fc)) return { cls: '', txt: '' };
  const d = a - fc; if (Math.abs(d) < 1e-9) return { cls: 'flat', txt: L('igual ao previsto', 'in line') };
  const above = d > 0; const txt = above ? L('acima do previsto', 'above forecast') : L('abaixo do previsto', 'below forecast');
  if (f && f.good === 'low') return { cls: above ? 'down' : 'up', txt };
  return { cls: 'neu', txt };
}
// ---------- histórico (robô) e reação do BTC (velas de 5 min da Binance) ----------
function famHist(f) {
  const H = CACHE.get('calhist'); if (!H || !f) return [];
  return H.v.ev.filter((x) => x.c === f.c && f.re.test(x.t)).sort((a, b) => b.d.localeCompare(a.d));
}
async function evReact(x) {
  if (EVS.react[x.id] || EVS.busy[x.id]) return EVS.react[x.id] || null;
  const t = Date.parse(x.d); if (!isNum(t) || t > Date.now() - 3600e3) return null;
  EVS.busy[x.id] = true;
  try {
    const t0 = Math.floor(t / 300e3) * 300e3;
    const ks = await klines('BTCUSDT', '5m', 300, { startTime: t0 });
    if (!ks.length || Math.abs(ks[0].t - t0) > 600e3) throw new Error('sem velas');
    const b = ks[0].o; const at = (n) => (ks[n - 1] ? (ks[n - 1].c / b - 1) * 100 : null);
    const h1 = ks.slice(0, 12); const hi = Math.max(...h1.map((k) => k.h)), lo = Math.min(...h1.map((k) => k.l));
    const up = (hi / b - 1) * 100, dn = (lo / b - 1) * 100;
    const r = { b: +b.toFixed(2), h1: +(at(12) ?? NaN).toFixed(3), h4: +(at(48) ?? NaN).toFixed(3), h24: ks.length >= 288 ? +at(288).toFixed(3) : null, mx: +(Math.abs(up) >= Math.abs(dn) ? up : dn).toFixed(3) };
    EVS.react[x.id] = r;
    const keys = Object.keys(EVS.react); if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete EVS.react[k];
    LS.set('ev-react', EVS.react);
    return r;
  } catch { return null; } finally { delete EVS.busy[x.id]; }
}
async function evLoadReact(list) {
  let changed = false;
  await vPool(list.filter((x) => !EVS.react[x.id]), 3, async (x) => { if (await evReact(x)) changed = true; });
  if (changed && S.page === 'events') { evDrawHist(); evDrawHero(); }
}
function reactStats(list) {
  const rs = list.map((x) => EVS.react[x.id]).filter(Boolean);
  const v4 = rs.map((r) => r.h4).filter(isNum);
  if (!v4.length) return null;
  return { n: v4.length, abs4: v4.reduce((s, v) => s + Math.abs(v), 0) / v4.length, up4: v4.filter((v) => v > 0).length, big: rs.reduce((a, r) => (isNum(r.mx) && (!a || Math.abs(r.mx) > Math.abs(a.mx)) ? r : a), null) };
}
// ---------- agenda: Google Agenda e arquivo .ics ----------
const icsT = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (s) => String(s || '').replace(/[\\;,]/g, (m) => '\\' + m).replace(/\r?\n/g, '\\n');
function evIcs(list) {
  const now = icsT(Date.now());
  const ve = list.map((e) => ['BEGIN:VEVENT', `UID:${String(e.id).replace(/[^\w.-]/g, '')}@nexushub`, `DTSTAMP:${now}`, `DTSTART:${icsT(e.at)}`, `DTEND:${icsT(e.at + 30 * 60e3)}`, `SUMMARY:${icsEsc(e.t)}`, `DESCRIPTION:${icsEsc(`${e.src} · NEXUS HUB`)}`, `URL:${icsEsc(safeUrl(e.url) || '')}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.t)}`, 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NEXUS HUB//Eventos do mercado//PT', 'CALSCALE:GREGORIAN', ...ve, 'END:VCALENDAR'].join('\r\n');
}
const gcalUrl = (e) => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.t)}&dates=${icsT(e.at)}/${icsT(e.at + 30 * 60e3)}&details=${encodeURIComponent(`${e.src} · NEXUS HUB${e.url ? '\n' + e.url : ''}`)}`;
const evById = (id) => evAll().find((e) => e.id === id) || null;
ACT.evIcs = (el) => { const e = evById(el.dataset.id); if (!e) return; downloadFile(`nexus-${String(e.id).replace(/[^\w-]/g, '').slice(0, 40)}.ics`, evIcs([e]), 'text/calendar'); toast(L('Arquivo de agenda baixado: abra para adicionar ao seu calendário.', 'Calendar file downloaded: open it to add to your calendar.'), { type: 'ok' }); };
ACT.evIcsAll = () => {
  const now = Date.now(); const list = evFiltered(evAll()).filter((e) => e.at > now && e.at < now + 31 * 86400e3);
  if (!list.length) { toast(L('Nenhum evento com esses filtros nos próximos 30 dias.', 'No events for these filters in the next 30 days.'), { type: 'warn' }); return; }
  downloadFile('nexus-eventos-30-dias.ics', evIcs(list), 'text/calendar'); toast(L(`${list.length} eventos no arquivo de agenda (.ics).`, `${list.length} events in the calendar file (.ics).`), { type: 'ok' });
};
// ---------- desenho ----------
function eventsHtml() {
  return `${pageHead(PAGES.events, `<span class="stamp-wrap row wrap" style="gap:6px">${stamp('ffcal')}${stamp('deribit')}</span>`)}
  <section class="panel ev-hero" id="ev-hero"></section>
  <section class="panel mt" id="ev-week"></section>
  <div class="grid g-3 mt ev-cry"><section class="panel" id="ev-opt"></section><section class="panel" id="ev-diff"></section><section class="panel" id="ev-halv"></section></div>
  <section class="panel flush mt" id="ev-list"></section>
  <section class="panel mt" id="ev-hist"></section>`;
}
function evDrawHero() {
  const box = $('#ev-hero'); if (!box) return;
  const now = Date.now(); const all = evAll().filter((e) => e.at > now);
  const nx = all.find((e) => e.imp >= 3);
  if (!nx) { setHTML(box, panelHead('calendar-clock', L('Próximo grande evento', 'Next big event')) + emptyBox('calendar-days', L('Carregando os calendários…', 'Loading calendars…'))); return; }
  const f = evFamOf(nx); const hist = famHist(f).slice(0, 8); const st = reactStats(hist);
  if (hist.length && hist.some((x) => !EVS.react[x.id])) evLoadReact(hist);
  const last = hist[0];
  const vals = [[L('Anterior', 'Previous'), nx.prev || (last && last.a) || ''], [L('Previsão', 'Forecast'), nx.fc || ''], [L('Divulgado', 'Actual'), nx.act || '']].filter(([, v]) => v);
  const more = all.filter((e) => e.imp >= 3 && e.id !== nx.id).slice(0, 5);
  setHTML(box, `<div class="ev-h-grid"><div class="ev-h-main">
      <div class="ev-h-k">${ico('calendar-clock', 16)}${esc(L('Próximo grande evento', 'Next big event'))}${evCatChip(nx)}</div>
      <button class="ev-h-t" data-act="evOpen" data-id="${esc(nx.id)}">${evTag(nx)}<span>${esc(nx.t)}</span>${evImp(nx.imp)}</button>
      <div class="ev-h-when">${ico('clock', 15)}${esc(fmtDate(nx.at, { weekday: 'long', day: '2-digit', month: 'long' }))}, ${esc(fmtTime(nx.at))}${nx.approx ? ` <span class="faint">(${esc(L('estimado', 'estimated'))})</span>` : ''} <span class="faint">· ${esc(nx.src)}</span></div>
      ${countdownHtml(nx.at)}
      ${vals.length ? `<div class="ev-h-vals">${vals.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(ffNum(v))}</b></div>`).join('')}</div>` : ''}
      ${st ? `<div class="ev-h-react">${ico('bitcoin', 16)}<span>${richText(L(`Nas últimas ${st.n} divulgações o BTC andou em média ±${fmtNum(st.abs4, 1, 1)}% nas 4 horas seguintes e subiu em ${st.up4} de ${st.n}.`, `In the last ${st.n} releases BTC moved ±${fmtNum(st.abs4, 1, 1)}% on average over the next 4 hours and rose in ${st.up4} of ${st.n}.`))}</span></div>` : ''}
      <div class="row wrap ev-h-btns"><button class="btn sm pri" data-act="evOpen" data-id="${esc(nx.id)}">${ico('info', 15)}${esc(L('Detalhes e histórico', 'Details & history'))}</button><button class="btn sm al-hbell${ACCOUNT.user && alEvOn(nx.id) ? ' on' : ''}" data-act="alEv" data-id="${esc(nx.id)}" aria-pressed="${ACCOUNT.user && alEvOn(nx.id) ? 'true' : 'false'}">${ico(ACCOUNT.user && alEvOn(nx.id) ? 'bell-ring' : 'bell-plus', 15)}${esc(ACCOUNT.user && alEvOn(nx.id) ? L('Aviso marcado', 'Alert set') : L('Avisar no celular', 'Notify my phone'))}</button><a class="btn sm" href="${esc(safeUrl(gcalUrl(nx)))}" target="_blank" rel="noopener noreferrer">${ico('calendar-plus', 15)}Google Agenda</a><button class="btn sm ghost" data-act="evIcs" data-id="${esc(nx.id)}">${ico('download', 15)}${esc(L('Baixar (.ics)', 'Download (.ics)'))}</button></div>
    </div>
    <div class="ev-h-side"><div class="ev-h-k">${ico('list-filter', 15)}${esc(L('Depois dele (alto impacto)', 'After it (high impact)'))}</div>
      ${more.length ? more.map((e) => `<button class="ev-mini" data-act="evOpen" data-id="${esc(e.id)}"><span class="d"><b>${esc(fmtDate(e.at, { day: '2-digit', month: 'short' }))}</b><small>${esc(fmtTime(e.at))}</small></span><span class="t">${evTag(e)}${esc(e.t)}</span><span class="badge" data-until="${e.at}">${esc(until(e.at))}</span></button>`).join('') : `<p class="small faint">${esc(L('Nada mais de alto impacto programado por enquanto.', 'Nothing else high-impact scheduled yet.'))}</p>`}
      <a class="link-btn" href="#/agenda">${esc(L('Agenda econômica completa', 'Full economic calendar'))}${ico('chevron-right', 15)}</a>
    </div></div>`);
}
function evDrawWeek() {
  const box = $('#ev-week'); if (!box) return;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - ((d0.getDay() + 6) % 7) + EVS.wk * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return d; });
  const t0 = days[0].getTime(), t1 = t0 + 7 * 86400e3 + 3600e3;
  const list = evFiltered(evAll()).filter((e) => e.at >= t0 && e.at < t1);
  const today = dayKey(Date.now()); const now = Date.now();
  const col = (d) => {
    const k = dayKey(d); const evs = list.filter((e) => dayKey(e.at) === k);
    return `<div class="ev-day${k === today ? ' today' : ''}${d.getTime() + 86400e3 < now ? ' past' : ''}"><div class="ev-dh"><b>${esc(fmtDate(d, { weekday: 'short' }).replace('.', ''))}</b><span>${esc(fmtDate(d, { day: '2-digit', month: '2-digit' }))}</span>${k === today ? `<em>${esc(L('hoje', 'today'))}</em>` : ''}</div>
      ${evs.length ? evs.map((e) => { const c = EV_CATS().find((x) => x[0] === evCatOf(e)); return `<button class="ev-wi i${e.imp}${e.at < now ? ' done' : ''}" style="--cc:${c ? c[3] : 'var(--text-3)'}" data-act="evOpen" data-id="${esc(e.id)}" title="${esc(e.t)}"><span class="h">${e.allDay ? esc(L('dia', 'day')) : esc(fmtTime(e.at))}</span>${evTag(e)}<span class="n">${esc(e.t)}</span>${e.act ? `<b class="a">${esc(ffNum(e.act))}</b>` : ''}</button>`; }).join('') : `<span class="ev-none">${esc(L('sem eventos', 'no events'))}</span>`}</div>`;
  };
  const r = `${days[0].toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'short' })}`;
  setHTML(box, panelHead('calendar-range', EVS.wk ? L('Próxima semana', 'Next week') : L('Esta semana', 'This week'), { sub: esc(L(`${r} · ${list.length} evento(s) com os filtros abaixo. Clique num evento para ver detalhes, histórico e adicionar à agenda.`, `${r} · ${list.length} event(s) with the filters below. Click an event for details, history and to add it to your calendar.`)), right: `<div class="row" style="gap:6px"><button class="btn sm ghost" data-act="evWk" data-d="-1" ${EVS.wk <= 0 ? 'disabled' : ''} aria-label="${esc(L('Semana anterior', 'Previous week'))}">${ico('chevron-left', 16)}</button><button class="btn sm ghost" data-act="evWk" data-d="1" ${EVS.wk >= 3 ? 'disabled' : ''} aria-label="${esc(L('Próxima semana', 'Next week'))}">${ico('chevron-right', 16)}</button></div>` }) + evFilters() + `<div class="ev-wk">${days.map(col).join('')}</div>`);
}
function evFilters() {
  return `<div class="ev-flt"><div class="ev-cats" role="group" aria-label="${esc(L('Tipo de evento', 'Event type'))}">${EV_CATS().map(([k, t, ic, c]) => `<button class="lab-cat" style="--cc:${c}" data-act="evCat" data-k="${k}" aria-pressed="${EVS.cat === k}">${ico(ic, 14)}${esc(t)}</button>`).join('')}</div>
    <div class="row wrap" style="gap:8px">${seg('evc', [['all', L('Todos', 'All')], ['US', L('EUA', 'US')], ['BR', L('Brasil', 'Brazil')], ['CR', L('Cripto', 'Crypto')]], EVS.ctry)}${seg('evi', [['3', L('Alto impacto', 'High impact')], ['2', L('Médio e alto', 'Medium+')]], String(EVS.imp))}</div></div>`;
}
function evDrawOpt() {
  const box = $('#ev-opt'); if (!box) return;
  const dr = CACHE.get('deribit'); const head = panelHead('layers', L('Vencimento de opções', 'Options expiry'), { sub: esc(L('Contratos em aberto na Deribit, a maior bolsa de opções de cripto.', 'Open contracts on Deribit, the largest crypto options exchange.')), right: stamp('deribit') });
  if (!dr) { setHTML(box, head + skel(5, 16)); return; }
  const now = Date.now(); const B = dr.v.btc, E = dr.v.eth;
  const ex = B.exp.filter((e) => e.t > now).slice(0, 12);
  const big = ex.filter((e) => e.t < now + 45 * 86400e3).sort((a, b) => (b.n || 0) - (a.n || 0))[0] || ex[0];
  if (!big) { setHTML(box, head + emptyBox('layers', L('Sem vencimentos agora', 'No expiries now'))); return; }
  const eb = E && E.exp.find((x) => x.t === big.t);
  const tot = (big.n || 0) + ((eb && eb.n) || 0);
  const dist = isNum(B.px) && isNum(big.mp) ? (big.mp / B.px - 1) * 100 : null;
  const rows = ex.slice(0, 5).map((e) => { const x = E && E.exp.find((y) => y.t === e.t); return `<tr${e === big ? ' class="on"' : ''}><td>${esc(fmtDate(e.t, { day: '2-digit', month: 'short' }))}</td><td class="r num">${esc(fmtCompact(e.n))}</td><td class="r num">${x ? esc(fmtCompact(x.n)) : '—'}</td></tr>`; }).join('');
  setHTML(box, head + `<div class="ev-ck"><span class="k">${esc(L('Maior vencimento à frente', 'Largest upcoming expiry'))}</span><b class="v">${esc(fmtCompact(tot))}</b><span class="s">${esc(fmtDate(big.t, { weekday: 'long', day: '2-digit', month: 'long' }))}, ${esc(fmtTime(big.t))} · <span data-until="${big.t}">${esc(until(big.t))}</span></span></div>
    <div class="ev-kv"><div><span>${esc(L('Put/Call (BTC)', 'Put/Call (BTC)'))}</span><b class="${isNum(big.pcr) ? (big.pcr < 0.7 ? 'up' : big.pcr > 1 ? 'down' : '') : ''}">${isNum(big.pcr) ? esc(fmtNum(big.pcr, 2, 2)) : '—'}</b></div><div><span>${esc(L('Dor máxima (BTC)', 'Max pain (BTC)'))}</span><b>${isNum(big.mp) ? esc(usd(big.mp, [0, 0])) : '—'}</b>${isNum(dist) ? `<small class="${tone(dist)}">${esc(fmtPct(dist, 1))} ${esc(L('do preço', 'vs price'))}</small>` : ''}</div>${eb ? `<div><span>${esc(L('Dor máxima (ETH)', 'Max pain (ETH)'))}</span><b>${isNum(eb.mp) ? esc(usd(eb.mp, [0, 0])) : '—'}</b></div>` : ''}</div>
    <div class="tbl-wrap"><table class="tbl ev-ot"><thead><tr><th>${esc(L('Data', 'Date'))}</th><th class="r">BTC</th><th class="r">ETH</th></tr></thead><tbody>${rows}</tbody></table></div>` + note(esc(L('Valor = contratos em aberto × preço do ativo. Put/Call abaixo de 0,7 = apostas de alta predominam; acima de 1 = proteção contra queda. Dor máxima = preço em que mais opções venceriam sem valor.', 'Value = open contracts × asset price. Put/Call below 0.7 = bullish bets dominate; above 1 = downside protection. Max pain = price at which most options would expire worthless.'))));
}
function evDrawDiff() {
  const box = $('#ev-diff'); if (!box) return;
  const md = CACHE.get('mp-diff'); const head = panelHead('pickaxe', L('Ajuste de dificuldade', 'Difficulty adjustment'), { sub: esc(L('A rede do Bitcoin recalibra a mineração a cada 2.016 blocos.', 'The Bitcoin network recalibrates mining every 2,016 blocks.')), right: stamp('mp-diff') });
  if (!md) { setHTML(box, head + skel(5, 16)); return; }
  const d = md.v; const ch = d.difficultyChange;
  setHTML(box, head + `<div class="ev-ck"><span class="k">${esc(L('Mudança estimada', 'Estimated change'))}</span><b class="v ${tone(ch)}">${esc(fmtPct(ch, 2))}</b><span class="s">${esc(L('no bloco', 'at block'))} ${esc(fmtNum(d.nextRetargetHeight, 0, 0))} · ${esc(fmtDate(d.estimatedRetargetDate, { day: '2-digit', month: 'short' }))}, ${esc(fmtTime(d.estimatedRetargetDate))} · <span data-until="${d.estimatedRetargetDate}">${esc(until(d.estimatedRetargetDate))}</span></span></div>
    <div class="ev-prog"><i style="width:${clamp(d.progressPercent, 0, 100).toFixed(1)}%"></i></div>
    <div class="ev-kv"><div><span>${esc(L('Progresso do ciclo', 'Epoch progress'))}</span><b>${esc(fmtNum(d.progressPercent, 1, 1))}%</b></div><div><span>${esc(L('Blocos restantes', 'Blocks left'))}</span><b>${esc(fmtNum(d.remainingBlocks, 0, 0))}</b></div><div><span>${esc(L('Ajuste anterior', 'Previous change'))}</span><b class="${tone(d.previousRetarget)}">${isNum(d.previousRetarget) ? esc(fmtPct(d.previousRetarget, 2)) : '—'}</b></div><div><span>${esc(L('Tempo médio do bloco', 'Average block time'))}</span><b>${isNum(d.timeAvg) ? esc(fmtNum(d.timeAvg / 60000, 1, 1)) + ' min' : '—'}</b></div></div>` + note(esc(L(EV_CRYPTO_WHY.diff[0], EV_CRYPTO_WHY.diff[1]))));
}
function evDrawHalv() {
  const box = $('#ev-halv'); if (!box) return;
  const md = CACHE.get('mp-diff'); const head = panelHead('hourglass', L('Próximo halving', 'Next halving'), { sub: esc(L('A recompensa por bloco cai pela metade no bloco 1.050.000.', 'The block reward halves at block 1,050,000.')), right: stamp('mp-diff') });
  if (!md || !isNum(md.v.height)) { setHTML(box, head + skel(5, 16)); return; }
  const h = md.v.height; const left = EV_HALVING - h; const blk = isNum(md.v.timeAvg) && md.v.timeAvg > 0 ? md.v.timeAvg : 600e3; const at = Date.now() + left * blk;
  const pct = clamp((h - 840000) / 210000 * 100, 0, 100);
  setHTML(box, head + `<div class="ev-ck"><span class="k">${esc(L('Data estimada', 'Estimated date'))}</span><b class="v">${esc(fmtDate(at, { month: 'long', year: 'numeric' }))}</b><span class="s">${esc(L(`faltam ${fmtNum(left, 0, 0)} blocos · cerca de ${fmtNum(left * blk / 86400e3, 0, 0)} dias`, `${fmtNum(left, 0, 0)} blocks left · about ${fmtNum(left * blk / 86400e3, 0, 0)} days`))}</span></div>
    <div class="ev-prog halv"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="ev-kv"><div><span>${esc(L('Bloco atual', 'Current block'))}</span><b>${esc(fmtNum(h, 0, 0))}</b></div><div><span>${esc(L('Recompensa hoje', 'Reward today'))}</span><b>3,125 BTC</b></div><div><span>${esc(L('Depois do halving', 'After the halving'))}</span><b class="up">1,5625 BTC</b></div><div><span>${esc(L('Ciclo percorrido', 'Cycle elapsed'))}</span><b>${esc(fmtNum(pct, 1, 1))}%</b></div></div>` + note(esc(L(EV_CRYPTO_WHY.halv[0] + ' Data estimada pelo tempo médio atual dos blocos (muda um pouco a cada dia).', EV_CRYPTO_WHY.halv[1] + ' Date estimated from the current average block time (shifts slightly every day).'))));
}
function evDrawList() {
  const box = $('#ev-list'); if (!box) return;
  const now = Date.now(); const start = EVS.past ? now - 7 * 86400e3 : now - 2 * 3600e3, end = now + 31 * 86400e3;
  const list = evFiltered(evAll()).filter((e) => e.at >= start && e.at <= end);
  const head = `<div class="panel-h" style="padding:16px 18px 8px;margin:0"><div class="tt"><h2 class="panel-t">${ico('list-filter', 18)}${esc(L('Próximos 30 dias', 'Next 30 days'))}</h2><p class="panel-s">${esc(L(`${list.length} evento(s) com os filtros desta página. Horários no seu fuso.`, `${list.length} event(s) with this page’s filters. Times in your time zone.`))}</p></div><div class="row wrap" style="gap:8px"><button class="btn sm ghost" data-act="evPast">${ico(EVS.past ? 'eye-off' : 'history', 15)}${esc(EVS.past ? L('Esconder passados', 'Hide past') : L('Incluir últimos 7 dias', 'Include last 7 days'))}</button><button class="btn sm" data-act="evIcsAll">${ico('calendar-plus', 15)}${esc(L('Baixar tudo para a agenda (.ics)', 'Download all to calendar (.ics)'))}</button></div></div>`;
  if (!list.length) { setHTML(box, head + `<div style="padding:0 18px 18px">${emptyBox('calendar-days', L('Nenhum evento com esses filtros', 'No events for these filters'), esc(L('Inclua médio impacto ou escolha "Todos".', 'Include medium impact or choose "All".')))}</div>`); return; }
  const nextId = (list.find((e) => e.at > now) || {}).id;
  let body = '', day = '';
  for (const e of list) {
    const dk = dayKey(e.at);
    if (dk !== day) { day = dk; const dn = fmtDate(e.at, { weekday: 'long', day: '2-digit', month: 'long' }); body += `<tr class="ev-lh"><td colspan="6">${esc(dn.charAt(0).toUpperCase() + dn.slice(1))}${dk === dayKey(now) ? ` <span class="badge pro">${esc(L('hoje', 'today'))}</span>` : ''}</td></tr>`; }
    const f = evFamOf(e); const past = e.at < now; const prv = e.prev || ((famHist(f)[0] || {}).a) || '';
    const sp = evSurprise(f, num(String(e.act || '').replace(',', '.').replace(/[^\d.-]/g, '')), num(String(e.fc || '').replace(',', '.').replace(/[^\d.-]/g, '')));
    body += `<tr class="click${past ? ' past' : ''}${e.id === nextId ? ' nx' : ''}" data-act="evOpen" data-id="${esc(e.id)}"><td class="b nowrap">${e.allDay ? esc(L('dia todo', 'all day')) : esc(fmtTime(e.at))}</td><td>${evTag(e)}</td><td class="ev-lt"><span class="t">${esc(e.t)}</span><div class="m">${evCatChip(e)}<span>${esc(e.src)}${e.approx ? ' · ' + esc(L('horário estimado', 'estimated time')) : ''}</span></div></td><td class="c">${evImp(e.imp)}</td><td class="r nowrap"><div class="ev-vals">${e.act ? `<b class="ev-a ${sp.cls}" title="${esc(sp.txt)}">${esc(ffNum(e.act))}</b>` : ''}${e.fc ? `<span>${esc(L('prev.', 'fcst'))} <b>${esc(ffNum(e.fc))}</b></span>` : ''}${prv ? `<span class="faint">${esc(L('ant.', 'prev'))} ${esc(ffNum(prv))}</span>` : ''}${!e.act && !e.fc && !prv ? '<span class="faint">—</span>' : ''}</div></td><td class="r nowrap"><div class="ev-when">${past ? `<span class="badge">${esc(L('divulgado', 'released'))}</span>` : `<span class="badge${e.id === nextId ? ' pro' : ''}" data-until="${e.at}">${esc(until(e.at))}</span>${alBell(e)}`}</div></td></tr>`;
  }
  setHTML(box, head + `<div class="tbl-wrap"><table class="tbl ev-l"><thead><tr><th>${esc(L('Hora', 'Time'))}</th><th>${esc(L('País', 'Country'))}</th><th>${esc(L('Evento', 'Event'))}</th><th class="c">${esc(L('Impacto', 'Impact'))}</th><th class="r">${esc(L('Valores', 'Values'))}</th><th class="r">${esc(L('Quando', 'When'))}</th></tr></thead><tbody>${body}</tbody></table></div><div style="padding:0 18px 16px">${note(esc(L('Fontes: Fed, Banco Central, BLS e IBGE (datas oficiais); calendário global e previsões: TradingView/ForexFactory via robô do NEXUS; opções: Deribit; dificuldade e halving: mempool.space. Valor divulgado em verde/vermelho só para inflação e juros (abaixo do previsto = bom para cripto).', 'Sources: Fed, Brazil’s central bank, BLS and IBGE (official dates); global calendar and forecasts: TradingView/ForexFactory via NEXUS bot; options: Deribit; difficulty and halving: mempool.space. Actual in green/red only for inflation and rates (below forecast = good for crypto).')))}</div>`);
}
function evDrawHist() {
  const box = $('#ev-hist'); if (!box) return;
  const H = CACHE.get('calhist');
  const head = panelHead('bitcoin', L('Como o Bitcoin reagiu', 'How Bitcoin reacted'), { sub: esc(L('As últimas divulgações de cada indicador: previsto × divulgado e quanto o BTC andou 1 h, 4 h e 24 h depois (velas de 5 min da Binance, a partir do minuto da divulgação).', 'The latest releases of each indicator: forecast vs actual and how much BTC moved 1 h, 4 h and 24 h later (Binance 5-min candles, from the release minute).')), right: stamp('calhist') });
  if (!H) { const h = HEALTH.calhist; setHTML(box, head + (h && h.ok === false ? emptyBox('hourglass', L('Histórico em preparação', 'History being prepared'), esc(L('O robô de dados monta este histórico uma vez por semana (TradingView). Ele aparece aqui sozinho assim que o arquivo ficar pronto.', 'The data robot builds this history once a week (TradingView). It shows up here on its own as soon as the file is ready.'))) : skel(6, 16))); return; }
  const fams = EV_FAM.filter((f) => famHist(f).length);
  if (!fams.length) { setHTML(box, head + emptyBox('bitcoin', L('Sem histórico ainda', 'No history yet'))); return; }
  if (!fams.some((f) => f.k === EVS.fam)) EVS.fam = fams[0].k;
  const f = famBy(EVS.fam); const list = famHist(f).slice(0, 12);
  if (list.some((x) => !EVS.react[x.id])) evLoadReact(list);
  const st = reactStats(list);
  const pc = (v) => (isNum(v) ? `<span class="ev-r ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${esc(fmtPct(v, 2))}</span>` : '<span class="faint">…</span>');
  const rows = list.map((x) => { const r = EVS.react[x.id]; const sp = evSurprise(f, x.ar, x.fr); return `<tr><td class="nowrap">${esc(fmtDate(x.d, { day: '2-digit', month: 'short', year: 'numeric' }))}<div class="tiny faint">${esc(fmtTime(x.d))}</div></td><td class="r"><b class="ev-a ${sp.cls}">${esc(x.a || '—')}</b>${sp.txt ? `<div class="tiny ${sp.cls === 'up' || sp.cls === 'down' ? sp.cls : 'faint'}">${esc(sp.txt)}</div>` : ''}</td><td class="r">${esc(x.f || '—')}</td><td class="r faint">${esc(x.p || '—')}</td><td class="r">${r ? pc(r.h1) : pc(null)}</td><td class="r">${r ? pc(r.h4) : pc(null)}</td><td class="r">${r ? pc(r.h24) : pc(null)}</td><td class="r hide-sm">${r ? pc(r.mx) : pc(null)}</td></tr>`; }).join('');
  setHTML(box, head + `<div class="ev-fams" role="group" aria-label="${esc(L('Indicador', 'Indicator'))}">${fams.map((x) => { const c = EV_CATS().find((y) => y[0] === x.cat); return `<button class="lab-cat" style="--cc:${c ? c[3] : 'var(--accent)'}" data-act="evFam" data-k="${x.k}" aria-pressed="${x.k === f.k}">${esc(x.c === 'BR' ? '🇧🇷 ' : '')}${esc(famName(x))}</button>`; }).join('')}</div>
    <div class="howto" style="margin-top:12px"><div class="ht-b ht-blue"><div class="ht-h">${ico('book-open', 16)}${esc(famName(f))}</div><p>${richText(L(f.why[0], f.why[1]))}</p></div></div>
    ${st ? `<div class="ev-st"><div><span>${esc(L('Movimento médio em 4 h', 'Average 4 h move'))}</span><b>±${esc(fmtNum(st.abs4, 2, 2))}%</b></div><div><span>${esc(L('BTC subiu depois (4 h)', 'BTC rose after (4 h)'))}</span><b class="${st.up4 * 2 >= st.n ? 'up' : 'down'}">${st.up4} ${esc(L('de', 'of'))} ${st.n}</b></div>${st.big ? `<div><span>${esc(L('Maior reação na 1ª hora', 'Largest first-hour move'))}</span><b class="${tone(st.big.mx)}">${esc(fmtPct(st.big.mx, 2))}</b></div>` : ''}</div>` : ''}
    <div class="tbl-wrap"><table class="tbl ev-ht"><thead><tr><th>${esc(L('Divulgação', 'Release'))}</th><th class="r">${esc(L('Divulgado', 'Actual'))}</th><th class="r">${esc(L('Previsto', 'Forecast'))}</th><th class="r">${esc(L('Anterior', 'Previous'))}</th><th class="r">BTC 1 h</th><th class="r">BTC 4 h</th><th class="r">BTC 24 h</th><th class="r hide-sm">${esc(L('Maior na 1ª hora', 'Max 1st hour'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` + note(esc(L(`Histórico: TradingView (via robô, lido ${fmtDateTime(H.v.generatedAt)}). Reação do BTC: preço de abertura da vela de 5 min do minuto da divulgação até o fechamento 1 h, 4 h e 24 h depois. Passado não garante o futuro.`, `History: TradingView (via robot, read ${fmtDateTime(H.v.generatedAt)}). BTC reaction: open of the 5-min candle at the release minute to the close 1 h, 4 h and 24 h later. Past performance does not guarantee the future.`))));
}
ACT.evOpen = (el) => {
  const e = evById(el.dataset.id); if (!e) return;
  const f = evFamOf(e); const hist = famHist(f).slice(0, 6); const now = Date.now();
  if (hist.some((x) => !EVS.react[x.id])) evLoadReact(hist).then(() => { const m = $('#ev-m-hist'); if (m) m.innerHTML = evModalHist(f, hist); });
  const why = e.kind === 'opt' ? EV_CRYPTO_WHY.opt : e.kind === 'diff' ? EV_CRYPTO_WHY.diff : e.kind === 'halv' ? EV_CRYPTO_WHY.halv : f ? f.why : null;
  const vals = [[L('Anterior', 'Previous'), e.prev || (hist[0] && hist[0].a) || ''], [L('Previsão', 'Forecast'), e.fc || ''], [L('Divulgado', 'Actual'), e.act || '']];
  const o = e.opt;
  openModal({
    title: e.t, wide: true,
    body: `<div class="ev-m-top">${evTag(e)}${evCatChip(e)}${evImp(e.imp)}<span class="small faint">${esc(e.src)}</span></div>
      <div class="ev-m-when">${ico('clock', 16)}<b>${esc(fmtDate(e.at, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }))}, ${esc(fmtTime(e.at))}</b>${e.approx ? `<span class="faint">(${esc(L('estimado', 'estimated'))})</span>` : ''}</div>
      ${e.at > now ? countdownHtml(e.at) : `<div class="callout info">${ico('check', 16)}<span>${esc(L(`Divulgado ${ago(e.at)}.`, `Released ${ago(e.at)}.`))}</span></div>`}
      ${o ? `<div class="ev-kv mt"><div><span>BTC</span><b>${esc(fmtCompact(o.btc.n))}</b><small>P/C ${isNum(o.btc.pcr) ? esc(fmtNum(o.btc.pcr, 2, 2)) : '—'} · ${esc(L('dor máx.', 'max pain'))} ${isNum(o.btc.mp) ? esc(usd(o.btc.mp, [0, 0])) : '—'}</small></div>${o.eth ? `<div><span>ETH</span><b>${esc(fmtCompact(o.eth.n))}</b><small>P/C ${isNum(o.eth.pcr) ? esc(fmtNum(o.eth.pcr, 2, 2)) : '—'} · ${esc(L('dor máx.', 'max pain'))} ${isNum(o.eth.mp) ? esc(usd(o.eth.mp, [0, 0])) : '—'}</small></div>` : ''}</div>` : vals.some(([, v]) => v) ? `<div class="ev-h-vals mt">${vals.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v ? esc(ffNum(v)) : '—'}</b></div>`).join('')}</div>` : ''}
      ${why ? `<div class="howto"><div class="ht-b ht-blue"><div class="ht-h">${ico('book-open', 16)}${esc(L('O que é e por que mexe com o cripto', 'What it is and why it moves crypto'))}</div><p>${richText(L(why[0], why[1]))}</p></div></div>` : ''}
      ${f && hist.length ? `<div class="ev-m-h"><div class="ev-h-k mt">${ico('history', 15)}${esc(L('Últimas divulgações e a reação do BTC', 'Latest releases and BTC’s reaction'))}</div><div id="ev-m-hist">${evModalHist(f, hist)}</div></div>` : ''}`,
    foot: `${e.at > Date.now() ? `<button class="btn pri al-hbell${ACCOUNT.user && alEvOn(e.id) ? ' on' : ''}" data-act="alEv" data-id="${esc(e.id)}">${ico(ACCOUNT.user && alEvOn(e.id) ? 'bell-ring' : 'bell-plus', 16)}${esc(ACCOUNT.user && alEvOn(e.id) ? L('Aviso marcado', 'Alert set') : L('Avisar no celular', 'Notify my phone'))}</button>` : ''}<a class="btn" href="${esc(safeUrl(gcalUrl(e)))}" target="_blank" rel="noopener noreferrer">${ico('calendar-plus', 16)}Google Agenda</a><button class="btn" data-act="evIcs" data-id="${esc(e.id)}">${ico('download', 16)}${esc(L('Baixar (.ics)', 'Download (.ics)'))}</button>${e.url ? `<a class="btn ghost" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${ico('external-link', 16)}${esc(L('Fonte oficial', 'Official source'))}</a>` : ''}<button class="btn pri" data-act="closeModal">${esc(L('Fechar', 'Close'))}</button>`,
  });
};
function evModalHist(f, hist) {
  const pc = (v) => (isNum(v) ? `<span class="ev-r ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${esc(fmtPct(v, 2))}</span>` : '<span class="faint">…</span>');
  return `<div class="tbl-wrap"><table class="tbl ev-ht"><thead><tr><th>${esc(L('Data', 'Date'))}</th><th class="r">${esc(L('Divulgado', 'Actual'))}</th><th class="r">${esc(L('Previsto', 'Forecast'))}</th><th class="r">BTC 1 h</th><th class="r">BTC 4 h</th><th class="r">BTC 24 h</th></tr></thead><tbody>${hist.map((x) => { const r = EVS.react[x.id]; const sp = evSurprise(f, x.ar, x.fr); return `<tr><td class="nowrap">${esc(fmtDate(x.d, { day: '2-digit', month: 'short', year: '2-digit' }))}</td><td class="r"><b class="ev-a ${sp.cls}" title="${esc(sp.txt)}">${esc(x.a || '—')}</b></td><td class="r">${esc(x.f || '—')}</td><td class="r">${r ? pc(r.h1) : pc(null)}</td><td class="r">${r ? pc(r.h4) : pc(null)}</td><td class="r">${r ? pc(r.h24) : pc(null)}</td></tr>`; }).join('')}</tbody></table></div>`;
}
ACT.evCat = (el) => { EVS.cat = el.dataset.k; LS.set('ev-cat', EVS.cat); eventsDraw(); };
ACT.seg_evc = (v) => { EVS.ctry = v; LS.set('ev-ctry', v); eventsDraw(); };
ACT.seg_evi = (v) => { EVS.imp = +v === 2 ? 2 : 3; LS.set('ev-imp', EVS.imp); eventsDraw(); };
ACT.evWk = (el) => { EVS.wk = clamp(EVS.wk + +el.dataset.d, 0, 3); evDrawWeek(); };
ACT.evPast = () => { EVS.past = !EVS.past; evDrawList(); };
ACT.evFam = (el) => { EVS.fam = el.dataset.k; LS.set('ev-fam', EVS.fam); evDrawHist(); };
function eventsDraw() { evDrawHero(); evDrawWeek(); evDrawOpt(); evDrawDiff(); evDrawHalv(); evDrawList(); evDrawHist(); }
onPrice((set) => { if (S.page === 'events' && (set.has('EVENTS') || set.has('AGENDA'))) eventsDraw(); });
setInterval(() => { if (!document.hidden && S.page === 'events') { evDrawWeek(); evDrawList(); } }, 60000);
page({
  id: 'events', group: 'macro', icon: 'calendar-clock', pt: 'Eventos do mercado', en: 'Market events',
  sub: 'O que mexe com o cripto, em ordem: juros, inflação, emprego, vencimento de opções, dificuldade e halving — com contagem regressiva, histórico real e a reação do Bitcoin a cada divulgação.',
  subEn: 'What moves crypto, in order: rates, inflation, jobs, options expiries, difficulty and halving — with countdowns, real history and Bitcoin’s reaction to each release.',
  init(el) { el.innerHTML = eventsHtml(); eventsDraw(); },
  show() { eventsDraw(); if (ACCOUNT.user) alLoad().then(() => alSyncEvents()).catch(() => {}); },
});
