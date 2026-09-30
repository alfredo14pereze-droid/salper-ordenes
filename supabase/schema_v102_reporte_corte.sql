-- =====================================================================
-- V102 — Reporte de corte real y precisión de consumos (Fase 2, Parte 4)
-- =====================================================================
-- Objetivo: que corte registre la tela REAL consumida al terminar su
-- etapa, que eso descuente el inventario (ya lo hace v_comprometido_telas
-- de la Parte 3 al dejar de contar la orden como pendiente de cortar), y
-- que se pueda comparar estimado vs. real.
--
-- DECISIÓN DE DISEÑO (confirmada con el usuario): el operador de corte
-- captura "tela usada" POR TELA, no por prenda — así se mantiene
-- "extremadamente simple" como pidió. Una tela puede repartirse entre
-- varias prendas de la misma orden, así que el reporte de precisión POR
-- PRENDA reparte el consumo real de esa tela PROPORCIONALMENTE entre las
-- prendas que la usan, según qué porcentaje del estimado representaba
-- cada una — es una aproximación cuando una tela es compartida, exacta
-- cuando una tela solo la usa una prenda. El snapshot se guarda al
-- momento del corte para que este cálculo no cambie si después se editan
-- los consumos por prenda (consumos_prenda).
--
-- Todo aditivo: 2 columnas nullable en movimientos_tela + funciones/vista
-- nuevas. calcular_consumo_orden se reescribe (misma firma, sin DROP) para
-- reusar el nuevo calcular_consumo_detalle en vez de duplicar la lógica de
-- match — el contrato (jsonb con por_tela/sin_consumo/unidad_no_coincide)
-- no cambia, así que OrderTelaResumen.jsx (Parte 3) sigue funcionando
-- igual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) movimientos_tela: snapshot del estimado al momento del corte.
-- ---------------------------------------------------------------------
alter table public.movimientos_tela add column if not exists consumo_estimado numeric;
alter table public.movimientos_tela add column if not exists orden_prendas_snapshot jsonb;

