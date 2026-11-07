-- NEXUS HUB — alertas de preço e de eventos no celular (Web Push). Idempotente; não apaga dados.
--
--   push_devices   aparelhos que recebem as notificações (assinatura Web Push do navegador)
--   price_alerts   alertas de preço: acima/abaixo de um valor (US$ ou R$) e alta/queda em 24 h
--   event_alerts   avisos de eventos (Fed, Copom, CPI, payroll, opções…) X minutos antes
--   alert_log      histórico do que foi enviado (o cliente vê e pode limpar)
--   alerts_status  última verificação do servidor (só o servidor e o painel do admin)
--   private.alerts_keys  chaves do servidor (VAPID e a chave do agendador): fora da API e
--                  geradas aqui dentro / pela própria função — nunca passam pelo código ou pelo chat
--
-- O pg_cron chama a função "alerts" (Edge Function) a cada minuto: ela lê os preços (Binance e
-- CoinGecko), dispara os alertas e envia as notificações. Isso também mantém o banco ativo.
-- Limite: plano grátis 3 alertas de preço ativos; PRO (e teste) 30. Avisos de eventos: todos.
--
-- Reverter: select cron.unschedule('nexus-alertas');  (as tabelas podem ficar; sem o agendador nada é enviado)

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

create schema if not exists private;

-- ---------- chaves do servidor ----------
create table if not exists private.alerts_keys (
  id            int primary key check (id = 1),
  cron_key      text not null,
  vapid_public  text,
  vapid_private text,
  created_at    timestamptz not null default now()
);
insert into private.alerts_keys (id, cron_key)
  values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (id) do nothing;
-- só a chave de serviço (usada pela Edge Function) lê; visitante e cliente não usam o esquema private
grant usage on schema private to service_role;
grant select, update on private.alerts_keys to service_role;

-- ---------- aparelhos ----------
create table if not exists public.push_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 1000),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth        text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  label       text check (label is null or char_length(label) <= 60),
  lang        text not null default 'pt' check (lang in ('pt', 'en')),
  tz          text check (tz is null or char_length(tz) <= 40),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  last_err    text,
  fails       int not null default 0
);
create index if not exists push_devices_user on public.push_devices (user_id);

-- ---------- alertas de preço ----------
create table if not exists public.price_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sym         text not null check (sym ~ '^[A-Za-z0-9.$_-]{1,15}$'),
  name        text check (name is null or char_length(name) <= 60),
  bn          text check (bn is null or bn ~ '^[A-Z0-9]{2,20}$'),              -- par na Binance (BTCUSDT)
  cg          text check (cg is null or cg ~ '^[a-z0-9._-]{1,80}$'),           -- id no CoinGecko
  cond        text not null check (cond in ('above', 'below', 'up24', 'down24')),
  value       numeric not null check (value > 0 and value < 1e15),
  ccy         text not null default 'usd' check (ccy in ('usd', 'brl')),
  repeat      boolean not null default false,
  note        text check (note is null or char_length(note) <= 120),
  active      boolean not null default true,
  armed       boolean not null default true,     -- o servidor desarma ao disparar (e rearma, se repetir)
  created_at  timestamptz not null default now(),
  fired_at    timestamptz,
  fired_price numeric,
  fired_n     int not null default 0,
  check (bn is not null or cg is not null),
  check (cond in ('above', 'below') or value <= 1000)
);
create index if not exists price_alerts_user on public.price_alerts (user_id);
create index if not exists price_alerts_on on public.price_alerts (active) where active;

-- ---------- avisos de eventos ----------
create table if not exists public.event_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ev_key      text not null check (char_length(ev_key) between 1 and 160),
  title       text not null check (char_length(title) between 1 and 160),
  detail      text check (detail is null or char_length(detail) <= 200),
  at          timestamptz not null,
  lead_min    int not null default 30 check (lead_min between 0 and 10080),
  auto        boolean not null default false,    -- criado por "avisar de todos os eventos importantes"
  sent_at     timestamptz,
  missed      boolean not null default false,    -- o servidor não conseguiu avisar a tempo (fica registrado)
  created_at  timestamptz not null default now(),
  unique (user_id, ev_key, lead_min)
);
create index if not exists event_alerts_due on public.event_alerts (at) where sent_at is null;

-- ---------- histórico ----------
create table if not exists public.alert_log (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null check (kind in ('price', 'event', 'test', 'info')),
  title    text not null,
  body     text,
  url      text,
  at       timestamptz not null default now(),
  sent     int not null default 0,
  failed   int not null default 0
);
create index if not exists alert_log_user_at on public.alert_log (user_id, at desc);

