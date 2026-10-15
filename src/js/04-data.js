// =====================================================================
// Camada de dados: busca com tempo-limite, fila por servidor, último valor válido,
// agendador único (pausa com a aba oculta), saúde das fontes e selos de procedência.
// =====================================================================
const HOST_LIMIT = { 'api.coingecko.com': 2, 'api.rss2json.com': 2, 'bitcoin-data.com': 1 };
const _active = {}, _queue = {};
function hostOf(u) { try { return new URL(u).host; } catch { return ''; } }
function _pump(h) {
  const lim = HOST_LIMIT[h] || 6;
  while ((_active[h] || 0) < lim && _queue[h] && _queue[h].length) {
    const job = _queue[h].shift();
    _active[h] = (_active[h] || 0) + 1;
    job().finally(() => { _active[h]--; _pump(h); });
  }
}
function _slot(u, fn) {
  const h = hostOf(u);
  return new Promise((res, rej) => {
    (_queue[h] = _queue[h] || []).push(() => fn().then(res, rej));
    _pump(h);
  });
}
class HttpError extends Error { constructor(status, url) { super(`HTTP ${status}`); this.status = status; this.url = url; } }
async function fetchRaw(url, { timeout = 12000, init = {}, as = 'json' } = {}) {
  return _slot(url, async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { ...init, signal: ctl.signal });
      if (!r.ok) throw new HttpError(r.status, url);
      return as === 'text' ? await r.text() : await r.json();
    } finally { clearTimeout(t); }
  });
}
const getJSON = (url, o) => fetchRaw(url, { ...o, as: 'json' });
const getText = (url, o) => fetchRaw(url, { ...o, as: 'text' });

// ---------- cache do último valor válido (persistido) ----------
const CACHE = {
  mem: {},
  get(id) { if (this.mem[id]) return this.mem[id]; const v = LS.get('c:' + id); if (v) this.mem[id] = v; return v; },
  set(id, v, persist = true) {
    const rec = { v, ts: Date.now() };
    this.mem[id] = rec;
    // o domínio é compartilhado com outros apps: só guarda no navegador o que é pequeno (< 40 KB)
    if (persist) { try { const str = JSON.stringify(rec); if (str.length < 40000) localStorage.setItem(LS.pre + 'c:' + id, str); else LS.del('c:' + id); } catch { /* cota cheia: fica só na memória */ } }
    return rec;
  },
};

// ---------- registro de fontes + agendador ----------
// def: { id, label, provider, every (ms), run: async () => data, validate(data) → bool,
//        onData(data, meta), need: () => bool (só roda quando precisa), persist, kind: 'live'|'ref'|'daily' }
const SRC = {};
const HEALTH = {};
function source(def) {
  const d = { every: 60000, persist: true, kind: 'live', need: () => true, ...def };
  SRC[d.id] = d;
  HEALTH[d.id] = HEALTH[d.id] || { id: d.id, label: d.label, provider: d.provider, ok: null, ts: 0, err: '', fails: 0, next: 0, every: d.every, kind: d.kind };
  const cached = CACHE.get(d.id);
  if (cached && d.onData) {
    HEALTH[d.id].ts = cached.ts; HEALTH[d.id].ok = true; HEALTH[d.id].cached = true;
    try { d.onData(cached.v, { cached: true, ts: cached.ts }); } catch (e) { console.warn('[NX] onData(cache)', d.id, e); }
  }
  return d;
}
async function runSource(id, { force = false } = {}) {
  const d = SRC[id], h = HEALTH[id];
  if (!d || d._running) return;
  if (!force && !d.need()) return;
  d._running = true;
  const t0 = performance.now();
  try {
    const data = await d.run();
    if (d.validate && !d.validate(data)) throw new Error(L('dado fora do esperado', 'unexpected data'));
    CACHE.set(id, data, d.persist);
    Object.assign(h, { ok: true, ts: Date.now(), err: '', fails: 0, ms: Math.round(performance.now() - t0), cached: false });
    h.next = Date.now() + d.every;
    if (d.onData) d.onData(data, { cached: false, ts: h.ts });
  } catch (e) {
    h.fails++;
    h.ok = h.ts ? h.ok : false;
    h.err = e && e.name === 'AbortError' ? L('tempo esgotado', 'timeout') : String((e && e.message) || e).slice(0, 120);
    h.lastErrTs = Date.now();
    // espera crescente com variação: 15 s, 30 s, 60 s... até o intervalo normal (máx. 10 min)
    const back = Math.min(Math.max(d.every, 15000), 15000 * 2 ** Math.min(h.fails - 1, 5)) * (0.85 + Math.random() * 0.3);
    h.next = Date.now() + Math.min(back, 600000);
    if (d.onError) { try { d.onError(e); } catch { /* */ } }
  } finally {
    d._running = false;
    stampsRefresh();
  }
}
function schedTick() {
  if (document.hidden || !navigator.onLine) return;
  const now = Date.now();
  for (const id in SRC) {
    const d = SRC[id], h = HEALTH[id];
    if (d._running || !d.need()) continue;
    if (!h.next || now >= h.next) runSource(id);
  }
}
function refreshStale() { // ao voltar para a aba: atualiza o que venceu
  const now = Date.now();
  for (const id in SRC) { const d = SRC[id], h = HEALTH[id]; if (d.need() && (!h.ts || now - h.ts > d.every)) runSource(id); }
}
function refreshAll() { for (const id in SRC) if (SRC[id].need()) runSource(id, { force: true }); }

