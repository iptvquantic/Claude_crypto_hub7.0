// =====================================================================
// Interface: páginas e rotas, menu lateral, tema, idioma, avisos, janelas,
// paleta de comandos (Ctrl+K), escolha de moeda e assistente de IA.
// Toda interação usa data-act (sem onclick no HTML: segurança e CSP).
// =====================================================================
const ACT = {};
const PAGES = {};
const PAGE_ORDER = [];
const GROUPS = [
  ['mercado', 'Mercado', 'Market'],
  ['analise', 'Análise', 'Analysis'],
  ['macro', 'Macro e eventos', 'Macro & events'],
  ['noticias', 'Notícias', 'News'],
  ['conta', 'Sua conta', 'Your account'],
];
function page(def) { PAGES[def.id] = def; PAGE_ORDER.push(def.id); }
const pageTitle = (p) => L(p.pt, p.en);

// ---------- menu lateral ----------
// cor de cada item do menu (ícone em "azulejo" colorido; o item atual fica preenchido)
const PAGE_COLOR = { dash: '#8e98ff', chart: '#4fc3f7', top100: '#f4b43f', markets: '#31d67f', onchain: '#f7931a', lab: '#b18cff', tokenomics: '#ff7ab8', buybacks: '#ff8a4c', etf: '#5aa8ff', whales: '#2ed3c6', macro: '#ffcb5c', agenda: '#9be15d', poly: '#7c9cff', news: '#ff6b7a', geo: '#ff9248', vault: '#34d399', plans: '#f4b43f', app: '#4fc3f7', settings: '#a3acc2', admin: '#ff6b7a' };
const GROUP_COLOR = { mercado: '#8e98ff', analise: '#f7931a', macro: '#ffcb5c', noticias: '#ff6b7a', conta: '#34d399' };
function buildSidebar() {
  const sb = $('#sb'); if (!sb) return;
  let html = '';
  for (const [g, pt, en] of GROUPS) {
    const items = PAGE_ORDER.map((id) => PAGES[id]).filter((p) => p.group === g && !p.hidden && (!p.admin || ACCOUNT.admin));
    if (!items.length) continue;
    html += `<div class="sb-g">${esc(L(pt, en))}</div>`;
    for (const p of items) {
      html += `<a class="sb-i" href="#/${p.id}" data-page="${p.id}" title="${esc(pageTitle(p))}"><span class="sb-ic" style="--c:${PAGE_COLOR[p.id] || GROUP_COLOR[g] || '#8e98ff'}">${ico(p.icon, 18)}</span><span class="lbl">${esc(pageTitle(p))}</span>${p.pro ? '<span class="tag">PRO</span>' : ''}</a>`;
    }
  }
  html += `<div class="sb-foot">${esc(L('Cada número mostra a fonte e a hora da leitura.', 'Every number shows its source and read time.'))}<br>NEXUS HUB ${esc(NX.version)}</div>`;
  sb.innerHTML = html;
  // altura dos itens calculada pelo CSS a partir da quantidade (o menu inteiro cabe sem rolar)
  sb.style.setProperty('--sb-n', String(sb.querySelectorAll('.sb-i').length || 19));
  sb.style.setProperty('--sb-g', String(sb.querySelectorAll('.sb-g').length || 5));
  markCurrent();
}
function markCurrent() { $$('#sb .sb-i').forEach((a) => (a.dataset.page === S.page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))); }
function setSbMini(mini) {
  document.body.classList.toggle('sb-mini', mini);
  LS.set('sb-mini', mini);
  const b = $('#sb-tog');
  if (b) { b.innerHTML = ico(mini ? 'panel-left-open' : 'panel-left-close', 19); b.title = mini ? L('Abrir menu', 'Expand menu') : L('Recolher menu', 'Collapse menu'); b.setAttribute('aria-label', b.title); }
}
ACT.sbToggle = () => {
  if (window.innerWidth <= 900) document.body.classList.toggle('sb-open');
  else setSbMini(!document.body.classList.contains('sb-mini'));
};
ACT.sbClose = () => document.body.classList.remove('sb-open');

