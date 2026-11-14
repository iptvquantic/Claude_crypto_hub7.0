-- Rotina que acorda as APIs do Render numa janela que cabe nas horas grátis (migração 06).
-- pg_net de mentira (só neste banco de teste): guarda os pedidos em vez de chamar a internet.
create schema if not exists net;
create table if not exists net._http_response (id bigint primary key, status_code int, content_type text, headers jsonb,
  content text, timed_out boolean, error_msg text, created timestamptz default now());
create table if not exists net._pedidos (id bigserial primary key, url text, headers jsonb, timeout int);
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net._pedidos (url, headers, timeout) values (url, headers, timeout_milliseconds) returning id $$;

do $$
declare r record; n int; base int := (345 - 36) * 60;
begin
  if not exists (select 1 from private.render_acordado where id = 'credix' and ativo and cota_h = 680 and peso_fds = 1 and cedo_min = 0
                   and tarde_min = 1440 and mes = '2026-11' and usado_min = (680 - 82) * 60)
     or not exists (select 1 from private.render_acordado where id = 'licitafacil' and not ativo) then
    raise exception 'sementes do CREDIX e do LicitaFácil';
  end if;
  delete from private.render_acordado;
  insert into private.render_acordado (id, url, cota_h, mes, usado_min) values ('a', 'https://a.onrender.com/api/health', 345, '2026-11', base);

  -- segunda 16/11, 02:00 em Brasília: calcula a janela do dia útil e não chama ninguém
  -- (sobram 36 h = 2160 min; faltam 11 dias úteis + 4 de fim de semana × 0,4 = 12,6 → 171 min, centrada às 13h30)
  perform private.render_acordar('2026-11-16 05:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  if r.dia <> date '2026-11-16' or r.janela_ini <> 725 or r.janela_fim <> 896 or r.usado_min <> base + 15 then
    raise exception 'janela do dia útil: % % % %', r.dia, r.janela_ini, r.janela_fim, r.usado_min;
  end if;
  if (select count(*) from net._pedidos) <> 0 then raise exception 'chamou fora da janela'; end if;

  -- 13:00 e 13:10: dentro da janela → chama e conta 10 min cada; guarda a resposta da chamada anterior
  perform private.render_acordar('2026-11-16 16:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  insert into net._http_response (id, status_code, created) values (r.ultimo_req, 200, timestamptz '2026-11-16 16:00:00.8+00');
  perform private.render_acordar('2026-11-16 16:10:00+00');
  select * into r from private.render_acordado where id = 'a';
  if (select count(*) from net._pedidos) <> 2 or r.usado_min <> base + 35 or r.ultimo_status <> 200 or r.ultimo_ms <> 800 or r.ultimo_req is null then
    raise exception 'chamadas dentro da janela: % % % %', (select count(*) from net._pedidos), r.usado_min, r.ultimo_status, r.ultimo_ms;
  end if;
  if (select url from net._pedidos order by id desc limit 1) <> 'https://a.onrender.com/api/health'
     or (select timeout from net._pedidos order by id desc limit 1) <> 90000 then raise exception 'pedido'; end if;

  -- resposta com erro fica registrada
  insert into net._http_response (id, status_code, timed_out, error_msg, created) values (r.ultimo_req, null, true, null, timestamptz '2026-11-16 16:11:30+00');
  -- 15:00: a janela já fechou (14:56) → nada
  perform private.render_acordar('2026-11-16 18:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  if (select count(*) from net._pedidos) <> 2 or r.ultimo_erro <> 'não respondeu' or r.ultimo_status is not null then
    raise exception 'depois da janela: % %', (select count(*) from net._pedidos), r.ultimo_erro;
  end if;

  -- sábado 21/11, 13:00: fim de semana tem janela menor (2125 min × 0,4 ÷ 7,6 = 111 min)
  perform private.render_acordar('2026-11-21 16:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  if r.janela_ini <> 755 or r.janela_fim <> 866 or (select count(*) from net._pedidos) <> 3 then
    raise exception 'fim de semana: % % %', r.janela_ini, r.janela_fim, (select count(*) from net._pedidos);
  end if;

  -- 01/12 (terça), 09:00: virou o mês → cota cheia: 20700 min ÷ (23 dias úteis + 8 × 0,4) = 790 min (06:55–20:05)
  perform private.render_acordar('2026-12-01 12:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  if r.mes <> '2026-12' or r.janela_ini <> 415 or r.janela_fim <> 1205 or r.usado_min <> 25 or (select count(*) from net._pedidos) <> 4 then
    raise exception 'virada do mês: % % % % %', r.mes, r.janela_ini, r.janela_fim, r.usado_min, (select count(*) from net._pedidos);
  end if;

  -- cota esgotada: sem janela e sem chamada (o serviço só acorda com acesso de verdade)
  update private.render_acordado set usado_min = 20700, dia = null where id = 'a';
  perform private.render_acordar('2026-12-02 16:00:00+00');
  select * into r from private.render_acordado where id = 'a';
  if r.janela_fim <> r.janela_ini or r.usado_min <> 20700 or (select count(*) from net._pedidos) <> 4 then
    raise exception 'cota esgotada: % % %', r.janela_ini, r.janela_fim, r.usado_min;
  end if;

  -- jeito do CREDIX (680 h, todo dia igual, 0h–24h): em dezembro, 40800 min ÷ 31 dias = 1316 min → 02:32 até 24:00
  insert into private.render_acordado (id, url, cota_h, peso_fds, cedo_min, tarde_min, mes) values ('b', 'https://b.onrender.com/api/health', 680, 1, 0, 1440, '2026-12');
  perform private.render_acordar('2026-12-01 12:00:00+00');
  select * into r from private.render_acordado where id = 'b';
  if r.janela_ini <> 152 or r.janela_fim <> 1440 or (select count(*) from net._pedidos) <> 5 then
    raise exception 'janela do CREDIX: % % %', r.janela_ini, r.janela_fim, (select count(*) from net._pedidos);
  end if;
  delete from private.render_acordado where id = 'b'; truncate net._pedidos;
  insert into net._pedidos (url) select 'x' from generate_series(1, 4);

  -- desligado: calcula, mas não chama
  update private.render_acordado set usado_min = 0, dia = null, ativo = false where id = 'a';
  perform private.render_acordar('2026-12-03 16:00:00+00');
  if (select count(*) from net._pedidos) <> 4 then raise exception 'desligado chamou'; end if;
end $$;
