// NEXUS HUB — conta (Supabase Edge Function "account"). Exige login (token do usuário no Authorization).
//   POST {action:"close", confirm:"EXCLUIR"}      → LGPD: apaga aportes, pedidos, perfil e a própria conta.
//   POST {action:"admin_reset", user_id}           → só admin: gera senha temporária para um cliente
//                                                    (o SMTP padrão do Supabase não envia e-mail para clientes).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders, env, SECRET } from './_shared.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', dig = '23456789';
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  let s = ''; for (let i = 0; i < 10; i++) s += abc[r[i] % abc.length];
  return s + dig[r[10] % dig.length] + dig[r[11] % dig.length];
}

Deno.serve(async (req) => {
  const H = corsHeaders(req.headers.get('origin') ?? '');
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.has('health')) return json({ ok: true, secret: !!SECRET, fn: 'account', v: 1 });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  if (!SECRET) return json({ ok: false, error: 'config' }, 500);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, error: 'auth' }, 401);
  const sb = createClient(env('SUPABASE_URL'), SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !who?.user) return json({ ok: false, error: 'auth' }, 401);
  const uid = who.user.id;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'json' }, 400); }
  const action = String(body?.action ?? '');

  if (action === 'close') {
    if (body?.confirm !== 'EXCLUIR') return json({ ok: false, error: 'confirm' }, 400);
    const { data: me } = await sb.from('profiles').select('plan').eq('id', uid).maybeSingle();
    if (me && ['admin', 'master'].includes(String(me.plan))) return json({ ok: false, error: 'admin' }, 403);
    for (const [table, col] of [['vault_entries', 'user_id'], ['payment_claims', 'user_id'], ['profiles', 'id']] as const) {
      const { error } = await sb.from(table).delete().eq(col, uid);
      if (error) return json({ ok: false, error: 'db', detail: `${table}: ${error.message}`.slice(0, 160) }, 500);
    }
    const { error } = await sb.auth.admin.deleteUser(uid);
    if (error) return json({ ok: false, error: 'auth_delete', detail: error.message.slice(0, 160) }, 500);
    return json({ ok: true });
  }

  if (action === 'admin_reset') {
    const { data: me } = await sb.from('profiles').select('plan, active').eq('id', uid).maybeSingle();
    if (!me || !me.active || !['admin', 'master'].includes(String(me.plan))) return json({ ok: false, error: 'forbidden' }, 403);
    const target = String(body?.user_id ?? '');
    if (!UUID_RE.test(target)) return json({ ok: false, error: 'user' }, 400);
    const { data: tp } = await sb.from('profiles').select('plan, email').eq('id', target).maybeSingle();
    if (!tp) return json({ ok: false, error: 'not_found' }, 404);
    if (['admin', 'master'].includes(String(tp.plan))) return json({ ok: false, error: 'forbidden' }, 403);
    const temp = tempPassword();
    const { error } = await sb.auth.admin.updateUserById(target, { password: temp });
    if (error) return json({ ok: false, error: 'update', detail: error.message.slice(0, 160) }, 500);
    return json({ ok: true, email: tp.email, temp_password: temp });
  }

  return json({ ok: false, error: 'action' }, 400);
});
