-- Testes da migração 04 (alertas de preço e de eventos). Roda na fase "schema+migracoes". Falha = exceção.
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

-- Bob passa a ser plano grátis (sem PRO): limite de 3 alertas de preço
update public.profiles set plan = 'free', plan_expiry = now() - interval '1 day' where email = 'bob@exemplo.com';
delete from public.price_alerts; delete from public.event_alerts; delete from public.push_devices; delete from public.alert_log;

-- ---------- ALICE (teste grátis = PRO) ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.price_alerts (sym, bn, cg, cond, value, ccy) values ('BTC', 'BTCUSDT', 'bitcoin', 'above', 120000, 'usd');
insert into public.price_alerts (sym, bn, cond, value, ccy, repeat) values ('ETH', 'ETHUSDT', 'below', 2000, 'usd', true);
insert into public.price_alerts (sym, cg, cond, value) values ('PEPE', 'pepe', 'up24', 15);
insert into public.price_alerts (sym, bn, cond, value, ccy) values ('SOL', 'SOLUSDT', 'above', 1000, 'brl');  -- 4º: PRO pode
-- tenta gravar no nome do Bob e com campos do servidor: o gatilho corrige
insert into public.price_alerts (user_id, sym, bn, cond, value, armed, fired_n, fired_at)
  values ('00000000-0000-0000-0000-00000000000b', 'XRP', 'XRPUSDT', 'above', 5, false, 9, now());
do $$ begin
  if (select count(*) from public.price_alerts) <> 5 then raise exception 'alice deveria ver 5 alertas'; end if;
  if exists (select 1 from public.price_alerts where user_id <> auth.uid()) then raise exception 'alerta deveria ficar no nome da alice'; end if;
  if exists (select 1 from public.price_alerts where sym = 'XRP' and (not armed or fired_n <> 0 or fired_at is not null)) then raise exception 'cliente não pode mexer em armed/fired_*'; end if;
end $$;
select pg_temp.expect_fail($q$insert into public.price_alerts (sym, cond, value) values ('BTC','above',1)$q$, 'alerta sem par nem id');
select pg_temp.expect_fail($q$insert into public.price_alerts (sym, bn, cond, value) values ('BTC','BTCUSDT','above',-5)$q$, 'valor negativo');
select pg_temp.expect_fail($q$insert into public.price_alerts (sym, bn, cond, value) values ('BTC','BTCUSDT','up24',5000)$q$, 'percentual absurdo');
select pg_temp.expect_fail($q$insert into public.price_alerts (sym, bn, cond, value) values ('BTC','btc<script>','above',1)$q$, 'par inválido');
update public.price_alerts set fired_n = 50, fired_at = now(), armed = false where sym = 'BTC';
do $$ begin
  if exists (select 1 from public.price_alerts where sym = 'BTC' and (fired_n <> 0 or fired_at is not null or not armed)) then raise exception 'update do cliente não pode mexer nos campos do servidor'; end if;
end $$;
-- avisos de eventos
insert into public.event_alerts (ev_key, title, at, lead_min) values ('cpi-2026-11-10', 'CPI dos EUA', now() + interval '3 days', 30);
insert into public.event_alerts (ev_key, title, at, lead_min, sent_at) values ('fomc-2026-12-09', 'Fed', now() + interval '30 days', 60, now());
do $$ begin
  if exists (select 1 from public.event_alerts where sent_at is not null) then raise exception 'cliente não pode marcar aviso como enviado'; end if;
end $$;
-- upsert (mesma chave): atualiza sem duplicar
insert into public.event_alerts (ev_key, title, at, lead_min) values ('cpi-2026-11-10', 'CPI dos EUA (out)', now() + interval '3 days', 30)
  on conflict (user_id, ev_key, lead_min) do update set title = excluded.title, at = excluded.at;
do $$ begin
  if (select count(*) from public.event_alerts where ev_key = 'cpi-2026-11-10') <> 1 then raise exception 'upsert duplicou o aviso'; end if;
  if (select title from public.event_alerts where ev_key = 'cpi-2026-11-10') <> 'CPI dos EUA (out)' then raise exception 'upsert não atualizou'; end if;
