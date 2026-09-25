-- V72 Produccion - FASE 6: funciones de datos para "Estadisticas de produccion" (solo lectura, ADITIVAS).
-- Solo admin_general / admin_fabrica (prod_puede_ver_montos). Toda la logica de calculo vive aqui; el frontend solo pinta.
-- Premios: semanas aprobadas con snapshot -> 'congelado'; semanas importadas del Excel (sin snapshot) -> 'calculado'
-- con las reglas actuales (prod_calcular_premios); semanas abiertas / en revision -> 'preliminar'.
-- Una semana SIN produccion (valor 0) no muestra premios (si no, todas empatan en el lugar 1 y salen premios artificiales).
-- Detalle por operacion (prendas, operaciones, dias) SOLO con semanas capturadas en el sistema (importada = false).

create or replace function public.prod_stats_info()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_prim date; v_nivel numeric;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  select min(s.fecha_inicio) into v_prim
    from public.prod_semanas s
   where not s.importada and exists (select 1 from public.prod_registros r where r.semana_id = s.id);
  select min(g.desde) into v_nivel from public.prod_reglas_premios g where g.tipo = 'meta' and g.activa;
  return jsonb_build_object('primera_semana_con_registros', v_prim, 'primer_nivel_meta', v_nivel);
end; $$;
revoke execute on function public.prod_stats_info() from public;
grant execute on function public.prod_stats_info() to authenticated;

