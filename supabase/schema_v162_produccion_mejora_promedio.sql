-- V162 — Producción: el % de mejora se compara contra el PROMEDIO de las últimas
-- 4 semanas con producción (antes: contra la última semana APROBADA).
--
-- Regla nueva (desde la semana que empieza en prod_mejora_promedio_desde()):
--   base     = promedio del valor generado de las últimas 4 semanas PREVIAS en las
--              que la operadora tuvo producción (valor > 0). Las semanas sin
--              registros no entran ni cuentan como 0. Con 1–3 semanas, promedia
--              las que tenga. Sin ninguna → mejora NULL ("N/A") y sin bono de mejora.
--   mejora % = (valor semana − base) / base × 100
--   Umbrales del bono de mejora y bono de lugar: sin cambios (prod_reglas_premios).
-- Semanas anteriores a la fecha de corte: se calculan como siempre (contra la
-- última semana aprobada). Semanas aprobadas: siguen saliendo de su snapshot.
--
-- Sin cambios de esquema (ni tablas ni columnas). Cambian 3 funciones de lectura
-- (columnas nuevas base_promedio, base_semanas, base_regla) y se parchea
-- prod_stats_destacados. prod_aprobar_semana no cambia: sigue guardando
-- prod_calcular_premios; en semanas con la regla nueva, valor_anterior = la base.
--
-- Todo va en una transacción: si algo falla, no queda nada a medias.

begin;

-- 0) Candado: las funciones vivas deben ser exactamente las que este archivo
--    reemplaza (V67/V69/V72 con el parche de V88, y V103). Si alguien las cambió
--    después, se aborta sin tocar nada.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('prod_calcular_premios', 'e5ebb47befe99f5a741bd2995d62ae0a'),
      ('prod_revision_semana',  '3bf63a99249bef7f76b1f36ec3359983'),
      ('prod_ranking_semana',   '50bae93c910a7a65488fb8b85bc7453e'),
      ('prod_stats_destacados', '73654878ee728230f8960d60bb3b9281')
    ) v(fn, esperado)
  loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.fn) <> 1 then
      raise exception 'V162: % no existe o tiene más de una versión.', r.fn;
    end if;
    if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.fn) <> r.esperado then
      raise exception 'V162: % no es la versión esperada (cambió después de V103). No se aplicó nada.', r.fn;
    end if;
  end loop;
end $$;

-- 1) Fecha de corte: la regla nueva aplica a la semana (mié–mar) que empieza ese día y siguientes.
--    Para moverla basta con volver a crear esta función con otra fecha.
create or replace function public.prod_mejora_promedio_desde()
returns date language sql immutable set search_path = public as $$
  select date '2026-10-21'
$$;
revoke execute on function public.prod_mejora_promedio_desde() from public, anon, authenticated;

-- 2) LA función reutilizable: base de mejora por operadora para una semana.
--    Misma fuente de valor que prod_historial_valores: semanas aprobadas o
--    importadas → prod_valor_semana; las demás → suma de prod_registros.
--    Interna: sin grant (solo la llaman otras funciones security definer).
create or replace function public.prod_base_mejora(p_semana_id uuid)
returns table (operadora_id uuid, base_promedio numeric, base_semanas integer)
language sql stable security definer set search_path = public as $$
  with sem as (
    select s.fecha_inicio as ini from public.prod_semanas s where s.id = p_semana_id
  ),
  vals as (
    select s.fecha_inicio as ini, pv.operadora_id as oid, pv.valor_generado as val
      from public.prod_semanas s
      join public.prod_valor_semana pv on pv.semana_id = s.id
     where (s.importada or s.estado = 'aprobada') and s.fecha_inicio < (select ini from sem)
    union all
    select s.fecha_inicio, r.operadora_id, sum(r.valor)
      from public.prod_semanas s
      join public.prod_registros r on r.semana_id = s.id
     where not (s.importada or s.estado = 'aprobada') and s.fecha_inicio < (select ini from sem)
     group by s.fecha_inicio, r.operadora_id
  ),
  ult as (
    select v.oid, v.val, row_number() over (partition by v.oid order by v.ini desc) as n
      from vals v
     where v.val > 0
  )
  select u.oid, avg(u.val), count(*)::integer
    from ult u
   where u.n <= 4
   group by u.oid