end $$;
-- aparelho
do $$ declare r jsonb; begin
  r := public.push_device_save('https://fcm.googleapis.com/fcm/send/abc123', repeat('A', 87), repeat('B', 22), 'Android · Chrome', 'pt', 'America/Sao_Paulo');
  if not (r ->> 'ok')::boolean then raise exception 'salvar aparelho: %', r; end if;
  if (select count(*) from public.push_devices) <> 1 then raise exception 'alice deveria ver 1 aparelho'; end if;
end $$;
-- só serviços de notificação conhecidos (migração 05): o resto é recusado com resposta clara
do $$ declare r jsonb; u text; begin
  foreach u in array array['http://fcm.googleapis.com/fcm/send/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/?x=fcm.googleapis.com/', 'https://fcm.googleapis.com@evil.example/x', 'https://FCM.googleapis.com/x', 'https://googleapis.com.br/x'] loop
    r := public.push_device_save(u, repeat('A', 87), repeat('B', 22));
    if (r ->> 'ok')::boolean or r ->> 'error' <> 'endpoint' then raise exception 'endereço % deveria ser recusado: %', u, r; end if;
  end loop;
  foreach u in array array['https://updates.push.services.mozilla.com/wpush/v2/gAAA', 'https://web.push.apple.com/QK1', 'https://wns2-by3p.notify.windows.com/w/?token=BQYAAAD%2b',
    'https://jmt17.google.com/fcm/send/zz9'] loop
    r := public.push_device_save(u, repeat('A', 87), repeat('B', 22));
    if not (r ->> 'ok')::boolean then raise exception 'endereço % deveria ser aceito: %', u, r; end if;
  end loop;
  delete from public.push_devices where endpoint !~ 'abc123';
