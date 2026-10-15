// =====================================================================
// Utilidades: DOM, escape, números, datas, armazenamento
// =====================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const avg = (a) => (a.length ? sum(a) / a.length : null);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => ESC[c]); }
// Só links http(s); qualquer outra coisa vira "#"
function safeUrl(u) { try { const x = new URL(String(u), location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } }
// Texto de HTML externo (RSS) → texto puro
function stripHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.innerHTML = String(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function hashColor(s) {
  const pal = ['#8e98ff', '#31d67f', '#f4b43f', '#ff6170', '#62b4ff', '#c084fc', '#2dd4bf', '#fb923c'];
  let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}

// ---------- idioma e formatação ----------
const S = { lang: 'pt', page: null, theme: 'dark' }; // estado global mínimo (o resto fica em cada módulo)
const L = (pt, en) => (S.lang === 'en' && en !== undefined ? en : pt);
const LOC = () => (S.lang === 'en' ? 'en-US' : 'pt-BR');
const NF = {};
function nf(key, opts) { const k = LOC() + key; return NF[k] || (NF[k] = new Intl.NumberFormat(LOC(), opts)); }

// decimais "inteligentes" para preço
function priceDigits(v) {
  const a = Math.abs(v);
  if (a >= 1000) return [2, 2];
  if (a >= 1) return [2, 4];
  if (a >= 0.01) return [4, 5];
  if (a >= 0.0001) return [6, 7];
  return [8, 10];
}
function fmtMoney(v, cur = 'USD', digits) {
  v = num(v); if (v === null) return '—';
  const [mn, mx] = digits || priceDigits(v);
  return nf(`m${cur}${mn}${mx}`, { style: 'currency', currency: cur, minimumFractionDigits: mn, maximumFractionDigits: mx }).format(v);
}
const usd = (v, d) => fmtMoney(v, 'USD', d);
const brl = (v, d) => fmtMoney(v, 'BRL', d);
function fmtCompact(v, cur = 'USD') {
  v = num(v); if (v === null) return '—';
  const opts = { notation: 'compact', maximumFractionDigits: Math.abs(v) >= 1e12 ? 2 : 1 };
  if (cur) Object.assign(opts, { style: 'currency', currency: cur });
  return nf(`c${cur}${opts.maximumFractionDigits}`, opts).format(v);
}
function fmtNum(v, mn = 0, mx = 2) {
  v = num(v); if (v === null) return '—';
  return nf(`n${mn}${mx}`, { minimumFractionDigits: mn, maximumFractionDigits: mx }).format(v);
}
function fmtQty(v) {
  v = num(v); if (v === null) return '—';
  const a = Math.abs(v);
  return fmtNum(v, 0, a >= 1000 ? 2 : a >= 1 ? 4 : 8);
}
function fmtPct(v, dec = 2, sign = true) {
  v = num(v); if (v === null) return '—';
  const s = fmtNum(Math.abs(v), dec, dec) + '%';
  if (!sign) return (v < 0 ? '-' : '') + s;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
}
// chip de variação (verde/vermelho); null → "—"
function chg(v, dec = 2, cls = '') {
  v = num(v);
  if (v === null) return `<span class="chip flat ${cls}">—</span>`;
  const k = v > 0.0049 ? 'up' : v < -0.0049 ? 'down' : 'flat';
  const arrow = k === 'up' ? '▲' : k === 'down' ? '▼' : '';
  return `<span class="chip ${k} ${cls}">${arrow}${arrow ? ' ' : ''}${fmtPct(v, dec, false).replace('-', '')}</span>`;
}
const tone = (v) => (num(v) === null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');

// ---------- datas ----------
function toDate(x) { if (x instanceof Date) return x; if (typeof x === 'number') return new Date(x); return parseDate(x); }
// datas de RSS/APIs: sem fuso = UTC (rss2json e IBGE mandam "AAAA-MM-DD HH:MM:SS" em UTC)
function parseDate(raw) {
  if (!raw) return new Date(NaN);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00Z');
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1], +(br[4] || 12), +(br[5] || 0), +(br[6] || 0)));
  return new Date(s);
}
const validDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());
function fmtDate(x, o = { day: '2-digit', month: 'short', year: 'numeric' }) { const d = toDate(x); return validDate(d) ? d.toLocaleDateString(LOC(), o) : '—'; }
function fmtTime(x, sec = false) { const d = toDate(x); return validDate(d) ? d.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) }) : '—'; }
function fmtDateTime(x) { const d = toDate(x); return validDate(d) ? d.toLocaleString(LOC(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
function ago(ts) {
  if (!ts) return L('sem leitura', 'no reading');
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return L('agora', 'now');
  if (s < 60) return L(`há ${s} s`, `${s}s ago`);
  const m = Math.round(s / 60);
  if (m < 60) return L(`há ${m} min`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 48) return L(`há ${h} h`, `${h} h ago`);
  return L(`há ${Math.round(h / 24)} d`, `${Math.round(h / 24)} d ago`);
}
function until(ts) {
  const s = Math.round((ts - Date.now()) / 1000);
  if (s <= 0) return L('agora', 'now');
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d >= 2) return L(`em ${d} dias`, `in ${d} days`);
  if (d === 1) return L(`em 1 dia e ${h} h`, `in 1 day ${h} h`);
  if (h >= 1) return L(`em ${h} h ${m} min`, `in ${h} h ${m} min`);
  return L(`em ${m} min`, `in ${m} min`);
}
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (i) => (S.lang === 'en' ? MONTHS_EN : MONTHS_PT)[i];
const dayKey = (d) => { const x = toDate(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const todayISO = () => dayKey(new Date());

// ---------- armazenamento local (nunca quebra se o navegador bloquear) ----------
const LS = {
  pre: 'nx3:',
  get(k, def = null) { try { const v = localStorage.getItem(this.pre + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(this.pre + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(this.pre + k); } catch { /* sem armazenamento */ } },
  keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith(this.pre)); } catch { return []; } },
};

// HTML de logo de moeda: imagem com fallback de iniciais coloridas
function coinLogo(c, size = 28) {
  const sym = (c.b || c.sym || '?').slice(0, 4);
  const color = c.c || c.color || hashColor(sym);
  const src = c.logo || (typeof LOGOS !== 'undefined' && LOGOS[c.cg || c.id]) || '';
  const fb = `<span class="coin-fb" style="width:${size}px;height:${size}px;background:${esc(color)};font-size:${Math.max(9, size * 0.36)}px">${esc(sym.slice(0, 3))}</span>`;
  if (!src) return fb;
  return `<img class="coin-logo" src="${esc(safeUrl(src))}" alt="" width="${size}" height="${size}" loading="lazy" data-fb="${esc(sym.slice(0, 3))}" data-fc="${esc(color)}">`;
}
// fallback das imagens que falham (sem onerror inline: CSP)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('coin-logo') || img.dataset.fbDone) return;
  img.dataset.fbDone = '1';
  const s = document.createElement('span');
  s.className = 'coin-fb';
  s.style.cssText = `width:${img.width}px;height:${img.height}px;background:${img.dataset.fc || '#8e98ff'};font-size:${Math.max(9, img.width * 0.36)}px`;
  s.textContent = img.dataset.fb || '?';
  img.replaceWith(s);
}, true);
