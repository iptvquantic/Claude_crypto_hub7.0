-- NEXUS HUB — camada extra de permissões (opcional; a RLS e os gatilhos *_guard já protegem os dados).
-- Tira privilégios padrão que o Supabase dá aos papéis anon/authenticated. Idempotente.
-- Contém REVOKE: aplicar pelo SQL Editor do painel (o conector pede confirmação para esse tipo de comando).
revoke all on public.app_admins, public.signup_attempts from anon, authenticated;
revoke all on public.profiles, public.vault_entries, public.payment_claims from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, settings, last_seen_at) on public.profiles to authenticated;
revoke delete, truncate on public.vault_entries from authenticated;
revoke update, delete, truncate on public.payment_claims from authenticated;
