// =====================================================================
// NOTÍCIAS — fontes em português (e as melhores de cripto em inglês), por
// tema, atualizadas sozinhas a cada 5 min. Primeiro tenta o arquivo do robô
// (rápido e sem limite); se estiver velho, lê as fontes direto (rss2json).
// GEOPOLÍTICA E CONFLITOS — linha do tempo automática por dia e por conflito.
// =====================================================================
const NEWS_CATS = {
  cripto: { pt: 'Cripto', en: 'Crypto', icon: 'bitcoin', maxH: 72, feeds: [
    ['https://livecoins.com.br/feed/', 'Livecoins', 'pt'], ['https://portaldobitcoin.uol.com.br/feed/', 'Portal do Bitcoin', 'pt'], ['https://www.criptofacil.com/feed/', 'CriptoFácil', 'pt'],
    ['https://cointelegraph.com/rss', 'Cointelegraph', 'en'], ['https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk', 'en'], ['https://decrypt.co/feed', 'Decrypt', 'en']] },
  economia: { pt: 'Economia e mercados', en: 'Economy & markets', icon: 'landmark', maxH: 48, feeds: [
    ['https://www.infomoney.com.br/feed/', 'InfoMoney', 'pt'], ['https://www.moneytimes.com.br/feed/', 'Money Times', 'pt'], ['https://g1.globo.com/rss/g1/economia/', 'g1 Economia', 'pt'], ['https://www.poder360.com.br/feed/', 'Poder360', 'pt']] },
  tech: { pt: 'IA e tecnologia', en: 'AI & tech', icon: 'sparkles', maxH: 72, feeds: [
    ['https://rss.tecmundo.com.br/feed', 'TecMundo', 'pt'], ['https://canaltech.com.br/rss/', 'Canaltech', 'pt'], ['https://olhardigital.com.br/feed/', 'Olhar Digital', 'pt'], ['https://g1.globo.com/rss/g1/tecnologia/', 'g1 Tecnologia', 'pt']] },
  mundo: { pt: 'Mundo', en: 'World', icon: 'earth', maxH: 48, feeds: [
    ['https://feeds.bbci.co.uk/portuguese/rss.xml', 'BBC News Brasil', 'pt'], ['https://g1.globo.com/rss/g1/mundo/', 'g1 Mundo', 'pt'], ['https://www.cnnbrasil.com.br/feed/', 'CNN Brasil', 'pt'], ['https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC World', 'en']] },
};
const NEWS = { tab: 'all', en: LS.get('news-en', false), tr: {}, sum: null };
let _pipeNews = null;
function pipelineNews() { // um pedido compartilhado por todas as categorias (vale 60 s)
  if (_pipeNews && Date.now() - _pipeNews.at < 60000) return _pipeNews.p;
  const p = getPipeline('news', 2 * 3600e3);
  _pipeNews = { at: Date.now(), p }; p.catch(() => { _pipeNews = null; });
  return p;
}
function newsClean(items, maxH) {
  const seen = new Set(), now = Date.now();
  return items.filter((n) => {
    if (!n || !n.t || !n.u || !isNum(n.d)) return false;
    if (n.d > now + 3600e3 || now - n.d > maxH * 3600e3) return false; // nem do futuro nem velha demais
    const k = n.u.split('?')[0] + '|' + n.t.toLowerCase().slice(0, 60);
    if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => b.d - a.d).slice(0, 80);
}
function registerNewsSources() {
  for (const [cat, def] of Object.entries(NEWS_CATS)) {
    source({
      id: 'news-' + cat, label: L(`Notícias: ${def.pt}`, `News: ${def.en}`), provider: L('fontes de notícia', 'news sources'), every: 5 * 60e3,
      need: () => (S.page === 'news' && (NEWS.tab === cat || NEWS.tab === 'all')) || (S.page === 'tokenomics' && cat === 'cripto'),
      run: async () => {
        try {
          const j = await pipelineNews();
          const arr = j.cats && j.cats[cat];
          if (Array.isArray(arr) && arr.length >= 5) return { items: newsClean(arr, def.maxH), via: 'pipe', gen: Date.parse(j.generatedAt) };
        } catch { /* robô fora: lê direto */ }
        const res = await Promise.allSettled(def.feeds.map(([u, name, lang]) => rssItems(u, 15).then((a) => a.map((n) => ({ ...n, src: name, lang })))));
        const items = res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
        if (!items.length) throw new Error(L('nenhuma fonte respondeu', 'no source responded'));
        return { items: newsClean(items, def.maxH), via: 'rss', ok: res.filter((r) => r.status === 'fulfilled').length, total: def.feeds.length };
      },
      validate: (d) => d.items.length > 0,
      onData: (d) => { SRC['news-' + cat].provider = d.via === 'pipe' ? L('robô NEXUS', 'NEXUS bot') : 'RSS'; _markDirty('NEWS'); },
    });
  }
}
function newsItems(cat) { const c = CACHE.get('news-' + cat); return c ? c.v.items : []; }
function ensureNews(cat) { const h = HEALTH['news-' + cat]; if (!h || !h.ts || Date.now() - h.ts > 5 * 60e3) runSource('news-' + cat, { force: true }); }
function newsFor(name, sym) {
  const items = newsItems('cripto'); if (!items.length) return [];
  const nm = String(name).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sy = String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const re = new RegExp(`\\b${nm}\\b`, 'i'), reS = sy.length >= 3 ? new RegExp(`\\b${sy}\\b`) : null;
  return items.filter((n) => re.test(n.t) || (reS && reS.test(n.t)));
}
function newsHtml() {
  const tabs = [['all', L('Destaques', 'Top'), 'newspaper'], ...Object.entries(NEWS_CATS).map(([k, d]) => [k, L(d.pt, d.en), d.icon])];
  return `${pageHead(PAGES.news, `<button class="btn sm" data-act="newsSum">${ico('sparkles', 16)}${esc(L('Resumo com IA', 'AI summary'))}</button>`)}
  <div class="row wrap between" style="gap:10px;margin-bottom:12px"><div class="seg-scroll">${seg('news', tabs, NEWS.tab)}</div>
  <div class="row wrap" style="gap:12px"><label class="check small" style="align-items:center"><input type="checkbox" data-chg="newsEn" ${NEWS.en ? 'checked' : ''}>${esc(L('Incluir notícias em inglês', 'Include English news'))}</label><button class="btn sm ghost" data-act="newsTr" id="news-tr">${ico('languages', 15)}${esc(L('Traduzir as em inglês', 'Translate English ones'))}</button></div></div>
  <div id="news-sum"></div><div id="news-src" class="row wrap" style="gap:6px;margin-bottom:12px"></div><div id="news-list"></div>`;
}
function newsVisible() {
  const cats = NEWS.tab === 'all' ? Object.keys(NEWS_CATS) : [NEWS.tab];
  let items = [];
  if (NEWS.tab === 'all') {
    // destaques: as mais recentes de cada tema, intercaladas
    const lists = cats.map((c) => newsItems(c).filter((n) => NEWS.en || n.lang !== 'en').slice(0, 9).map((n) => ({ ...n, cat: c })));
    for (let i = 0; i < 9; i++) lists.forEach((l) => { if (l[i]) items.push(l[i]); });
  } else items = newsItems(NEWS.tab).filter((n) => NEWS.en || n.lang !== 'en').map((n) => ({ ...n, cat: NEWS.tab }));
  return { cats, items };
}
function newsCard(n, lead) {
  const t = NEWS.tr[n.u] || n.t;
  return `<a class="nc ${lead ? 'lead' : ''}" href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer">
    ${n.img && lead ? `<img class="nc-img" src="${esc(safeUrl(n.img))}" alt="" loading="lazy">` : ''}
    <div class="nc-top"><span class="nc-src">${esc(n.src)}</span>${n.lang === 'en' ? `<span class="badge">${NEWS.tr[n.u] ? esc(L('traduzida', 'translated')) : 'EN'}</span>` : ''}<span>·</span><span title="${esc(fmtDateTime(n.d))}">${esc(ago(n.d))}</span></div>
    <div class="nc-t">${esc(t)}</div>${n.x && !NEWS.tr[n.u] ? `<div class="nc-x">${esc(n.x)}</div>` : ''}
    <div class="nc-foot"><span>${esc(L(NEWS_CATS[n.cat] ? NEWS_CATS[n.cat].pt : '', NEWS_CATS[n.cat] ? NEWS_CATS[n.cat].en : ''))}</span><span class="row" style="gap:4px">${esc(L('ler na fonte', 'read at source'))}${ico('external-link', 14)}</span></div></a>`;
}
function drawNews() {
  const box = $('#news-list'); if (!box) return;
  const { cats, items } = newsVisible();
  setHTML('#news-src', cats.map((c) => stamp('news-' + c, L(NEWS_CATS[c].pt, NEWS_CATS[c].en))).join(''));
  const loading = cats.some((c) => !CACHE.get('news-' + c) && HEALTH['news-' + c] && HEALTH['news-' + c].ok !== false);
  if (!items.length) {
    box.innerHTML = loading ? `<div class="news">${Array.from({ length: 6 }, () => `<div class="nc">${skel(4, 16)}</div>`).join('')}</div>` : `<div class="panel">${emptyBox('newspaper', L('Sem notícias agora', 'No news right now'), esc(L('As fontes não responderam. Tentando de novo automaticamente a cada poucos minutos.', 'Sources did not respond. Retrying automatically every few minutes.')))}</div>`;
    return;
  }
  box.innerHTML = `<div class="news">${items.slice(0, 60).map((n, i) => newsCard(n, i === 0)).join('')}</div>${note(L('As notícias são dos veículos citados em cada card; o NEXUS só organiza por tema e horário. Itens com mais de 2–3 dias saem sozinhos.', 'News belongs to the outlets on each card; NEXUS only sorts by topic and time. Items older than 2–3 days drop off.'))}`;
}
ACT.seg_news = (v) => { NEWS.tab = v; drawNews(); (v === 'all' ? Object.keys(NEWS_CATS) : [v]).forEach(ensureNews); };
ACT.newsEn = (el) => { NEWS.en = el.checked; LS.set('news-en', NEWS.en); drawNews(); };
async function translateItems(items) {
  const todo = items.filter((n) => n.lang === 'en' && !NEWS.tr[n.u]).slice(0, 25);
  if (!todo.length) return 0;
  const out = await aiCall([{ role: 'user', content: `Traduza estes títulos de notícias para ${S.lang === 'en' ? 'English' : 'português do Brasil'}, de forma natural e fiel. Responda SÓ com um JSON {"índice":"tradução"}.\n${JSON.stringify(Object.fromEntries(todo.map((n, i) => [i, n.t])))}` }], { model: NX.aiModelFast, max: 3000 });
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  Object.entries(j).forEach(([i, v]) => { const n = todo[+i]; if (n && typeof v === 'string' && v.length < 400) NEWS.tr[n.u] = v; });
  return todo.length;
}
ACT.newsTr = async (el) => {
  if (!aiKey()) { toast(L('A tradução usa IA com a sua chave da Anthropic (fica só neste navegador). Cole a chave em Configurações.', 'Translation uses AI with your Anthropic key (kept in this browser). Paste it in Settings.'), { type: 'warn', action: { label: L('Abrir', 'Open'), fn: () => go('settings') } }); return; }
  if (!NEWS.en) { NEWS.en = true; LS.set('news-en', true); const cb = $('[data-chg=newsEn]'); if (cb) cb.checked = true; }
  el.classList.add('busy');
  try { const n = await translateItems(S.page === 'geo' ? geoItems() : newsVisible().items); drawNews(); if (S.page === 'geo') drawGeo(); toast(n ? L(`${n} títulos traduzidos.`, `${n} titles translated.`) : L('Nada para traduzir.', 'Nothing to translate.'), { type: 'ok' }); }
  catch (e) { toast(L('Não foi possível traduzir: ', 'Could not translate: ') + e.message, { type: 'err' }); }
  el.classList.remove('busy');
};
ACT.newsSum = async (el) => {
  if (!aiKey()) { toast(L('O resumo usa IA com a sua chave da Anthropic. Cole a chave em Configurações.', 'The summary uses AI with your Anthropic key. Paste it in Settings.'), { type: 'warn', action: { label: L('Abrir', 'Open'), fn: () => go('settings') } }); return; }
  const items = newsVisible().items.slice(0, 40);
  if (!items.length) return;
  el.classList.add('busy');
  try {
    const text = await aiCall([{ role: 'user', content: `Estas são as manchetes mais recentes (fonte, horário UTC, título):\n${items.map((n) => `- [${n.src}, ${new Date(n.d).toISOString().slice(0, 16)}] ${n.t}`).join('\n')}\n\nFaça um resumo do dia em até 6 tópicos curtos para um investidor brasileiro, agrupando assuntos repetidos e citando a fonte entre parênteses. Use só o que está nas manchetes; não invente números. Responda em ${S.lang === 'en' ? 'English' : 'português do Brasil'}.` }], { max: 900 });
    NEWS.sum = { text, at: Date.now() };
  } catch (e) { NEWS.sum = { text: '⚠ ' + e.message, at: Date.now() }; }
  el.classList.remove('busy');
  setHTML('#news-sum', `<div class="panel mt" style="margin-bottom:14px">${panelHead('sparkles', L('Resumo com IA', 'AI summary'), { sub: esc(L(`Gerado às ${fmtTime(NEWS.sum.at)} a partir das manchetes abaixo. Confira nas fontes.`, `Generated at ${fmtTime(NEWS.sum.at)} from the headlines below. Check the sources.`)) })}<div class="ai-m">${esc(NEWS.sum.text)}</div></div>`);
};
onPrice((set) => { if (set.has('NEWS')) { if (S.page === 'news') drawNews(); if (S.page === 'geo') drawGeo(); } });
page({
  id: 'news', group: 'noticias', icon: 'newspaper', pt: 'Notícias', en: 'News',
  sub: 'Cripto, economia, tecnologia e mundo nas principais fontes do Brasil. Atualiza sozinho a cada 5 minutos.',
  subEn: 'Crypto, economy, tech and world from leading Brazilian outlets. Refreshes itself every 5 minutes.',
  init(el) { el.innerHTML = newsHtml(); drawNews(); },
  show() { drawNews(); },
});

// ---------- GEOPOLÍTICA E CONFLITOS ----------
// Base: Projeto X (Radar Agora). Geopolítica = guerras, conflitos, Oriente Médio, Rússia–Ucrânia, China,
// EUA e rotas de energia; Internacional = política e sociedade sem conflito armado. Cada notícia mostra a
// força da apuração: confirmada por 2+ veículos, 1 veículo (em desenvolvimento) ou versão de uma das partes.
const GEO = { tab: 'all', ptOnly: LS.get('geo-pt', false), conf: false, open: {}, day: {} };
const GEO_FRONTS = () => [
  ['oriente', L('Oriente Médio', 'Middle East'), 'swords', '#ff6b7a'],
  ['ucrania', L('Rússia e Ucrânia', 'Russia & Ukraine'), 'shield-alert', '#62b4ff'],
  ['rotas', L('Rotas e energia', 'Routes & energy'), 'ship', '#2dd4bf'],
  ['asia', L('China e Ásia', 'China & Asia'), 'map-pin', '#f4b43f'],
  ['comercial', L('Comércio e sanções', 'Trade & sanctions'), 'scale', '#c084fc'],
];
// reserva quando o robô atrasa: as mesmas regras de tema, aplicadas às manchetes de Mundo lidas direto
const GEO_RE = {
  oriente: /\b(ir[ãa]|iran(ian)?|teer[ãa]|tehran|israel(ense)?s?|gaza|hamas|hezbollah?|l[íi]bano|lebanon|s[íi]ria|syria|iraque|iraq|i[êe]men|yemen|houthis?|cisjord[âa]nia|west bank|netanyahu|khamenei|oriente m[ée]dio|middle east)\b/i,
  rotas: /\b(ormuz|hormuz|mar vermelho|red sea|suez|petroleiros?|tankers?|navios?|shipping|opep|opec|brent)\b/i,
  ucrania: /\b(ucr[âa]nia(nos?)?|ukrain(e|ian)|r[úu]ssia|russia(n)?|kremlin|kiev|kyiv|moscou|moscow|zelensk[iy]|putin|donbas|crimeia|crimea)\b/i,
  asia: /\b(taiwan|taipei|mar do sul da china|south china sea|pequim|beijing|xi jinping|coreia do norte|north korea|pyongyang|kim jong|filipinas|philippines)\b/i,
  comercial: /\b(tarifas?|tariffs?|san[çc][õo]es|sanctions?|guerra comercial|trade war|embargos?)\b/i,
};
// manchete que atribui a informação a uma das partes ("Irã diz…", "segundo o exército…"); "segundo dia" não conta
const GEO_ATT = /\b(diz|dizem|afirma|afirmam|alega|alegam|acusa|acusam|nega|negam|amea[çc]a|amea[çc]am|says|said|claims?|alleges?|accuses?|according to|denies|warns?)\b|\bsegundo (o |a |os |as )?(governo|ex[ée]rcito|militares|minist[ée]rio|autoridades|fontes|relatos|testemunhas|ag[êe]ncia|kremlin|casa branca|pent[áa]gono|hamas|hezbollah|houthis|israel|ir[ãa]|r[úu]ssia|ucr[âa]nia|china|eua|otan|onu|imprensa|m[íi]dia)\b/i;
function registerGeoSource() {
  source({
    id: 'geo', label: L('Geopolítica e conflitos', 'Geopolitics & conflicts'), provider: L('robô NEXUS', 'NEXUS bot'), every: 10 * 60e3, persist: false,
    need: () => S.page === 'geo',
    run: async () => {
      try {
        const j = await getPipeline('news', 12 * 3600e3);
        if (Array.isArray(j.cats && j.cats.geo) && j.cats.geo.length >= 10) return { items: j.cats.geo, via: 'pipe', gen: Date.parse(j.geoAt || j.generatedAt) };
      } catch { /* robô fora: lê direto */ }
      const res = await Promise.allSettled(NEWS_CATS.mundo.feeds.map(([u, name, lang]) => rssItems(u, 20).then((a) => a.map((n) => ({ ...n, src: name, lang })))));
      const raw = res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
      if (!raw.length) throw new Error(L('nenhuma fonte respondeu', 'no source responded'));
      const items = newsClean(raw, 72).map((n) => { const tp = Object.keys(GEO_RE).filter((k) => GEO_RE[k].test(`${n.t} ${n.x || ''}`)); return { ...n, cat: tp.length ? 'geo' : 'intl', tp, att: GEO_ATT.test(n.t) || undefined, ns: 1 }; });
      return { items, via: 'rss', gen: Date.now() };
    },
    validate: (d) => Array.isArray(d.items) && d.items.length > 0,
    onData: (d) => { SRC.geo.provider = d.via === 'pipe' ? L('robô NEXUS', 'NEXUS bot') : 'RSS'; GEO._g = null; _markDirty('GEO'); },
  });
}
// a mesma história em vários veículos vira uma só, com as outras fontes ligadas a ela
const geoWords = (t) => new Set(labNorm(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|after|over|que|para|com|sem|sobre|contra|entre|apos|diz|says|new)$/.test(w)));
function geoGroups() {
  const c = CACHE.get('geo'); const all = c && c.v ? c.v.items : [];
  if (GEO._g && GEO._g.src === all) return GEO._g;
  const items = all.filter((n) => n && n.t && n.u && isNum(n.d) && Date.now() - n.d < 7.5 * 86400e3).slice().sort((a, b) => b.d - a.d);
  const W = items.map((n) => geoWords(n.t));
  const used = new Array(items.length).fill(false); const leads = [];
  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue; used[i] = true;
    const lead = { ...items[i], more: [] };
    const outlets = new Set([lead.src]);
    for (let j = i + 1; j < items.length; j++) {
      if (used[j] || Math.abs(items[i].d - items[j].d) > 36 * 3600e3) continue;
      let k = 0; for (const w of W[i]) if (W[j].has(w)) k++;
      if (k / (W[i].size + W[j].size - k || 1) >= 0.42) { used[j] = true; if (!outlets.has(items[j].src)) { outlets.add(items[j].src); lead.more.push(items[j]); } } // mesma história, outro veículo
    }
    lead.ns = outlets.size;
    lead.att = GEO_ATT.test(lead.t) || undefined;
    lead.tp = [...new Set([...(lead.tp || []), ...lead.more.flatMap((m) => m.tp || [])])];
    if (lead.cat !== 'geo' && lead.more.some((m) => m.cat === 'geo')) lead.cat = 'geo';
    lead.stt = lead.att ? 'att' : lead.ns >= 2 ? 'ok' : 'dev';
    leads.push(lead);
  }
  GEO._g = { src: all, leads };
  return GEO._g;
}
function geoVisible() {
  const { leads } = geoGroups();
  return leads.filter((n) => (GEO.tab === 'intl' ? n.cat === 'intl' : n.cat === 'geo' && (GEO.tab === 'all' || (n.tp || []).includes(GEO.tab))) && (!GEO.ptOnly || n.lang !== 'en') && (!GEO.conf || n.stt === 'ok'));
}
function geoItems() { return geoVisible(); } // usado pelo botão "Traduzir"
const geoBadge = (n) => (n.stt === 'ok' ? `<span class="geo-st ok" title="${esc(L('A mesma notícia saiu em 2 ou mais veículos reconhecidos.', 'The same story ran in 2 or more recognized outlets.'))}">${ico('circle-check', 13)}${esc(L(`confirmada · ${n.ns} veículos`, `confirmed · ${n.ns} outlets`))}</span>`
  : n.stt === 'att' ? `<span class="geo-st att" title="${esc(L('A manchete atribui a informação a uma das partes ("diz", "afirma", "acusa"). Trate como versão até haver confirmação independente.', 'The headline attributes the information to one side ("says", "claims", "accuses"). Treat it as a version until independently confirmed.'))}">${ico('circle-alert', 13)}${esc(L('versão de uma das partes', 'one side’s version'))}${n.ns > 1 ? ` · ${n.ns}` : ''}</span>`
    : `<span class="geo-st dev" title="${esc(L('Por enquanto, só um veículo publicou.', 'So far only one outlet has published.'))}">${ico('hourglass', 13)}${esc(L('em desenvolvimento · 1 veículo', 'developing · 1 outlet'))}</span>`);
