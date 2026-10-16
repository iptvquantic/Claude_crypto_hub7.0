// =====================================================================
// TOP 100 — as 100 maiores criptomoedas (CoinGecko) com preço da Binance ao
// vivo quando a moeda tem par na lista. Busca, ordenação e mini-gráfico 7d.
// Aba "Mundo": maiores ativos do planeta (ações, metais, cripto) pelo robô.
// =====================================================================
const T100 = { tab: 'crypto', q: '', sort: 'rank', dir: 1, t: 0 };
function registerTop100Sources() {
  source({
    id: 'top100', label: 'Top 100', provider: 'CoinGecko', every: 3 * 60e3, need: () => S.page === 'top100' || !document.body.classList.contains('no-ticker'), persist: false,
    run: async () => getJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d', { timeout: 15000 }),
    validate: (a) => Array.isArray(a) && a.length >= 50,
    onData: (a) => { a.forEach((m) => { if (m.image) LOGOS[m.id] = m.image; }); _markDirty('TOP100'); },
  });
  source({
    id: 'world', label: L('Maiores ativos do mundo', 'Largest assets'), provider: L('robô NEXUS', 'NEXUS bot'), every: 30 * 60e3, need: () => S.page === 'top100' && T100.tab === 'world',
    run: async () => { const j = await getPipeline('markets', 6 * 3600e3); if (!Array.isArray(j.world) || j.world.length < 10) throw new Error(L('lista indisponível', 'list unavailable')); return { list: j.world, gen: Date.parse(j.worldAt || j.generatedAt), src: j.worldSrc || 'companiesmarketcap.com' }; },
    onData: (d) => { HEALTH.world.dataTs = d.gen; _markDirty('WORLD'); },
  });
}
function t100Rows() {
  const c = CACHE.get('top100'); if (!c) return [];
  return c.v.map((m) => {
    const u = BY_CG[m.id]; const live = u && PX[u.s];
    return {
      id: m.id, rank: m.market_cap_rank, n: m.name, s: (m.symbol || '').toUpperCase(), logo: m.image, sym: u ? u.s : null,
      p: live ? live.p : m.current_price, live: !!live,
      h1: num(m.price_change_percentage_1h_in_currency), d1: live ? live.chg : num(m.price_change_percentage_24h_in_currency ?? m.price_change_percentage_24h),
      d7: num(m.price_change_percentage_7d_in_currency), d30: num(m.price_change_percentage_30d_in_currency),
      mcap: m.market_cap, vol: m.total_volume, spark: m.sparkline_in_7d && m.sparkline_in_7d.price,
    };
  });
}
function t100Html() {
  return `${pageHead(PAGES.top100, '')}
  <div class="row wrap between" style="gap:10px;margin-bottom:14px">
    ${seg('t100tab', [['crypto', L('Criptomoedas', 'Crypto'), 'coins'], ['world', L('Maiores ativos do mundo', 'Largest assets'), 'globe']], T100.tab, 'lg')}
    <div class="inp-search" style="min-width:min(320px,100%)">${ico('search', 18)}<input class="inp" id="t100-q" type="search" placeholder="${esc(L('Buscar por nome ou símbolo', 'Search name or symbol'))}" autocomplete="off" spellcheck="false" data-inp="t100q" aria-label="${esc(L('Buscar', 'Search'))}"></div>
  </div>
  <section class="panel flush" id="t100-box"></section>`;
}
const t100Cols = () => [['rank', '#', 'r'], ['n', L('Moeda', 'Coin'), ''], ['p', L('Preço', 'Price'), 'r'], ['h1', '1h', 'r'], ['d1', '24h', 'r'], ['d7', '7d', 'r'], ['d30', '30d', 'r'], ['mcap', L('Valor de mercado', 'Market cap'), 'r'], ['vol', L('Volume 24h', 'Volume 24h'), 'r'], ['spark', L('7 dias', '7 days'), 'r']];
function drawT100() {
  const box = $('#t100-box'); if (!box) return;
  if (T100.tab === 'world') return drawWorld(box);
  let rows = t100Rows();
  const head = `<div class="panel-h" style="padding:14px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('coins', 18)}${esc(L('As 100 maiores criptomoedas', 'Top 100 cryptocurrencies'))}</h2><p class="panel-s">${esc(L('Preço com ponto verde = ao vivo da Binance; demais preços e variações: CoinGecko.', 'Price with green dot = live from Binance; other prices and changes: CoinGecko.'))}</p></div><div class="row wrap" style="gap:6px">${stamp('top100')}${stamp('px-rest', 'Binance')}</div></div>`;
  if (!rows.length) { box.innerHTML = head + `<div style="padding:0 18px 18px">${HEALTH.top100 && HEALTH.top100.ok === false ? emptyBox('wifi-off', L('Lista indisponível agora', 'List unavailable now'), esc(L('O CoinGecko não respondeu. Tentando de novo automaticamente.', 'CoinGecko did not respond. Retrying automatically.'))) : skel(10, 22)}</div>`; return; }
  const q = T100.q.trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.n.toLowerCase().includes(q) || r.s.toLowerCase().startsWith(q));
  const k = T100.sort, d = T100.dir;
  rows.sort((a, b) => { const x = a[k], y = b[k]; if (k === 'n') return d * String(x).localeCompare(String(y)); return d * ((isNum(x) ? x : -Infinity) - (isNum(y) ? y : -Infinity)); });
  const th = t100Cols().map(([key, lbl, al]) => `<th class="${al} ${key !== 'spark' ? 'sortable' : ''}" ${key !== 'spark' ? `data-act="t100sort" data-k="${key}"` : ''} aria-sort="${T100.sort === key ? (T100.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(lbl)}${T100.sort === key ? (T100.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const tr = rows.map((r) => `<tr class="${r.sym ? 'click' : ''}" ${r.sym ? `data-act="go" data-to="chart" data-params='${esc(JSON.stringify({ s: r.sym }))}'` : ''} data-id="${esc(r.id)}">
    <td class="r rank">${r.rank || '—'}</td>
    <td><div class="coin">${coinLogo({ b: r.s, logo: r.logo, cg: r.id }, 28)}<div><div class="nm">${esc(r.n)}</div><div class="sy">${esc(r.s)}</div></div></div></td>
    <td class="r num" data-f="p">${r.live ? '<i class="dot-live" title="Binance ao vivo"></i>' : ''}${esc(usd(r.p))}</td>
    <td class="r">${chg(r.h1, 2, 'sm')}</td><td class="r" data-f="d1">${chg(r.d1, 2, 'sm')}</td><td class="r">${chg(r.d7, 2, 'sm')}</td><td class="r">${chg(r.d30, 2, 'sm')}</td>
    <td class="r">${esc(fmtCompact(r.mcap))}</td><td class="r">${esc(fmtCompact(r.vol))}</td>
    <td class="r" style="width:120px"><div style="width:110px;margin-left:auto">${sparkSVG(r.spark ? r.spark.filter((_, i) => i % 4 === 0) : [], { w: 110, h: 30 })}</div></td></tr>`).join('');
  box.innerHTML = head + `<div class="tbl-wrap" style="max-height:none"><table class="tbl"><thead><tr>${th}</tr></thead><tbody>${tr || `<tr><td colspan="10">${emptyBox('search', L('Nenhuma moeda encontrada', 'No coin found'))}</td></tr>`}</tbody></table></div>`;
}
function updT100Live(set) {
  if (Date.now() - T100.t < 1500) return; T100.t = Date.now();
  $$('#t100-box tr[data-id]').forEach((tr) => {
    const u = BY_CG[tr.dataset.id]; if (!u || !set.has(u.s)) return;
    const q = PX[u.s];
    setHTML($('[data-f=p]', tr), `<i class="dot-live" title="Binance ao vivo"></i>${esc(usd(q.p))}`);
    setHTML($('[data-f=d1]', tr), chg(q.chg, 2, 'sm'));
  });
}
function drawWorld(box) {
  const w = CACHE.get('world');
  const head = `<div class="panel-h" style="padding:14px 18px 10px;margin:0"><div class="tt"><h2 class="panel-t">${ico('globe', 18)}${esc(L('Maiores ativos do mundo por valor de mercado', 'Largest assets by market cap'))}</h2><p class="panel-s">${esc(L('Empresas, metais e criptomoedas. Atualizado pelo robô do NEXUS a partir de fonte pública.', 'Companies, metals and crypto. Updated by the NEXUS bot from a public source.'))}</p></div>${stamp('world')}</div>`;
  if (!w) {
    box.innerHTML = head + `<div style="padding:0 18px 18px">${HEALTH.world && HEALTH.world.ok === false ? emptyBox('database', L('Ranking ainda não disponível', 'Ranking not available yet'), esc(L('O robô que traz este ranking ainda não publicou dados recentes. Enquanto isso, veja a lista completa na fonte.', 'The bot has not published recent data yet. Meanwhile, see the full list at the source.')), extLink('https://companiesmarketcap.com/assets-by-market-cap/', 'companiesmarketcap.com')) : skel(10, 22)}</div>`;
    return;
  }
  const q = T100.q.trim().toLowerCase();
  const rows = w.v.list.filter((r) => !q || String(r.n).toLowerCase().includes(q) || String(r.s || '').toLowerCase().startsWith(q)).slice(0, 100);
  const kind = { stock: L('Ação', 'Stock'), metal: L('Metal', 'Metal'), crypto: 'Cripto', etf: 'ETF' };
  box.innerHTML = head + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="r">#</th><th>${esc(L('Ativo', 'Asset'))}</th><th>${esc(L('Tipo', 'Type'))}</th><th class="r">${esc(L('Valor de mercado', 'Market cap'))}</th><th class="r">${esc(L('Preço', 'Price'))}</th><th class="r">24h</th><th>${esc(L('País', 'Country'))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="r rank">${esc(r.rank)}</td><td><div class="coin" style="min-width:150px"><span class="coin-fb" style="background:${hashColor(r.n)}">${esc(String(r.s || r.n).slice(0, 3))}</span><div><div class="nm">${esc(r.n)}</div><div class="sy">${esc(r.s || '')}</div></div></div></td><td><span class="badge">${esc(kind[r.kind] || r.kind || '—')}</span></td><td class="r num">${esc(fmtCompact(r.mcap))}</td><td class="r">${isNum(r.p) ? esc(usd(r.p)) : '—'}</td><td class="r">${chg(r.chg, 2, 'sm')}</td><td>${esc(r.country || '')}</td></tr>`).join('')}</tbody></table></div><div style="padding:0 18px 16px">${note(L(`Fonte: ${esc(w.v.src)} (lido pelo robô em ${esc(fmtDateTime(w.v.gen))}). Valores de ações e metais podem ter atraso.`, `Source: ${esc(w.v.src)} (read by the bot at ${esc(fmtDateTime(w.v.gen))}). Stock and metal values may be delayed.`))}</div>`;
}
ACT.seg_t100tab = (v) => { T100.tab = v; drawT100(); if (v === 'world') runSource('world'); };
ACT.t100q = debounce((el) => { T100.q = el.value; drawT100(); }, 180);
ACT.t100sort = (el) => { const k = el.dataset.k; if (T100.sort === k) T100.dir *= -1; else { T100.sort = k; T100.dir = k === 'rank' || k === 'n' ? 1 : -1; } drawT100(); };
onPrice((set) => {
  if (S.page !== 'top100') return;
  if (set.has('TOP100') || set.has('WORLD')) drawT100(); else if (T100.tab === 'crypto') updT100Live(set);
});
page({
  id: 'top100', group: 'mercado', icon: 'trophy', pt: 'Top 100', en: 'Top 100',
  sub: 'As maiores criptomoedas por valor de mercado, com busca e ordenação.', subEn: 'Largest cryptocurrencies by market cap, searchable and sortable.',
  init(el) { el.innerHTML = t100Html(); drawT100(); },
  show() { drawT100(); },
});
