-- =====================================================================
-- NEXUS HUB — banco de dados (Supabase / Postgres) — projeto "nexus-hub" (sa-east-1, ref ccgpmnqlqsuetqindwkb)
-- Idempotente: pode rodar quantas vezes quiser; nunca apaga dados.
-- Segurança:
--   * cada usuário só enxerga e altera o que é dele (Row Level Security);
--   * plano e validade só mudam no servidor (gatilho de cadastro e funções de admin) — nunca pelo app;
--   * a lista de administradores (app_admins) fica só no banco: nenhum e-mail ou senha no código público;
--   * tirar um aporte = "remover" (fica oculto e pode ser desfeito); encerrar a conta apaga tudo
--     pela função "account" (Edge Function), que usa a chave de serviço do próprio Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- PERFIL / PLANO ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id),
  email        text,
  name         text check (name is null or char_length(name) <= 80),
  plan         text not null default 'trial' check (plan in ('trial','pro','free','admin','master')),
  plan_expiry  timestamptz not null default (now() + interval '15 days'),
  active       boolean not null default true,
  settings     jsonb not null default '{}'::jsonb
               check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 16384),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- ---------- ADMINISTRADORES (privado: RLS sem política = ninguém lê pela API) ----------
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);

-- ---------- PORTFOLIO VAULT: APORTES ----------
create table if not exists public.vault_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  type        text not null check (type in ('buy','sell')),
  asset_id    text not null check (char_length(asset_id) between 1 and 80),
  sym         text not null check (char_length(sym) between 1 and 15),
  name        text check (name is null or char_length(name) <= 60),
  binance_sym text check (binance_sym is null or binance_sym ~ '^[A-Z0-9]{2,20}$'),
  logo        text check (logo is null or (char_length(logo) <= 300 and logo ~ '^https://')),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  date        date not null check (date between '2009-01-03' and '2100-12-31'),
  qty         numeric(30,12) not null check (qty > 0 and qty < 1e15),
  amount_usd  numeric(20,2) not null check (amount_usd >= 0 and amount_usd < 1e13),
  amount_brl  numeric(20,2) not null check (amount_brl >= 0 and amount_brl < 1e14),
  fx_brl      numeric(12,6) check (fx_brl is null or (fx_brl > 0 and fx_brl < 1000)),
  currency    text not null default 'BRL' check (currency in ('BRL','USD')),
  fee         numeric(20,2) not null default 0 check (fee >= 0 and fee < 1e12),
  exchange    text check (exchange is null or char_length(exchange) <= 40),
  notes       text check (notes is null or char_length(notes) <= 200),
  legacy_id   text check (legacy_id is null or char_length(legacy_id) <= 60),
  removed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vault_legacy_unique unique (user_id, legacy_id)
);
create index if not exists vault_user_date_idx on public.vault_entries (user_id, date desc) where removed_at is null;

-- ---------- PEDIDOS DE ATIVAÇÃO (cliente avisa que pagou; o dono aprova no painel) ----------
create table if not exists public.payment_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  plan        text not null check (plan in ('mensal','trimestral','anual')),
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists payment_claims_user_idx on public.payment_claims (user_id, created_at desc);

-- ---------- LIMITE DE CADASTRO (só a função "signup" usa, com a chave de serviço) ----------
create table if not exists public.signup_attempts (
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index if not exists signup_attempts_idx on public.signup_attempts (ip_hash, at desc);

-- =====================================================================
-- FUNÇÕES
-- =====================================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active and p.plan in ('admin','master'));
$$;

create or replace function public.has_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.active
                   and (p.plan in ('admin','master') or p.plan_expiry > now()));
$$;