end $$;
select pg_temp.expect_fail($q$insert into public.push_devices (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x.com/y', repeat('A', 87), repeat('B', 22))$q$, 'gravar aparelho direto na tabela');
select pg_temp.expect_fail($q$insert into public.alert_log (user_id, kind, title) values (auth.uid(), 'info', 'falso')$q$, 'cliente escrever no histórico');
select pg_temp.expect_fail($q$select public.alerts_server_keys()$q$, 'cliente ler as chaves do servidor');
select pg_temp.expect_fail($q$select public.alerts_server_set_vapid(repeat('A', 87), repeat('B', 43))$q$, 'cliente trocar a chave VAPID');
select pg_temp.expect_fail($q$select * from public.alerts_claim_events()$q$, 'cliente reservar avisos');
select pg_temp.expect_fail($q$select public.alerts_cleanup()$q$, 'cliente limpar');
select pg_temp.expect_fail($q$select public.admin_alerts_status()$q$, 'cliente ver o painel dos alertas');
select pg_temp.expect_fail($q$select * from private.alerts_keys$q$, 'cliente ler o esquema private');
select pg_temp.expect_empty($q$select * from public.alerts_status$q$, 'cliente ler a situação do servidor');
reset role;

-- ---------- BOB (grátis): não vê nada da Alice; limite de 3 ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_empty($q$select * from public.price_alerts$q$, 'bob ver alertas da alice');
select pg_temp.expect_empty($q$select * from public.event_alerts$q$, 'bob ver eventos da alice');
select pg_temp.expect_empty($q$select * from public.push_devices$q$, 'bob ver aparelhos da alice');
update public.price_alerts set value = 1 where sym = 'BTC';  -- não acha (RLS): não muda nada
delete from public.price_alerts where sym = 'ETH';
insert into public.price_alerts (sym, bn, cond, value) values ('BTC', 'BTCUSDT', 'above', 1), ('ETH', 'ETHUSDT', 'above', 1), ('SOL', 'SOLUSDT', 'above', 1);
select pg_temp.expect_fail($q$insert into public.price_alerts (sym, bn, cond, value) values ('XRP','XRPUSDT','above',1)$q$, '4º alerta no plano grátis');
update public.price_alerts set active = false where sym = 'SOL';
insert into public.price_alerts (sym, bn, cond, value) values ('XRP', 'XRPUSDT', 'above', 1);   -- cabe de novo
select pg_temp.expect_fail($q$update public.price_alerts set active = true where sym = 'SOL'$q$, 'reativar acima do limite');
-- o mesmo navegador entra na conta do Bob: o aparelho passa para o Bob
do $$ begin
  perform public.push_device_save('https://fcm.googleapis.com/fcm/send/abc123', repeat('C', 87), repeat('D', 22), 'Android', 'pt', null);
  if (select count(*) from public.push_devices) <> 1 then raise exception 'aparelho deveria passar para o bob'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.price_alerts where sym = 'BTC' and value = 1 and user_id = '00000000-0000-0000-0000-00000000000a') > 0 then raise exception 'bob mexeu no alerta da alice'; end if;
  if (select count(*) from public.price_alerts where sym = 'ETH' and user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then raise exception 'bob apagou alerta da alice'; end if;
  if (select user_id from public.push_devices where endpoint = 'https://fcm.googleapis.com/fcm/send/abc123') <> '00000000-0000-0000-0000-00000000000b' then raise exception 'aparelho deveria ser do bob'; end if;
end $$;

-- ---------- visitante sem login ----------
set role anon;
select pg_temp.as_user(null);
select pg_temp.expect_fail($q$select public.push_device_save('https://fcm.googleapis.com/fcm/send/zz', repeat('A', 87), repeat('B', 22))$q$, 'visitante salvar aparelho');
select pg_temp.expect_empty($q$select * from public.price_alerts$q$, 'visitante ver alertas');
select pg_temp.expect_fail($q$select public.alerts_server_keys()$q$, 'visitante ler chaves');
reset role;

-- ---------- SERVIDOR (chave de serviço) ----------
set role service_role;
do $$ declare k jsonb; v jsonb; n int; begin
  k := public.alerts_server_keys();
  if length(k ->> 'cron_key') < 60 then raise exception 'chave do agendador deveria existir: %', k; end if;
  if k ->> 'vapid_public' is not null then raise exception 'VAPID deveria começar vazia'; end if;
  v := public.alerts_server_set_vapid(repeat('P', 87), repeat('Q', 43));
  if v ->> 'vapid_public' <> repeat('P', 87) then raise exception 'VAPID não gravou'; end if;
  v := public.alerts_server_set_vapid(repeat('X', 87), repeat('Y', 43));
  if v ->> 'vapid_public' <> repeat('P', 87) then raise exception 'VAPID existente não pode ser trocada'; end if;
  -- aviso que chegou na hora sai uma vez só; o muito atrasado fica como perdido
  insert into public.event_alerts (user_id, ev_key, title, at, lead_min) values
    ('00000000-0000-0000-0000-00000000000a', 'agora', 'Evento em 10 min', now() + interval '10 minutes', 30),
    ('00000000-0000-0000-0000-00000000000a', 'velho', 'Evento antigo', now() - interval '3 hours', 30);
  select count(*) into n from public.alerts_claim_events();
  if n <> 1 then raise exception 'deveria reservar 1 aviso, reservou %', n; end if;
  select count(*) into n from public.alerts_claim_events();
  if n <> 0 then raise exception 'aviso não pode sair duas vezes'; end if;
  if not (select missed from public.event_alerts where ev_key = 'velho') then raise exception 'aviso atrasado deveria ficar como perdido'; end if;
  -- o servidor grava os campos dele
  update public.price_alerts set armed = false, fired_n = fired_n + 1, fired_at = now() where sym = 'ETH' and user_id = '00000000-0000-0000-0000-00000000000a';
  if (select fired_n from public.price_alerts where sym = 'ETH' and user_id = '00000000-0000-0000-0000-00000000000a') <> 1 then raise exception 'servidor deveria marcar o disparo'; end if;
  insert into public.alert_log (user_id, kind, title, sent) values ('00000000-0000-0000-0000-00000000000a', 'price', 'ETH abaixo de US$ 2.000', 1);
  insert into public.alerts_status (id, at, alerts) values (1, now(), 3) on conflict (id) do update set at = excluded.at;
  perform public.alerts_cleanup();
end $$;
reset role;

-- ---------- ADMIN ----------
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ declare r jsonb; begin
  r := public.admin_alerts_status();
  if (r ->> 'devices')::int <> 1 or (r ->> 'price_active')::int < 4 then raise exception 'painel dos alertas: %', r; end if;
end $$;
reset role;
select pg_temp.as_user(null);
select 'ALERTAS OK' as resultado;
