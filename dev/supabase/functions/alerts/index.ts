// NEXUS HUB — alertas de preço e de eventos no celular (Supabase Edge Function "alerts").
//   POST {mode:"cron"} + cabeçalho x-cron-key   → o banco chama a cada minuto (pg_cron): confere os preços
//                                                  (Binance e CoinGecko), dispara alertas e avisos de eventos
//                                                  e envia as notificações (Web Push).
//   POST {action:"test"} + login                  → notificação de teste nos aparelhos do usuário
//   GET  ?vapid=1                                  → chave pública para o navegador assinar as notificações
//   GET  ?health=1                                 → situação da função
// As chaves (VAPID e a do agendador) ficam no banco, no esquema private: geradas lá dentro e aqui na
// primeira vez; nunca passam pelo código do site.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders, env, SECRET } from './_shared.ts';
import { generateVapidKeys, sendWebPush } from './webpush.js';
import { judge, quoteFor, priceMsg, eventMsg, testMsg, renewMsg } from './core.js';

const SUBJECT = 'https://iptvquantic.github.io/Claude_crypto_hub7.0/';
type Sb = ReturnType<typeof createClient>;
type Msg = { kind: string; build: (lang: string, tz: string) => { title: string; body: string }; url: string; ttl: number; topic?: string; urgency?: string };

let KEYS: { cron_key: string; vapid_public: string; vapid_private: string } | null = null;
async function getKeys(sb: Sb) {
  if (KEYS && KEYS.cron_key && KEYS.vapid_public && KEYS.vapid_private) return KEYS;
  let r = await sb.rpc('alerts_server_keys');
  if (r.error) throw new Error('keys: ' + r.error.message);
  if (!r.data?.vapid_public) {
    const g = await generateVapidKeys();
    const s = await sb.rpc('alerts_server_set_vapid', { p_public: g.publicKey, p_private: g.privateKey });
    if (s.error) throw new Error('vapid: ' + s.error.message);
    r = await sb.rpc('alerts_server_keys');
    if (r.error) throw new Error('keys: ' + r.error.message);
  }
  KEYS = r.data;
  return KEYS!;
}
const sameKey = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};

