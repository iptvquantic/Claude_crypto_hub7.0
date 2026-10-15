// =====================================================================
// DASHBOARD — cards editáveis, resumo do mercado, medo e ganância,
// dominância, RSI, mapa de calor, maiores altas/baixas, em alta,
// próximos eventos e retornos mensais (BTC/ETH).
// =====================================================================
const DASH = { cards: null, flashAt: {}, hm: '24h', mr: 'BTC', t: {} };

// ---------- cards: leitura/migração ----------
function dashCards() {
  if (DASH.cards) return DASH.cards;
  let c = LS.get('dash-cards');
  if (!Array.isArray(c) || !c.length) {
    c = [];
    try { const old = JSON.parse(localStorage.getItem('nx-dash-syms') || 'null'); if (Array.isArray(old)) old.forEach((s) => { if (BY_SYM[s]) c.push({ k: 'b', s }); }); } catch { /* */ }
    try {
      const ex = JSON.parse(localStorage.getItem('nx-dash-extra') || 'null');
      if (Array.isArray(ex)) ex.forEach((x) => {
        const id = x && String(x.cgId || x.id || ''); if (!id) return;
        if (BY_CG[id]) c.push({ k: 'b', s: BY_CG[id].s });
        else c.push({ k: 'g', cg: id, b: String(x.sym || '').toUpperCase().slice(0, 12), n: String(x.name || id).slice(0, 40), logo: /^https:/.test(x.logo || '') ? x.logo : '' });
      });
    } catch { /* */ }
    if (!c.length) c = DASH_DEFAULT.map((s) => ({ k: 'b', s }));
  }
  const seen = new Set();
  DASH.cards = c.filter((x) => {
    if (!x) return false;
    const key = x.k === 'b' ? x.s : x.cg;
    if (!key || seen.has(key) || (x.k === 'b' && !BY_SYM[x.s])) return false;
    seen.add(key); return true;
  }).slice(0, 12);
  LS.set('dash-cards', DASH.cards);
  DASH.cards.forEach((x) => { if (x.k === 'g') trackExtra(x.cg); });
  return DASH.cards;
}
function saveCards() { LS.set('dash-cards', DASH.cards); }
const cardKey = (x) => (x.k === 'b' ? x.s : 'g:' + x.cg);
function cardCoin(x) {
  if (x.k === 'b') { const c = BY_SYM[x.s]; return { ...c, logo: LOGOS[c.cg] || '', live: VALID.has(c.s) }; }
  return { b: x.b, n: x.n, cg: x.cg, c: hashColor(x.cg), logo: LOGOS[x.cg] || x.logo || '', live: false };
}
function cardQuote(x) {
  if (x.k === 'b') { const p = PX[x.s]; return p ? { p: p.p, chg: p.chg, src: 'Binance' } : null; }
  const q = XP[x.cg]; return q ? { p: q.p, chg: q.chg, src: 'CoinGecko' } : null;
}
function cardHtml(x, i) {
  const c = cardCoin(x), q = cardQuote(x);
  const spark = CGM[c.cg] && CGM[c.cg].sparkline_in_7d ? sparkSVG(CGM[c.cg].sparkline_in_7d.price.filter((_, j) => j % 3 === 0)) : '';
  const meta = x.k === 'b' ? (c.live ? L('tempo real', 'real time') : L('par suspenso', 'pair halted')) : L('CoinGecko · 1 min', 'CoinGecko · 1 min');
  return `<div class="pc rel" data-k="${esc(cardKey(x))}" data-act="pcOpen" data-i="${i}" role="link" tabindex="0" aria-label="${esc(c.n)}">
    <div class="pc-h">${coinLogo(c, 32)}<div class="grow"><div class="pc-n">${esc(c.n)}</div><div class="pc-s">${esc(c.b)} · ${esc(meta)}</div></div></div>
    <div class="pc-p" data-f="p">${q ? esc(usd(q.p)) : '<span class="skel" style="display:block;height:24px;width:70%"></span>'}</div>
    <div class="pc-b" data-f="b">${q && toBRL(q.p) ? esc(brl(toBRL(q.p))) : '&nbsp;'}</div>
    <div class="pc-f"><span data-f="c">${q ? chg(q.chg) : ''}</span><div class="pc-spark" title="${esc(L('Últimos 7 dias', 'Last 7 days'))}">${spark}</div></div>
    <button class="pc-more" data-act="pcMenu" data-i="${i}" aria-label="${esc(L('Opções do card', 'Card options'))}" aria-haspopup="menu">${ico('ellipsis-vertical', 17)}</button>
    <div class="menu" role="menu" style="top:40px;right:6px"></div>
  </div>`;
}
function drawCards() {
  const box = $('#d-cards'); if (!box) return;
  const cards = dashCards();
  box.classList.toggle('dense', cards.length > 6);
  box.innerHTML = cards.map(cardHtml).join('') + (cards.length < 4 ? `<button class="pc-add" data-act="pcAdd">${ico('plus', 22)}<span>${esc(L('Adicionar moeda', 'Add coin'))}</span></button>` : '');
  const add = $('#d-add'); if (add) add.disabled = cards.length >= 12;
}
function updCards(set) {
  const cards = dashCards();
  cards.forEach((x) => {
    const key = cardKey(x);
    if (set && !(x.k === 'b' ? set.has(x.s) || set.has('FX') : set.has('XP') || set.has('FX'))) return;
    const el = $(`#d-cards .pc[data-k="${CSS.escape(key)}"]`); if (!el) return;
    const q = cardQuote(x); if (!q) return;
    setHTML($('[data-f=p]', el), esc(usd(q.p)));
    setHTML($('[data-f=b]', el), toBRL(q.p) ? esc(brl(toBRL(q.p))) : '&nbsp;');
    setHTML($('[data-f=c]', el), chg(q.chg));
    // brilho suave na mudança (no máximo a cada 1,4 s por card; o número muda sempre)
    const prev = x.k === 'b' && PX[x.s] ? PX[x.s].prev : null;
    if (isNum(prev) && prev !== q.p && Date.now() - (DASH.flashAt[key] || 0) > 1400) {
      DASH.flashAt[key] = Date.now();
      el.classList.remove('fl-up', 'fl-down'); void el.offsetWidth;
      el.classList.add(q.p > prev ? 'fl-up' : 'fl-down');
      setTimeout(() => el.classList.remove('fl-up', 'fl-down'), 900);
    }
  });
}
ACT.pcOpen = (el, e) => {
  if (e && e.target.closest('.menu, .pc-more')) return;
  const x = dashCards()[+el.dataset.i]; if (!x) return;
  if (x.k === 'b') go('chart', { s: x.s }); else window.open(`https://www.coingecko.com/pt/moedas/${encodeURIComponent(x.cg)}`, '_blank', 'noopener');
};
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.pc[data-act=pcOpen]')) ACT.pcOpen(e.target, e); });
ACT.pcMenu = (el) => {
  const i = +el.dataset.i, n = dashCards().length;
  const m = el.nextElementSibling; const open = !m.classList.contains('open');
  closeMenus(m);
  m.innerHTML = `<button class="menu-i" data-act="pcSwap" data-i="${i}" role="menuitem">${ico('arrow-left-right', 17)}${esc(L('Trocar moeda', 'Change coin'))}</button>
    ${i > 0 ? `<button class="menu-i" data-act="pcMove" data-i="${i}" data-d="-1" role="menuitem">${ico('chevron-left', 17)}${esc(L('Mover para a esquerda', 'Move left'))}</button>` : ''}
    ${i < n - 1 ? `<button class="menu-i" data-act="pcMove" data-i="${i}" data-d="1" role="menuitem">${ico('chevron-right', 17)}${esc(L('Mover para a direita', 'Move right'))}</button>` : ''}
    <div class="menu-sep"></div>
    <button class="menu-i" data-act="pcRemove" data-i="${i}" role="menuitem" ${n <= 1 ? 'disabled' : ''}>${ico('trash-2', 17)}${esc(L('Remover card', 'Remove card'))}</button>`;
  m.classList.toggle('open', open); el.setAttribute('aria-expanded', String(open));
};
function pickToCard(p) { return p.kind === 'b' ? { k: 'b', s: p.s } : { k: 'g', cg: p.cg, b: p.b, n: p.n, logo: p.logo }; }
ACT.pcAdd = () => {
  openCoinPicker({ title: L('Adicionar moeda ao painel', 'Add coin to dashboard'), exclude: dashCards().map((x) => (x.k === 'b' ? x.s : x.cg)), onPick: (p) => {
    const card = pickToCard(p); DASH.cards.push(card); saveCards();
    if (card.k === 'g') { LOGOS[card.cg] = LOGOS[card.cg] || card.logo; trackExtra(card.cg); }
    drawCards(); toast(L(`${p.n} adicionado.`, `${p.n} added.`), { type: 'ok' });
  } });
};
ACT.pcSwap = (el) => {
  closeMenus(); const i = +el.dataset.i;
  openCoinPicker({ title: L('Trocar moeda do card', 'Change card coin'), exclude: dashCards().map((x) => (x.k === 'b' ? x.s : x.cg)), onPick: (p) => {
    DASH.cards[i] = pickToCard(p); saveCards();
    if (p.kind === 'g') { LOGOS[p.cg] = LOGOS[p.cg] || p.logo; trackExtra(p.cg); }
    drawCards(); toast(L(`Card trocado para ${p.n}.`, `Card changed to ${p.n}.`), { type: 'ok' });
  } });
};
ACT.pcMove = (el) => {
  closeMenus(); const i = +el.dataset.i, j = i + +el.dataset.d, a = DASH.cards;
  if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; saveCards(); drawCards();
};
ACT.pcRemove = (el) => {
  closeMenus(); const i = +el.dataset.i; if (DASH.cards.length <= 1) return;
  const [gone] = DASH.cards.splice(i, 1); saveCards(); drawCards();
  toast(L('Card removido.', 'Card removed.'), { action: { label: L('Desfazer', 'Undo'), fn: () => { DASH.cards.splice(i, 0, gone); saveCards(); drawCards(); } } });
};
ACT.pcReset = async () => {
  if (!(await confirmBox(L('Voltar aos 5 cards padrão (BTC, ETH, SOL, ONDO, AAVE)?', 'Reset to the 5 default cards (BTC, ETH, SOL, ONDO, AAVE)?'), { ok: L('Restaurar', 'Reset') }))) return;
  DASH.cards = DASH_DEFAULT.map((s) => ({ k: 'b', s })); saveCards(); drawCards();
};