-- ---------- situação do servidor (uma linha) ----------
create table if not exists public.alerts_status (
  id        int primary key check (id = 1),
  at        timestamptz,
  ms        int,
  alerts    int,
  fired     int,
  events    int,
  sent      int,
  failed    int,
  err       text,
  day       date,
  day_sent  int not null default 0,
  day_runs  int not null default 0
);

-- =====================================================================
-- PROTEÇÃO: o cliente não mexe nos campos do servidor; limite por plano
-- (funções de gatilho com os direitos de quem grava: o servidor passa livre)
-- =====================================================================
create or replace function public.price_alerts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare lim int; n int;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.armed := true; new.created_at := now();
    new.fired_at := null; new.fired_price := null; new.fired_n := 0;
  else
    new.id := old.id; new.user_id := old.user_id; new.created_at := old.created_at;
    new.fired_at := old.fired_at; new.fired_price := old.fired_price; new.fired_n := old.fired_n;
    if (new.active and not old.active) or new.value is distinct from old.value or new.cond is distinct from old.cond
       or new.ccy is distinct from old.ccy then new.armed := true; else new.armed := old.armed; end if;
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    lim := case when public.has_pro() then 30 else 3 end;
    select count(*) into n from public.price_alerts a where a.user_id = new.user_id and a.active and a.id <> new.id;
    if n >= lim then
      raise exception 'limite de % alertas de preço ativos', lim using errcode = 'P0001', hint = 'alert_limit';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists price_alerts_guard on public.price_alerts;
create trigger price_alerts_guard before insert or update on public.price_alerts
  for each row execute function public.price_alerts_guard();

create or replace function public.event_alerts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare n int;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.sent_at := null; new.missed := false; new.created_at := now();
    select count(*) into n from public.event_alerts e where e.user_id = new.user_id and e.sent_at is null;
    if n >= 300 then raise exception 'limite de avisos de eventos' using errcode = 'P0001', hint = 'event_limit'; end if;
  else
    new.id := old.id; new.user_id := old.user_id; new.created_at := old.created_at;
    new.sent_at := old.sent_at; new.missed := old.missed;
  end if;
  return new;
end $$;
drop trigger if exists event_alerts_guard on public.event_alerts;
create trigger event_alerts_guard before insert or update on public.event_alerts
  for each row execute function public.event_alerts_guard();

-- =====================================================================
-- RLS: cada um vê e mexe só no que é seu
-- =====================================================================
alter table public.push_devices  enable row level security;
alter table public.price_alerts  enable row level security;
alter table public.event_alerts  enable row level security;
alter table public.alert_log     enable row level security;
alter table public.alerts_status enable row level security;  -- sem política: só o servidor

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_devices' and policyname = 'push_devices_own_select') then
    create policy push_devices_own_select on public.push_devices for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_devices' and policyname = 'push_devices_own_delete') then
    create policy push_devices_own_delete on public.push_devices for delete to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_alerts' and policyname = 'price_alerts_own') then
    create policy price_alerts_own on public.price_alerts for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_alerts' and policyname = 'event_alerts_own') then
    create policy event_alerts_own on public.event_alerts for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_log' and policyname = 'alert_log_own_select') then
    create policy alert_log_own_select on public.alert_log for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alert_log' and policyname = 'alert_log_own_delete') then
    create policy alert_log_own_delete on public.alert_log for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