// ---------- rotas (#/pagina?param=valor) ----------
function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [id, qs] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { id: id || 'dash', params };
}
function go(id, params) {
  const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  const target = `#/${id}${qs}`;
  if (location.hash === target) showPage(id, params || {}); else location.hash = target;
}
let _pageParams = {};
function showPage(id, params = {}) {
  if (!PAGES[id] || (PAGES[id].admin && !ACCOUNT.admin)) id = 'dash';
  const p = PAGES[id];
  const prev = S.page && PAGES[S.page];
  _pageParams = params;
  if (prev && prev.id !== id && prev.hide) { try { prev.hide(); } catch (e) { console.warn('[NX] hide', e); } }
  let el = $('#pg-' + id);
  if (!el) {
    el = document.createElement('section');
    el.className = 'pg'; el.id = 'pg-' + id; el.setAttribute('aria-labelledby', 'pt-' + id);
    $('#main').appendChild(el);
  }
  $$('.pg.on').forEach((x) => x !== el && x.classList.remove('on'));
  S.page = id;
  if (!el.dataset.ready) {
    el.dataset.ready = '1';
    try { p.init(el, params); } catch (e) { console.error('[NX] init', id, e); el.innerHTML = errorBlock(e); }
  }
  el.classList.add('on');
  if (p.show) { try { p.show(el, params); } catch (e) { console.warn('[NX] show', id, e); } }
  document.title = `${pageTitle(p)} · NEXUS HUB`;
  markCurrent();
  document.body.classList.remove('sb-open');
  const main = $('#main'); if (main && !params.keep) main.scrollTop = 0;
  if (window.innerWidth <= 900 && !params.keep) window.scrollTo(0, 0);
  // fontes que só rodam com a página aberta passam a valer agora
  setTimeout(refreshStale, 50);
}
window.addEventListener('hashchange', () => { const { id, params } = parseHash(); showPage(id, params); });
// cabeçalho padrão de página
function pageHead(p, tools = '', sub) {
  return `<header class="pg-h"><div class="grow"><h1 class="pg-t" id="pt-${p.id}">${esc(pageTitle(p))}</h1>${(sub ?? L(p.sub || '', p.subEn || p.sub || '')) ? `<p class="pg-s">${sub ?? esc(L(p.sub || '', p.subEn || p.sub || ''))}</p>` : ''}</div>${tools ? `<div class="pg-tools">${tools}</div>` : ''}</header>`;
}
function errorBlock(e) {
  return `<div class="panel"><div class="empty">${ico('triangle-alert', 30)}<b>${esc(L('Esta seção falhou ao abrir', 'This section failed to load'))}</b><p>${esc(String((e && e.message) || e))}</p><button class="btn sm" data-act="reload">${ico('refresh-cw', 16)}${esc(L('Recarregar a página', 'Reload page'))}</button></div></div>`;
}
ACT.reload = () => location.reload();
ACT.go = (el) => go(el.dataset.to, el.dataset.params ? JSON.parse(el.dataset.params) : undefined);
// re-desenha uma página já aberta (troca de idioma, por exemplo)
function rerenderPages() {
  $$('.pg').forEach((el) => {
    const id = el.id.slice(3); const p = PAGES[id];
    if (!p) return;
    if (id === S.page) { el.dataset.ready = ''; el.innerHTML = ''; }
    else el.remove();
  });
  if (S.page) { const cur = S.page; S.page = null; showPage(cur, { ..._pageParams, keep: 1 }); }
}