// ---------- fontes do dashboard ----------
function registerDashSources() {
  const need = onPage('dash');
  source({
    id: 'stables', label: 'Stablecoins', provider: 'DefiLlama', every: 30 * 60e3, need,
    run: async () => {
      const j = await getJSON('https://stablecoins.llama.fi/stablecoins', { timeout: 20000 });
      const a = (j.peggedAssets || []).filter((x) => x.circulating && isNum(x.circulating.peggedUSD));
      const f = (k) => sum(a.map((x) => (x[k] && x[k].peggedUSD) || 0));
      const top = a.map((x) => ({ s: x.symbol, v: x.circulating.peggedUSD })).sort((p, q) => q.v - p.v).slice(0, 3);
      return { total: f('circulating'), day: f('circulatingPrevDay'), week: f('circulatingPrevWeek'), month: f('circulatingPrevMonth'), top };
    },
    validate: (d) => d.total > 5e10 && d.total < 5e12,
    onData: () => _markDirty('STABLE'),
  });
  source({
    id: 'defi', label: 'DeFi', provider: 'CoinGecko', every: 30 * 60e3, need,
    run: async () => { const d = (await getJSON('https://api.coingecko.com/api/v3/global/decentralized_finance_defi', { timeout: 12000 })).data; return { mcap: num(d.defi_market_cap), dom: num(d.defi_dominance), vol: num(d.trading_volume_24h), top: d.top_coin_name }; },
    validate: (d) => d.mcap > 1e9,
    onData: () => _markDirty('DEFI'),
  });
  source({
    id: 'trending', label: L('Em alta no CoinGecko', 'Trending on CoinGecko'), provider: 'CoinGecko', every: 15 * 60e3, need,
    run: async () => {
      const j = await getJSON('https://api.coingecko.com/api/v3/search/trending', { timeout: 12000 });
      return (j.coins || []).slice(0, 8).map(({ item: it }) => ({ id: it.id, n: it.name, s: it.symbol, rank: it.market_cap_rank, logo: it.small || it.thumb, p: num(it.data && it.data.price), chg: num(it.data && it.data.price_change_percentage_24h && it.data.price_change_percentage_24h.usd) }));
    },
    validate: (a) => Array.isArray(a) && a.length > 0,
    onData: () => _markDirty('TREND'),
  });
  source({
    id: 'rsi', label: 'RSI BTC/ETH', provider: 'Binance', every: 5 * 60e3, need, persist: true,
    run: async () => {
      const out = {};
      for (const [b, s] of [['BTC', 'BTCUSDT'], ['ETH', 'ETHUSDT']]) {
        out[b] = {};
        const tfs = await Promise.all(['1h', '4h', '1d', '1w'].map((tf) => klines(s, tf, 300)));
        ['1h', '4h', '1d', '1w'].forEach((tf, i) => { out[b][tf] = lastOf(rsiSeries(tfs[i].map((k) => k.c))); });
      }
      return out;
    },
    validate: (d) => isNum(d.BTC['1d']),
    onData: () => _markDirty('RSI'),
  });
  source({
    id: 'monthly', label: L('Retornos mensais', 'Monthly returns'), provider: 'Binance', every: 60 * 60e3, need,
    run: async () => {
      const [b, e] = await Promise.all([klines('BTCUSDT', '1M', 120), klines('ETHUSDT', '1M', 120)]);
      const m = (a) => a.map((k) => ({ t: k.t, o: k.o, c: k.c }));
      return { BTC: m(b), ETH: m(e) };
    },
    validate: (d) => d.BTC.length > 12,
    onData: () => _markDirty('MONTHLY'),
  });
}