-- Novo usuário → perfil. O teste de 15 dias é definido AQUI (no servidor). Admin vem da lista privada.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_adm boolean;
begin
  select exists (select 1 from public.app_admins a where a.email = lower(new.email)) into is_adm;
  insert into public.profiles (id, email, name, plan, plan_expiry)
  values (new.id, lower(new.email),
          nullif(left(btrim(coalesce(new.raw_user_meta_data->>'name', '')), 80), ''),
          case when is_adm then 'master' else 'trial' end,
          case when is_adm then timestamptz '2999-12-31 00:00:00+00' else now() + interval '15 days' end)
  on conflict (id) do nothing;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal) then
    create trigger on_auth_user_created after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'vault_touch' and not tgisinternal) then
    create trigger vault_touch before update on public.vault_entries
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- Proteção do plano: pelo app (papéis anon/authenticated) ninguém altera plano, validade, e-mail ou status.
-- Só as funções do servidor (security definer) e o painel do Supabase mudam esses campos.
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id or new.email is distinct from old.email
    or new.plan is distinct from old.plan or new.plan_expiry is distinct from old.plan_expiry
    or new.active is distinct from old.active or new.created_at is distinct from old.created_at) then
    raise exception 'campo protegido' using errcode = '42501';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_guard' and not tgisinternal) then
    create trigger profiles_guard before update on public.profiles
      for each row execute function public.profiles_guard();
  end if;
end $$;

-- Aporte: pelo app, dono e data de remoção não mudam por update direto (usar vault_remove/vault_restore)
create or replace function public.vault_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.user_id is distinct from old.user_id or new.removed_at is distinct from old.removed_at
    or new.created_at is distinct from old.created_at) then
    raise exception 'campo protegido' using errcode = '42501';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'vault_guard' and not tgisinternal) then
    create trigger vault_guard before update on public.vault_entries
      for each row execute function public.vault_guard();
  end if;
end $$;

-- No máximo 3 pedidos de ativação pendentes por pessoa (evita spam)
create or replace function public.claims_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.payment_claims c
      where c.user_id = new.user_id and c.status = 'pending') >= 3 then
    raise exception 'já existem pedidos pendentes' using errcode = '23514';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'claims_guard' and not tgisinternal) then
    create trigger claims_guard before insert on public.payment_claims
      for each row execute function public.claims_guard();
  end if;
end $$;

-- Meu perfil (plano calculado no servidor)
create or replace function public.my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'name', p.name, 'plan', p.plan,
    'plan_expiry', p.plan_expiry, 'active', p.active, 'created_at', p.created_at,
    'pro', (p.active and (p.plan in ('admin','master') or p.plan_expiry > now())),
    'admin', (p.active and p.plan in ('admin','master')),
    'server_time', now())
  from public.profiles p where p.id = auth.uid();
$$;

-- Remover / desfazer um aporte (vale mesmo sem PRO: a pessoa sempre pode tirar os próprios dados)
create or replace function public.vault_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sem login' using errcode = '42501'; end if;
  update public.vault_entries set removed_at = now()
   where id = p_id and user_id = auth.uid() and removed_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $$;

