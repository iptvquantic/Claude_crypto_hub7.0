-- Testes da migração 02 (permissões extras). Roda só na fase "schema+migracoes". Falha = exceção.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function pg_temp.expect_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'DEVERIA FALHAR: %', what;
end $$;

-- visitante sem login: só o sinal de vida
do $$ begin
  if not has_function_privilege('anon', 'public.ping()', 'execute') then raise exception 'anon deveria chamar ping'; end if;
  if has_function_privilege('anon', 'public.admin_overview()', 'execute') then raise exception 'anon não deveria chamar admin_overview'; end if;
  if has_function_privilege('anon', 'public.my_profile()', 'execute') then raise exception 'anon não deveria chamar my_profile'; end if;
  if has_function_privilege('anon', 'public.vault_remove(uuid)', 'execute') then raise exception 'anon não deveria chamar vault_remove'; end if;
  if has_function_privilege('anon', 'public.handle_new_user()', 'execute') then raise exception 'anon não deveria chamar handle_new_user'; end if;
end $$;

-- quem tem login: funções do app sim, funções de gatilho não
do $$ begin
  if not has_function_privilege('authenticated', 'public.my_profile()', 'execute') then raise exception 'authenticated deveria chamar my_profile'; end if;
  if not has_function_privilege('authenticated', 'public.has_pro()', 'execute') then raise exception 'authenticated deveria chamar has_pro (usada na RLS)'; end if;
  if not has_function_privilege('authenticated', 'public.admin_set_plan(uuid, text, integer)', 'execute') then raise exception 'authenticated deveria chamar admin_set_plan (a função confere se é admin)'; end if;
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then raise exception 'authenticated não deveria chamar handle_new_user'; end if;
  if has_function_privilege('authenticated', 'public.vault_guard()', 'execute') then raise exception 'authenticated não deveria chamar vault_guard'; end if;
end $$;

-- o cadastro continua criando o perfil quando quem grava em auth.users não é superusuário
-- (no Supabase é o papel supabase_auth_admin): o gatilho não depende de EXECUTE para disparar
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant insert, select on auth.users to supabase_auth_admin;
set role supabase_auth_admin;
insert into auth.users(id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1', 'carla@exemplo.com', '{"name":"Carla"}');
reset role;
do $$ begin
  if (select plan from public.profiles where email = 'carla@exemplo.com') is distinct from 'trial' then raise exception 'gatilho de cadastro não criou o perfil depois da migração'; end if;
end $$;

-- anônimo de fato barrado ao chamar (não só pela tabela de privilégios)
set role anon;
select pg_temp.expect_fail($q$select public.my_profile()$q$, 'anon chamar my_profile');
do $$ begin if not (public.ping()->>'ok')::boolean then raise exception 'ping'; end if; end $$;
select pg_temp.expect_fail($q$select public.admin_robot_status()$q$, 'anon ver o agendador');
reset role;

-- agendador do robô (migração 03): só o administrador vê e mexe; o disparo direto não é da API
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false); end $$;
do $$ begin
  if has_function_privilege('anon', 'public.admin_robot_status()', 'execute') then raise exception 'anon não deveria chamar admin_robot_status'; end if;
  if has_function_privilege('anon', 'public.admin_robot_set_token(text)', 'execute') then raise exception 'anon não deveria chamar admin_robot_set_token'; end if;
  if not has_function_privilege('authenticated', 'public.admin_robot_status()', 'execute') then raise exception 'authenticated deveria chamar admin_robot_status (a função confere se é admin)'; end if;
  if has_schema_privilege('authenticated', 'private', 'usage') or has_schema_privilege('anon', 'private', 'usage') then raise exception 'o esquema private não pode ser usado pela API'; end if;
end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); -- Alice: cliente, não é admin
select pg_temp.expect_fail($q$select public.admin_robot_status()$q$, 'cliente ver o agendador');
select pg_temp.expect_fail($q$select public.admin_robot_set_token('github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')$q$, 'cliente trocar o token');
select pg_temp.expect_fail($q$select public.admin_robot_dispatch_now()$q$, 'cliente disparar o robô');
select pg_temp.expect_fail($q$select private.robo_disparar('teste')$q$, 'cliente chamar o disparo direto');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad'); -- dono (admin)
do $$ declare r jsonb; begin
  r := public.admin_robot_status();
  if r ->> 'server_time' is null then raise exception 'o admin deveria ver o agendador'; end if;
  r := public.admin_robot_set_token('isso não é um token');
  if (r ->> 'ok')::boolean or r ->> 'error' <> 'formato' then raise exception 'token em formato errado deveria ser recusado: %', r; end if;
end $$;
reset role;
select 'PERMISSÕES OK' as resultado;