create or replace function public.prod_stats_semanas(p_desde date default null, p_hasta date default null, p_operadora uuid default null)
returns table (
  semana_id uuid, fecha_inicio date, fecha_fin date, estado text, importada boolean,
  valor_total numeric, vs_anterior_pct numeric, vs_prom4_pct numeric,
  premios_total numeric, premios_origen text, participantes integer, con_meta integer, premios_pct numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_nivel numeric;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  select min(g.desde) into v_nivel from public.prod_reglas_premios g where g.tipo = 'meta' and g.activa;

  return query
  with vals as (
    select s.id as sid, s.fecha_inicio as ini, s.fecha_fin as fin, s.estado as est, s.importada as imp,
      case when s.importada or s.estado = 'aprobada'
           then (select coalesce(sum(v.valor_generado), 0) from public.prod_valor_semana v
                  where v.semana_id = s.id and (p_operadora is null or v.operadora_id = p_operadora))
           else (select coalesce(sum(r.valor), 0) from public.prod_registros r
                  where r.semana_id = s.id and (p_operadora is null or r.operadora_id = p_operadora))
      end as val
    from public.prod_semanas s
  ),
  win as (
    select w.*,
      lag(w.val) over (order by w.ini) as prev,
      avg(w.val) over (order by w.ini rows between 4 preceding and 1 preceding) as avg4
    from vals w
  )
  select w.sid, w.ini, w.fin, w.est, w.imp, w.val,
    case when w.prev > 0 then (w.val - w.prev) / w.prev * 100 end,
    case when w.avg4 > 0 then (w.val - w.avg4) / w.avg4 * 100 end,
    case when w.val > 0 then pr.total end,
    case when exists (select 1 from public.prod_premios_semana p where p.semana_id = w.sid) then 'congelado'
         when w.est in ('abierta', 'en_revision') then 'preliminar'
         else 'calculado' end,
    pr.n::integer,
    pr.n_meta::integer,
    case when w.val > 0 and pr.total is not null then pr.total / w.val * 100 end
  from win w
  cross join lateral (
    select sum(x.total_premio) as total, count(*) as n,
           count(*) filter (where v_nivel is not null and x.valor_generado >= v_nivel) as n_meta
      from public.prod_revision_semana(w.sid) x
     where p_operadora is null or x.operadora_id = p_operadora
  ) pr
  where (p_desde is null or w.ini >= p_desde) and (p_hasta is null or w.fin <= p_hasta)
  order by w.ini;
end; $$;
revoke execute on function public.prod_stats_semanas(date, date, uuid) from public;
grant execute on function public.prod_stats_semanas(date, date, uuid) to authenticated;

-- Distribucion por nivel de bono meta de UNA semana (incluye "sin bono meta": desde NULL).
create or replace function public.prod_stats_distribucion_meta(p_semana_id uuid, p_operadora uuid default null)
returns table (orden integer, desde numeric, bono numeric, cantidad integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  return query
  with filas as (
    select x.operadora_id as oid, x.valor_generado as val
      from public.prod_revision_semana(p_semana_id) x
     where p_operadora is null or x.operadora_id = p_operadora
  ),
  niveles as (select g.desde as nd, g.bono as nb from public.prod_reglas_premios g where g.tipo = 'meta' and g.activa),
  asign as (select f.oid, (select max(n.nd) from niveles n where n.nd <= f.val) as nivel from filas f)
  select 0, null::numeric, 0::numeric, (select count(*)::integer from asign a where a.nivel is null)
  union all
  select 1, n.nd, n.nb, (select count(*)::integer from asign a where a.nivel = n.nd)
    from niveles n
  order by 1, 2 nulls first;
end; $$;
revoke execute on function public.prod_stats_distribucion_meta(uuid, uuid) from public;
grant execute on function public.prod_stats_distribucion_meta(uuid, uuid) to authenticated;

-- Destacados de una semana: top 5 por valor, top 5 por % de mejora (sin "Sin base") y rachas de 3+ semanas
-- abajo de su promedio de 4 semanas previas (mismo umbral que el Dashboard: -p_umbral %).
create or replace function public.prod_stats_destacados(p_semana_id uuid, p_umbral numeric default 10)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_fin date; v_top_valor jsonb; v_top_mejora jsonb; v_rachas jsonb;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  select s.fecha_fin into v_fin from public.prod_semanas s where s.id = p_semana_id;
  if v_fin is null then raise exception 'Semana no encontrada.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'valor', t.valor_generado, 'lugar', t.lugar) order by t.valor_generado desc, t.nombre), '[]'::jsonb)
    into v_top_valor
    from (select x.nombre, x.valor_generado, x.lugar from public.prod_revision_semana(p_semana_id) x
           order by x.valor_generado desc, x.nombre limit 5) t;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'mejora_pct', t.mejora_pct, 'valor', t.valor_generado) order by t.mejora_pct desc, t.nombre), '[]'::jsonb)
    into v_top_mejora
    from (select x.nombre, x.mejora_pct, x.valor_generado from public.prod_revision_semana(p_semana_id) x
           where x.mejora_pct is not null order by x.mejora_pct desc, x.nombre limit 5) t;

  with semanas as (
    select s.id as sid, s.fecha_fin as fin, s.importada as imp, s.estado as est
      from public.prod_semanas s where s.fecha_fin <= v_fin
  ),
  matriz as (
    select o.id as oid, o.nombre as nom, s.fin,
      coalesce(case when s.imp or s.est = 'aprobada'
           then (select v.valor_generado from public.prod_valor_semana v where v.semana_id = s.sid and v.operadora_id = o.id)
           else (select sum(r.valor) from public.prod_registros r where r.semana_id = s.sid and r.operadora_id = o.id)
      end, 0) as val
    from public.prod_operadoras o cross join semanas s
    where o.activo and o.participa_bonos
  ),
  prom as (
    select m.*, avg(m.val) over (partition by m.oid order by m.fin rows between 4 preceding and 1 preceding) as avg4
      from matriz m
  ),
  marca as (
    select p.*, (p.avg4 > 0 and (p.val - p.avg4) / p.avg4 * 100 <= -p_umbral) as abajo from prom p
  ),
  bloques as (
    select m.*, sum(case when m.abajo then 0 else 1 end) over (partition by m.oid order by m.fin) as blk from marca m
  ),
  racha as (
    select b.*, case when b.abajo then row_number() over (partition by b.oid, b.blk order by b.fin) else 0 end as semanas_seguidas
      from bloques b
  )
  select coalesce(jsonb_agg(jsonb_build_object('nombre', r.nom, 'semanas', r.semanas_seguidas, 'valor', r.val, 'promedio', r.avg4)
                            order by r.semanas_seguidas desc, r.nom), '[]'::jsonb)
    into v_rachas
    from racha r where r.fin = v_fin and r.semanas_seguidas >= 3;

  return jsonb_build_object('top_valor', v_top_valor, 'top_mejora', v_top_mejora, 'rachas', v_rachas);
end; $$;
revoke execute on function public.prod_stats_destacados(uuid, numeric) from public;
grant execute on function public.prod_stats_destacados(uuid, numeric) to authenticated;

