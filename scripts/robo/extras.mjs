// =====================================================================
// Robô de dados — partes novas (out/2026):
//   geo        notícias de geopolítica por conflito (7 dias, cota por dia, várias fontes por história)
//   lab        histórico diário on-chain do BTC (Coin Metrics + bitcoin-data.com + medo e ganância)
//   buybacks   recompras, queimas e repasse aos detentores por token (DefiLlama + CoinGecko)
//   whales     100 maiores endereços de BTC e distribuição por faixa de saldo (bitinfocharts)
// Cada função recebe o "ctx" do robô (get, pool, previous, save, parseRss, GN, GNE) e nunca inventa número:
// se a fonte falha, o arquivo anterior é mantido com o horário antigo.
// =====================================================================

const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString();
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const r6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : null);
const r5 = (v) => (Number.isFinite(v) ? +v.toPrecision(5) : null);
const rint = (v) => (Number.isFinite(v) ? Math.round(v) : null);

// ---------------------------------------------------------------------
// GEOPOLÍTICA — inspirado no Radar Agora (Projeto X): geopolítica = guerras, conflitos, Oriente Médio,
// Rússia–Ucrânia, China, EUA e rotas de energia; internacional = política e sociedade sem conflito armado.
// ---------------------------------------------------------------------
export const GEO_TOPICS = [
  ['oriente', /\b(ir[ãa]|iran(ian)?|teer[ãa]|tehran|israel(ense)?s?|gaza|hamas|hezbollah?|l[íi]bano|lebanon|s[íi]ria|syria|iraque|iraq|i[êe]men|yemen|houthis?|cisjord[âa]nia|west bank|netanyahu|khamenei|idf|oriente m[ée]dio|middle east)\b/i],
  ['rotas', /\b(ormuz|hormuz|mar vermelho|red sea|bab el|suez|petroleiros?|tankers?|navios?|ships?|vessels?|shipping|frete mar[íi]timo|opep|opec|brent|crude|lng|g[áa]s natural)\b/i],
  ['ucrania', /\b(ucr[âa]nia(nos?)?|ukrain(e|ian)|r[úu]ssia|russia(n)?|kremlin|kiev|kyiv|moscou|moscow|zelensk[iy]|putin|donbas|crimeia|crimea|kharkiv|odessa)\b/i],
  ['asia', /\b(taiwan|taipei|mar do sul da china|south china sea|pequim|beijing|xi jinping|coreia do norte|north korea|pyongyang|kim jong|filipinas|philippines)\b/i],
  ['comercial', /\b(tarifas?|tariffs?|san[çc][õo]es|sanctions?|guerra comercial|trade war|embargos?|export controls?|controle de exporta[çc][ãa]o|omc|wto)\b/i],
];
const GEO_WORDS = /\b(guerra|war|conflito|conflict|ataques?|attacks?|bombardeio|airstrikes?|strikes?|m[íi]sseis?|m[íi]ssil|missiles?|drones?|tropas|troops|ex[ée]rcito|army|militar(es)?|military|cessar-fogo|ceasefire|tr[ée]gua|truce|invas[ãa]o|invasion|terroris|ref[ée]ns|hostages?|nuclear|ogivas?|otan|nato|onu\b|united nations|conselho de seguran[çc]a|security council|diplomac|diplomat|c[úu]pula|summit|g7|g20|bri[cç]s|golpe de estado|coup|sanç|pent[áa]gono|pentagon|centcom|marinha|navy)\b/i;
const OFFTOPIC = /\b(futebol|football|soccer|copa do mundo|world cup|nba|nfl|t[êe]nis|f[óo]rmula 1|olimp[íi]|novela|bbb|reality|celebridade|famos[oa]s?|moda|fashion|receitas?|hor[óo]scopo|carnaval|shows?|cantora?|singer|atriz|ator|actress|actor|filmes?|movie|s[ée]ries?|netflix|gl[úu]teo|glutemax|bumbum|dieta|fitness|loteria|mega-sena|ganhador|novel[ae]|bilheteria|lifestyle|wellness|recipe|recipes|royal family|pr[íi]ncipe harry|meghan)\b/i;
// política e sociedade (para "Internacional": sem isso, crime e variedades de outros países ficam de fora)
const POLITICS = /\b(presidente|president|governo|government|elei[çc][ãa]o|elei[çc][õo]es|election|eleitor|parlament|congresso|congress|senado|senate|ministr[oa]|minister|premi[êe]|prime minister|protestos?|protests?|manifesta[çc]|greve|lei\b|law\b|reforma|economia|economy|infla[çc][ãa]o|inflation|banco central|central bank|diplomac|acordo|deal|c[úu]pula|summit|papa\b|pope|imigra|migrant|refugiad|refugee|direitos humanos|human rights|suprema corte|supreme court|tribunal|ditadura|regime|oposi[çc][ãa]o|opposition|crise|crisis|d[íi]vida|debt|fmi|imf|banco mundial|world bank|or[çc]amento|budget|impeachment|corrup[çc]|corruption)\b/i;
// veículos aceitos quando a notícia vem pelo Google Notícias (os demais são descartados: sem fonte reconhecida)
const GN_OK = /^(g1|globo|o globo|folha|estad[ãa]o|uol|cnn|valor|infomoney|exame|veja|bbc|deutsche welle|dw\b|reuters|ap news|associated press|afp|bloomberg|cnbc|times brasil|poder360|metr[óo]poles|r7|terra|gazeta do povo|correio braziliense|ag[êe]ncia brasil|jovem pan|sbt news|band|rfi|euronews|al jazeera|the guardian|the new york times|new york times|wall street journal|the wall street journal|financial times|the washington post|washington post|politico|axios|france 24|sky news|abc news|nbc news|cbs news|npr|the economist|times of israel|haaretz|kyiv independent|kyiv post|the moscow times|south china morning post|nikkei|the japan times|yonhap|al arabiya|gulf news|arab news|the times of india|xinhua|anadolu|ansa|efe|lusa|carta capital|istoé|isto[ée] dinheiro|o tempo|zero hora|gzh|o povo|nexo|piau[íi]|brasil de fato|agência pública)/i;
const JUNK_TITLE = /(breaking updates from|top stories and breaking|news today\s*-|^live:? *$|newsletter|podcast\b|quiz\b|crossword|palavras cruzadas)/i;
// manchete que atribui a informação a uma das partes ("Irã diz…", "segundo o exército…"); "segundo dia" não conta
const ATTRIB = /\b(diz|dizem|afirma|afirmam|alega|alegam|acusa|acusam|nega|negam|amea[çc]a|amea[çc]am|says|said|claims?|alleges?|accuses?|according to|denies|warns?)\b|\bsegundo (o |a |os |as )?(governo|ex[ée]rcito|militares|minist[ée]rio|autoridades|fontes|relatos|testemunhas|ag[êe]ncia|kremlin|casa branca|pent[áa]gono|hamas|hezbollah|houthis|israel|ir[ãa]|r[úu]ssia|ucr[âa]nia|china|eua|otan|onu|imprensa|m[íi]dia)\b/i;
const STOP = new Set('a o os as de da do das dos e em no na nos nas um uma para por com sem que se ao à é foi diz após sobre contra entre the of to in on at for and is are was with by from after over as its it be has have new says'.split(' '));
const words = (t) => new Set(String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function jaccard(a, b) { let i = 0; for (const w of a) if (b.has(w)) i++; return i / (a.size + b.size - i || 1); }

export function geoFeeds(GN, GNE) {
  return [
    // Brasil (português)
    ['https://g1.globo.com/rss/g1/mundo/', 'g1 Mundo', 'pt', 'br'],
    ['https://feeds.folha.uol.com.br/mundo/rss091.xml', 'Folha Mundo', 'pt', 'br'],
    ['https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/?outputType=xml', 'Estadão Internacional', 'pt', 'br'],
    ['https://feeds.bbci.co.uk/portuguese/rss.xml', 'BBC News Brasil', 'pt', 'br'],
    ['https://rss.dw.com/rdf/rss-br-all', 'DW Brasil', 'pt', 'br'],
    ['https://www.metropoles.com/mundo/feed', 'Metrópoles', 'pt', 'br'],
    // por conflito (Google Notícias em português)
    [GN('(Irã OR Teerã OR Israel OR Gaza OR Líbano OR Hezbollah OR Hamas OR Iêmen) when:2d'), 'Google Notícias', 'pt', 'gn'],
    [GN('(Ormuz OR "Mar Vermelho" OR Houthis OR petroleiro OR "rota marítima") when:3d'), 'Google Notícias', 'pt', 'gn'],
    [GN('(Ucrânia OR Kiev OR Zelensky OR Kremlin OR Putin) when:2d'), 'Google Notícias', 'pt', 'gn'],
    [GN('(Taiwan OR "Mar do Sul da China" OR "Coreia do Norte") when:3d'), 'Google Notícias', 'pt', 'gn'],
    [GN('(tarifas OR sanções OR "guerra comercial" OR embargo) (EUA OR China OR Trump) when:2d'), 'Google Notícias', 'pt', 'gn'],
    // agências e grandes jornais (inglês)
    [GNE('(site:reuters.com OR site:apnews.com OR site:afp.com) (war OR strike OR sanctions OR missile OR ceasefire OR troops) when:2d'), 'Google News', 'en', 'agency'],
    ['https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera', 'en', 'world'],
    ['https://www.theguardian.com/world/rss', 'The Guardian', 'en', 'world'],
    ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', 'en', 'world'],
    ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'The New York Times', 'en', 'world'],
    ['https://www.kyivpost.com/feed', 'Kyiv Post', 'en', 'world'],
    ['https://gulfnews.com/feed', 'Gulf News', 'en', 'world'],
    // rotas marítimas e energia
    ['https://gcaptain.com/feed/', 'gCaptain', 'en', 'maritime'],
    ['https://maritime-executive.com/articles.rss', 'The Maritime Executive', 'en', 'maritime'],
    ['https://www.seatrade-maritime.com/rss.xml', 'Seatrade Maritime', 'en', 'maritime'],
  ];
}