$$;
revoke execute on function public.prod_base_mejora(uuid) from public, anon, authenticated;

-- 3) Motor de premios. Mismo cálculo de valor, lugar y bonos; solo cambia la base.
drop function public.prod_revision_semana(uuid);
drop function public.prod_calcular_premios(uuid);

create function public.prod_calcular_premios(p_semana_id uuid)
returns table (
  operadora_id uuid,
  folio_empleado text,
  numero_operadora integer,
  nombre text,
  valor_generado numeric,
  valor_anterior numeric,
  lugar integer,
  mejora_pct numeric,
  bono_meta numeric,
  bono_lugar numeric,
  bono_mejora numeric,
  total_premio numeric,
  semana_anterior_id uuid,
  base_promedio numeric,
  base_semanas integer,
  base_regla text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sem public.prod_semanas;
  v_prev uuid;
  v_promedio boolean;
begin
  if not public.prod_puede_ver_lectura() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;

  select * into v_sem from public.prod_semanas s where s.id = p_semana_id;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;
  v_promedio := v_sem.fecha_inicio >= public.prod_mejora_promedio_desde();

  -- Regla vieja (semanas antes del corte): semana aprobada inmediatamente anterior.
  if not v_promedio then
    select s.id into v_prev
    from public.prod_semanas s
    where s.estado = 'aprobada' and s.fecha_inicio < v_sem.fecha_inicio
    order by s.fecha_inicio desc
    limit 1;
  end if;

  return query
  with part as (
    select o.id as pid, o.folio_empleado as pfolio, o.numero_operadora as pnum, o.nombre as pnombre,
      case
        when v_sem.importada then coalesce(
          (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_sem.id and v.operadora_id = o.id), 0)
        else coalesce(
          (select sum(r.valor) from public.prod_registros r where r.semana_id = v_sem.id and r.operadora_id = o.id), 0)
      end as val
    from public.prod_operadoras o
    where o.participa_bonos and o.activo
  ),
  base as (
    select b.operadora_id as bid, b.base_promedio as bprom, b.base_semanas as bn
      from public.prod_base_mejora(v_sem.id) b
     where v_promedio
  ),
  rk as (
    select p.*,
      1 + (select count(*) from part q where q.val > p.val)::integer as lug,
      case when v_promedio then (select b.bprom from base b where b.bid = p.pid)
           else (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_prev and v.operadora_id = p.pid)
      end as ant,
      case when v_promedio then (select b.bn from base b where b.bid = p.pid)
           else case when v_prev is null then null else 1 end
      end as nsem
    from part p
  ),
  calc as (
    select rk.*,
      case when rk.ant is null or rk.ant = 0 then null else (rk.val - rk.ant) / rk.ant * 100 end as mej
    from rk
  )
  select
    c.pid, c.pfolio, c.pnum, c.pnombre, c.val, c.ant, c.lug, c.mej,
    m.bono, l.bono, j.bono,
    m.bono + l.bono + j.bono,
    v_prev,
    c.ant, c.nsem,
    case when v_promedio then 'promedio' else 'semana_anterior' end
  from calc c
  cross join lateral (
    select coalesce((select r.bono from public.prod_reglas_premios r
                     where r.tipo = 'meta' and r.activa and r.desde <= c.val order by r.desde desc limit 1), 0) as bono
  ) m
  cross join lateral (
    select coalesce((select r.bono from public.prod_reglas_premios r
                     where r.tipo = 'lugar' and r.activa and r.desde <= c.lug order by r.desde desc limit 1), 0) as bono
  ) l
  cross join lateral (
    select case when c.mej is null or c.mej < 0 then 0
                else coalesce((select r.bono from public.prod_reglas_premios r
                               where r.tipo = 'mejora' and r.activa and r.desde <= c.mej order by r.desde desc limit 1), 0)
           end as bono
  ) j
  order by c.lug, c.pnombre;
end; $$;
revoke execute on function public.prod_calcular_premios(uuid) from public, anon;
grant execute on function public.prod_calcular_premios(uuid) to authenticated;

-- 4) Revisión: snapshot si está aprobada, si no el cálculo en vivo. En semanas
--    aprobadas con la regla nueva, valor_anterior del snapshot ES la base y el
--    número de semanas se reconstruye con prod_base_mejora (solo para mostrarlo).
create function public.prod_revision_semana(p_semana_id uuid)
returns table (
  operadora_id uuid, folio_empleado text, numero_operadora integer, nombre text,
  valor_generado numeric, valor_anterior numeric, lugar integer, mejora_pct numeric,
  bono_meta numeric, bono_lugar numeric, bono_mejora numeric, total_premio numeric,
  semana_anterior_id uuid, congelada boolean,
  base_promedio numeric, base_semanas integer, base_regla text
)
language plpgsql security definer set search_path = public as $$
declare v_promedio boolean;
begin
  if not public.prod_puede_ver_lectura() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  if exists (select 1 from public.prod_premios_semana p where p.semana_id = p_semana_id) then
    select s.fecha_inicio >= public.prod_mejora_promedio_desde() into v_promedio
      from public.prod_semanas s where s.id = p_semana_id;
    return query
    select p.operadora_id, o.folio_empleado, o.numero_operadora, o.nombre, p.valor_generado, p.valor_anterior,
           p.lugar, p.mejora_pct, p.bono_meta, p.bono_lugar, p.bono_mejora, p.total_premio, null::uuid, true,
           p.valor_anterior,
           case when v_promedio then b.base_semanas when p.valor_anterior is null then null else 1 end,
           case when v_promedio then 'promedio' else 'semana_anterior' end
    from public.prod_premios_semana p
    join public.prod_operadoras o on o.id = p.operadora_id
    left join public.prod_base_mejora(p_semana_id) b on v_promedio and b.operadora_id = p.operadora_id
    where p.semana_id = p_semana_id
    order by p.lugar, o.nombre;
  else
    return query
    select c.operadora_id, c.folio_empleado, c.numero_operadora, c.nombre, c.valor_generado, c.valor_anterior,
           c.lugar, c.mejora_pct, c.bono_meta, c.bono_lugar, c.bono_mejora, c.total_premio, c.semana_anterior_id, false,
           c.base_promedio, c.base_semanas, c.base_regla
    from public.prod_calcular_premios(p_semana_id) c;
  end if;
