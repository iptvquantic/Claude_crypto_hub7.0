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
      need: () => (S.page === 'news' && (NEWS.tab === cat || NEWS.tab === 'all')) || (S.page === 'geo' && cat === 'mundo') || (S.page === 'tokenomics' && cat === 'cripto'),
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
const GEO = { tab: 'all' };
const GEO_TABS = () => [
  ['all', L('Tudo', 'All'), null],
  ['ukr', L('Ucrânia e Rússia', 'Ukraine & Russia'), /ucr[aâ]nia|ukrain|r[uú]ssia|russia|putin|zelensk|kiev|kyiv|moscou|moscow|donbas|crimeia|crimea|\botan\b|\bnato\b/i],
  ['me', L('Oriente Médio', 'Middle East'), /israel|gaza|hamas|hezbollah|\bir[ãa]\b|\biran|teer[ãa]|tehran|l[ií]bano|lebanon|s[ií]ria|syria|i[êe]men|yemen|houthi|cisjord|west bank|oriente m[ée]dio|middle east|palestin/i],
  ['trade', L('Guerra comercial', 'Trade war'), /tarifa|tariff|guerra comercial|trade war|sanç|sanction|\bomc\b|\bwto\b|protecionis|protectionis|export controls?|controle de exporta/i],
  ['asia', L('China e Taiwan', 'China & Taiwan'), /taiwan|taip|\bchina\b|chin[eê]s|chinese|pequim|beijing|xi jinping|mar do sul da china|south china sea|coreia do norte|north korea/i],
];
function geoItems() {
  const items = newsItems('mundo').map((n) => ({ ...n, cat: 'mundo' }));
  const tab = GEO_TABS().find((t) => t[0] === GEO.tab);
  return tab && tab[2] ? items.filter((n) => tab[2].test(n.t + ' ' + (n.x || ''))) : items;
}
function geoHtml() {
  return `${pageHead(PAGES.geo, `<button class="btn sm ghost" data-act="newsTr">${ico('languages', 15)}${esc(L('Traduzir as em inglês', 'Translate English ones'))}</button>`)}
  <div class="row wrap between" style="gap:10px;margin-bottom:12px"><div class="seg-scroll">${seg('geo', GEO_TABS().map(([v, l]) => [v, l]), GEO.tab)}</div>${stamp('news-mundo')}</div>
  <section class="panel" id="geo-tl"></section>`;
}
function drawGeo() {
  const box = $('#geo-tl'); if (!box) return;
  const items = geoItems().filter((n) => Date.now() - n.d < 5 * 86400e3);
  const head = panelHead('earth', L('Linha do tempo', 'Timeline'), { sub: esc(L('Manchetes dos últimos 5 dias, montadas automaticamente por dia. Clique para ler na fonte.', 'Headlines from the last 5 days, grouped by day automatically. Click to read at the source.')) });
  if (!items.length) { box.innerHTML = head + (CACHE.get('news-mundo') ? emptyBox('earth', L('Nada sobre este tema nos últimos dias', 'Nothing on this topic in recent days'), esc(L('As fontes não trouxeram manchetes com estes termos.', 'Sources had no headlines with these terms.'))) : skel(6, 18)); return; }
  const days = {};
  items.forEach((n) => { (days[dayKey(n.d)] = days[dayKey(n.d)] || []).push(n); });
  box.innerHTML = head + `<div class="tl">${Object.keys(days).sort().reverse().map((k) => {
    const d = days[k][0].d;
    return `<div class="tl-day"><div class="tl-d">${esc(k === todayISO() ? L('Hoje', 'Today') : fmtDate(d, { weekday: 'long' }))}<small>${esc(fmtDate(d, { day: '2-digit', month: 'long' }))}</small></div><div class="tl-items">${days[k].slice(0, 14).map((n) => `<a class="tl-i" href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer"><span class="tm">${esc(fmtTime(n.d))}</span><span>${esc(NEWS.tr[n.u] || n.t)} <span class="src">· ${esc(n.src)}${n.lang === 'en' && !NEWS.tr[n.u] ? ' (EN)' : ''}</span></span></a>`).join('')}</div></div>`;
  }).join('')}</div>` + note(L('Fontes: BBC News Brasil, g1, CNN Brasil e BBC World. Os temas são separados por palavras-chave nas manchetes.', 'Sources: BBC News Brasil, g1, CNN Brasil and BBC World. Topics are split by keywords in headlines.'));
}
ACT.seg_geo = (v) => { GEO.tab = v; drawGeo(); };
page({
  id: 'geo', group: 'noticias', icon: 'earth', pt: 'Geopolítica e conflitos', en: 'Geopolitics & conflicts',
  sub: 'O que está acontecendo no mundo, dia a dia, separado por conflito. Atualiza sozinho.',
  subEn: 'What is happening in the world, day by day, by conflict. Refreshes itself.',
  init(el) { el.innerHTML = geoHtml(); drawGeo(); ensureNews('mundo'); },
  show() { drawGeo(); },
});