-- Por prenda (solo semanas capturadas en el sistema).
create or replace function public.prod_stats_prendas(p_desde date default null, p_hasta date default null, p_operadora uuid default null)
returns table (prenda text, valor numeric, piezas bigint, registros bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  return query
  select o.prenda, sum(r.valor), sum(r.piezas)::bigint, count(*)::bigint
    from public.prod_registros r
    join public.prod_semanas s on s.id = r.semana_id
    join public.prod_operaciones o on o.folio = r.folio_operacion
   where not s.importada
     and (p_desde is null or s.fecha_inicio >= p_desde) and (p_hasta is null or s.fecha_fin <= p_hasta)
     and (p_operadora is null or r.operadora_id = p_operadora)
   group by o.prenda
   order by sum(r.valor) desc;
end; $$;
revoke execute on function public.prod_stats_prendas(date, date, uuid) from public;
grant execute on function public.prod_stats_prendas(date, date, uuid) to authenticated;

-- Top 10 operaciones por piezas y por valor generado.
create or replace function public.prod_stats_operaciones(p_desde date default null, p_hasta date default null, p_operadora uuid default null)
returns table (criterio text, pos integer, folio integer, prenda text, parte text, operacion text, piezas bigint, valor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  return query
  with agg as (
    select o.folio as f, o.prenda as pr, o.parte as pa, o.operacion as op, sum(r.piezas)::bigint as pz, sum(r.valor) as vl
      from public.prod_registros r
      join public.prod_semanas s on s.id = r.semana_id
      join public.prod_operaciones o on o.folio = r.folio_operacion
     where not s.importada
       and (p_desde is null or s.fecha_inicio >= p_desde) and (p_hasta is null or s.fecha_fin <= p_hasta)
       and (p_operadora is null or r.operadora_id = p_operadora)
     group by o.folio, o.prenda, o.parte, o.operacion
  ),
  por_piezas as (select 'piezas'::text as c, (row_number() over (order by a.pz desc, a.f))::integer as p, a.* from agg a),
  por_valor as (select 'valor'::text as c, (row_number() over (order by a.vl desc, a.f))::integer as p, a.* from agg a)
  select x.c, x.p, x.f, x.pr, x.pa, x.op, x.pz, x.vl from por_piezas x where x.p <= 10
  union all
  select y.c, y.p, y.f, y.pr, y.pa, y.op, y.pz, y.vl from por_valor y where y.p <= 10
  order by 1 desc, 2;
end; $$;
revoke execute on function public.prod_stats_operaciones(date, date, uuid) from public;
grant execute on function public.prod_stats_operaciones(date, date, uuid) to authenticated;

-- Produccion por dia de la semana (miercoles a martes): promedio por semana capturada del rango.
create or replace function public.prod_stats_dias(p_desde date default null, p_hasta date default null, p_operadora uuid default null)
returns table (orden integer, dia text, valor_prom numeric, piezas_prom numeric, semanas integer)
language plpgsql stable security definer set search_path = public as $$
declare v_semanas integer;
begin
  if not public.prod_puede_ver_montos() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  select count(distinct r.semana_id)::integer into v_semanas
    from public.prod_registros r join public.prod_semanas s on s.id = r.semana_id
   where not s.importada
     and (p_desde is null or s.fecha_inicio >= p_desde) and (p_hasta is null or s.fecha_fin <= p_hasta)
     and (p_operadora is null or r.operadora_id = p_operadora);
  return query
  with dias as (
    select g.n as ord, (array['Miércoles','Jueves','Viernes','Sábado','Domingo','Lunes','Martes'])[g.n + 1] as nombre
      from generate_series(0, 6) g(n)
  ),
  tot as (
    select ((extract(dow from r.fecha)::int - 3 + 7) % 7) as ord, sum(r.valor) as vl, sum(r.piezas) as pz
      from public.prod_registros r join public.prod_semanas s on s.id = r.semana_id
     where not s.importada
       and (p_desde is null or s.fecha_inicio >= p_desde) and (p_hasta is null or s.fecha_fin <= p_hasta)
       and (p_operadora is null or r.operadora_id = p_operadora)
     group by 1
  )
  select d.ord, d.nombre,
         case when v_semanas > 0 then coalesce(t.vl, 0) / v_semanas else 0 end,
         case when v_semanas > 0 then coalesce(t.pz, 0)::numeric / v_semanas else 0 end,
         v_semanas
    from dias d left join tot t on t.ord = d.ord
   order by d.ord;
end; $$;
revoke execute on function public.prod_stats_dias(date, date, uuid) from public;
grant execute on function public.prod_stats_dias(date, date, uuid) to authenticated;