export function classifyGeo(n, kind) {
  const txt = `${n.t} ${n.x || ''}`;
  if (OFFTOPIC.test(n.t) || JUNK_TITLE.test(n.t)) return null;
  if ((kind === 'gn' || kind === 'agency') && !GN_OK.test(String(n.src || '').trim())) return null;
  const topics = GEO_TOPICS.filter(([, re]) => re.test(txt)).map(([k]) => k);
  // matéria marítima só entra quando fala de rota, ataque, apreensão ou energia (não de feira e carreira)
  if (kind === 'maritime' && !topics.length && !GEO_WORDS.test(txt)) return null;
  const geo = topics.length > 0 || GEO_WORDS.test(txt);
  if (!geo && kind !== 'br' && kind !== 'world') return null; // fora das editorias de mundo, só entra conflito
  if (!geo && !POLITICS.test(txt)) return null; // "Internacional" = política e sociedade, não crime nem variedades
  return { cat: geo ? 'geo' : 'intl', topics, att: ATTRIB.test(n.t) };
}

export async function geoNews(ctx) {
  const feeds = geoFeeds(ctx.GN, ctx.GNE);
  const now = Date.now(), maxAge = 7 * DAY;
  const res = await ctx.pool(feeds, 4, async ([u, src, lang]) => ctx.parseRss(await ctx.get(u, { timeout: 25000 }), src, lang));
  let ok = 0; const raw = [];
  res.forEach((r, i) => { if (Array.isArray(r)) { ok++; const kind = feeds[i][3]; r.forEach((n) => raw.push({ ...n, kind })); } else console.warn('  geo falhou:', feeds[i][1], r && r.err); });
  // soma com as notícias das execuções anteriores (é assim que a linha do tempo chega a 7 dias)
  try { const old = await ctx.previous('news'); ((old && old.cats && old.cats.geo) || []).forEach((n) => raw.push({ ...n, kind: n.kind || 'br', old: true })); } catch { /* sem arquivo anterior */ }
  const seen = new Set(); const items = [];
  for (const n of raw.sort((a, b) => (a.old === b.old ? b.d - a.d : a.old ? 1 : -1)).sort((a, b) => b.d - a.d)) {
    if (n.d > now + 3600e3 || now - n.d > maxAge) continue;
    const key = n.u.split('?')[0]; const tkey = n.t.toLowerCase().replace(/\s+/g, ' ').slice(0, 70);
    if (seen.has(key) || seen.has(tkey)) continue; seen.add(key); seen.add(tkey);
    const c = classifyGeo(n, n.kind); if (!c) continue;
    items.push({ t: n.t, u: n.u, d: n.d, x: n.x, img: n.img, src: n.src, lang: n.lang, cat: c.cat, tp: c.topics, att: c.att || undefined, kind: n.kind });
    delete items[items.length - 1].ns; delete items[items.length - 1].dup;
  }
  // mesma história em vários veículos (títulos parecidos em até 36 h): conta as fontes
  const W = items.map((n) => words(n.t));
  for (let i = 0; i < items.length; i++) {
    if (items[i].grp !== undefined) continue;
    items[i].grp = i; const srcs = new Set([items[i].src]);
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].grp !== undefined || Math.abs(items[i].d - items[j].d) > 36 * 3600e3) continue;
      if (jaccard(W[i], W[j]) >= 0.42) { items[j].grp = i; srcs.add(items[j].src); }
    }
    items[i].ns = srcs.size;
  }
  items.forEach((n) => { if (n.grp !== items.indexOf(n)) { n.dup = 1; } delete n.grp; });
  // cota por dia (horário de Brasília) para os dias anteriores não sumirem
  const byDay = {};
  const kept = [];
  for (const n of items) {
    const k = new Date(n.d - 3 * 3600e3).toISOString().slice(0, 10);
    byDay[k] = (byDay[k] || 0) + 1;
    if (byDay[k] <= 70) kept.push(n);
  }
  if (kept.filter((n) => n.cat === 'geo').length < 10) throw new Error(`poucas notícias de geopolítica (${kept.length})`);
  return { items: kept, feeds: `${ok}/${feeds.length}`, days: Object.keys(byDay).length };
}