// ---------- tema ----------
const THEMES = [['dark', 'Escuro', 'Dark', 'moon'], ['light', 'Claro', 'Light', 'sun'], ['cyber', 'Cyber', 'Cyber', 'zap'], ['matrix', 'Matrix', 'Matrix', 'grid-3x3'], ['auto', 'Automático', 'Automatic', 'monitor']];
const _mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
function applyTheme(name) {
  S.themeChoice = name;
  const real = name === 'auto' ? (_mq && _mq.matches ? 'light' : 'dark') : name;
  S.theme = real;
  document.documentElement.setAttribute('data-theme', real);
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim() || '#0f1627';
  LS.set('theme', name);
  $$('[data-act="setTheme"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === name)));
  if (typeof onThemeChange === 'function') onThemeChange();
}
if (_mq) _mq.addEventListener('change', () => { if (S.themeChoice === 'auto') applyTheme('auto'); });
ACT.setTheme = (el) => { applyTheme(el.dataset.v); closeMenus(); };
function themeMenuHtml() {
  return THEMES.map(([v, pt, en, i]) => `<button class="menu-i" role="menuitemradio" data-act="setTheme" data-v="${v}" aria-checked="${S.themeChoice === v}">${ico(i, 17)}${esc(L(pt, en))}</button>`).join('');
}

// ---------- idioma ----------
function setLang(lang) {
  if (lang !== 'pt' && lang !== 'en') return;
  S.lang = lang; LS.set('lang', lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  $$('.lang-sw button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === lang)));
  buildHeaderLabels(); buildSidebar(); rerenderPages(); liveStatus(); renderAccountChip();
}
ACT.setLang = (el) => setLang(el.dataset.v);

// ---------- menus suspensos ----------
function closeMenus(except) { $$('.menu.open').forEach((m) => { if (m !== except) { m.classList.remove('open'); const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); } }); }
ACT.menu = (el) => {
  const m = el.nextElementSibling; if (!m) return;
  const open = !m.classList.contains('open');
  closeMenus(m);
  if (m.dataset.build === 'theme') m.innerHTML = themeMenuHtml();
  if (m.dataset.build === 'account') m.innerHTML = accountMenuHtml();
  m.classList.toggle('open', open);
  el.setAttribute('aria-expanded', String(open));
};
document.addEventListener('click', (e) => { if (!e.target.closest('.rel')) closeMenus(); });

// ---------- avisos (toasts) ----------
function toast(msg, { type = 'info', ms = 4200, action } = {}) {
  const wrap = $('#toasts'); if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  const icn = { ok: 'circle-check', err: 'triangle-alert', warn: 'triangle-alert', info: 'info' }[type] || 'info';
  el.innerHTML = `${ico(icn, 18)}<span class="msg">${esc(msg)}</span>${action ? `<button class="act">${esc(action.label)}</button>` : ''}<button class="cls" aria-label="${esc(L('Fechar', 'Close'))}">${ico('x', 16)}</button>`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  el.querySelector('.cls').onclick = kill;
  if (action) el.querySelector('.act').onclick = () => { kill(); action.fn(); };
  wrap.appendChild(el);
  while (wrap.children.length > 4) wrap.firstElementChild.remove();
  setTimeout(kill, action ? Math.max(ms, 7000) : ms);
}

// ---------- janelas (modal) ----------
let _modal = null;
function openModal({ title, body, foot = '', wide = false, onOpen, onClose, label, guard }) {
  closeModal();
  const sc = $('#scrim');
  sc.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || title)}"><div class="modal-h"><h2 class="modal-t">${esc(title)}</h2><button class="icon-btn" data-act="closeModal" aria-label="${esc(L('Fechar', 'Close'))}">${ico('x', 18)}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  sc.classList.add('open');
  _modal = { el: sc.firstElementChild, onClose, guard, prevFocus: document.activeElement };
  setTimeout(() => { const f = sc.querySelector('[autofocus], input:not([type=hidden]):not(.hp), select, textarea, .btn.pri'); if (f) f.focus(); }, 30);
  if (onOpen) onOpen(_modal.el);
  return _modal.el;
}
function closeModal() {
  const sc = $('#scrim'); if (!sc || !sc.classList.contains('open')) return;
  const m = _modal; _modal = null;
  sc.classList.remove('open'); sc.innerHTML = '';
  if (m && m.onClose) { try { m.onClose(); } catch { /* */ } }
  if (m && m.prevFocus && m.prevFocus.focus) m.prevFocus.focus();
}
ACT.closeModal = closeModal;
// janela com dados digitados (guard) não fecha por clique fora nem por Esc — só por Cancelar/Salvar/X
function modalGuarded() {
  if (!_modal || !_modal.guard) return false;
  let g = false; try { g = !!_modal.guard(); } catch { g = false; }
  if (g) { const m = _modal.el; m.classList.remove('nudge'); void m.offsetWidth; m.classList.add('nudge'); toast(L('Você tem dados não salvos: use Salvar ou Cancelar.', 'You have unsaved data: use Save or Cancel.'), { type: 'warn', ms: 2600 }); }
  return g;
}
document.addEventListener('mousedown', (e) => { if (e.target.id === 'scrim' && !e.target.dataset.static && !modalGuarded()) closeModal(); });
function confirmBox(msg, { ok = L('Confirmar', 'Confirm'), danger = false, title = L('Confirmar', 'Confirm') } = {}) {
  return new Promise((res) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; res(v); closeModal(); };
    openModal({
      title, body: `<p class="muted" style="line-height:1.6">${esc(msg)}</p>`,
      foot: `<button class="btn ghost" data-k="no">${esc(L('Cancelar', 'Cancel'))}</button><button class="btn ${danger ? 'danger' : 'pri'}" data-k="yes" autofocus>${esc(ok)}</button>`,
      onOpen: (el) => { el.querySelector('[data-k=no]').onclick = () => finish(false); el.querySelector('[data-k=yes]').onclick = () => finish(true); },
      onClose: () => { if (!done) { done = true; res(false); } },
    });
  });
}