-- ---------------------------------------------------------------------
-- 2) calcular_consumo_detalle — mismo matching que ya usaba
--    calcular_consumo_orden, pero a nivel de renglón (tela+prenda+talla)
--    en vez de agregado. Se usa para el snapshot del corte y para poder
--    reescribir calcular_consumo_orden sin duplicar la lógica.
-- ---------------------------------------------------------------------
create or replace function public.calcular_consumo_detalle(p_items jsonb)
returns table (
  tela_id uuid, garment text, talla text, cantidad numeric,
  consumo numeric, consumo_unidad text, tela_unidad text, estimado numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_size jsonb;
  v_tela_id uuid;
  v_tela_unidad text;
  v_garment_norm text;
  v_talla text;
  v_cantidad numeric;
  v_consumo numeric;
  v_consumo_unidad text;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if v_item->>'tela_id' is null or v_item->>'tela_id' = '' then
      continue;
    end if;
    v_tela_id := (v_item->>'tela_id')::uuid;
    select unidad into v_tela_unidad from public.telas where id = v_tela_id;
    v_garment_norm := lower(trim(coalesce(v_item->>'garment', '')));

    for v_size in select * from jsonb_array_elements(coalesce(v_item->'sizes', '[]'::jsonb))
    loop
      v_talla := v_size->>'talla';
      v_cantidad := nullif(v_size->>'cantidad', '')::numeric;
      if v_cantidad is null or v_cantidad <= 0 then
        continue;
      end if;

      v_consumo := null;
      v_consumo_unidad := null;
      select cp.consumo, cp.unidad into v_consumo, v_consumo_unidad
      from public.consumos_prenda cp
      where cp.prenda_normalizada = v_garment_norm and cp.tallas is not null and v_talla = any(cp.tallas)
      limit 1;
      if v_consumo is null then
        select cp.consumo, cp.unidad into v_consumo, v_consumo_unidad
        from public.consumos_prenda cp
        where cp.prenda_normalizada = v_garment_norm and cp.tallas is null
        limit 1;
      end if;

      tela_id := v_tela_id;
      garment := v_item->>'garment';
      talla := v_talla;
      cantidad := v_cantidad;
      consumo := v_consumo;
      consumo_unidad := v_consumo_unidad;
      tela_unidad := v_tela_unidad;
      estimado := case
        when v_consumo is not null and (v_tela_unidad is null or v_consumo_unidad = v_tela_unidad)
        then v_cantidad * v_consumo
        else null
      end;
      return next;
    end loop;
  end loop;
  return;
end;
$$;
revoke execute on function public.calcular_consumo_detalle(jsonb) from public;
grant execute on function public.calcular_consumo_detalle(jsonb) to authenticated;

-- calcular_consumo_orden — misma firma y mismo contrato de salida, ahora
-- agregado a partir de calcular_consumo_detalle (no vuelve a implementar
-- el matching por su cuenta).
create or replace function public.calcular_consumo_orden(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_por_tela jsonb := '{}'::jsonb;
  v_sin_consumo jsonb := '[]'::jsonb;
  v_no_coincide jsonb := '[]'::jsonb;
  v_row record;
  v_acumulado numeric;
begin
  for v_row in select * from public.calcular_consumo_detalle(p_items)
  loop
    if v_row.consumo is null then
      v_sin_consumo := v_sin_consumo || jsonb_build_object('garment', v_row.garment, 'talla', v_row.talla);
    elsif v_row.tela_unidad is not null and v_row.consumo_unidad <> v_row.tela_unidad then
      v_no_coincide := v_no_coincide || jsonb_build_object(
        'garment', v_row.garment, 'talla', v_row.talla,
        'consumo_unidad', v_row.consumo_unidad, 'tela_unidad', v_row.tela_unidad
      );
    else
      v_acumulado := coalesce((v_por_tela->>(v_row.tela_id::text))::numeric, 0) + v_row.estimado;
      v_por_tela := jsonb_set(v_por_tela, array[v_row.tela_id::text], to_jsonb(v_acumulado));
    end if;
  end loop;
  return jsonb_build_object('por_tela', v_por_tela, 'sin_consumo', v_sin_consumo, 'unidad_no_coincide', v_no_coincide);
end;
$$;
revoke execute on function public.calcular_consumo_orden(jsonb) from public;
grant execute on function public.calcular_consumo_orden(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3) marcar_corte — una tela usada por cada tela de la orden, todas
--    obligatorias. Inserta el/los movimiento(s) consumo_corte (con
--    snapshot del estimado) y completa la etapa de corte, en una sola
--    llamada.
-- ---------------------------------------------------------------------
create or replace function public.marcar_corte(p_orden_id uuid, p_consumos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_items jsonb;
  v_telas_orden uuid[];
  v_entry jsonb;
  v_tela_id uuid;
  v_tela_unidad text;
  v_cantidad numeric;
  v_snapshot jsonb;
  v_estimado_total numeric;
begin
  if coalesce(v_role, '') not in ('corte', 'admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para marcar el corte de esta orden.';
  end if;

  select items into v_items from public.orders where id = p_orden_id;
  if v_items is null then
    raise exception 'Orden % no encontrada.', p_orden_id;
  end if;

  select array_agg(distinct (item->>'tela_id')::uuid) into v_telas_orden
  from jsonb_array_elements(v_items) as item
  where item->>'tela_id' is not null and item->>'tela_id' <> '';

  if v_telas_orden is null or array_length(v_telas_orden, 1) = 0 then
    raise exception 'Esta orden no tiene ninguna tela asignada a sus prendas.';
  end if;

  foreach v_tela_id in array v_telas_orden
  loop
    v_cantidad := null;
    for v_entry in select * from jsonb_array_elements(coalesce(p_consumos, '[]'::jsonb))
    loop
      if (v_entry->>'tela_id')::uuid = v_tela_id then
        v_cantidad := nullif(v_entry->>'cantidad', '')::numeric;
      end if;
    end loop;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Falta capturar la tela usada para una de las telas de esta orden.';
    end if;

    select unidad into v_tela_unidad from public.telas where id = v_tela_id;
    if v_tela_unidad is null then
      raise exception 'Una de las telas de esta orden no tiene unidad de medida definida. Pide que la configuren en Catálogos.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('garment', d.garment, 'talla', d.talla, 'estimado', d.estimado)), '[]'::jsonb),
           sum(d.estimado)
      into v_snapshot, v_estimado_total
      from public.calcular_consumo_detalle(v_items) d
     where d.tela_id = v_tela_id and d.estimado is not null;

    insert into public.movimientos_tela (
      tela_id, tipo, cantidad, unidad, orden_id, usuario_id, consumo_estimado, orden_prendas_snapshot
    ) values (
      v_tela_id, 'consumo_corte', -abs(v_cantidad), v_tela_unidad, p_orden_id, auth.uid(), v_estimado_total, v_snapshot
    );
  end loop;

  perform public.update_orden_etapa(p_orden_id, 'corte', 'completado');
end;
$$;
revoke execute on function public.marcar_corte(uuid, jsonb) from public;
grant execute on function public.marcar_corte(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) v_movimientos_tela — se extiende con consumo_estimado (columna
--    nueva al final) para poder mostrar estimado vs. real en el detalle
--    de la orden / historial de la tela.
-- ---------------------------------------------------------------------
create or replace view public.v_movimientos_tela as
select
  m.id, m.tela_id, m.tipo, m.cantidad, m.unidad, m.orden_id, m.nota, m.fecha,
  m.usuario_id, p.full_name as usuario_nombre, m.consumo_estimado, t.nombre as tela_nombre
from public.movimientos_tela m
left join public.profiles p on p.id = m.usuario_id
left join public.telas t on t.id = m.tela_id;

grant select on public.v_movimientos_tela to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) v_precision_consumos — por prenda, promedio de la diferencia
--    estimado-vs-real (real prorrateado cuando la tela es compartida
--    entre prendas), y si pasa de ±10% ("alerta"). Solo admin_fabrica/
--    admin_general la consumen en el frontend (capa de UX, igual que el
--    resto del sistema) — el grant aquí es solo a authenticated, ni
--    siquiera anon.
-- ---------------------------------------------------------------------
create or replace view public.v_precision_consumos as
with movimientos as (
  select id, cantidad, consumo_estimado, orden_prendas_snapshot
  from public.movimientos_tela
  where tipo = 'consumo_corte' and orden_prendas_snapshot is not null and consumo_estimado is not null and consumo_estimado > 0
),
renglones as (
  select
    r.garment,
    r.estimado,
    abs(m.cantidad) * (r.estimado / m.consumo_estimado) as real_prorrateado
  from movimientos m
  cross join lateral jsonb_to_recordset(m.orden_prendas_snapshot) as r(garment text, talla text, estimado numeric)
  where r.estimado > 0
)
select
  garment as prenda,
  count(*) as renglones_comparados,
  avg((real_prorrateado - estimado) / estimado * 100) as diferencia_pct_promedio,
  abs(avg((real_prorrateado - estimado) / estimado * 100)) > 10 as alerta
from renglones
group by garment
order by garment;

grant select on public.v_precision_consumos to authenticated;