// ---------------------------------------------------------------------
// BITCOIN LAB — histórico diário alinhado por dia (t0 + i dias)
// ---------------------------------------------------------------------
const CM_MAP = { PriceUSD: ['price', r6], CapMVRVCur: ['mvrv', r5], CapMrktCurUSD: ['mcap', r5], IssTotUSD: ['iss', r5], HashRate: ['hash', r5], AdrActCnt: ['addr', rint], AdrBalCnt: ['bal', rint], SplyCur: ['supply', rint], SplyExNtv: ['exch', rint], FlowInExNtv: ['inflow', r5], FlowOutExNtv: ['outflow', r5], FeeTotNtv: ['fees', r5], TxCnt: ['tx', rint] };
// bitcoin-data.com (plano grátis: 10 pedidos por hora e os últimos 7 dias só para assinantes). Rodízio: até 3 por execução.
export const BD_METRICS = [
  ['cvdd', 'cvdd', r6], ['sth-realized-price', 'sthRealizedPrice', r6], ['lth-realized-price', 'lthRealizedPrice', r6], ['aviv', 'aviv', r5],
  ['lth-sopr', 'lthSopr', r5], ['sth-sopr', 'sthSopr', r5], ['sth-mvrv', 'sthMvrv', r5], ['lth-mvrv', 'lthMvrv', r5], ['sopr', 'sopr', r5],
  ['reserve-risk', 'reserveRisk', r5], ['true-market-mean', 'trueMarketMean', r6], ['terminal-price', 'terminalPrice', r6], ['balanced-price', 'balancedPrice', r6], ['rhodl-ratio', 'rhodlRatio', r5],
];
const T0 = Date.UTC(2010, 6, 18);
const idxOf = (t) => Math.round((Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate()) - T0) / DAY);

