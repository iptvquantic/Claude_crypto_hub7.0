// NEXUS HUB — cadastro (Supabase Edge Function "signup").
// Cria a conta já confirmada (sem e-mail de confirmação: o SMTP padrão do Supabase só envia para a equipe).
// Proteções: validação de e-mail/senha, campo-isca contra robôs, limite de 5 cadastros por hora por IP
// (guardado só como hash) e 500 por dia no total. O plano/teste de 15 dias é decidido no banco (handle_new_user).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders, env, SECRET, sha256 } from './_shared.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  const H = corsHeaders(req.headers.get('origin') ?? '');
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.has('health')) return json({ ok: true, secret: !!SECRET, fn: 'signup', v: 1 });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'json' }, 400); }
  if (body?.website) return json({ ok: true }); // campo-isca: robô preencheu
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const name = String(body?.name ?? '').trim().slice(0, 80);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: 'email' }, 400);
  if (password.length < 8 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return json({ ok: false, error: 'password' }, 400);
  }
  if (!SECRET) return json({ ok: false, error: 'config' }, 500);
  const sb = createClient(env('SUPABASE_URL'), SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'desconhecido';
  const ipHash = await sha256('nexus-hub|' + ip);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: mine } = await sb.from('signup_attempts').select('ip_hash', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('at', hourAgo);
  if ((mine ?? 0) >= 5) return json({ ok: false, error: 'rate' }, 429);
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count: all } = await sb.from('signup_attempts').select('ip_hash', { count: 'exact', head: true }).gte('at', dayAgo);
  if ((all ?? 0) >= 500) return json({ ok: false, error: 'busy' }, 429);
  await sb.from('signup_attempts').insert({ ip_hash: ipHash });
  const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) {
    const msg = String(error.message || '');
    if (/already|registered|exists/i.test(msg)) return json({ ok: false, error: 'exists' }, 409);
    if (/password/i.test(msg)) return json({ ok: false, error: 'password', detail: msg.slice(0, 160) }, 400);
    return json({ ok: false, error: 'create', detail: msg.slice(0, 160) }, 400);
  }
  return json({ ok: true });
});