// ---------- montagem da página ----------
function dashHtml() {
  const p = PAGES.dash;
  return `${pageHead(p, `<button class="btn sm pri" id="d-add" data-act="pcAdd">${ico('plus', 16)}${esc(L('Adicionar moeda', 'Add coin'))}</button><button class="btn sm ghost" data-act="pcReset" title="${esc(L('Voltar aos cards padrão', 'Reset cards'))}">${ico('undo-2', 16)}<span class="hide-m">${esc(L('Cards padrão', 'Default cards'))}</span></button><button class="btn sm" data-act="refreshAll">${ico('refresh-cw', 16)}${esc(L('Atualizar', 'Refresh'))}</button>`)}
  <div class="pcards" id="d-cards"></div>
  <div class="panel flush mt"><div class="strip s8" id="d-strip">${skel(1, 34)}</div><div class="row wrap" style="padding:8px 14px 12px;gap:6px" id="d-strip-src"></div></div>
  <div class="grid g-3 mt">
    <section class="panel" id="d-fng"></section>
    <section class="panel" id="d-dom"></section>
    <section class="panel" id="d-rsi"></section>
  </div>
  <section class="panel mt" id="d-hm"></section>
  <div class="grid g-3 mt">
    <section class="panel" id="d-up"></section>
    <section class="panel" id="d-down"></section>
    <section class="panel" id="d-trend"></section>
  </div>
  <div class="grid g-2 mt">
    <section class="panel span-2" id="d-mr"></section>
  </div>
  <section class="panel mt" id="d-ev"></section>`;
}
ACT.refreshAll = () => { refreshAll(); priceSnapshot().catch(() => {}); toast(L('Atualizando todas as fontes…', 'Refreshing all sources…'), { type: 'ok', ms: 2200 }); };