export async function lab(ctx) {
  const prev = await ctx.previous('lab');
  const now = Date.now();
  const n = idxOf(now) + 1;
  const out = { generatedAt: iso(now), t0: dayKey(T0), n, cm: {}, cmAt: null, bd: {}, bdAt: {}, bdLast: {}, bdMiss: {}, fng: null, fngAt: null };
  const fit = (arr) => { const a = Array.isArray(arr) ? arr.slice(0, n) : []; while (a.length < n) a.push(null); return a; };
  if (prev && prev.t0 === out.t0) {
    for (const k of Object.keys(prev.cm || {})) out.cm[k] = fit(prev.cm[k]);
    for (const k of Object.keys(prev.bd || {})) out.bd[k] = fit(prev.bd[k]);
    Object.assign(out.bdAt, prev.bdAt || {}); Object.assign(out.bdLast, prev.bdLast || {}); Object.assign(out.bdMiss, prev.bdMiss || {});
    out.cmAt = prev.cmAt || null; out.fng = prev.fng ? fit(prev.fng) : null; out.fngAt = prev.fngAt || null;
  }
  const notes = [];
  // Coin Metrics (comunitário, sem chave): renova a cada 6 h
  if (!out.cmAt || now - Date.parse(out.cmAt) > 6 * 3600e3 || !out.cm.price) {
    try {
      const url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=${Object.keys(CM_MAP).join(',')}&frequency=1d&page_size=10000&start_time=2010-07-18`;
      const j = await ctx.get(url, { as: 'json', timeout: 60000 });
      const rows = (j && j.data) || [];
      if (rows.length < 4000) throw new Error(`Coin Metrics: só ${rows.length} dias`);
      const cm = {}; for (const [, [k]] of Object.entries(CM_MAP)) cm[k] = new Array(n).fill(null);
      for (const r of rows) {
        const i = idxOf(Date.parse(r.time)); if (i < 0 || i >= n) continue;
        for (const [m, [k, rnd]] of Object.entries(CM_MAP)) { const v = Number(r[m]); if (r[m] !== undefined && r[m] !== null && Number.isFinite(v)) cm[k][i] = rnd(v); }
      }
      out.cm = cm; out.cmAt = iso(now);
    } catch (e) { notes.push('cm: ' + String(e.message || e).slice(0, 120)); }
  }
  // bitcoin-data.com: rodízio
  const due = BD_METRICS.filter(([name]) => !(out.bdMiss[name] && now - Date.parse(out.bdMiss[name]) < 7 * DAY))
    .filter(([name]) => !out.bdAt[name] || now - Date.parse(out.bdAt[name]) > 20 * 3600e3)
    .sort((a, b) => (Date.parse(out.bdAt[a[0]] || 0) || 0) - (Date.parse(out.bdAt[b[0]] || 0) || 0)).slice(0, 3);
  for (const [name, key, rnd] of due) {
    try {
      const r = await ctx.raw(`https://bitcoin-data.com/v1/${name}`, { timeout: 40000 });
      if (r.status === 404) { out.bdMiss[name] = iso(now); notes.push(`bd ${name}: não existe`); continue; }
      if (r.status === 429) { notes.push('bd: limite por hora'); break; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const arr = JSON.parse(r.text);
      if (!Array.isArray(arr) || arr.length < 100) throw new Error('formato inesperado');
      // o plano grátis só entrega ~4 anos: o que já foi guardado antes da janela continua (o histórico cresce a cada dia)
      const a = Array.isArray(out.bd[key]) ? out.bd[key].slice() : new Array(n).fill(null); let last = null;
      for (const x of arr) { const t = Date.parse(x.d); const v = Number(x[key]); const i = idxOf(t); if (i >= 0 && i < n && Number.isFinite(v)) { a[i] = rnd(v); if (!last || x.d > last) last = x.d; } }
      out.bd[key] = a; out.bdAt[name] = iso(now); out.bdLast[key] = last; delete out.bdMiss[name];
    } catch (e) { notes.push(`bd ${name}: ` + String(e.message || e).slice(0, 80)); }
  }
  // medo e ganância (alternative.me): histórico completo, 1× por dia
  if (!out.fngAt || now - Date.parse(out.fngAt) > 12 * 3600e3) {
    try {
      const j = await ctx.get('https://api.alternative.me/fng/?limit=0&format=json', { as: 'json', timeout: 30000 });
      const a = new Array(n).fill(null);
      for (const x of (j && j.data) || []) { const i = idxOf(Number(x.timestamp) * 1000); const v = Number(x.value); if (i >= 0 && i < n && Number.isFinite(v)) a[i] = v; }
      out.fng = a; out.fngAt = iso(now);
    } catch (e) { notes.push('fng: ' + String(e.message || e).slice(0, 80)); }
  }
  if (!out.cm.price) throw new Error('sem histórico de preço; ' + notes.join('; '));
  ctx.save('lab', out);
  return { days: n, bd: Object.keys(out.bd).length, ...(notes.length ? { note: notes.join('; ').slice(0, 300) } : {}) };
}

// ---------------------------------------------------------------------
// RECOMPRA E QUEIMA — "holders revenue" da DefiLlama (valor que volta ao detentor do token:
// recompra, queima ou distribuição), somado por token (todas as versões/mercados do protocolo).
// ---------------------------------------------------------------------
function holdersType(text) {
  const t = String(text || '');
  // Hyperliquid: desde a votação dos validadores (17–24/12/2025) o HYPE do Assistance Fund (e o que entra nele) conta como queimado
  if (/assistance fund/i.test(t)) return 'buyback-burn';
  // "buyback", "bought back", "repurchase", "buying STONK", "used to buy ORCA", "Assistance Fund"...
  const bb = /buy[\s-]?backs?|bought back|repurchas|assistance fund|token buy|\bbuy(?:s|ing)?\b(?:\s+back)?\s+(?:the\s+)?\$?[a-z]{2,12}\b/i.test(t) && !/\bbuy(?:s|ing)?\s+(?:liquidity|lp|insurance|bonds?)\b/i.test(t);
  // queima que já acabou ("used to be burnt before …") não conta
  const burn = /burn/i.test(t) && !/used to be burn|no longer burn|stopped burn|burns? ended/i.test(t);
  return bb && burn ? 'buyback-burn' : bb ? 'buyback' : burn ? 'burn' : 'share';
}
function methodText(m) {
  if (!m) return '';
  if (typeof m === 'string') return m;
  return m.HoldersRevenue || m.holdersRevenue || '';
}
export async function buybacks(ctx) {
  const prev = await ctx.previous('buybacks');
  const VER = 3; // mudou o formato ou a classificação: refaz na hora
  if (prev && prev.v === VER && Array.isArray(prev.list) && prev.list.length && Date.now() - Date.parse(prev.generatedAt) < 3 * 3600e3) { ctx.save('buybacks', prev); return { n: prev.list.length, cached: true }; }
  const ov = await ctx.get('https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyHoldersRevenue', { as: 'json', timeout: 90000 });
  // todos os protocolos com recompra, queima ou repasse nos últimos 60 dias (os novos entram sozinhos)
  const groups = new Map();
  for (const p of (ov && ov.protocols) || []) {
    if (!(p.total30d > 0 || p.total7d > 0 || p.total24h > 0 || p.total60dto30d > 0)) continue;
    const key = p.parentProtocol || ('p#' + (p.defillamaId || p.slug));
    let g = groups.get(key);
    if (!g) { g = { key, slug: p.parentProtocol ? p.parentProtocol.replace(/^parent#/, '') : p.slug, n: p.parentProtocol ? null : (p.displayName || p.name), logo: p.logo, cat: p.category, chains: new Set(), d1: 0, d7: 0, d30: 0, p30: 0, y1: 0, all: 0, parts: [], method: '' }; groups.set(key, g); }
    g.d1 += p.total24h || 0; g.d7 += p.total7d || 0; g.d30 += p.total30d || 0; g.p30 += p.total60dto30d || 0; g.y1 += p.total1y || 0; g.all += p.totalAllTime || 0;
    (p.chains || []).forEach((c) => g.chains.add(c));
    g.parts.push({ n: p.displayName || p.name, d30: p.total30d || 0 });
    if (!g.method) g.method = methodText(p.methodology);
  }
  const top = [...groups.values()].sort((a, b) => (b.d30 + b.p30) - (a.d30 + a.p30)).slice(0, 400);
  const sum = (slug) => ctx.get(`https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}?dataType=dailyHoldersRevenue&excludeTotalDataChartBreakdown=true`, { as: 'json', timeout: 40000 });
  const det = await ctx.pool(top, 6, (g) => sum(g.slug));
  // alguns "pais" da DefiLlama têm outro nome no resumo (maker → sky, astherus → aster): tenta o apelido e a 1ª palavra do produto
  const ALIAS = { maker: 'sky', astherus: 'aster' };
  for (let i = 0; i < top.length; i++) {
    if (det[i] && !det[i].err && det[i].gecko_id) continue;
    const g = top[i]; const firstWord = String((g.parts[0] && g.parts[0].n) || g.n || '').toLowerCase().split(/[\s.]+/)[0].replace(/[^a-z0-9-]/g, '');
    for (const alt of [...new Set([ALIAS[g.slug], firstWord].filter((x) => x && x !== g.slug))]) {
      try { const d = await sum(alt); if (d && d.gecko_id) { det[i] = d; g.slug = alt; break; } } catch { /* tenta o próximo */ }
    }
  }
  const prevBy = new Map(((prev && prev.list) || []).filter((x) => x.cv).map((x) => [x.id, x]));
  const list = []; let kept = 0;
  top.forEach((g, i) => {
    const d = det[i] && !det[i].err ? det[i] : null;
    if (!d) { const old = prevBy.get(g.slug); if (old) { list.push(old); kept++; } return; } // falhou agora: fica o último dado, com a data dele
    const gecko = d.gecko_id; if (!gecko) return; // sem token negociável no CoinGecko: fica de fora
    // série diária compacta: c0 = 1º dia (UTC) e cv = valores dia a dia (até 200 dias)
    const pts = (d.totalDataChart || []).filter((x) => Array.isArray(x) && Number.isFinite(x[1])).map(([t, v]) => [Number(t) * (Number(t) < 1e12 ? 1000 : 1), v]).slice(-200);
    if (!pts.length) return;
    const c0 = Math.floor(pts[0][0] / DAY) * DAY; const cv = [];
    for (const [t, v] of pts) { const k = Math.floor(t / DAY) - c0 / DAY; if (k >= 0 && k < 400) cv[k] = Math.round(v); } // dia UTC de cada ponto (nunca arredonda para o dia seguinte)
    for (let k = 0; k < cv.length; k++) if (cv[k] === undefined) cv[k] = null;
    const meth = methodText(d.methodology) || g.method || ((d.childProtocols || []).map((c) => methodText(c.methodology)).find(Boolean) || '');
    const num = (v, f) => (Number.isFinite(v) ? v : f);
    list.push({
      id: g.slug, n: d.displayName || d.name || g.n || g.slug, sym: d.symbol ? String(d.symbol).toUpperCase() : '', cg: gecko, logo: d.logo || g.logo, cat: d.category || g.cat,
      chains: [...g.chains].slice(0, 4), d1: num(d.total24h, g.d1), d7: num(d.total7d, g.d7), d30: num(d.total30d, g.d30), p30: num(d.total60dto30d, g.p30), y1: num(d.total1y, g.y1), all: num(d.totalAllTime, g.all),
      type: holdersType(meth), method: String(meth).replace(/\s+/g, ' ').slice(0, 240), parts: g.parts.sort((a, b) => b.d30 - a.d30).slice(0, 6).map((x) => x.n), c0, cv,
    });
  });
  if (list.length < 8) throw new Error(`só ${list.length} tokens com dados`);
  // preço e valor de mercado (CoinGecko), em lotes, para o "rendimento" da recompra
  try {
    const ids = [...new Set(list.map((x) => x.cg))]; const by = {};
    for (let k = 0; k < ids.length; k += 150) {
      const mk = await ctx.get(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.slice(k, k + 150).join(','))}&per_page=250&page=1`, { as: 'json', timeout: 30000 });
      (Array.isArray(mk) ? mk : []).forEach((m) => { by[m.id] = m; });
    }
    list.forEach((x) => { const m = by[x.cg]; if (m) { x.mcap = m.market_cap || null; x.fdv = m.fully_diluted_valuation || null; x.price = m.current_price; x.chg = m.price_change_percentage_24h; x.img = m.image; x.rank = m.market_cap_rank; if (!x.sym) x.sym = String(m.symbol || '').toUpperCase(); } });
  } catch (e) { console.warn('  buybacks: CoinGecko falhou', e.message); }
  list.sort((a, b) => b.d30 - a.d30);
  ctx.save('buybacks', { v: VER, generatedAt: iso(Date.now()), src: 'DefiLlama (holders revenue)', list });
  return { n: list.length, groups: top.length, ...(kept ? { kept } : {}) };
}

// ---------------------------------------------------------------------
// BALEIAS — bitinfocharts: 100 maiores endereços e distribuição por faixa de saldo
// ---------------------------------------------------------------------
const numTxt = (s) => { const v = Number(String(s).replace(/[^0-9.\-]/g, '')); return Number.isFinite(v) ? v : null; };
export function parseBitinfo(html, strip) {
  const first = (t) => { const m = String(t).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  const dval = (c) => { const m = c.match(/data-val=['"]([\d.eE+-]+)['"]/); return m ? Number(m[1]) : null; };
  let dist = [], top = [];
  const tm = html.match(/<table[^>]*>\s*<caption>\s*Bitcoin distribution[\s\S]*?<\/table>/i);
  if (tm) {
    const rows = [...tm[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((c) => ({ a: c[1], t: strip(c[2]) })));
    dist = rows.filter((r) => r.length >= 6 && /^[\[(]/.test(r[0].t)).map((r) => ({
      range: r[0].t.replace(/\s+/g, ' '), addr: dval(r[1].a) ?? first(r[1].t), addrPct: first(r[2].t), coins: dval(r[3].a) ?? first(r[3].t), usd: first(r[4].t.replace(/\$/g, '')), coinsPct: first(r[5].t),
    }));
  }
  // top 100: linhas com link de endereço
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
  while ((m = rowRe.exec(html)) && top.length < 100) {
    const r = m[1];
    const addr = (r.match(/\/bitcoin\/address\/([A-Za-z0-9]{20,90})/) || [])[1]; if (!addr) continue;
    const cells = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 4) continue;
    const rank = numTxt(strip(cells[0]));
    const label = strip((r.match(/wallet:\s*([^<]{2,60})/i) || [])[1] || '').replace(/^wallet:\s*/i, '');
    const balCell = strip(cells[2] || ''); const bal = numTxt((balCell.match(/^([\d,.]+)\s*BTC/i) || [])[1] || balCell.split(' ')[0]);
    const pct = numTxt((strip(cells[3] || '').match(/([\d.]+)%/) || [])[1]);
    const tail = cells.slice(4).map((c) => strip(c));
    top.push({ r: rank, a: addr, label: label || null, bal, pct, firstIn: tail[0] || null, lastIn: tail[1] || null, ins: numTxt(tail[2]), firstOut: tail[3] || null, lastOut: tail[4] || null, outs: numTxt(tail[5]) });
  }
  return { dist, top };
}
export async function whales(ctx) {
  const prev = await ctx.previous('whales');
  if (prev && Array.isArray(prev.top) && prev.top.length && Date.now() - Date.parse(prev.generatedAt) < 6 * 3600e3) { ctx.save('whales', prev); return { n: prev.top.length, cached: true }; }
  const html = await ctx.get('https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html', { timeout: 30000 });
  const { dist, top } = parseBitinfo(html, ctx.strip);
  if (top.length < 50 || dist.length < 6) throw new Error(`tabela mudou (top ${top.length}, faixas ${dist.length})`);
  ctx.save('whales', { generatedAt: iso(Date.now()), src: 'bitinfocharts.com', top, dist });
  return { n: top.length, ranges: dist.length };
}
