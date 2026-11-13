-- NEXUS HUB — reforço dos alertas no celular (12/11/2026). Idempotente; não apaga dados de clientes.
--
-- 1) Aparelhos: só entram endereços dos serviços de notificação conhecidos (Google/FCM: Chrome, Edge no
--    Android, Samsung, Opera, Brave · Mozilla: Firefox · Apple: Safari e app no iPhone · WNS: Edge no
--    Windows). Antes, qualquer endereço https era aceito: uma conta mal-intencionada poderia fazer o
--    servidor do NEXUS mandar pedidos para um site qualquer.
-- 2) Limpeza diária do histórico do agendador: cada verificação de minuto grava uma linha em
--    cron.job_run_details (1.440 por dia, para sempre). Ficam os 2 últimos dias.
--
-- Reverter: alter table public.push_devices drop constraint push_devices_endpoint_host;
--           select cron.unschedule('nexus-limpa-agendador');

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_devices_endpoint_host' and conrelid = 'public.push_devices'::regclass) then
    alter table public.push_devices add constraint push_devices_endpoint_host
      check (endpoint ~ '^https://([a-z0-9-]+\.)*(googleapis\.com|google\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)(:443)?/[^[:space:]]*$');
  end if;
end $$;

-- a mesma regra na função do app, com resposta clara (o site explica qual navegador usar)
create or replace function public.push_device_save(p_endpoint text, p_p256dh text, p_auth text,
  p_label text default null, p_lang text default 'pt', p_tz text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://([a-z0-9-]+\.)*(googleapis\.com|google\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)(:443)?/[^[:space:]]*$' then
    return jsonb_build_object('ok', false, 'error', 'endpoint');
  end if;
  if (select count(*) from public.push_devices d where d.user_id = uid and d.endpoint <> p_endpoint) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'limite');
  end if;
  insert into public.push_devices as d (user_id, endpoint, p256dh, auth, label, lang, tz)
  values (uid, p_endpoint, p_p256dh, p_auth, nullif(left(btrim(coalesce(p_label, '')), 60), ''),
          case when p_lang = 'en' then 'en' else 'pt' end, nullif(left(btrim(coalesce(p_tz, '')), 40), ''))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label,
        lang = excluded.lang, tz = excluded.tz, fails = 0, last_err = null;
  return jsonb_build_object('ok', true);
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'nexus-limpa-agendador';
    perform cron.schedule('nexus-limpa-agendador', '23 4 * * *',
      $q$delete from cron.job_run_details where end_time < now() - interval '2 days'$q$);
  end if;
end $$;

-- 3) Menor privilégio (aviso do Security Advisor): visitante sem login não chama as funções dos alertas, e as
--    funções do servidor só o servidor. Todas já conferiam quem chama; isto é uma segunda trava.
--    (Contém REVOKE: se o conector pedir confirmação e ela não vier, aplicar estas 4 linhas pelo SQL Editor.)
revoke execute on function public.push_device_save(text, text, text, text, text, text), public.admin_alerts_status() from public, anon;
revoke execute on function public.alerts_server_keys(), public.alerts_server_set_vapid(text, text), public.alerts_claim_events(),
  public.alerts_renew_due(), public.alerts_cleanup() from public, anon, authenticated;
grant execute on function public.push_device_save(text, text, text, text, text, text), public.admin_alerts_status() to authenticated;
grant execute on function public.alerts_server_keys(), public.alerts_server_set_vapid(text, text), public.alerts_claim_events(),
  public.alerts_renew_due(), public.alerts_cleanup() to service_role;
