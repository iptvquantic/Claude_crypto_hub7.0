-- NEXUS HUB — horas grátis do Render bem aproveitadas (14/11/2026). Idempotente; não toca em dados de clientes.
--
-- O Render grátis dá 750 h por mês para a conta inteira (somando todos os serviços grátis) e desliga o serviço
-- depois de 15 min sem acesso. Monitores de 5 em 5 min deixavam as APIs do CREDIX e do LicitaFácil acordadas
-- 24 h: as horas acabavam no meio do mês e o Render suspendia tudo até o dia 1º (aconteceu em 26/10).
-- Agora o banco do NEXUS acorda as duas só numa janela por dia que cabe na cota: a cada dia, a janela é o que
-- sobra da cota do mês ÷ os dias que faltam (dia útil vale 1; sábado e domingo valem `peso_fds`), centrada às
-- 13h30 de Brasília. Fora da janela o serviço dorme e acorda sozinho no primeiro acesso (~1 min).
-- A conta é feita aqui (cada chamada vale 10 min + 15 min de "cauda" por dia); `cota_h` já deixa ~60 h por mês
-- de reserva para acessos fora da janela e para os outros serviços grátis da conta.
--
-- Desligar: select cron.unschedule('nexus-render-acordado');
-- Mudar a cota ou o horário: update private.render_acordado set cota_h = …, centro_min = … where id = '…';

create table if not exists private.render_acordado (
  id text primary key,
  url text not null,
  cota_h numeric not null,                  -- horas do mês para este serviço
  peso_fds numeric not null default 0.4,    -- sábado e domingo valem menos que dia útil
  centro_min smallint not null default 810, -- centro da janela (minutos depois de 00:00 em Brasília: 13h30)
  cedo_min smallint not null default 360,   -- nunca antes das 6h
  tarde_min smallint not null default 1380, -- nem depois das 23h
  ativo boolean not null default true,
  mes text,                                 -- 'AAAA-MM' (UTC, como o Render) da contagem abaixo
  usado_min integer not null default 0,     -- minutos acordado por causa desta rotina neste mês
  dia date,                                 -- dia (Brasília) da janela abaixo
  janela_ini smallint,
  janela_fim smallint,
  ultimo_ping timestamptz,
  ultimo_req bigint,
  ultimo_status int,
  ultimo_ms int,
  ultimo_erro text
);
alter table private.render_acordado enable row level security;

create or replace function private.render_acordar(p_agora timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  brt timestamp := p_agora at time zone 'America/Sao_Paulo';
  hoje date := (p_agora at time zone 'America/Sao_Paulo')::date;
  agora_min int := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::int * 60
                   + extract(minute from (p_agora at time zone 'America/Sao_Paulo'))::int;
  mes_atual text := to_char(p_agora at time zone 'UTC', 'YYYY-MM');
  ultimo_dia date := (((date_trunc('month', p_agora at time zone 'UTC') + interval '1 month' - interval '1 second')
                        at time zone 'UTC') at time zone 'America/Sao_Paulo')::date;
  pesos numeric; peso_hoje numeric; resto int; janela int; ini int; fim int; req bigint;
  resp record;
begin
  for r in select * from private.render_acordado order by id for update loop
    -- resultado da chamada anterior (o pg_net responde em segundo plano)
    if r.ultimo_req is not null then
      select status_code, error_msg, timed_out, created into resp from net._http_response where id = r.ultimo_req;
      if found then
        update private.render_acordado set ultimo_status = resp.status_code,
          ultimo_ms = greatest(0, round(extract(epoch from (resp.created - r.ultimo_ping)) * 1000))::int,
          ultimo_erro = coalesce(left(resp.error_msg, 200), case when resp.timed_out then 'não respondeu' end),
          ultimo_req = null
        where id = r.id;
      end if;
    end if;
    -- virou o mês (UTC): a cota recomeça
    if r.mes is distinct from mes_atual then
      update private.render_acordado set mes = mes_atual, usado_min = 0, dia = null where id = r.id;
      r.usado_min := 0; r.dia := null;
    end if;
    -- janela do dia, calculada uma vez por dia
    if r.dia is distinct from hoje then
      select sum(case when extract(isodow from g) in (6, 7) then r.peso_fds else 1 end) into pesos
        from generate_series(hoje::timestamp, ultimo_dia::timestamp, interval '1 day') as g;
      peso_hoje := case when extract(isodow from hoje) in (6, 7) then r.peso_fds else 1 end;
      resto := greatest(0, round(r.cota_h * 60)::int - r.usado_min);
      janela := least(r.tarde_min - r.cedo_min, floor(resto * peso_hoje / greatest(pesos, 0.01))::int);
      if janela < 30 then janela := 0; end if;
      ini := greatest(r.cedo_min, r.centro_min - janela / 2);
      fim := least(r.tarde_min, ini + janela);
      update private.render_acordado set dia = hoje, janela_ini = ini, janela_fim = fim,
        usado_min = usado_min + case when janela > 0 then 15 else 0 end   -- o Render só dorme 15 min depois do último acesso
      where id = r.id;
      r.janela_ini := ini; r.janela_fim := fim;
    end if;
    -- dentro da janela: acorda (ou mantém acordado) e conta 10 min
    if r.ativo and r.janela_fim > r.janela_ini and agora_min >= r.janela_ini and agora_min < r.janela_fim then
      req := net.http_get(url := r.url, headers := '{"user-agent": "nexus-hub-acordar/1"}'::jsonb, timeout_milliseconds := 90000);
      update private.render_acordado set ultimo_ping = p_agora, ultimo_req = req, usado_min = usado_min + 10 where id = r.id;
    end if;
  end loop;
end $$;

-- As horas vão quase todas para o CREDIX: o site do LicitaFácil usa a API da Vercel (o Render dele é só reserva,
-- acorda sozinho se a Vercel falhar). CREDIX: 680 h por mês, todos os dias iguais, das 0h às 24h → ~22 h por dia
-- (dorme só de madrugada); sobram ~70 h de reserva. Em novembro/2026 as duas APIs já tinham ficado acordadas 24 h
-- desde 01/11 (~650 h usadas até 14/11, pelas métricas do Render): o CREDIX começa com o que sobra para novembro
-- (82 h, ~4,8 h por dia, centradas às 13h30). Em dezembro a conta recomeça.
insert into private.render_acordado (id, url, cota_h, peso_fds, cedo_min, tarde_min, ativo, mes, usado_min) values
  ('credix', 'https://loan-system-api-af5k.onrender.com/api/health', 680, 1, 0, 1440, true, '2026-11', (680 - 82) * 60),
  ('licitafacil', 'https://licitafacil-api-kxks.onrender.com/api/health', 0, 0.4, 360, 1380, false, '2026-11', (345 - 36) * 60)
on conflict (id) do nothing;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'nexus-render-acordado';
    perform cron.schedule('nexus-render-acordado', '*/10 * * * *', 'select private.render_acordar()');
  end if;
end $$;
