// Utilidades comuns às funções do NEXUS HUB (copiadas para cada função na publicação).
export const env = (k: string, d = '') => (Deno.env.get(k) ?? d).trim();
const named = (k: string) => { try { const o = JSON.parse(env(k) || '{}'); return String(o.default ?? Object.values(o)[0] ?? ''); } catch { return ''; } };
// chave de serviço: a nova (sb_secret_) e, se não houver, a antiga (service_role)
export const SECRET = named('SUPABASE_SECRET_KEYS') || env('SUPABASE_SERVICE_ROLE_KEY');
const ALLOWED = (env('ALLOWED_ORIGINS') || 'https://iptvquantic.github.io').split(',').map((s) => s.trim());
export function corsHeaders(origin: string) {
  const ok = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}
export async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
