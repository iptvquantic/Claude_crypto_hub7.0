// Função "alerts" (Edge Function) rodando no Node com o banco, a Binance e o serviço de push simulados:
// confere a verificação de cada minuto de ponta a ponta (paginação acima de 1000 alertas, cotação parada,
// nova tentativa, aparelho cancelado, histórico). Uso: node --experimental-strip-types --no-warnings dev/test-alerts-fn.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url)), FN = path.join(HERE, 'supabase/functions/alerts');
const mod = (f) => pathToFileURL(path.join(FN, f)).href;
let src = readFileSync(path.join(FN, 'index.ts'), 'utf8');
if (!src.includes("from 'npm:@supabase/supabase-js")) throw new Error('index.ts mudou: ajuste este teste');
src = src.replace(/import \{ createClient \} from 'npm:@supabase\/supabase-js@[^']+';/, 'const createClient = () => globalThis.__sb;')
  .replace(/from '\.\/(_shared\.ts|webpush\.js|core\.js)'/g, (_, f) => `from '${mod(f)}'`);
mkdirSync(path.join(HERE, 'out'), { recursive: true });
const TMP = path.join(HERE, 'out', 'alerts-index.node.ts');
writeFileSync(TMP, src);
const rows = { price_alerts: [], push_devices: [], alert_log: [], alerts_status: [] };
const calls = [];
function qb(table) {
  const st = { table, op: 'select', filters: [], range: null, payload: null };
  const run = async () => {
    calls.push({ ...st });
    let data = rows[table] || [];
    for (const [k, col, v] of st.filters) data = data.filter((r) => (k === 'eq' ? r[col] === v : k === 'in' ? v.includes(r[col]) : true));
    if (st.op === 'update') { data.forEach((r) => Object.assign(r, st.payload)); return { data: data.map((r) => ({ id: r.id })), error: null }; }
    if (st.op === 'insert') { rows[table].push(...[].concat(st.payload)); return { data: null, error: null }; }
    if (st.op === 'upsert') { rows[table] = [st.payload]; return { data: null, error: null }; }
    if (st.op === 'delete') { rows[table] = (rows[table] || []).filter((r) => !data.includes(r)); return { data: null, error: null }; }
    if (st.range) data = data.slice(st.range[0], st.range[1] + 1);
    return { data, error: null };
  };
  const b = {
    select() { return b; }, order() { return b; }, limit() { return b; },
    eq(c, v) { st.filters.push(['eq', c, v]); return b; }, in(c, v) { st.filters.push(['in', c, v]); return b; },
    range(f, t) { st.range = [f, t]; return b; },
    update(p) { st.op = 'update'; st.payload = p; return b; }, insert(p) { st.op = 'insert'; st.payload = p; return b; },
    upsert(p) { st.op = 'upsert'; st.payload = p; return b; }, delete() { st.op = 'delete'; return b; },
    maybeSingle: async () => { const r = await run(); return { data: (r.data || [])[0] || null, error: null }; },
    then(res, rej) { return run().then(res, rej); },
  };
  return b;
}
globalThis.__sb = {
  from: qb,
  rpc: async (fn) => fn === 'alerts_server_keys' ? { data: { cron_key: 'K'.repeat(64), vapid_public: globalThis.__vp, vapid_private: globalThis.__vd }, error: null } : { data: [], error: null },
  auth: { getUser: async () => ({ data: { user: null }, error: { message: 'x' } }) },
};
globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://x.supabase.co' : 'secret') }, serve: (h) => { globalThis.__h = h; } };
const { generateVapidKeys, b64uEnc } = await import(mod('webpush.js'));
const g = await generateVapidKeys(); globalThis.__vp = g.publicKey; globalThis.__vd = g.privateKey;
// 2.300 alertas ativos de 23 contas (mais que 1000: tem de paginar); cotações simuladas
const now = Date.now();
for (let i = 0; i < 2300; i++) rows.price_alerts.push({ id: 'a' + String(i).padStart(5, '0'), user_id: 'u' + (i % 23), sym: 'BTC', bn: i % 2 ? 'BTCUSDT' : 'OLDUSDT', cg: null, cond: 'above', value: 100, ccy: i % 4 === 1 ? 'brl' : 'usd', repeat: false, active: true, armed: true, fired_n: 0 });
for (let u = 0; u < 23; u++) rows.push_devices.push({ id: 'd' + u, user_id: 'u' + u, endpoint: 'https://fcm.googleapis.com/fcm/send/dev' + u, p256dh: null, auth: null, lang: 'pt', tz: null });
// aparelhos com chaves de verdade (para o envio cifrar)
for (const d of rows.push_devices) { const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); d.p256dh = b64uEnc(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))); d.auth = b64uEnc(crypto.getRandomValues(new Uint8Array(16))); }
let pushes = 0, flaky = 0; const bnCalls = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('/api/v3/ticker/24hr')) {
    bnCalls.push(url.length);
    const syms = JSON.parse(decodeURIComponent((url.match(/symbols=([^&]+)/) || [])[1] || '[]'));
    const one = (url.match(/[?&]symbol=([A-Z0-9]+)/) || [])[1];
    const mk = (s) => ({ symbol: s, lastPrice: s === 'USDTBRL' ? '5.5' : '200', openPrice: '190', closeTime: s === 'OLDUSDT' ? now - 5 * 3600e3 : now });
    return new Response(JSON.stringify(one ? mk(one) : syms.map(mk)), { status: 200 });
  }
  if (url.startsWith('https://fcm.googleapis.com/')) {
    pushes++;
    if (url.endsWith('dev3') && flaky++ === 0) return new Response('busy', { status: 503 });   // 1ª tentativa falha: tem de tentar de novo
    if (url.endsWith('dev5')) return new Response('gone', { status: 410 });
    return new Response('', { status: 201 });
  }
  throw new Error('rede inesperada: ' + url.slice(0, 80));
};
await import(pathToFileURL(TMP).href);
const res = await globalThis.__h(new Request('https://x/functions/v1/alerts', { method: 'POST', headers: { 'x-cron-key': 'K'.repeat(64), 'content-type': 'application/json' }, body: '{"mode":"cron"}' }));
const j = await res.json();
const fired = rows.price_alerts.filter((a) => a.fired_n === 1).length, stale = rows.price_alerts.filter((a) => a.bn === 'OLDUSDT' && a.fired_n).length;
const checks = [
  ['resposta 200 e ok', res.status === 200 && j.ok === true && !j.err],
  ['leu os 2.300 alertas (paginado)', j.alerts === 2300],
  ['disparou só os de cotação viva (1.150)', j.fired === 1150 && fired === 1150 && stale === 0],
  ['uma mensagem por alerta e por aparelho (1.150 − 50 do aparelho cancelado)', j.sent === 1100 && j.failed === 50],
  ['nova tentativa depois do 503 (1 pedido a mais, nenhum alerta perdido)', flaky === 51 && pushes === 1151],
  ['aparelho cancelado (410) saiu da lista', rows.push_devices.length === 22 && !rows.push_devices.find((d) => d.id === 'd5')],
  ['histórico gravado (1.150 linhas)', rows.alert_log.length === 1150],
  ['situação gravada', rows.alerts_status.length === 1 && rows.alerts_status[0].day_runs === 1],
  ['chave do agendador errada é recusada', (await globalThis.__h(new Request('https://x/', { method: 'POST', headers: { 'x-cron-key': 'errada' }, body: '{}' }))).status === 401],
];
let bad = 0; for (const [n, ok] of checks) { console.log((ok ? '✓ ' : '✗ ') + n); if (!ok) bad++; }
if (bad) { console.log(JSON.stringify(j), { fired, stale, pushes, flaky, devs: rows.push_devices.length, log: rows.alert_log.length }); process.exit(1); }
console.log('✅ função alerts (agendador): ' + checks.length + ' verificações');
