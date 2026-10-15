-- Testes de segurança do NEXUS HUB (RLS, planos, admin). Falha = exceção.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, false); end $$;
create or replace function pg_temp.expect_fail(sql text, what text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then return; end;
  raise exception 'DEVERIA FALHAR: %', what;
end $$;

create or replace function pg_temp.expect_empty(sql text, what text) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'select count(*) from (' || sql || ') q' into n; exception when others then return; end;
  if n > 0 then raise exception 'DEVERIA VIR VAZIO: % (% linhas)', what, n; end if;
end $$;

-- dados de teste (como superusuário)
insert into public.app_admins(email) values ('dono@exemplo.com') on conflict do nothing;
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@exemplo.com', '{"name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@exemplo.com', '{}'),
  ('00000000-0000-0000-0000-0000000000ad', 'DONO@exemplo.com', '{"name":"Dono"}')
on conflict do nothing;

do $$ begin
  if (select plan from public.profiles where email='alice@exemplo.com') <> 'trial' then raise exception 'alice deveria ser trial'; end if;
  if (select plan_expiry from public.profiles where email='alice@exemplo.com') < now() + interval '14 days' then raise exception 'trial deveria ter 15 dias'; end if;
  if (select plan from public.profiles where email='dono@exemplo.com') <> 'master' then raise exception 'dono deveria ser master'; end if;
  if (select name from public.profiles where email='alice@exemplo.com') <> 'Alice' then raise exception 'nome não veio do cadastro'; end if;
end $$;

-- ALICE (trial ativo)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.vault_entries(type, asset_id, sym, date, qty, amount_usd, amount_brl)
  values ('buy','bitcoin','BTC','2025-01-15',0.05,4750,28500);
do $$ begin
  if (select count(*) from public.vault_entries) <> 1 then raise exception 'alice deveria ver 1 aporte'; end if;
  if not ((public.my_profile())->>'pro')::boolean then raise exception 'trial deveria dar pro'; end if;
  if ((public.my_profile())->>'admin')::boolean then raise exception 'alice não é admin'; end if;
end $$;
select pg_temp.expect_fail($q$update public.profiles set plan='master' where id=auth.uid()$q$, 'alice mudar o próprio plano');
select pg_temp.expect_fail($q$update public.profiles set plan_expiry='2999-01-01' where id=auth.uid()$q$, 'alice mudar a validade');
update public.profiles set name = 'Alice S.' where id = auth.uid();
select pg_temp.expect_fail($q$select public.admin_overview()$q$, 'alice usar painel admin');
select pg_temp.expect_fail($q$select public.admin_set_plan('00000000-0000-0000-0000-00000000000a','pro',365)$q$, 'alice se dar PRO');
select pg_temp.expect_empty($q$select * from public.app_admins$q$, 'alice ler admins');
select pg_temp.expect_fail($q$insert into public.vault_entries(user_id,type,asset_id,sym,date,qty,amount_usd,amount_brl) values ('00000000-0000-0000-0000-00000000000b','buy','bitcoin','BTC','2025-01-15',1,1,1)$q$, 'alice gravar no nome do bob');
select pg_temp.expect_fail($q$insert into public.vault_entries(type,asset_id,sym,date,qty,amount_usd,amount_brl) values ('buy','bitcoin','BTC','2025-01-15',-1,1,1)$q$, 'quantidade negativa');
insert into public.payment_claims(plan, note) values ('anual','pix 15/10');
insert into public.payment_claims(plan) values ('mensal');
insert into public.payment_claims(plan) values ('mensal');
select pg_temp.expect_fail($q$insert into public.payment_claims(plan) values ('mensal')$q$, '4º pedido pendente');
select pg_temp.expect_fail($q$insert into public.payment_claims(plan,status) values ('mensal','approved')$q$, 'pedido já aprovado');
reset role;

-- BOB não vê nada da Alice
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from public.vault_entries) <> 0 then raise exception 'bob vendo aporte da alice'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'bob vendo outros perfis'; end if;
  if (select count(*) from public.payment_claims) <> 0 then raise exception 'bob vendo pedidos da alice'; end if;
end $$;
update public.vault_entries set qty = 999;  -- não pode afetar a Alice
select 1; -- (sem permissão de apagar)
reset role;
do $$ begin if (select qty from public.vault_entries limit 1) <> 0.05 then raise exception 'bob alterou aporte da alice'; end if; end $$;

-- trial vencido: lê e apaga, mas não grava
update public.profiles set plan_expiry = now() - interval '1 day' where email='alice@exemplo.com';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin if ((public.my_profile())->>'pro')::boolean then raise exception 'trial vencido não é pro'; end if; end $$;
select pg_temp.expect_fail($q$insert into public.vault_entries(type,asset_id,sym,date,qty,amount_usd,amount_brl) values ('buy','bitcoin','BTC','2025-02-01',0.01,900,5000)$q$, 'gravar com trial vencido');
do $$ begin if (select count(*) from public.vault_entries) <> 1 then raise exception 'deveria continuar lendo'; end if; end $$;
reset role;

-- DONO aprova o pagamento
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ declare o jsonb; begin
  o := public.admin_overview();
  if (o->>'users')::int <> 3 then raise exception 'overview users %', o; end if;
  if (o->>'claims_pending')::int <> 3 then raise exception 'overview claims %', o; end if;
  if (select count(*) from public.admin_list_users('alice', 10)) <> 1 then raise exception 'busca de usuário'; end if;
  if (select count(*) from public.admin_list_claims('pending')) <> 3 then raise exception 'lista de pedidos'; end if;
  perform public.admin_set_plan('00000000-0000-0000-0000-00000000000a', 'pro', 365);
  if (select count(*) from public.admin_list_claims('pending')) <> 0 then raise exception 'pedidos deveriam ser aprovados'; end if;
end $$;
select pg_temp.expect_fail($q$select public.admin_set_plan('00000000-0000-0000-0000-0000000000ad','free',1)$q$, 'rebaixar admin');
select pg_temp.expect_fail($q$select public.admin_set_plan('00000000-0000-0000-0000-00000000000a','master',1)$q$, 'dar master pela API');
reset role;
do $$ begin if (select plan_expiry from public.profiles where email='alice@exemplo.com') < now() + interval '364 days' then raise exception 'pro de 365 dias'; end if; end $$;

-- ALICE volta a gravar, remove e desfaz (sem PRO também pode remover)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.vault_entries(type,asset_id,sym,date,qty,amount_usd,amount_brl) values ('sell','bitcoin','BTC','2025-03-01',0.01,900,5000);
do $$ declare eid uuid; begin
  select id into eid from public.vault_entries where type='sell';
  if not (public.vault_remove(eid)->>'ok')::boolean then raise exception 'remover'; end if;
  if (select count(*) from public.vault_entries) <> 1 then raise exception 'removido não some da lista'; end if;
  if not (public.vault_restore(eid)->>'ok')::boolean then raise exception 'desfazer'; end if;
  if (select count(*) from public.vault_entries) <> 2 then raise exception 'desfazer não trouxe de volta'; end if;
end $$;
select pg_temp.expect_fail($q$update public.vault_entries set removed_at = now()$q$, 'remover por update direto');
select pg_temp.expect_fail($q$update public.vault_entries set user_id = '00000000-0000-0000-0000-00000000000b'$q$, 'trocar dono do aporte');
reset role;
-- bob não remove aporte da alice
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ declare eid uuid; begin
  select id into eid from public.vault_entries limit 1;  -- bob não vê nada: eid nulo
  if eid is not null then raise exception 'bob vê aporte'; end if;
end $$;
reset role;
do $$ declare eid uuid; r jsonb; begin
  select id into eid from public.vault_entries where user_id='00000000-0000-0000-0000-00000000000a' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-00000000000b')::text, false);
  r := public.vault_remove(eid);
  if (r->>'ok')::boolean then raise exception 'bob removeu aporte da alice'; end if;
  perform set_config('request.jwt.claims', '', false);
end $$;

-- ANÔNIMO não lê nada
set role anon;
select pg_temp.expect_empty($q$select * from public.profiles$q$, 'anon ler perfis');
select pg_temp.expect_empty($q$select * from public.vault_entries$q$, 'anon ler aportes');
select pg_temp.expect_empty($q$select * from public.payment_claims$q$, 'anon ler pedidos');
select pg_temp.expect_fail($q$insert into public.vault_entries(user_id,type,asset_id,sym,date,qty,amount_usd,amount_brl) values ('00000000-0000-0000-0000-00000000000b','buy','bitcoin','BTC','2025-01-15',1,1,1)$q$, 'anon gravar aporte');
select pg_temp.expect_fail($q$select public.admin_overview()$q$, 'anon usar admin');
do $$ begin if public.my_profile() is not null then raise exception 'anon não tem perfil'; end if; exception when insufficient_privilege then null; end $$;
-- sinal de vida do robô funciona sem login
do $$ begin if not (public.ping()->>'ok')::boolean then raise exception 'ping deveria responder ok'; end if; end $$;
reset role;
select 'RLS OK' as resultado;