function geoHtml() {
  const fronts = GEO_FRONTS();
  return `${pageHead(PAGES.geo, `<button class="btn sm ghost" data-act="newsTr">${ico('languages', 15)}${esc(L('Traduzir as em inglês', 'Translate English ones'))}</button><span class="stamp-wrap">${stamp('geo')}</span>`)}
  <section class="panel" id="geo-fronts"></section>
  <div class="geo-bar mt"><div class="seg-scroll">${seg('geo', [['all', L('Todas as frentes', 'All fronts')], ...fronts.map(([k, t]) => [k, t]), ['intl', L('Internacional', 'International')]], GEO.tab)}</div>
    <div class="row wrap" style="gap:8px 16px"><label class="check small" style="align-items:center"><input type="checkbox" data-chg="geoConf" ${GEO.conf ? 'checked' : ''}>${esc(L('Só confirmadas (2+ veículos)', 'Confirmed only (2+ outlets)'))}</label><label class="check small" style="align-items:center"><input type="checkbox" data-chg="geoPt" ${GEO.ptOnly ? 'checked' : ''}>${esc(L('Só em português', 'Portuguese only'))}</label></div></div>
  <section class="panel mt" id="geo-tl"></section>
  <section class="panel mt" id="geo-src"></section>`;
}
function drawGeoFronts() {
  const box = $('#geo-fronts'); if (!box) return;
  const c = CACHE.get('geo');
  const head = panelHead('radar', L('Agora em cada frente', 'Now on each front'), { sub: esc(L('Quanto cada conflito está sendo noticiado e a manchete mais recente. Toque para abrir a linha do tempo daquela frente.', 'How much each conflict is being reported and the latest headline. Tap to open that front’s timeline.')) });
  if (!c) { setHTML(box, head + (HEALTH.geo && HEALTH.geo.ok === false ? emptyBox('wifi-off', L('Notícias indisponíveis agora', 'News unavailable'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : `<div class="geo-fronts">${'<div class="skel" style="height:150px"></div>'.repeat(5)}</div>`)); return; }
  const { leads } = geoGroups(); const now = Date.now();
  const stats = GEO_FRONTS().map(([k, t, ic, col]) => {
    const list = leads.filter((n) => n.cat === 'geo' && (n.tp || []).includes(k));
    const d24 = list.filter((n) => now - n.d < 86400e3);
    const top = list.filter((n) => now - n.d < 48 * 3600e3).slice().sort((a, b) => b.ns - a.ns || b.d - a.d)[0];
    return { k, t, ic, col, n24: d24.length, n7: list.length, last: list[0], top };
  });
  const mx = Math.max(1, ...stats.map((s) => s.n24));
  setHTML(box, head + `<div class="geo-fronts">${stats.map((s) => {
    const lead = s.top && s.top.ns > 1 ? s.top : s.last;
    return `<button class="geo-front${GEO.tab === s.k ? ' on' : ''}" data-act="geoFront" data-k="${s.k}" style="--c:${s.col}">
      <span class="h">${ico(s.ic, 17)}<b>${esc(s.t)}</b></span>
      <span class="m"><b>${s.n24}</b> ${esc(L('nas últimas 24 h', 'in the last 24 h'))} · ${s.n7} ${esc(L('em 7 dias', 'in 7 days'))}</span>
      <span class="bar"><i style="width:${Math.max(4, s.n24 / mx * 100)}%;background:${s.col}"></i></span>
      ${lead ? `<span class="t">${esc(NEWS.tr[lead.u] || lead.t)}</span><span class="s">${esc(lead.src)} · ${esc(ago(lead.d))}${lead.ns > 1 ? ` · ${esc(L(`${lead.ns} veículos`, `${lead.ns} outlets`))}` : ''}</span>` : `<span class="s">${esc(L('Sem notícias nos últimos 7 dias.', 'No news in the last 7 days.'))}</span>`}
    </button>`;
  }).join('')}</div>`);
}
function geoItemHtml(n) {
  const t = NEWS.tr[n.u] || n.t;
  const fr = Object.fromEntries(GEO_FRONTS().map(([k, tt, , col]) => [k, [tt, col]]));
  const open = GEO.open[n.u];
  return `<div class="geo-i"><span class="tm">${esc(fmtTime(n.d))}</span><div class="grow">
    <a class="geo-t" href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>
    <div class="geo-m">${geoBadge(n)}<span class="src">${esc(n.src)}${n.lang === 'en' && !NEWS.tr[n.u] ? ' · EN' : ''}</span>${(n.tp || []).filter((k) => fr[k]).map((k) => `<span class="geo-tp" style="--c:${fr[k][1]}">${esc(fr[k][0])}</span>`).join('')}${n.more.length ? `<button class="link-btn geo-more" data-act="geoMore" data-u="${esc(n.u)}">${ico(open ? 'chevron-up' : 'chevron-down', 14)}${esc(L(`+${n.more.length} ${n.more.length === 1 ? 'fonte' : 'fontes'}`, `+${n.more.length} ${n.more.length === 1 ? 'source' : 'sources'}`))}</button>` : ''}</div>
    ${open && n.more.length ? `<div class="geo-alt">${n.more.map((m) => `<a href="${esc(safeUrl(m.u))}" target="_blank" rel="noopener noreferrer"><b>${esc(m.src)}</b> · ${esc(NEWS.tr[m.u] || m.t)} <span class="faint">${esc(fmtTime(m.d))}</span></a>`).join('')}</div>` : ''}
  </div></div>`;
}
function drawGeo() {
  drawGeoFronts();
  const box = $('#geo-tl'); if (!box) return;
  const fr = GEO_FRONTS().find(([k]) => k === GEO.tab);
  const title = GEO.tab === 'all' ? L('Linha do tempo de todas as frentes', 'Timeline of all fronts') : GEO.tab === 'intl' ? L('Internacional: política e sociedade', 'International: politics & society') : L(`Linha do tempo: ${fr ? fr[1] : ''}`, `Timeline: ${fr ? fr[1] : ''}`);
  const head = panelHead('history', title, { sub: esc(L('Os últimos 7 dias, do mais novo para o mais antigo (horário de Brasília). Cada notícia mostra a força da apuração.', 'The last 7 days, newest first (Brasília time). Each story shows how well it is sourced.')) });
  const c = CACHE.get('geo');
  if (!c) { setHTML(box, head + skel(8, 18)); return; }
  const items = geoVisible();
  if (!items.length) { setHTML(box, head + emptyBox('earth', L('Nada nesta frente com estes filtros', 'Nothing on this front with these filters'), esc(L('Tente "Todas as frentes" ou desmarque os filtros.', 'Try "All fronts" or clear the filters.')))); return; }
  const days = {};
  for (const n of items) { const k = new Date(n.d - 3 * 3600e3).toISOString().slice(0, 10); (days[k] = days[k] || []).push(n); }
  const todayBr = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const yestBr = new Date(Date.now() - 27 * 3600e3).toISOString().slice(0, 10);
  const html = Object.keys(days).sort().reverse().map((k) => {
    const list = days[k]; const d = Date.parse(k + 'T15:00:00Z');
    const lbl = k === todayBr ? L('Hoje', 'Today') : k === yestBr ? L('Ontem', 'Yesterday') : fmtDate(d, { weekday: 'long', timeZone: 'UTC' });
    const conf = list.filter((n) => n.stt === 'ok').length;
    const lim = GEO.day[k] ? list.length : 12;
    return `<div class="geo-day"><div class="geo-dh"><b>${esc(lbl)}</b><span>${esc(fmtDate(d, { day: '2-digit', month: 'long', timeZone: 'UTC' }))}</span><span class="tiny faint">${esc(L(`${list.length} notícias · ${conf} confirmadas`, `${list.length} stories · ${conf} confirmed`))}</span></div><div class="geo-items">${list.slice(0, lim).map(geoItemHtml).join('')}</div>${list.length > 12 ? `<button class="btn sm ghost geo-dmore" data-act="geoDay" data-k="${k}">${ico(GEO.day[k] ? 'chevron-up' : 'chevron-down', 15)}${esc(GEO.day[k] ? L('Mostrar menos', 'Show less') : L(`Ver todas as ${list.length} deste dia`, `See all ${list.length} from this day`))}</button>` : ''}</div>`;
  }).join('');
  const via = c.v.via === 'rss' ? `<div class="callout warn" style="margin-bottom:12px">${ico('triangle-alert', 18)}<span>${esc(L('O robô de notícias está atrasado: mostrando só as manchetes de Mundo lidas direto das fontes (últimos 3 dias).', 'The news robot is delayed: showing only World headlines read directly from sources (last 3 days).'))}</span></div>` : '';
  setHTML(box, head + via + `<div class="geo-tl">${html}</div>`);
  drawGeoSrc();
}
function drawGeoSrc() {
  const box = $('#geo-src'); if (!box || box.dataset.done === S.lang) return; box.dataset.done = S.lang;
  const grp = [
    [L('Brasil', 'Brazil'), 'g1 Mundo · Folha · Estadão · BBC News Brasil · DW Brasil · Metrópoles · CNN Brasil · Poder360 · Valor · UOL · R7'],
    [L('Agências e internacionais', 'Agencies & international'), 'Reuters · AP · AFP · Al Jazeera · Al Arabiya · The Guardian · BBC World · The New York Times · Financial Times · Euronews · Kyiv Post · Gulf News'],
    [L('Rotas marítimas e energia', 'Shipping routes & energy'), 'gCaptain · The Maritime Executive · Seatrade Maritime'],
  ];
  setHTML(box, panelHead('shield-check', L('Fontes e regras', 'Sources & rules')) + `<div class="geo-srcs">${grp.map(([t, l]) => `<div><b>${esc(t)}</b><p>${esc(l)}</p></div>`).join('')}</div>
    <ul class="geo-rules">
      <li>${geoBadge({ stt: 'ok', ns: 2 })} ${esc(L('a mesma notícia saiu em 2 ou mais veículos reconhecidos.', 'the same story ran in 2 or more recognized outlets.'))}</li>
      <li>${geoBadge({ stt: 'dev', ns: 1 })} ${esc(L('por enquanto só um veículo publicou; pode mudar.', 'only one outlet so far; it may change.'))}</li>
      <li>${geoBadge({ stt: 'att', ns: 1 })} ${esc(L('a manchete atribui a informação a uma das partes ("Irã diz…", "Rússia afirma…"). Em guerra, as partes têm interesse: vale como versão, não como fato confirmado.', 'the headline attributes the information to one side ("Iran says…", "Russia claims…"). In war, the sides have interests: it is a version, not a confirmed fact.'))}</li>
      <li>${esc(L('Só entram veículos reconhecidos (perfis anônimos de "última hora" ficam de fora). Notícias pelo Google Notícias só valem quando o veículo está na lista.', 'Only recognized outlets are used (anonymous "breaking" accounts are left out). Google News items only count when the outlet is on the list.'))}</li>
    </ul>`);
}
ACT.seg_geo = (v) => { GEO.tab = v; drawGeo(); };
ACT.geoFront = (el) => { GEO.tab = el.dataset.k; $$('.seg[data-seg="geo"] button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === GEO.tab))); drawGeo(); const t = $('#geo-tl'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
ACT.geoConf = (el) => { GEO.conf = el.checked; drawGeo(); };
ACT.geoPt = (el) => { GEO.ptOnly = el.checked; LS.set('geo-pt', GEO.ptOnly); drawGeo(); };
ACT.geoMore = (el) => { const u = el.dataset.u; GEO.open[u] = !GEO.open[u]; drawGeo(); };
ACT.geoDay = (el) => { const k = el.dataset.k; GEO.day[k] = !GEO.day[k]; drawGeo(); };
onPrice((set) => { if (S.page === 'geo' && (set.has('GEO') || set.has('NEWS'))) drawGeo(); });
page({
  id: 'geo', group: 'noticias', icon: 'earth', pt: 'Geopolítica e conflitos', en: 'Geopolitics & conflicts',
  sub: 'Guerras, conflitos e rotas de energia, dia a dia e por frente, com a força de cada notícia: quantos veículos confirmam e o que é só versão de uma das partes. Atualiza sozinho.',
  subEn: 'Wars, conflicts and energy routes, day by day and by front, with how well each story is sourced: how many outlets confirm it and what is only one side’s version. Refreshes itself.',
  init(el) { el.innerHTML = geoHtml(); drawGeo(); },
  show() { drawGeo(); },
});