end; $$;
revoke execute on function public.prod_revision_semana(uuid) from public, anon;
grant execute on function public.prod_revision_semana(uuid) to authenticated;

-- 5) Ranking sin bonos (Juanis / "Imprimir ranking"): misma base que el motor.
drop function public.prod_ranking_semana(uuid);
create function public.prod_ranking_semana(p_semana_id uuid)
returns table (
  operadora_id uuid, nombre text, valor_generado numeric, valor_anterior numeric, lugar integer, mejora_pct numeric,
  base_semanas integer, base_regla text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sem public.prod_semanas;
  v_prev uuid;
  v_promedio boolean;
begin
  if not public.prod_puede_ver_ranking() then
    raise exception 'No tienes permiso para ver el ranking de producción.';
  end if;

  select * into v_sem from public.prod_semanas s where s.id = p_semana_id;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;
  v_promedio := v_sem.fecha_inicio >= public.prod_mejora_promedio_desde();

  if exists (select 1 from public.prod_premios_semana p where p.semana_id = p_semana_id) then
    return query
    select p.operadora_id, o.nombre, p.valor_generado, p.valor_anterior, p.lugar, p.mejora_pct,
           case when v_promedio then b.base_semanas when p.valor_anterior is null then null else 1 end,
           case when v_promedio then 'promedio' else 'semana_anterior' end
    from public.prod_premios_semana p
    join public.prod_operadoras o on o.id = p.operadora_id
    left join public.prod_base_mejora(p_semana_id) b on v_promedio and b.operadora_id = p.operadora_id
    where p.semana_id = p_semana_id
    order by p.lugar, o.nombre;
    return;
  end if;

  if not v_promedio then
    select s.id into v_prev
    from public.prod_semanas s
    where s.estado = 'aprobada' and s.fecha_inicio < v_sem.fecha_inicio
    order by s.fecha_inicio desc
    limit 1;
  end if;

  return query
  with part as (
    select o.id as pid, o.nombre as pnombre,
      case
        when v_sem.importada then coalesce(
          (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_sem.id and v.operadora_id = o.id), 0)
        else coalesce(
          (select sum(r.valor) from public.prod_registros r where r.semana_id = v_sem.id and r.operadora_id = o.id), 0)
      end as val
    from public.prod_operadoras o
    where o.participa_bonos and o.activo
  ),
  base as (
    select b.operadora_id as bid, b.base_promedio as bprom, b.base_semanas as bn
      from public.prod_base_mejora(v_sem.id) b
     where v_promedio
  ),
  rk as (
    select p.*,
      1 + (select count(*) from part q where q.val > p.val)::integer as lug,
      case when v_promedio then (select b.bprom from base b where b.bid = p.pid)
           else (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_prev and v.operadora_id = p.pid)
      end as ant,
      case when v_promedio then (select b.bn from base b where b.bid = p.pid)
           else case when v_prev is null then null else 1 end
      end as nsem
    from part p
  )
  select rk.pid, rk.pnombre, rk.val, rk.ant, rk.lug,
    case when rk.ant is null or rk.ant = 0 then null else (rk.val - rk.ant) / rk.ant * 100 end,
    rk.nsem,
    case when v_promedio then 'promedio' else 'semana_anterior' end
  from rk
  order by rk.lug, rk.pnombre;
end;
$$;
revoke execute on function public.prod_ranking_semana(uuid) from public, anon;
grant execute on function public.prod_ranking_semana(uuid) to authenticated;

-- 6) Estadísticas: "Top 5 por % de mejora" trae también la base y cuántas semanas.
--    Se parchea la definición viva (ya verificada arriba) para no tocar lo demás.
do $$
declare d text; nuevo text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'prod_stats_destacados';
  nuevo := replace(d,
    $x$jsonb_build_object('nombre', t.nombre, 'mejora_pct', t.mejora_pct, 'valor', t.valor_generado)$x$,
    $x$jsonb_build_object('nombre', t.nombre, 'mejora_pct', t.mejora_pct, 'valor', t.valor_generado, 'base_promedio', t.base_promedio, 'base_semanas', t.base_semanas, 'base_regla', t.base_regla)$x$);
  nuevo := replace(nuevo,
    $x$select x.nombre, x.mejora_pct, x.valor_generado from public.prod_revision_semana(p_semana_id) x$x$,
    $x$select x.nombre, x.mejora_pct, x.valor_generado, x.base_promedio, x.base_semanas, x.base_regla from public.prod_revision_semana(p_semana_id) x$x$);
  if position('x.base_regla from public.prod_revision_semana' in nuevo) = 0
     or position($x$'base_regla', t.base_regla$x$ in nuevo) = 0 then
    raise exception 'V162: no pude parchear prod_stats_destacados.';
  end if;
  execute nuevo;
end $$;

commit;

-- Verificación (opcional, después de aplicar):
-- select nombre, valor_generado, base_promedio, base_semanas, base_regla, mejora_pct, bono_mejora
--   from public.prod_revision_semana((select id from public.prod_semanas where fecha_inicio = '2026-10-21'))
--  order by lugar;