-- =====================================================================
-- FUNÇÕES DO APP
-- =====================================================================
-- grava (ou atualiza) este aparelho na conta de quem está logado. O mesmo navegador que troca de
-- conta passa a avisar só a conta nova (o endereço da assinatura é único).
create or replace function public.push_device_save(p_endpoint text, p_p256dh text, p_auth text,
  p_label text default null, p_lang text default 'pt', p_tz text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'entre na sua conta' using errcode = '42501'; end if;
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

-- =====================================================================
-- FUNÇÕES DO SERVIDOR (só a chave de serviço: conferem quem chama)
-- =====================================================================
create or replace function public.alerts_server_keys() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'sem permissão' using errcode = '42501'; end if;
  return (select jsonb_build_object('cron_key', k.cron_key, 'vapid_public', k.vapid_public, 'vapid_private', k.vapid_private)
            from private.alerts_keys k where k.id = 1);
end $$;

-- grava o par VAPID gerado pela função na primeira vez (nunca troca um par existente)
create or replace function public.alerts_server_set_vapid(p_public text, p_private text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_public !~ '^[A-Za-z0-9_-]{80,100}$' or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then raise exception 'formato' using errcode = '22023'; end if;
  update private.alerts_keys k set vapid_public = p_public, vapid_private = p_private where k.id = 1 and k.vapid_public is null;
  return (select jsonb_build_object('vapid_public', k.vapid_public) from private.alerts_keys k where k.id = 1);
end $$;

-- reserva os avisos de eventos que chegaram na hora (cada um sai uma vez só, mesmo com duas verificações juntas)
create or replace function public.alerts_claim_events() returns setof public.event_alerts
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'sem permissão' using errcode = '42501'; end if;
  -- passou mais de 2 h do evento sem avisar (servidor fora do ar): registra e não avisa mais
  update public.event_alerts e set sent_at = now(), missed = true
   where e.sent_at is null and e.at < now() - interval '2 hours';
  return query
    with u as (
      update public.event_alerts e set sent_at = now()
       where e.sent_at is null and e.at - make_interval(mins => e.lead_min) <= now()
      returning e.*)
    select * from u;
end $$;

-- quem tem avisos automáticos de eventos acabando (programados até menos de 7 dias) e não foi lembrado na semana
create or replace function public.alerts_renew_due() returns table (user_id uuid, last_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'sem permissão' using errcode = '42501'; end if;
  return query
    select e.user_id, max(e.at) as last_at from public.event_alerts e
     where e.auto
     group by e.user_id
    having max(e.at) < now() + interval '7 days'
       and max(e.created_at) < now() - interval '1 day'
       and not exists (select 1 from public.alert_log l where l.user_id = e.user_id and l.kind = 'info' and l.at > now() - interval '7 days');
end $$;

-- limpeza: histórico com mais de 90 dias, avisos de eventos passados há mais de 3 dias, aparelhos que só falham
create or replace function public.alerts_cleanup() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare a int; b int; c int;
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'sem permissão' using errcode = '42501'; end if;
  delete from public.alert_log l where l.at < now() - interval '90 days'; get diagnostics a = row_count;
  delete from public.event_alerts e where e.at < now() - interval '3 days'; get diagnostics b = row_count;
  delete from public.push_devices d where d.fails >= 10; get diagnostics c = row_count;
  return jsonb_build_object('log', a, 'events', b, 'devices', c);
end $$;

-- painel do administrador
create or replace function public.admin_alerts_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  r := jsonb_build_object(
    'server_time', now(),
    'run', (select to_jsonb(s) - 'id' from public.alerts_status s where s.id = 1),
    'devices', (select count(*) from public.push_devices),
    'users', (select count(distinct d.user_id) from public.push_devices d),
    'price_active', (select count(*) from public.price_alerts a where a.active),
    'events_pending', (select count(*) from public.event_alerts e where e.sent_at is null and e.at > now()),
    'sent24h', (select coalesce(sum(l.sent), 0) from public.alert_log l where l.at > now() - interval '24 hours'),
    'failed24h', (select coalesce(sum(l.failed), 0) from public.alert_log l where l.at > now() - interval '24 hours'));
  begin
    r := r || jsonb_build_object('job', (select jsonb_build_object('active', j.active, 'schedule', j.schedule)
                                           from cron.job j where j.jobname = 'nexus-alertas' limit 1));
  exception when others then r := r || jsonb_build_object('job_err', sqlerrm); end;
  return r;
end $$;

grant execute on function public.push_device_save(text, text, text, text, text, text), public.admin_alerts_status() to authenticated;
grant execute on function public.alerts_server_keys(), public.alerts_server_set_vapid(text, text), public.alerts_claim_events(),
  public.alerts_renew_due(), public.alerts_cleanup() to service_role;
grant select, insert, update, delete on public.push_devices, public.price_alerts, public.event_alerts, public.alert_log, public.alerts_status to service_role;
grant select, insert, update, delete on public.price_alerts, public.event_alerts to authenticated;
grant select, delete on public.push_devices, public.alert_log to authenticated;

-- =====================================================================
-- AGENDADOR: a cada minuto o banco chama a função "alerts"
-- =====================================================================
create or replace function private.alerts_tick() returns bigint
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select a.cron_key into k from private.alerts_keys a where a.id = 1;
  if k is null then return null; end if;
  return net.http_post(
    url := 'https://ccgpmnqlqsuetqindwkb.supabase.co/functions/v1/alerts',
    body := jsonb_build_object('mode', 'cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', k, 'x-region', 'sa-east-1'),
    timeout_milliseconds := 30000);
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'nexus-alertas';
    perform cron.schedule('nexus-alertas', '* * * * *', 'select private.alerts_tick()');
  end if;
end $$;