function drawStrip() {
  const g = CACHE.get('global'), st = CACHE.get('stables'), df = CACHE.get('defi'), fg = CACHE.get('fng');
  const G = g && g.v, cell = (k, v, s = '') => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="s">${s || '&nbsp;'}</div></div>`;
  const btcD = G && G.dom.btc, ethD = G && G.dom.eth;
  const r = brlRate();
  const html = [
    cell(L('Mercado cripto', 'Crypto market'), G ? esc(fmtCompact(G.mcap)) : '—', G ? chg(G.mcapChg) + ` <span class="faint">24h</span>` : ''),
    cell(L('Volume 24h', '24h volume'), G ? esc(fmtCompact(G.vol)) : '—', G && G.mcap ? `<span class="faint">${esc(fmtPct(G.vol / G.mcap * 100, 1, false))} ${esc(L('do valor de mercado', 'of market cap'))}</span>` : ''),
    cell(L('Dominância BTC', 'BTC dominance'), isNum(btcD) ? esc(fmtPct(btcD, 2, false)) : '—', isNum(domChange24h('bitcoin', btcD)) ? `<span class="${tone(domChange24h('bitcoin', btcD))}">${esc(pp(domChange24h('bitcoin', btcD)))}</span> <span class="faint">24h</span>` : ''),
    cell(L('Dominância ETH', 'ETH dominance'), isNum(ethD) ? esc(fmtPct(ethD, 2, false)) : '—', isNum(domChange24h('ethereum', ethD)) ? `<span class="${tone(domChange24h('ethereum', ethD))}">${esc(pp(domChange24h('ethereum', ethD)))}</span> <span class="faint">24h</span>` : ''),
    cell(L('Stablecoins', 'Stablecoins'), st ? esc(fmtCompact(st.v.total)) : '—', st && st.v.week ? chg((st.v.total / st.v.week - 1) * 100) + ` <span class="faint">7d</span>` : ''),
    cell(L('DeFi', 'DeFi'), df ? esc(fmtCompact(df.v.mcap)) : '—', df && isNum(df.v.dom) ? `<span class="faint">${esc(fmtPct(df.v.dom, 2, false))} ${esc(L('do total', 'of total'))}</span>` : ''),
    cell(L('Dólar', 'USD/BRL'), r ? esc(brl(r.v, [4, 4])) : '—', isNum(FX.chg.usdbrl) ? chg(FX.chg.usdbrl) : r ? `<span class="faint">${esc(r.src)}</span>` : ''),
    cell(L('Medo e ganância', 'Fear & greed'), fg && fg.v[0] ? `<span style="color:${fgColor(num(fg.v[0].value))}">${esc(fg.v[0].value)}</span>` : '—', fg && fg.v[0] ? esc(fgLabel(fg.v[0].value_classification)) : ''),
  ].join('');
  setHTML('#d-strip', html);
  setHTML('#d-strip-src', [stamp('global'), stamp('stables'), stamp('defi'), stamp('fx'), stamp('fng')].join(''));
}
function drawFng() {
  const box = $('#d-fng'); if (!box) return;
  const fg = CACHE.get('fng'); const a = fg && fg.v;
  const head = panelHead('gauge', L('Medo e ganância', 'Fear & greed'), { sub: esc(L('Sentimento do mercado cripto: 0 = medo extremo, 100 = ganância extrema.', 'Crypto sentiment: 0 = extreme fear, 100 = extreme greed.')), right: stamp('fng') });
  if (!a || !a.length) { box.innerHTML = head + (HEALTH.fng && HEALTH.fng.ok === false ? emptyBox('wifi-off', L('Índice indisponível agora', 'Index unavailable now'), esc(L('Tentando de novo automaticamente.', 'Retrying automatically.'))) : skel(5, 18)); return; }
  const v = num(a[0].value), col = fgColor(v);
  const days = a.slice(0, 7).reverse();
  const dayHtml = days.map((d) => { const n = num(d.value), ts = num(d.timestamp) * 1000; return `<div class="fg-day" title="${esc(fmtDate(ts))}"><div class="d">${esc(fmtDate(ts, { day: '2-digit', month: '2-digit', timeZone: 'UTC' }))}</div><div class="n" style="color:${fgColor(n)}">${n}</div><div class="c">${esc(fgLabel(d.value_classification))}</div></div>`; }).join('');
  const avg30 = avg(a.slice(0, 30).map((d) => num(d.value)).filter(isNum));
  const ref = (k, i) => (a[i] ? `<span>${esc(k)} <b style="color:${fgColor(num(a[i].value))}">${esc(a[i].value)}</b></span>` : '');
  box.innerHTML = `${head}<div class="fg-wrap">${gaugeSVG(v)}<div class="fg-val" style="color:${col}">${v}</div><div class="fg-lbl">${esc(fgLabel(a[0].value_classification))}</div>
    <div class="fg-days">${dayHtml}</div>
    <div class="row wrap small mt" style="justify-content:center;gap:6px 16px">${ref(L('Ontem', 'Yesterday'), 1)}${ref(L('Há 7 dias', '7 days ago'), 7)}${ref(L('Há 30 dias', '30 days ago'), 30)}${isNum(avg30) ? `<span>${esc(L('Média 30 dias', '30-day avg'))} <b>${fmtNum(avg30, 0, 0)}</b></span>` : ''}</div></div>
    ${note(L('O índice é diário (uma leitura por dia, em UTC).', 'The index is daily (one reading per day, UTC).'))}`;
}
function drawDom() {
  const box = $('#d-dom'); if (!box) return;
  const g = CACHE.get('global');
  const head = panelHead('chart-pie', L('Dominância de mercado', 'Market dominance'), { sub: esc(L('Fatia de cada moeda no valor de mercado cripto total.', 'Each coin’s share of total crypto market cap.')), right: stamp('global') });
  if (!g) { box.innerHTML = head + skel(6, 16); return; }
  const dom = g.v.dom || {};
  const rows = Object.entries(dom).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const other = 100 - sum(rows.map((r) => r[1]));
  const max = rows.length ? rows[0][1] : 100;
  const row = (k, v, id) => {
    const cg = id || DOM_IDS[k]; const c = BY_CG[cg] || { b: k.toUpperCase(), cg, c: hashColor(k) };
    const d = cg ? domChange24h(cg, v) : null;
    return `<div class="dom-row"><span class="nm">${coinLogo({ ...c, b: k.toUpperCase(), logo: LOGOS[cg] }, 22)}${esc(k.toUpperCase())}</span><span class="small ${tone(d)}" title="${esc(L('Variação em 24 h, em pontos percentuais', '24h change, percentage points'))}">${isNum(d) ? esc(pp(d)) : ''}</span><span class="pct">${esc(fmtPct(v, 2, false))}</span><div class="bar"><i style="width:${clamp(v / max * 100, 1, 100)}%;background:${esc((BY_CG[cg] && BY_CG[cg].c) || hashColor(k))}"></i></div></div>`;
  };
  box.innerHTML = head + rows.map(([k, v]) => row(k, v)).join('') + (other > 0.05 ? `<div class="dom-row"><span class="nm">${esc(L('Outras', 'Others'))}</span><span></span><span class="pct">${esc(fmtPct(other, 2, false))}</span><div class="bar"><i style="width:${clamp(other / max * 100, 1, 100)}%;background:var(--text-3)"></i></div></div>` : '') +
    note(L('Variação de 24 h calculada a partir das variações de valor de mercado informadas pelo CoinGecko.', '24h change derived from CoinGecko market-cap changes.'));
}
function rsiState(v) {
  if (!isNum(v)) return ['', '—'];
  if (v >= 70) return ['down', L('Sobrecomprado', 'Overbought')];
  if (v <= 30) return ['up', L('Sobrevendido', 'Oversold')];
  return ['', L('Neutro', 'Neutral')];
}
function drawRsi() {
  const box = $('#d-rsi'); if (!box) return;
  const r = CACHE.get('rsi');
  const head = panelHead('activity', L('Força relativa (RSI 14)', 'Relative strength (RSI 14)'), { sub: esc(L('Acima de 70: esticado para cima. Abaixo de 30: esticado para baixo.', 'Above 70: stretched up. Below 30: stretched down.')), right: stamp('rsi') });
  if (!r) { box.innerHTML = head + skel(8, 14); return; }
  const tfn = { '1h': '1h', '4h': '4h', '1d': L('1D', '1D'), '1w': L('1S', '1W') };
  const grp = (b) => `<div class="rsi-g"><div class="rsi-h">${coinLogo({ ...BY_BASE[b], logo: LOGOS[BY_BASE[b].cg] }, 20)}${esc(b)}</div>${['1h', '4h', '1d', '1w'].map((tf) => { const v = r.v[b] && r.v[b][tf]; const [cls, st] = rsiState(v); return `<div class="rsi-r"><span class="tf">${tfn[tf]}</span><div class="rsi-bar">${isNum(v) ? `<i style="left:${clamp(v, 0, 100)}%"></i>` : ''}</div><span class="v">${isNum(v) ? fmtNum(v, 1, 1) : '—'}</span><span class="st ${cls}">${esc(st)}</span></div>`; }).join('')}</div>`;
  box.innerHTML = head + grp('BTC') + grp('ETH') + note(L('Método de Wilder sobre as velas da Binance; a vela atual entra no cálculo (como nas corretoras).', 'Wilder method on Binance candles; the current candle is included (as on exchanges).'));
}
// ---------- mapa de calor ----------
function heatCoins() {
  const coins = liveCoins().filter((c) => PX[c.s]);
  const mc = (c) => (CGM[c.cg] && CGM[c.cg].market_cap) || 0;
  return coins.sort((a, b) => mc(b) - mc(a));
}
function drawHeat() {
  const box = $('#d-hm'); if (!box) return;
  const coins = heatCoins();
  const sc0 = DASH.hm === '7d' ? 15 : 8;
  const val = (c) => (DASH.hm === '7d' ? num(CGM[c.cg] && CGM[c.cg].price_change_percentage_7d_in_currency) : PX[c.s].chg);
  // mesma ordem: só troca cores e números (não pisca e não perde o foco)
  const order = coins.map((c) => c.s).join(',') + '|' + DASH.hm, grid = $('#d-hm-grid');
  if (grid && DASH.hmOrder === order && grid.children.length === coins.length) {
    coins.forEach((c, i) => { const el = grid.children[i], v = val(c); el.style.background = heatBg(v, sc0); el.children[1].textContent = isNum(v) ? fmtPct(v, 2) : '—'; el.children[2].textContent = usd(PX[c.s].p); });
    return;
  }
  DASH.hmOrder = coins.length ? order : '';
  const tools = `<div class="row" style="gap:8px">${seg('dhm', [['24h', '24h'], ['7d', '7d']], DASH.hm)}${stamp('px-rest', 'Binance')}</div>`;
  const head = panelHead('grid-3x3', L('Mapa de calor', 'Heatmap'), { sub: esc(L('Tamanho pelo valor de mercado; cor pela variação. Clique para ver o gráfico.', 'Size by market cap; color by change. Click for the chart.')), right: tools });
  if (!coins.length) { box.innerHTML = head + skel(4, 40); return; }
  const cells = coins.map((c, i) => {
    const v = val(c);
    const t = i === 0 ? 't1' : i === 1 ? 't2' : i < 10 ? 't3' : 't4';
    return `<button class="hm-c ${t}" style="background:${heatBg(v, DASH.hm === '7d' ? 15 : 8)}" data-act="go" data-to="chart" data-params='${esc(JSON.stringify({ s: c.s }))}' title="${esc(c.n + ' · ' + usd(PX[c.s].p))}"><span class="s">${esc(c.b)}</span><span class="p">${isNum(v) ? esc(fmtPct(v, 2)) : '—'}</span><span class="x">${esc(usd(PX[c.s].p))}</span></button>`;
  }).join('');
  const sc = DASH.hm === '7d' ? 15 : 8;
  box.innerHTML = head + `<div class="hm" id="d-hm-grid">${cells}</div><div class="hm-scale">${[-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map((f) => `<div style="flex:1;text-align:center"><i style="background:${heatBg(f * sc, sc)}"></i>${f === 0 ? '0%' : esc(fmtPct(f * sc, 0))}</div>`).join('')}</div>` +
    (DASH.hm === '7d' ? note(L('Variação de 7 dias do CoinGecko (atualiza a cada 10 min).', '7-day change from CoinGecko (every 10 min).')) : '');
}
ACT.seg_dhm = (v) => { DASH.hm = v; drawHeat(); };
function moverList(dir) {
  const coins = liveCoins().filter((c) => PX[c.s] && isNum(PX[c.s].chg));
  coins.sort((a, b) => (dir > 0 ? PX[b.s].chg - PX[a.s].chg : PX[a.s].chg - PX[b.s].chg));
  return coins.slice(0, 6);
}
function drawMovers() {
  for (const [id, dir, icon, t] of [['#d-up', 1, 'trending-up', L('Maiores altas 24h', 'Top gainers 24h')], ['#d-down', -1, 'trending-down', L('Maiores baixas 24h', 'Top losers 24h')]]) {
    const box = $(id); if (!box) continue;
    const list = moverList(dir);
    box.innerHTML = panelHead(icon, t, { right: stamp('px-rest', 'Binance') }) + (list.length ? `<div class="list">${list.map((c) => `<a class="li" href="#/chart?s=${c.s}">${coinLogo({ ...c, logo: LOGOS[c.cg] }, 28)}<span class="grow"><span class="t" style="display:block">${esc(c.n)}</span><span class="m">${esc(c.b)} · ${esc(usd(PX[c.s].p))}</span></span>${chg(PX[c.s].chg)}</a>`).join('')}</div>` : skel(5, 18));
  }
}
function drawTrend() {
  const box = $('#d-trend'); if (!box) return;
  const t = CACHE.get('trending');
  const head = panelHead('flame', L('Em alta no CoinGecko', 'Trending on CoinGecko'), { sub: esc(L('Moedas mais buscadas nas últimas 24 h.', 'Most searched coins in the last 24h.')), right: stamp('trending') });
  if (!t) { box.innerHTML = head + skel(5, 18); return; }
  box.innerHTML = head + `<div class="list">${t.v.slice(0, 6).map((c, i) => `<a class="li" href="https://www.coingecko.com/pt/moedas/${encodeURIComponent(c.id)}" target="_blank" rel="noopener noreferrer"><span class="li-n">${i + 1}</span>${coinLogo({ b: String(c.s).toUpperCase(), logo: c.logo, cg: c.id }, 28)}<span class="grow"><span class="t" style="display:block">${esc(c.n)}</span><span class="m">${esc(String(c.s).toUpperCase())}${c.rank ? ' · #' + c.rank : ''}${isNum(c.p) ? ' · ' + esc(usd(c.p)) : ''}</span></span>${chg(c.chg)}</a>`).join('')}</div>`;
}
// ---------- retornos mensais ----------
function drawMonthly() {
  const box = $('#d-mr'); if (!box) return;
  const m = CACHE.get('monthly');
  const head = panelHead('calendar-days', L('Retornos mensais', 'Monthly returns'), { sub: esc(L('Variação de cada mês (abertura → fechamento, em UTC). O mês atual muda ao vivo.', 'Each month’s change (open → close, UTC). The current month updates live.')), right: `<div class="row" style="gap:8px">${seg('dmr', [['BTC', 'BTC'], ['ETH', 'ETH']], DASH.mr)}${stamp('monthly')}</div>` });
  if (!m || !m.v[DASH.mr]) { box.innerHTML = head + skel(6, 18); return; }
  const rows = {}; const now = new Date();
  const curKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  for (const k of m.v[DASH.mr]) {
    const d = new Date(k.t), y = d.getUTCFullYear(), mo = d.getUTCMonth();
    let c = k.c;
    if (`${y}-${mo}` === curKey) { const live = PX[DASH.mr + 'USDT']; if (live) c = live.p; }
    (rows[y] = rows[y] || {})[mo] = { r: (c / k.o - 1) * 100, cur: `${y}-${mo}` === curKey };
  }
  const years = Object.keys(rows).map(Number).sort((a, b) => b - a);
  const cols = Array.from({ length: 12 }, (_, i) => i);
  const cell = (x) => (x ? `<td class="v ${x.r >= 0 ? 'pos' : 'neg'} ${x.cur ? 'cur' : ''}"${x.cur ? ' data-cur="1"' : ''}>${esc(fmtPct(x.r, 1))}</td>` : '<td class="na">—</td>');
  const yearTot = (y) => { const vals = cols.map((i) => rows[y][i]).filter(Boolean); if (!vals.length) return null; return (vals.reduce((p, x) => p * (1 + x.r / 100), 1) - 1) * 100; };
  const body = years.map((y) => { const t = yearTot(y); return `<tr><td>${y}</td>${cols.map((i) => cell(rows[y][i])).join('')}<td class="v yr-tot ${isNum(t) ? (t >= 0 ? 'pos' : 'neg') : 'na'}">${isNum(t) ? esc(fmtPct(t, 1)) : '—'}</td></tr>`; }).join('');
  const avgRow = cols.map((i) => { const vals = years.map((y) => rows[y][i]).filter((x) => x && !x.cur).map((x) => x.r); const a = avg(vals); return `<td class="${tone(a)}">${isNum(a) ? esc(fmtPct(a, 1)) : '—'}</td>`; }).join('');
  const medRow = cols.map((i) => { const vals = years.map((y) => rows[y][i]).filter((x) => x && !x.cur).map((x) => x.r).sort((a, b) => a - b); const md = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null; return `<td class="${tone(md)}">${isNum(md) ? esc(fmtPct(md, 1)) : '—'}</td>`; }).join('');
  box.innerHTML = head + `<div class="tbl-wrap"><table class="tbl mr"><thead><tr><th>${esc(L('Ano', 'Year'))}</th>${cols.map((i) => `<th>${esc(monthName(i))}</th>`).join('')}<th>${esc(L('Ano', 'Year'))}</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>${esc(L('Média', 'Average'))}</td>${avgRow}<td></td></tr><tr><td>${esc(L('Mediana', 'Median'))}</td>${medRow}<td></td></tr></tfoot></table></div>` +
    note(L(`Fonte: velas mensais ${DASH.mr}/USDT da Binance (desde ago/2017, início do par). Média e mediana não incluem o mês em andamento.`, `Source: Binance ${DASH.mr}/USDT monthly candles (since Aug 2017). Average and median exclude the current month.`));
}
ACT.seg_dmr = (v) => { DASH.mr = v; drawMonthly(); };
function updMonthlyCur() {
  const td = $('#d-mr td[data-cur]'); const m = CACHE.get('monthly'); if (!td || !m) return;
  const arr = m.v[DASH.mr]; const k = arr && arr[arr.length - 1]; const live = PX[DASH.mr + 'USDT']; if (!k || !live) return;
  const r = (live.p / k.o - 1) * 100; td.textContent = fmtPct(r, 1); td.className = `v ${r >= 0 ? 'pos' : 'neg'} cur`; td.dataset.cur = '1';
}
function drawEvents() {
  const box = $('#d-ev'); if (!box) return;
  const evs = typeof officialEvents === 'function' ? officialEvents().filter((e) => e.at > Date.now()).slice(0, 5) : [];
  box.innerHTML = panelHead('calendar-days', L('Próximos eventos que mexem com o mercado', 'Upcoming market-moving events'), { sub: esc(L('Calendários oficiais. Quando um evento passa, o próximo assume sozinho.', 'Official calendars. When an event passes, the next one takes its place.')), right: `<a class="link-btn" href="#/agenda">${esc(L('Agenda completa', 'Full calendar'))}${ico('chevron-right', 15)}</a>` }) +
    (evs.length ? `<div>${evs.map((e, i) => `<div class="ev ${i === 0 ? 'next' : ''}"><div class="ev-d">${esc(fmtDate(e.at, { day: '2-digit', month: 'short' }))}<small>${esc(fmtTime(e.at))}</small></div><div><div class="ev-t">${ctryTag(e.country)}${esc(e.t)}<span class="imp i${e.imp}" title="${esc(L('Impacto', 'Impact'))}"><i></i><i></i><i></i></span></div><div class="ev-m"><span>${esc(e.src)}</span></div></div><span class="badge ${i === 0 ? 'pro' : ''}" data-until="${e.at}">${esc(until(e.at))}</span></div>`).join('')}</div>` : emptyBox('calendar-days', L('Sem eventos programados', 'No events scheduled')));
}
function dashDraw() { drawCards(); drawStrip(); drawFng(); drawDom(); drawRsi(); drawHeat(); drawMovers(); drawTrend(); drawMonthly(); drawEvents(); }
onPrice((set) => {
  if (S.page !== 'dash' || !$('#pg-dash.on')) return;
  updCards(set);
  if (set.has('GLOBAL') || set.has('STABLE') || set.has('DEFI') || set.has('FX') || set.has('FNG')) drawStrip();
  if (set.has('FNG')) drawFng();
  if (set.has('GLOBAL') || set.has('CGM')) { drawDom(); drawStrip(); }
  if (set.has('CGM') || set.has('XP')) { if (!DASH.cards || DASH.cards.some((x) => !$(`#d-cards .pc[data-k="${CSS.escape(cardKey(x))}"] .spark`))) drawCards(); }
  if (set.has('RSI')) drawRsi();
  if (set.has('TREND')) drawTrend();
  if (set.has('MONTHLY')) drawMonthly(); else if (set.has('BTCUSDT') || set.has('ETHUSDT')) updMonthlyCur();
  const now = Date.now();
  if (now - (DASH.t.hm || 0) > 2500) { DASH.t.hm = now; drawHeat(); }
  if (now - (DASH.t.mv || 0) > 4000) { DASH.t.mv = now; drawMovers(); }
});
page({
  id: 'dash', group: 'mercado', icon: 'layout-dashboard', pt: 'Dashboard', en: 'Dashboard',
  sub: 'O mercado agora: preços ao vivo, sentimento, dominância e força. Cada número mostra a fonte e a hora.',
  subEn: 'The market now: live prices, sentiment, dominance and momentum. Every number shows its source and time.',
  init(el) { el.innerHTML = dashHtml(); dashDraw(); },
  show() { dashDraw(); },
});