create or replace function public.vault_restore(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sem login' using errcode = '42501'; end if;
  update public.vault_entries set removed_at = null
   where id = p_id and user_id = auth.uid() and removed_at > now() - interval '7 days';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $$;

-- ---------- ADMIN (painel do dono) ----------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users',        (select count(*) from public.profiles),
    'pro_active',   (select count(*) from public.profiles where active and plan = 'pro' and plan_expiry > now()),
    'trial_active', (select count(*) from public.profiles where active and plan = 'trial' and plan_expiry > now()),
    'expired',      (select count(*) from public.profiles where active and plan in ('trial','pro','free') and plan_expiry <= now()),
    'new_7d',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'claims_pending', (select count(*) from public.payment_claims where status = 'pending'),
    'entries',      (select count(*) from public.vault_entries where removed_at is null),
    'server_time',  now());
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50)
returns table (id uuid, email text, name text, plan text, plan_expiry timestamptz, active boolean,
               created_at timestamptz, last_seen_at timestamptz, entries bigint, pending_claims bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  return query
    select p.id, p.email, p.name, p.plan, p.plan_expiry, p.active, p.created_at, p.last_seen_at,
           (select count(*) from public.vault_entries v where v.user_id = p.id and v.removed_at is null),
           (select count(*) from public.payment_claims c where c.user_id = p.id and c.status = 'pending')
      from public.profiles p
     where p_search is null or p_search = '' or p.email ilike '%' || p_search || '%' or p.name ilike '%' || p_search || '%'
     order by (select count(*) from public.payment_claims c where c.user_id = p.id and c.status = 'pending') desc,
              p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

create or replace function public.admin_list_claims(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, plan text, note text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  return query
    select c.id, c.user_id, p.email, c.plan, c.note, c.status, c.created_at
      from public.payment_claims c join public.profiles p on p.id = c.user_id
     where p_status is null or c.status = p_status
     order by c.created_at desc limit 200;
end $$;

-- Dar/estender plano. p_days soma a partir do maior entre "agora" e a validade atual.
create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare new_exp timestamptz;
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_plan not in ('trial','pro','free') then raise exception 'plano inválido' using errcode = '22023'; end if;
  if p_days is not null and (p_days < -3650 or p_days > 3650) then raise exception 'dias inválidos' using errcode = '22023'; end if;
  update public.profiles
     set plan = p_plan,
         plan_expiry = case when p_days is null then plan_expiry
                            else greatest(plan_expiry, now()) + make_interval(days => p_days) end
   where id = p_user and plan not in ('admin','master')
   returning plan_expiry into new_exp;
  if new_exp is null then raise exception 'usuário não encontrado (ou é admin)' using errcode = 'P0002'; end if;
  if p_plan = 'pro' then
    update public.payment_claims set status = 'approved', resolved_at = now()
     where user_id = p_user and status = 'pending';
  end if;
  return jsonb_build_object('ok', true, 'plan', p_plan, 'plan_expiry', new_exp);
end $$;

create or replace function public.admin_resolve_claim(p_claim uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_status not in ('approved','rejected') then raise exception 'status inválido' using errcode = '22023'; end if;
  update public.payment_claims set status = p_status, resolved_at = now() where id = p_claim;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem permissão' using errcode = '42501'; end if;
  update public.profiles set active = p_active where id = p_user and plan not in ('admin','master');
  return jsonb_build_object('ok', true);
end $$;

-- =====================================================================
-- RLS E PERMISSÕES
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.app_admins      enable row level security;
alter table public.vault_entries   enable row level security;
alter table public.payment_claims  enable row level security;
alter table public.signup_attempts enable row level security;

-- perfis: ler o próprio; alterar só nome/preferências (o gatilho profiles_guard barra o resto)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own') then
    create policy profiles_select_own on public.profiles for select to authenticated
      using (id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own') then
    create policy profiles_update_own on public.profiles for update to authenticated
      using (id = (select auth.uid())) with check (id = (select auth.uid()));
  end if;
end $$;

-- aportes: ler os próprios (não removidos); criar/editar só com PRO ativo; remover pela função vault_remove
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vault_entries' and policyname = 'vault_select_own') then
    create policy vault_select_own on public.vault_entries for select to authenticated
      using (user_id = (select auth.uid()) and removed_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vault_entries' and policyname = 'vault_insert_pro') then
    create policy vault_insert_pro on public.vault_entries for insert to authenticated
      with check (user_id = (select auth.uid()) and removed_at is null and (select public.has_pro()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vault_entries' and policyname = 'vault_update_pro') then
    create policy vault_update_pro on public.vault_entries for update to authenticated
      using (user_id = (select auth.uid()) and removed_at is null and (select public.has_pro()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- pedidos de ativação: criar e ler os próprios (status sempre "pending" na criação)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_claims' and policyname = 'claims_select_own') then
    create policy claims_select_own on public.payment_claims for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_claims' and policyname = 'claims_insert_own') then
    create policy claims_insert_own on public.payment_claims for insert to authenticated
      with check (user_id = (select auth.uid()) and status = 'pending' and resolved_at is null);
  end if;
end $$;

grant select on public.profiles to authenticated;
grant update (name, settings, last_seen_at) on public.profiles to authenticated;
grant select, insert, update on public.vault_entries to authenticated;
grant select, insert on public.payment_claims to authenticated;
grant execute on function public.is_admin(), public.has_pro(), public.my_profile(),
  public.vault_remove(uuid), public.vault_restore(uuid),
  public.admin_overview(), public.admin_list_users(text, int), public.admin_list_claims(text),
  public.admin_set_plan(uuid, text, int), public.admin_resolve_claim(uuid, text),
  public.admin_set_active(uuid, boolean) to authenticated;
