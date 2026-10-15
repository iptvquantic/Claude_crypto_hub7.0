-- NEXUS HUB — camada extra de permissões (opcional; a RLS e os gatilhos *_guard já protegem os dados).
-- Tira privilégios padrão que o Supabase dá aos papéis anon/authenticated. Idempotente.
-- Contém REVOKE: aplicar pelo SQL Editor do painel (o conector pede confirmação para esse tipo de comando).

-- Tabelas
revoke all on public.app_admins, public.signup_attempts from anon, authenticated;
revoke all on public.profiles, public.vault_entries, public.payment_claims from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (name, settings, last_seen_at) on public.profiles to authenticated;
revoke delete, truncate on public.vault_entries from authenticated;
revoke update, delete, truncate on public.payment_claims from authenticated;

-- Funções (resolve os avisos "Public Can Execute SECURITY DEFINER Function" do Security Advisor):
-- visitante sem login só chama o sinal de vida; quem tem login chama as funções do app;
-- ninguém chama as funções de gatilho direto (os gatilhos continuam disparando normalmente).
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.handle_new_user(), public.touch_updated_at(), public.profiles_guard(),
  public.vault_guard(), public.claims_guard() from authenticated;
grant execute on function public.is_admin(), public.has_pro(), public.my_profile(),
  public.vault_remove(uuid), public.vault_restore(uuid),
  public.admin_overview(), public.admin_list_users(text, int), public.admin_list_claims(text),
  public.admin_set_plan(uuid, text, int), public.admin_resolve_claim(uuid, text),
  public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.ping() to anon, authenticated;
