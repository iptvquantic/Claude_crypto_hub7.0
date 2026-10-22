-- NEXUS HUB — agendador do robô de dados (pg_cron + pg_net do Supabase). Idempotente.
--
-- Por quê: em out/2026 o GitHub dispara o agendamento "schedule" do robô só de tempos em tempos
-- (≈ 6 a 8 vezes por dia, em pares), e o robô foi feito para rodar a cada ~20 min. Aqui o próprio
-- banco pede ao GitHub uma execução (workflow_dispatch) a cada 20 min.
--
-- O token do GitHub fica no Vault do Supabase (criptografado), com o nome github_dispatch_token.
-- O dono cola pelo painel do administrador do site (função admin_robot_set_token): o token nunca vai
-- para o código, para o chat nem volta para a tela. Sem token, nada acontece (o robô segue só com o
-- agendamento do GitHub).
--
-- Reverter: select cron.unschedule('nexus-robo');  (e, se quiser, apagar o segredo no Vault)

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

-- esquema fora da API (o PostgREST só expõe "public"); visitante e cliente não têm acesso
create schema if not exists private;

-- cada pedido feito ao GitHub (a resposta fica 6 h na tabela net._http_response do pg_net)
create table if not exists private.robo_disparos (
  id     bigint primary key,
  at     timestamptz not null default now(),
  origem text not null default 'agendador'
);

-- pede ao GitHub uma execução do robô; devolve o id do pedido (ou null sem token)
create or replace function private.robo_disparar(p_origem text default 'agendador') returns bigint
language plpgsql security definer set search_path = '' as $$
declare tok text; rid bigint;
begin
  select s.decrypted_secret into tok from vault.decrypted_secrets s where s.name = 'github_dispatch_token' limit 1;
  if tok is null or length(tok) < 20 then return null; end if;
  rid := net.http_post(
    url := 'https://api.github.com/repos/iptvquantic/Claude_crypto_hub7.0/actions/workflows/atualizar-dados.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'nexus-hub-agendador',
      'Content-Type', 'application/json'),
    timeout_milliseconds := 15000);
  insert into private.robo_disparos (id, origem) values (rid, left(coalesce(p_origem, 'agendador'), 20))
    on conflict (id) do nothing;
  delete from private.robo_disparos where at < now() - interval '7 days';
  return rid;
end $$;

-- ---------- painel do administrador ----------
-- situação: token salvo (sem mostrar), agendamento, último pedido e a resposta do GitHub
create or replace function public.admin_robot_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := jsonb_build_object('server_time', now());
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  begin
    r := r || jsonb_build_object('token', (
      select jsonb_build_object('set', length(s.decrypted_secret) >= 20, 'updated_at', s.updated_at)
        from vault.decrypted_secrets s where s.name = 'github_dispatch_token' limit 1));
  exception when others then r := r || jsonb_build_object('token_err', sqlerrm); end;
  begin
    r := r || jsonb_build_object('job', (
      select jsonb_build_object('active', j.active, 'schedule', j.schedule) from cron.job j where j.jobname = 'nexus-robo' limit 1));
  exception when others then r := r || jsonb_build_object('job_err', sqlerrm); end;
  begin
    r := r || jsonb_build_object(
      'last', (select jsonb_build_object('at', d.at, 'origem', d.origem, 'status', h.status_code,
                 'error', coalesce(h.error_msg, case when h.timed_out then 'tempo esgotado' end), 'body', left(h.content, 300))
               from private.robo_disparos d left join net._http_response h on h.id = d.id
               order by d.at desc limit 1),
      'n24h', (select count(*) from private.robo_disparos d where d.at > now() - interval '24 hours'),
      'ok6h', (select count(*) from private.robo_disparos d join net._http_response h on h.id = d.id
               where h.status_code between 200 and 299),
      'bad6h', (select count(*) from private.robo_disparos d join net._http_response h on h.id = d.id
                where h.status_code >= 300 or h.error_msg is not null or h.timed_out));
  exception when others then r := r || jsonb_build_object('last_err', sqlerrm); end;
  return r;
end $$;

-- salva (ou troca) o token; texto vazio remove. Aceita só o formato de token do GitHub.
create or replace function public.admin_robot_set_token(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text := btrim(coalesce(p_token, '')); sid uuid;
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if t <> '' and t !~ '^(github_pat_[A-Za-z0-9_]{20,255}|ghp_[A-Za-z0-9]{30,255})$' then
    return jsonb_build_object('ok', false, 'error', 'formato');
  end if;
  select s.id into sid from vault.secrets s where s.name = 'github_dispatch_token' limit 1;
  if t = '' then
    -- "remover" = trocar por um marcador vazio (o robô ignora); não depende de permissão de apagar no Vault
    if sid is not null then perform vault.update_secret(sid, '-'); end if;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  if sid is null then
    perform vault.create_secret(t, 'github_dispatch_token', 'NEXUS HUB: dispara o robô de dados no GitHub Actions');
  else
    perform vault.update_secret(sid, t);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- dispara agora (botão "Testar agora"); no máximo 1 por minuto
create or replace function public.admin_robot_dispatch_now() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rid bigint; last timestamptz;
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  select max(d.at) into last from private.robo_disparos d where d.origem = 'manual';
  if last > now() - interval '1 minute' then return jsonb_build_object('ok', false, 'error', 'aguarde'); end if;
  rid := private.robo_disparar('manual');
  if rid is null then return jsonb_build_object('ok', false, 'error', 'sem_token'); end if;
  return jsonb_build_object('ok', true, 'id', rid);
end $$;

-- quem tem login chama (as funções conferem se é o administrador); visitante sem login, não
revoke execute on function public.admin_robot_status(), public.admin_robot_set_token(text),
  public.admin_robot_dispatch_now() from public, anon;
grant execute on function public.admin_robot_status(), public.admin_robot_set_token(text),
  public.admin_robot_dispatch_now() to authenticated;

-- a cada 20 min (minutos 2, 22 e 42: fora da grade do GitHub, que usa 7/17/27/37/47/57)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'nexus-robo';
    perform cron.schedule('nexus-robo', '2,22,42 * * * *', 'select private.robo_disparar()');
  end if;
end $$;
