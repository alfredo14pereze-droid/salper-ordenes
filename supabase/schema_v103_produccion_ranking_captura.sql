-- =====================================================================
-- V103 — Ranking de producción visible para captura_produccion (Juanis)
-- =====================================================================
-- Pedido del usuario: que Juanis (rol `captura_produccion`) pueda ver el
-- resultado ("valor generado") de cada operadora y pueda imprimir el
-- ranking. Confirmado explícitamente: SÍ se le muestra el monto en pesos
-- del valor generado (relaja, a propósito y solo para esto, la regla de
-- "captura_produccion nunca ve montos en pesos" de V66-V70).
--
-- Alcance A PROPÓSITO muy angosto: NO se le abre "Revisión producción" ni
-- "Admin producción" (siguen exclusivos admin_general/admin_fabrica), y
-- dentro de "Dashboard producción" tampoco ve los premios/bonos reales
-- (bono_meta/bono_lugar/bono_mejora/total_premio) — eso vive en
-- prod_revision_semana, que NO se toca aquí y se queda detrás de
-- prod_puede_ver_montos() de siempre. Solo se relaja lo que hace falta
-- para el ranking: prod_historial_valores (ya no traía bonos, solo
-- valor_generado) y una función NUEVA (prod_ranking_semana) que expone
-- lo mismo que ya calculaba prod_revision_semana pero SIN las columnas
-- de bono/premio.
-- =====================================================================

create or replace function public.prod_puede_ver_ranking()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.prod_puede_ver_montos() or public.current_user_role() = 'captura_produccion';
$$;
revoke execute on function public.prod_puede_ver_ranking() from public;
grant execute on function public.prod_puede_ver_ranking() to authenticated;

-- Misma firma que ya tenía — solo cambia el candado de permiso.
create or replace function public.prod_historial_valores(p_semanas integer default 16)
returns table (
  semana_id uuid, fecha_inicio date, fecha_fin date, estado text, importada boolean,
  operadora_id uuid, valor numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.prod_puede_ver_ranking() then
    raise exception 'No tienes permiso para ver los montos de producción.';
  end if;
  return query
  with sem as (
    select s.* from public.prod_semanas s order by s.fecha_inicio desc limit greatest(p_semanas, 1)
  )
  select s.id, s.fecha_inicio, s.fecha_fin, s.estado, s.importada, v.opid, v.opval
  from sem s
  join lateral (
    select pv.operadora_id as opid, pv.valor_generado as opval
      from public.prod_valor_semana pv
     where (s.importada or s.estado = 'aprobada') and pv.semana_id = s.id
    union all
    select r.operadora_id, sum(r.valor)
      from public.prod_registros r
     where not (s.importada or s.estado = 'aprobada') and r.semana_id = s.id
     group by r.operadora_id
  ) v on true;
end; $$;
revoke execute on function public.prod_historial_valores(integer) from public;
grant execute on function public.prod_historial_valores(integer) to authenticated;

-- Ranking de una semana SIN columnas de bono/premio (a diferencia de
-- prod_revision_semana, que sí las trae y se queda exclusiva de
-- admin_general/admin_fabrica). IMPORTANTE: NO llama a
-- prod_calcular_premios — esa función tiene su PROPIO candado interno,
-- hardcoded a prod_puede_ver_montos() (sin importar quién la llame ni
-- desde dónde), así que Juanis seguiría rechazada ahí para cualquier
-- semana todavía no aprobada. En su lugar, se copian aquí solo las CTEs
-- de RANKING de esa función (part/rk) — sin los cross join de bonos —
-- para no tocar ni relajar el candado de prod_calcular_premios (que sigue
-- exclusivo admin_general/admin_fabrica, sin cambios).
create or replace function public.prod_ranking_semana(p_semana_id uuid)
returns table (
  operadora_id uuid, nombre text, valor_generado numeric, valor_anterior numeric, lugar integer, mejora_pct numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sem public.prod_semanas;
  v_prev uuid;
begin
  if not public.prod_puede_ver_ranking() then
    raise exception 'No tienes permiso para ver el ranking de producción.';
  end if;

  if exists (select 1 from public.prod_premios_semana p where p.semana_id = p_semana_id) then
    return query
    select p.operadora_id, o.nombre, p.valor_generado, p.valor_anterior, p.lugar, p.mejora_pct
    from public.prod_premios_semana p
    join public.prod_operadoras o on o.id = p.operadora_id
    where p.semana_id = p_semana_id
    order by p.lugar, o.nombre;
    return;
  end if;

  select * into v_sem from public.prod_semanas s where s.id = p_semana_id;
  if v_sem.id is null then
    raise exception 'Semana no encontrada.';
  end if;

  select s.id into v_prev
  from public.prod_semanas s
  where s.estado = 'aprobada' and s.fecha_inicio < v_sem.fecha_inicio
  order by s.fecha_inicio desc
  limit 1;

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
  rk as (
    select p.*,
      1 + (select count(*) from part q where q.val > p.val)::integer as lug,
      (select v.valor_generado from public.prod_valor_semana v where v.semana_id = v_prev and v.operadora_id = p.pid) as ant
    from part p
  )
  select rk.pid, rk.pnombre, rk.val, rk.ant, rk.lug,
    case when rk.ant is null or rk.ant = 0 then null else (rk.val - rk.ant) / rk.ant * 100 end
  from rk
  order by rk.lug, rk.pnombre;
end;
$$;
revoke execute on function public.prod_ranking_semana(uuid) from public;
grant execute on function public.prod_ranking_semana(uuid) to authenticated;