// ---------- cotações ----------
async function getJSON(url: string, ms = 8000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json', 'user-agent': 'nexus-hub-alerts/1' } });
  if (!r.ok) throw Object.assign(new Error('http ' + r.status), { status: r.status });
  return r.json();
}
const BN_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
async function binance(symbols: string[]) {
  const out: Record<string, { px: number; chg: number; t: number }> = {};
  if (!symbols.length) return out;
  // deno-lint-ignore no-explicit-any
  const put = (x: any) => { const px = +x.lastPrice, op = +x.openPrice; if (px > 0) out[x.symbol] = { px, chg: op > 0 ? (px / op - 1) * 100 : NaN, t: +x.closeTime || Date.now() }; };
  for (const h of BN_HOSTS) {
    try {
      const a = await getJSON(`${h}/api/v3/ticker/24hr?type=MINI&symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
      if (Array.isArray(a)) { a.forEach(put); return out; }
    } catch (e) {
      // um par saiu da Binance e derrubou o lote: um por um (no máximo 40)
      if ((e as { status?: number }).status === 400) {
        await Promise.all(symbols.slice(0, 40).map(async (s) => { try { put(await getJSON(`${h}/api/v3/ticker/24hr?type=MINI&symbol=${s}`, 6000)); } catch { /* fora */ } }));
        return out;
      }
    }
  }
  return out;
}
async function coingecko(ids: string[]) {
  const out: Record<string, { usd: number; brl: number; chg: number; brlChg: number; t: number }> = {};
  if (!ids.length) return out;
  try {
    const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.slice(0, 100).map(encodeURIComponent).join(',')}&vs_currencies=usd,brl&include_24hr_change=true&include_last_updated_at=true`);
    // deno-lint-ignore no-explicit-any
    for (const [id, v] of Object.entries(j as Record<string, any>)) {
      if (v && v.usd > 0) out[id] = { usd: v.usd, brl: v.brl, chg: v.usd_24h_change, brlChg: v.brl_24h_change, t: (v.last_updated_at || 0) * 1000 || Date.now() };
    }
  } catch { /* CoinGecko fora ou limite: tenta no próximo minuto */ }
  return out;
}

// ---------- envio ----------
async function deliver(sb: Sb, vapid: { publicKey: string; privateKey: string }, out: Map<string, Msg[]>) {
  const res = { sent: 0, failed: 0, devices: 0, gone: 0 };
  const users = [...out.keys()];
  if (!users.length) return res;
  const { data: devs, error } = await sb.from('push_devices').select('id,user_id,endpoint,p256dh,auth,lang,tz').in('user_id', users);
  if (error) throw new Error('devices: ' + error.message);
  const byUser = new Map<string, typeof devs>();
  for (const d of devs || []) { const a = byUser.get(d.user_id) || []; a.push(d); byUser.set(d.user_id, a); }
  const okIds = new Set<string>(), goneIds = new Set<string>(), bad = new Map<string, string>();
  const logs: Record<string, unknown>[] = [];
  const jobs: Promise<void>[] = [];
  for (const [uid, msgs] of out) {
    const ds = byUser.get(uid) || [];
    res.devices += ds.length;
    for (const m of msgs) {
      const row = { user_id: uid, kind: m.kind, ...m.build((ds[0] && ds[0].lang) || 'pt', (ds[0] && ds[0].tz) || 'America/Sao_Paulo'), url: m.url, sent: 0, failed: 0 };
      logs.push(row);
      for (const d of ds) {
        jobs.push((async () => {
          const txt = m.build(d.lang || 'pt', d.tz || 'America/Sao_Paulo');
          const payload = JSON.stringify({ ...txt, url: m.url, kind: m.kind, tag: m.topic ? 'nx-' + m.topic : undefined, ts: Date.now() });
          const r = await sendWebPush(d, payload, vapid, SUBJECT, { ttl: m.ttl, urgency: m.urgency || 'high', topic: m.topic });
          if (r.ok) { row.sent++; okIds.add(d.id); } else { row.failed++; if (r.gone) goneIds.add(d.id); else bad.set(d.id, `${r.status} ${r.err}`.slice(0, 160)); }
        })());
      }
    }
  }
  await Promise.all(jobs);
  for (const l of logs) { res.sent += l.sent as number; res.failed += l.failed as number; }
  res.gone = goneIds.size;
  if (logs.length) await sb.from('alert_log').insert(logs);
  if (goneIds.size) await sb.from('push_devices').delete().in('id', [...goneIds]);
  if (okIds.size) await sb.from('push_devices').update({ last_ok_at: new Date().toISOString(), fails: 0, last_err: null }).in('id', [...okIds]);
  for (const [id, err] of bad) {
    const d = (devs || []).find((x) => x.id === id);
    const { data: cur } = await sb.from('push_devices').select('fails').eq('id', id).maybeSingle();
    if (d && cur) await sb.from('push_devices').update({ fails: (cur.fails || 0) + 1, last_err: err }).eq('id', id);
  }
  return res;
}
const add = (out: Map<string, Msg[]>, uid: string, m: Msg) => { const a = out.get(uid) || []; a.push(m); out.set(uid, a); };

// ---------- verificação de cada minuto ----------
async function runCron(sb: Sb) {
  const t0 = Date.now();
  const st = { alerts: 0, fired: 0, events: 0, sent: 0, failed: 0, err: '' };
  const errs: string[] = [];
  const k = await getKeys(sb);
  const vapid = { publicKey: k.vapid_public, privateKey: k.vapid_private };
  const out = new Map<string, Msg[]>();
  const now = Date.now();

  // 1) avisos de eventos que chegaram na hora (reservados no banco: saem uma vez só)
  const ev = await sb.rpc('alerts_claim_events');
  if (ev.error) errs.push('eventos: ' + ev.error.message);
  for (const e of (ev.data || []) as { user_id: string; at: string; title: string; detail: string | null; ev_key: string }[]) {
    st.events++;
    const at = Date.parse(e.at);
    add(out, e.user_id, { kind: 'event', build: (lang, tz) => eventMsg(e, lang, tz), url: '#/events', ttl: Math.max(300, Math.round((at - now) / 1000) + 3600) });
  }

  // 2) alertas de preço
  const { data: alerts, error: aErr } = await sb.from('price_alerts').select('*').eq('active', true).limit(5000);
  if (aErr) errs.push('alertas: ' + aErr.message);
  // deno-lint-ignore no-explicit-any
  const list = (alerts || []) as any[];
  st.alerts = list.length;
  if (list.length) {
    const bn = [...new Set(list.filter((a) => a.bn).map((a) => a.bn as string))];
    if (list.some((a) => a.bn && a.ccy === 'brl') && !bn.includes('USDTBRL')) bn.push('USDTBRL');
    const Q = { bn: await binance(bn), cg: {} as Record<string, { usd: number; brl: number; chg: number; brlChg: number; t: number }> };
    const needCg = [...new Set(list.filter((a) => a.cg && !quoteFor(a, Q)).map((a) => a.cg as string))];
    Q.cg = await coingecko(needCg);
    const rearm: string[] = [];
    for (const a of list) {
      const q = quoteFor(a, Q);
      const j = judge(a, q);
      if (j === 'rearm') { rearm.push(a.id); continue; }
      if (j !== 'fire' || !q) continue;
      // reserva o disparo (se outra verificação já pegou, não repete)
      const { data: got } = await sb.from('price_alerts')
        .update({ armed: false, active: !!a.repeat, fired_at: new Date().toISOString(), fired_price: q.px, fired_n: (a.fired_n || 0) + 1 })
        .eq('id', a.id).eq('armed', true).eq('active', true).select('id');
      if (!got || !got.length) continue;
      st.fired++;
      add(out, a.user_id, { kind: 'price', build: (lang, tz) => priceMsg(a, q, lang, tz), url: a.bn ? `#/chart?s=${a.bn}` : '#/alerts', ttl: 3600, topic: String(a.id).replace(/-/g, '') });
    }
    if (rearm.length) await sb.from('price_alerts').update({ armed: true }).in('id', rearm).eq('armed', false).eq('active', true);
  }

  // 3) uma vez por dia (12h UTC = 9h de Brasília): avisos automáticos de eventos acabando
  const d = new Date();
  if (d.getUTCHours() === 12 && d.getUTCMinutes() < 2) {
    const r = await sb.rpc('alerts_renew_due');
    for (const x of (r.data || []) as { user_id: string; last_at: string }[]) {
      add(out, x.user_id, { kind: 'info', build: (lang, tz) => renewMsg(x.last_at, lang, tz), url: '#/alerts', ttl: 86400, urgency: 'normal' });
    }
  }

  // 4) envio
  if (out.size) {
    try { const r = await deliver(sb, vapid, out); st.sent = r.sent; st.failed = r.failed; } catch (e) { errs.push(String((e as Error).message || e)); }
  }

  // 5) limpeza (uma vez por hora)
  if (d.getUTCMinutes() === 7) await sb.rpc('alerts_cleanup');

  // 6) situação para o painel do administrador
  st.err = errs.join(' · ').slice(0, 300);
  const today = d.toISOString().slice(0, 10);
  const { data: s0 } = await sb.from('alerts_status').select('day,day_sent,day_runs').eq('id', 1).maybeSingle();
  const same = s0 && s0.day === today;
  await sb.from('alerts_status').upsert({
    id: 1, at: new Date().toISOString(), ms: Date.now() - t0, ...st, day: today,
    day_sent: (same ? s0.day_sent || 0 : 0) + st.sent, day_runs: (same ? s0.day_runs || 0 : 0) + 1,
  });
  return { ...st, ms: Date.now() - t0 };
}

Deno.serve(async (req) => {
  const H = corsHeaders(req.headers.get('origin') ?? '');
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  if (!SECRET) return json({ ok: false, error: 'config' }, 500);
  const sb = createClient(env('SUPABASE_URL'), SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      if (url.searchParams.has('health')) return json({ ok: true, fn: 'alerts', v: 1 });
      if (url.searchParams.has('vapid')) { const k = await getKeys(sb); return json({ ok: true, key: k.vapid_public }); }
      return json({ ok: false, error: 'method' }, 405);
    }
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
    const cron = req.headers.get('x-cron-key') || '';
    if (cron) {
      const k = await getKeys(sb);
      if (!sameKey(cron, k.cron_key)) return json({ ok: false, error: 'auth' }, 401);
      return json({ ok: true, ...(await runCron(sb)) });
    }
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ ok: false, error: 'auth' }, 401);
    const { data: who, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !who?.user) return json({ ok: false, error: 'auth' }, 401);
    const uid = who.user.id;
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* corpo vazio */ }
    if (String(body.action || '') === 'test') {
      const { data: last } = await sb.from('alert_log').select('at').eq('user_id', uid).eq('kind', 'test').order('at', { ascending: false }).limit(1);
      if (last && last[0] && Date.now() - Date.parse(last[0].at) < 20000) return json({ ok: false, error: 'wait' }, 429);
      const k = await getKeys(sb);
      const r = await deliver(sb, { publicKey: k.vapid_public, privateKey: k.vapid_private },
        new Map([[uid, [{ kind: 'test', build: (lang: string, tz: string) => testMsg(lang, tz), url: '#/alerts', ttl: 600 }]]]));
      return json({ ok: true, ...r });
    }
    return json({ ok: false, error: 'action' }, 400);
  } catch (e) {
    return json({ ok: false, error: 'server', detail: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