// ---------- paleta de comandos (Ctrl+K) ----------
let _cmdk = { items: [], sel: 0 };
function cmdkItems(q) {
  q = (q || '').trim().toLowerCase();
  const pages = PAGE_ORDER.map((id) => PAGES[id]).filter((p) => !p.hidden && (!p.admin || ACCOUNT.admin))
    .map((p) => ({ g: L('Páginas', 'Pages'), ic: p.icon, t: pageTitle(p), k: '', run: () => go(p.id), s: `${p.pt} ${p.en} ${p.id}`.toLowerCase() }));
  const acts = [
    { g: L('Ações', 'Actions'), ic: 'refresh-cw', t: L('Atualizar todos os dados agora', 'Refresh all data now'), run: () => { refreshAll(); toast(L('Atualizando todas as fontes…', 'Refreshing all sources…'), { type: 'ok' }); } },
    { g: L('Ações', 'Actions'), ic: 'sun', t: L('Tema claro', 'Light theme'), run: () => applyTheme('light') },
    { g: L('Ações', 'Actions'), ic: 'moon', t: L('Tema escuro', 'Dark theme'), run: () => applyTheme('dark') },
    { g: L('Ações', 'Actions'), ic: 'languages', t: S.lang === 'pt' ? 'English' : 'Português', run: () => setLang(S.lang === 'pt' ? 'en' : 'pt') },
    { g: L('Ações', 'Actions'), ic: 'sparkles', t: L('Abrir assistente de IA', 'Open AI assistant'), run: () => aiOpen(true) },
  ].map((a) => ({ ...a, s: a.t.toLowerCase() }));
  const coins = q.length >= 2 ? liveCoins().filter((c) => c.b.toLowerCase().startsWith(q) || c.n.toLowerCase().includes(q)).slice(0, 6)
    .map((c) => ({ g: L('Gráfico da moeda', 'Coin chart'), ic: 'chart-candlestick', t: `${c.n} (${c.b})`, k: priceOf(c.s) ? usd(priceOf(c.s).p) : '', run: () => go('chart', { s: c.s }), s: '' })) : [];
  const f = (a) => !q || a.s.includes(q);
  return [...coins, ...pages.filter(f), ...acts.filter(f)];
}
function openCmdk() {
  openModal({
    title: L('Ir para', 'Go to'), label: L('Busca rápida', 'Quick search'),
    body: `<div class="cmdk-wrap">${ico('search', 18)}<input class="cmdk-in" id="cmdk-in" placeholder="${esc(L('Página, moeda ou ação…', 'Page, coin or action…'))}" autocomplete="off" spellcheck="false" aria-label="${esc(L('Buscar', 'Search'))}"></div><div class="cmdk-list" id="cmdk-list" role="listbox"></div><div class="cmdk-foot"><span><span class="kbd">↑↓</span> ${esc(L('navegar', 'navigate'))}</span><span><span class="kbd">Enter</span> ${esc(L('abrir', 'open'))}</span><span><span class="kbd">Esc</span> ${esc(L('fechar', 'close'))}</span></div>`,
    onOpen: (m) => {
      m.classList.add('cmdk'); m.querySelector('.modal-h').remove(); m.querySelector('.modal-b').style.padding = '0';
      const inp = m.querySelector('#cmdk-in');
      const draw = () => {
        _cmdk.items = cmdkItems(inp.value); _cmdk.sel = Math.min(_cmdk.sel, Math.max(0, _cmdk.items.length - 1));
        let g = ''; let html = '';
        _cmdk.items.forEach((it, i) => { if (it.g !== g) { g = it.g; html += `<div class="cmdk-g">${esc(g)}</div>`; } html += `<div class="cmdk-i" role="option" data-i="${i}" aria-selected="${i === _cmdk.sel}">${ico(it.ic, 18)}<span>${esc(it.t)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ''}</div>`; });
        m.querySelector('#cmdk-list').innerHTML = html || `<div class="empty small">${esc(L('Nada encontrado', 'Nothing found'))}</div>`;
      };
      inp.addEventListener('input', () => { _cmdk.sel = 0; draw(); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); _cmdk.sel = Math.min(_cmdk.items.length - 1, _cmdk.sel + 1); draw(); m.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); _cmdk.sel = Math.max(0, _cmdk.sel - 1); draw(); m.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter') { e.preventDefault(); const it = _cmdk.items[_cmdk.sel]; if (it) { closeModal(); it.run(); } }
      });
      m.querySelector('#cmdk-list').addEventListener('click', (e) => { const r = e.target.closest('.cmdk-i'); if (r) { const it = _cmdk.items[+r.dataset.i]; closeModal(); it.run(); } });
      _cmdk.sel = 0; draw();
    },
  });
}
ACT.cmdk = openCmdk;