// ---------- selos de procedência ----------
// <span class="stamp" data-src="id"> é atualizado sozinho. Estados: live (em dia), stale (atrasado),
// err (falhou e sem valor), ref (referência), off (sem leitura ainda).
function stampState(id) {
  const h = HEALTH[id]; if (!h) return { cls: 'off', txt: L('sem fonte', 'no source') };
  const d = SRC[id] || {};
  if (d.kind === 'ref') return { cls: 'ref', txt: L('referência', 'reference') };
  if (!h.ts) return h.ok === false ? { cls: 'err', txt: L('indisponível', 'unavailable') } : { cls: 'off', txt: L('carregando', 'loading') };
  const age = Date.now() - h.ts, every = d.every || 60000;
  const slack = d.kind === 'daily' ? 36 * 3600e3 : every * 2.5 + 20000;
  const cls = age <= slack ? 'live' : 'stale';
  return { cls, txt: d.kind === 'daily' && h.dataTs ? L('dado de ', 'data from ') + fmtDate(h.dataTs, { day: '2-digit', month: 'short' }) : ago(h.ts) };
}
function stamp(id, provider) {
  const p = provider || (SRC[id] && SRC[id].provider) || '';
  const st = stampState(id);
  return `<span class="stamp ${st.cls}" data-src="${esc(id)}" data-prov="${esc(p)}" title="${esc(stampTitle(id))}"><i class="dot"></i><b>${esc(p)}</b><span class="st">${esc(st.txt)}</span></span>`;
}
function stampTitle(id) {
  const h = HEALTH[id]; if (!h) return '';
  const parts = [];
  if (h.ts) parts.push(L('Última leitura: ', 'Last read: ') + fmtDateTime(h.ts));
  if (h.err) parts.push(L('Último erro: ', 'Last error: ') + h.err);
  if (SRC[id] && SRC[id].every) parts.push(L('Atualiza a cada ', 'Refreshes every ') + humanEvery(SRC[id].every));
  return parts.join('\n');
}
function humanEvery(ms) { const s = ms / 1000; return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; }
function stampsRefresh() {
  $$('.stamp[data-src]').forEach((el) => {
    const st = stampState(el.dataset.src);
    el.className = 'stamp ' + st.cls;
    const s = el.querySelector('.st'); if (s && s.textContent !== st.txt) s.textContent = st.txt;
    el.title = stampTitle(el.dataset.src);
  });
}

// ---------- dados do robô (ramo "data" do GitHub, gerado pelo GitHub Actions) ----------
// Nunca é a única fonte: se estiver velho ou faltando, cada página busca direto.
async function getPipeline(name, maxAgeMs = 3 * 3600e3) {
  const bucket = Math.floor(Date.now() / 120000); // 2 min: evita cache velho do CDN
  const j = await getJSON(`${NX.dataBase}${name}.json?v=${bucket}`, { timeout: 10000 });
  const gen = Date.parse(j && j.generatedAt);
  if (!gen || Date.now() - gen > maxAgeMs) throw new Error(L('arquivo do robô desatualizado', 'pipeline file stale'));
  return j;
}

// ---------- RSS (fallback direto do navegador via rss2json) ----------
async function rssItems(feedUrl, max = 12) {
  const j = await getJSON('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl), { timeout: 14000 });
  if (!j || j.status !== 'ok' || !Array.isArray(j.items)) throw new Error('rss');
  const feedTitle = (j.feed && j.feed.title) || hostOf(feedUrl);
  return j.items.slice(0, max).map((it) => ({
    t: stripHtml(it.title), u: it.link, d: parseDate(it.pubDate).getTime(),
    x: stripHtml(it.description).slice(0, 260),
    img: it.thumbnail || (it.enclosure && /image/.test(it.enclosure.type || '') ? it.enclosure.link : '') || '',
    src: feedTitle,
  })).filter((n) => n.t && n.u && isNum(n.d));
}

// ---------- auto-auditoria: procura número quebrado na tela ----------
function nxAudit() {
  const issues = [];
  const root = $('#main'); if (!root) return issues;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const bad = /\b(NaN|undefined|Infinity|null)\b|\[object Object\]/;
  let n;
  while ((n = walker.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest('.pg:not(.on)') || el.closest('script,style,.no-audit')) continue;
    if (bad.test(n.nodeValue)) issues.push({ text: n.nodeValue.trim().slice(0, 80), where: el.closest('[id]')?.id || el.tagName });
  }
  const stale = Object.values(HEALTH).filter((h) => SRC[h.id] && SRC[h.id].need() && h.ts && SRC[h.id].kind === 'live' && Date.now() - h.ts > SRC[h.id].every * 4 + 60000);
  stale.forEach((h) => issues.push({ text: L('fonte atrasada: ', 'stale source: ') + h.label, where: h.id }));
  window.__nxAudit = { ts: Date.now(), issues };
  return issues;
}
