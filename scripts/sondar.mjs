#!/usr/bin/env node
// Ferramenta de desenvolvimento: testa endereços de dados a partir do GitHub Actions (onde a rede é livre)
// e grava um resumo de cada resposta em <pasta>/probe.json (status, tempo, CORS, formato e amostra).
// Uso: node scripts/sondar.mjs <pasta> [lista.json]   — a lista padrão é scripts/sondar-lista.json
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '_probe';
const LIST = process.argv[3] || new URL('./sondar-lista.json', import.meta.url);
const ORIGIN = 'https://iptvquantic.github.io';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
mkdirSync(OUT, { recursive: true });

function shape(v, depth = 0) {
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? (v.length > 120 ? v.slice(0, 120) + '…' : v) : v;
  if (depth > 3) return Array.isArray(v) ? `[array ${v.length}]` : '{…}';
  if (Array.isArray(v)) {
    const out = { _len: v.length };
    if (v.length) out.first = shape(v[0], depth + 1);
    if (v.length > 1) out.last = shape(v[v.length - 1], depth + 1);
    return out;
  }
  const keys = Object.keys(v); const out = { _keys: keys.length > 40 ? keys.slice(0, 40).concat(`…+${keys.length - 40}`) : keys };
  for (const k of keys.slice(0, 25)) out[k] = shape(v[k], depth + 1);
  return out;
}

const list = JSON.parse(readFileSync(LIST, 'utf8'));
const results = {};
for (const p of list) {
  const t0 = Date.now();
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), p.timeout || 25000);
  try {
    const r = await fetch(p.url, { method: p.method || 'GET', signal: ctl.signal, headers: { 'user-agent': UA, origin: ORIGIN, accept: p.accept || '*/*', ...(p.headers || {}) }, body: p.body ? JSON.stringify(p.body) : undefined });
    const text = await r.text();
    if (p.save) writeFileSync(join(OUT, p.save), text);
    const res = { status: r.status, ms: Date.now() - t0, type: r.headers.get('content-type'), acao: r.headers.get('access-control-allow-origin'), len: text.length };
    for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'cache-control', 'last-modified']) { const v = r.headers.get(h); if (v) res[h] = v; }
    let j = null; try { j = JSON.parse(text); } catch { /* não é JSON */ }
    if (j !== null) {
      if (p.pick === 'cm-catalog') {
        const d = (j.data && j.data[0]) || {};
        res.metrics = (d.metrics || []).map((m) => m.metric + ':' + (m.frequencies || []).map((f) => f.frequency + (f.min_time ? '@' + String(f.min_time).slice(0, 10) : '')).join('/'));
      } else if (p.pick === 'llama-overview') {
        const prot = (j.protocols || []).filter((x) => x.total30d > 0).sort((a, b) => (b.total30d || 0) - (a.total30d || 0));
        res.top = prot.slice(0, 40).map((x) => ({ n: x.name, slug: x.slug || x.module, cat: x.category, sym: x.symbol, gecko: x.gecko_id, cg: x.cmcId, d1: x.total24h, d7: x.total7d, d30: x.total30d, y1: x.total1y, avg1y: x.average1y, all: x.totalAllTime, ch1m: x.change_1m, chains: (x.chains || []).slice(0, 3) }));
        res.protocolKeys = j.protocols && j.protocols[0] ? Object.keys(j.protocols[0]) : [];
        res.rootKeys = Object.keys(j);
        res.count = (j.protocols || []).length;
      } else if (p.pick === 'llama-find') {
        const terms = (p.find || []).map((t) => t.toLowerCase());
        const hit = (x) => terms.some((t) => [x.name, x.displayName, x.slug, x.parentProtocol, x.module].some((v) => String(v || '').toLowerCase().includes(t)));
        res.found = (j.protocols || []).filter(hit).map((x) => ({ n: x.displayName || x.name, slug: x.slug, mod: x.module, parent: x.parentProtocol, id: x.defillamaId, gecko: x.gecko_id, cat: x.category, d1: x.total24h, d7: x.total7d, d30: x.total30d, y1: x.total1y, meth: typeof x.methodology === 'string' ? x.methodology.slice(0, 160) : x.methodology && (x.methodology.HoldersRevenue || '').slice(0, 160) }));
        res.count = (j.protocols || []).length;
      } else if (p.pick === 'llama-sum') {
        const ch = j.totalDataChart || [];
        res.sum = { n: j.displayName || j.name, gecko: j.gecko_id, sym: j.symbol, d1: j.total24h, d7: j.total7d, d30: j.total30d, y1: j.total1y, all: j.totalAllTime, last: ch.slice(-3), meth: j.methodology, children: (j.childProtocols || []).map((c) => c.displayName || c.name) };
      } else if (p.pick === 'openapi') {
        res.paths = Object.keys(j.paths || {}).slice(0, 400);
      } else res.shape = shape(j);
    } else res.sample = text.slice(0, p.sampleLen || 900);
    results[p.id] = res;
    console.log(p.id, res.status, res.ms + 'ms', res.len);
  } catch (e) {
    results[p.id] = { error: String(e.message || e), ms: Date.now() - t0 };
    console.log(p.id, 'ERRO', e.message);
  } finally { clearTimeout(to); }
  if (p.pause) await new Promise((r) => setTimeout(r, p.pause));
}
writeFileSync(join(OUT, 'probe.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
console.log('pronto');