// ---------- escolher moeda (qualquer cripto) ----------
let _pick = { cb: null, results: [], exclude: new Set() };
function openCoinPicker({ title = L('Escolher moeda', 'Pick a coin'), exclude = [], onPick, onCancel }) {
  _pick = { cb: onPick, results: [], exclude: new Set(exclude), picked: false };
  openModal({
    title,
    onClose: () => { if (!_pick.picked && onCancel) setTimeout(onCancel, 0); },
    body: `<div class="inp-search">${ico('search', 18)}<input class="inp" id="cp-q" placeholder="${esc(L('Nome ou símbolo (ex.: Bitcoin, SOL)', 'Name or symbol (e.g. Bitcoin, SOL)'))}" autocomplete="off" spellcheck="false"></div>
      <div class="list mt" id="cp-list" style="max-height:52vh;overflow-y:auto"></div>
      <p class="panel-note">${esc(L('Moedas da lista principal atualizam em tempo real (Binance). As outras vêm do CoinGecko e atualizam a cada minuto.', 'Main-list coins update in real time (Binance). Others come from CoinGecko and refresh every minute.'))}</p>`,
    onOpen: (m) => {
      const q = m.querySelector('#cp-q'), list = m.querySelector('#cp-list');
      const row = (c, i, kind) => {
        const dis = _pick.exclude.has(kind === 'b' ? c.s : c.id);
        const meta = kind === 'b' ? `${c.b} · ${L('tempo real', 'real time')}` : `${(c.symbol || '').toUpperCase()} · CoinGecko${c.market_cap_rank ? ' · #' + c.market_cap_rank : ''}`;
        return `<button class="li" style="width:100%;text-align:left;${dis ? 'opacity:.45;pointer-events:none' : ''}" data-k="${kind}" data-i="${i}">${coinLogo(kind === 'b' ? c : { b: (c.symbol || '').toUpperCase(), logo: c.thumb || c.large, id: c.id }, 30)}<span class="grow"><span class="t" style="display:block">${esc(kind === 'b' ? c.n : c.name)}</span><span class="m">${esc(meta)}</span></span>${dis ? `<span class="badge">${esc(L('já está', 'added'))}</span>` : ''}</button>`;
      };
      let cur = [];
      const draw = () => {
        const s = q.value.trim().toLowerCase();
        cur = liveCoins().filter((c) => !s || c.b.toLowerCase().includes(s) || c.n.toLowerCase().includes(s)).slice(0, s ? 12 : 16);
        let html = cur.map((c, i) => row(c, i, 'b')).join('');
        if (_pick.results.length) html += `<div class="cmdk-g">${esc(L('Mais moedas (CoinGecko)', 'More coins (CoinGecko)'))}</div>` + _pick.results.map((c, i) => row(c, i, 'g')).join('');
        list.innerHTML = html || `<div class="empty small">${esc(L('Nenhuma moeda encontrada', 'No coin found'))}</div>`;
      };
      const search = debounce(async () => {
        const s = q.value.trim(); _pick.results = [];
        if (s.length < 2) { draw(); return; }
        try {
          const j = await getJSON('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(s), { timeout: 10000 });
          if (q.value.trim() !== s) return;
          const live = new Set(UNIVERSE.map((c) => c.cg));
          _pick.results = (j.coins || []).filter((c) => !live.has(c.id)).slice(0, 12);
        } catch { /* sem busca externa: fica a lista principal */ }
        draw();
      }, 320);
      q.addEventListener('input', () => { draw(); search(); });
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        let pick;
        if (b.dataset.k === 'b') { const c = cur[+b.dataset.i]; pick = { kind: 'b', s: c.s, b: c.b, n: c.n, cg: c.cg, c: c.c, logo: LOGOS[c.cg] || '' }; }
        else { const c = _pick.results[+b.dataset.i]; pick = { kind: 'g', s: null, b: (c.symbol || '').toUpperCase().slice(0, 12), n: c.name, cg: c.id, c: hashColor(c.id), logo: c.large || c.thumb || '' }; }
        const cb = _pick.cb; _pick.picked = true; closeModal(); if (cb) cb(pick);
      });
      draw();
    },
  });
}

// ---------- cabeçalho ----------
function buildHeaderLabels() {
  const s = $('#hdr-search'); if (s) s.querySelector('.txt').textContent = L('Buscar página ou moeda', 'Search page or coin');
  const ai = $('#ai-btn'); if (ai) { ai.title = L('Assistente de IA', 'AI assistant'); ai.setAttribute('aria-label', ai.title); }
  const th = $('#theme-btn'); if (th) { th.title = L('Tema', 'Theme'); th.setAttribute('aria-label', th.title); }
}
function updClock() { const c = $('#hdr-clock'); if (c) c.textContent = new Date().toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function updHeaderBtc() {
  const el = $('#hdr-btc'); if (!el) return;
  const p = PX.BTCUSDT;
  el.innerHTML = p ? `<span>BTC ${esc(usd(p.p, [0, 0]))}</span><small class="${tone(p.chg)}">${esc(fmtPct(p.chg))}</small>` : '';
}

// ---------- assistente de IA (chave do próprio usuário, só neste navegador) ----------
const AI = { msgs: [] };
function aiKey() { return LS.get('ai-key', ''); }
function aiOpen(v) {
  const p = $('#ai'); if (!p) return;
  const open = v ?? !p.classList.contains('open');
  p.classList.toggle('open', open);
  if (open) { aiRender(); setTimeout(() => $('#ai-in')?.focus(), 200); }
}
ACT.ai = () => aiOpen();
function aiRender() {
  const box = $('#ai-msgs'); if (!box) return;
  const intro = aiKey() ? L('Pergunte sobre o mercado. Eu uso os números ao vivo desta tela como contexto.', 'Ask about the market. I use the live numbers on this screen as context.')
    : L('Para usar o assistente, cole sua chave da Anthropic em Configurações (fica só neste navegador).', 'To use the assistant, paste your Anthropic key in Settings (stored only in this browser).');
  box.innerHTML = `<div class="ai-m">${esc(intro)}</div>` + AI.msgs.map((m) => `<div class="ai-m ${m.role === 'user' ? 'me' : ''}">${esc(m.content)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
function marketContext() {
  const bits = [];
  const b = PX.BTCUSDT, e = PX.ETHUSDT;
  if (b) bits.push(`BTC ${usd(b.p)} (${fmtPct(b.chg)} 24h)`);
  if (e) bits.push(`ETH ${usd(e.p)} (${fmtPct(e.chg)} 24h)`);
  const fg = CACHE.get('fng'); if (fg && fg.v && fg.v[0]) bits.push(`Fear & Greed ${fg.v[0].value} (${fg.v[0].value_classification})`);
  const fed = CACHE.get('fed'); if (fed && fed.v) bits.push(`Fed ${fed.v.from}–${fed.v.to}%`);
  const sel = CACHE.get('selic'); if (sel && sel.v) bits.push(`Selic ${sel.v.v}%`);
  const r = brlRate(); if (r) bits.push(`USD/BRL ${fmtNum(r.v, 2, 4)}`);
  return `Data/hora: ${new Date().toLocaleString('pt-BR')}. ${bits.join('; ')}.`;
}
async function aiCall(messages, { system, max = 900, model = NX.aiModel, tools } = {}) {
  const key = aiKey();
  if (!/^sk-ant-/.test(key)) throw new Error(L('Configure sua chave da Anthropic em Configurações.', 'Set your Anthropic key in Settings.'));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: max, system, messages, ...(tools ? { tools } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `HTTP ${r.status}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
ACT.aiSend = async () => {
  const inp = $('#ai-in'); const text = inp.value.trim(); if (!text) return;
  inp.value = '';
  AI.msgs.push({ role: 'user', content: text }); aiRender();
  const btn = $('#ai-send'); btn.classList.add('busy');
  try {
    const reply = await aiCall(AI.msgs.slice(-10), {
      system: `Você é o assistente do NEXUS HUB, um painel financeiro brasileiro. Responda em ${S.lang === 'en' ? 'English' : 'português do Brasil'}, direto e claro. Use só os números do contexto ou diga que não sabe; não invente dado. Não é recomendação de investimento. Contexto ao vivo: ${marketContext()}`,
    });
    AI.msgs.push({ role: 'assistant', content: reply || '—' });
  } catch (e) { AI.msgs.push({ role: 'assistant', content: '⚠ ' + e.message }); }
  btn.classList.remove('busy'); aiRender();
};

// ---------- delegação de eventos ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && !el.dataset.allowNav) e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-chg]'); if (el && ACT[el.dataset.chg]) ACT[el.dataset.chg](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-inp]'); if (el && ACT[el.dataset.inp]) ACT[el.dataset.inp](el, e); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('#scrim.open')) closeModal(); else openCmdk(); return; }
  if (e.key === 'Escape') { if ($('#scrim.open')) { if (!modalGuarded()) closeModal(); return; } if ($('#ai.open')) { aiOpen(false); return; } closeMenus(); document.body.classList.remove('sb-open'); }
  if (e.key === 'Enter' && e.target.id === 'ai-in' && !e.shiftKey) { e.preventDefault(); ACT.aiSend(); }
  // seções com abas: setas trocam a aba
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.matches('.seg button')) {
    const bs = $$('button', e.target.parentElement); const i = bs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1);
    if (bs[i]) { bs[i].focus(); bs[i].click(); }
  }
});
// abas genéricas: <div class="seg" data-seg="nome"> <button data-v="x"> … ACT.seg_<nome>(valor)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.seg[data-seg] > button'); if (!b) return;
  const seg = b.parentElement;
  $$('button', seg).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  const fn = ACT['seg_' + seg.dataset.seg]; if (fn) fn(b.dataset.v, b);
});
function seg(name, opts, cur, cls = '') {
  return `<div class="seg ${cls}" role="tablist" data-seg="${name}">${opts.map(([v, label, icon]) => `<button role="tab" data-v="${esc(v)}" aria-selected="${String(v) === String(cur)}">${icon ? ico(icon, 15) : ''}${esc(label)}</button>`).join('')}</div>`;
}
const skel = (n = 3, h = 16) => `<div class="skel-lines">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;
const emptyBox = (icon, title, text = '', action = '') => `<div class="empty">${ico(icon, 30)}<b>${esc(title)}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;
