-- =====================================================================
-- V157 — Editar las etapas de una orden (administradores de fábrica)
-- =====================================================================
-- Pedido de Alfredo (2026-10-20): poder quitar, agregar y reordenar las
-- etapas de una orden ya creada (p. ej. quitarle corte a una orden que
-- no se corta). Hasta ahora las etapas solo salían de la plantilla del
-- tipo, del producto (Maquila/Frisa) o de "Lleva bordado/impresión".
--
-- set_orden_etapas(orden, etapas[]): la lista nueva, en orden.
--   * Solo admin_fabrica y admin_general (los mismos que pueden regresar
--     una etapa).
--   * Una etapa ya iniciada o terminada no se puede quitar (sí moverla).
--   * Etapas nuevas nacen en "pendiente"; el orden queda 1..n.
--   * Bordado e impresión por prenda dependen de "Lleva bordado/impresión"
--     en las prendas: al quitarlas o agregarlas aquí se ajusta esa marca,
--     para que editar las prendas (o el surtido de terminado) no las
--     vuelva a poner o quitar.
--   * Órdenes Frisa: también se actualiza su copia de la secuencia
--     (orders.frisa_producto), que es la que manda en ellas (V155).
--   * Queda en el historial de la orden.
--
-- Aditivo: una función nueva. No toca ninguna existente.
-- Rollback: drop function public.set_orden_etapas(uuid, text[]);
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.recompute_order_status(uuid)') is null then
    raise exception 'V157: no encuentro recompute_order_status(uuid). No se aplicó nada.';
  end if;
  if to_regclass('public.procesos_catalogo') is null then
    raise exception 'V157: falta V155 (procesos_catalogo). No se aplicó nada.';
  end if;
end $$;

create or replace function public.set_orden_etapas(p_order_id uuid, p_etapas text[])
returns setof public.orden_etapas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_etapas text[] := coalesce(p_etapas, '{}'::text[]);
  v_malo text;
  v_antes text;
  v_despues text;
  v_tenia_bordado boolean;
  v_tenia_impresion boolean;
  v_procesos jsonb;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_fabrica', 'admin_general') then
    raise exception 'Solo el administrador de fábrica o el general pueden editar las etapas de una orden.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_order.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;

  if coalesce(array_length(v_etapas, 1), 0) = 0 then
    raise exception 'La orden necesita al menos una etapa.';
  end if;
  select e into v_malo from unnest(v_etapas) e
  where e not in ('impresion', 'sublimado', 'descosido', 'corte', 'produccion', 'reflejante', 'bordado', 'impresion_prenda', 'terminado')
  limit 1;
  if found then raise exception 'Etapa desconocida: %.', v_malo; end if;
  select e into v_malo from unnest(v_etapas) e group by e having count(*) > 1 limit 1;
  if found then raise exception 'La etapa % está repetida.', v_malo; end if;

  select etapa into v_malo from public.orden_etapas
  where order_id = p_order_id and estado <> 'pendiente' and not (etapa = any(v_etapas))
  limit 1;
  if found then
    raise exception 'No se puede quitar %: ya se empezó. Regrésala a pendiente primero si fue un error.',
      coalesce((select nombre from public.procesos_catalogo where etapa = v_malo), v_malo);
  end if;

  select string_agg(etapa, ' > ' order by orden_secuencia) into v_antes from public.orden_etapas where order_id = p_order_id;
  v_tenia_bordado := exists (select 1 from public.orden_etapas where order_id = p_order_id and etapa = 'bordado');
  v_tenia_impresion := exists (select 1 from public.orden_etapas where order_id = p_order_id and etapa = 'impresion_prenda');

  -- Frisa: primero la copia de la secuencia (el candado de orden_etapas la
  -- usa para decidir qué se puede agregar o quitar).
  if v_order.order_type_key = 'frisa' and v_order.frisa_producto is not null then
    select jsonb_agg(
             coalesce(
               (select pr from jsonb_array_elements(v_order.frisa_producto->'procesos') pr where pr->>'etapa' = e limit 1),
               jsonb_build_object('proceso', c.codigo, 'nombre', c.nombre, 'etapa', e, 'impresiones', null, 'notas', null)
             ) || jsonb_build_object('orden', n)
             order by n)
      into v_procesos
    from unnest(v_etapas) with ordinality as t(e, n)
    left join public.procesos_catalogo c on c.etapa = e;
    update public.orders set frisa_producto = jsonb_set(frisa_producto, '{procesos}', v_procesos) where id = p_order_id;
  end if;

  delete from public.orden_etapas where order_id = p_order_id and not (etapa = any(v_etapas));
  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select p_order_id, e, 'pendiente', n from unnest(v_etapas) with ordinality as t(e, n)
  on conflict (order_id, etapa) do nothing;
  update public.orden_etapas oe set orden_secuencia = t.n
  from unnest(v_etapas) with ordinality as t(e, n)
  where oe.order_id = p_order_id and oe.etapa = t.e and oe.orden_secuencia is distinct from t.n;

  -- La marca de las prendas sigue a la etapa (si no, editar las prendas o
  -- el surtido la volverían a poner o quitar).
  if jsonb_typeof(v_order.items) = 'array'
     and (v_tenia_bordado <> ('bordado' = any(v_etapas)) or v_tenia_impresion <> ('impresion_prenda' = any(v_etapas))) then
    update public.orders set items = (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(it) <> 'object' then it
                    else it
                      || case when v_tenia_bordado <> ('bordado' = any(v_etapas))
                              then jsonb_build_object('lleva_bordado', 'bordado' = any(v_etapas)) else '{}'::jsonb end
                      || case when v_tenia_impresion <> ('impresion_prenda' = any(v_etapas))
                              then jsonb_build_object('lleva_impresion', 'impresion_prenda' = any(v_etapas)) else '{}'::jsonb end
               end order by n), '[]'::jsonb)
      from jsonb_array_elements(v_order.items) with ordinality as t(it, n)
    ), updated_at = now()
    where id = p_order_id;
  end if;

  select string_agg(etapa, ' > ' order by orden_secuencia) into v_despues from public.orden_etapas where order_id = p_order_id;
  if v_despues is distinct from v_antes then
    insert into public.order_status_history (order_id, status, notes, changed_by, changed_at)
    values (p_order_id, v_order.status, 'Etapas editadas: ' || coalesce(v_antes, '(ninguna)') || ' → ' || v_despues, auth.uid(), now());
  end if;

  perform public.recompute_order_status(p_order_id);
  return query select * from public.orden_etapas where order_id = p_order_id order by orden_secuencia;
end;
$$;
revoke execute on function public.set_orden_etapas(uuid, text[]) from public, anon;
grant execute on function public.set_orden_etapas(uuid, text[]) to authenticated;

-- =====================================================================
-- Verificación (solo lectura):
--   select has_function_privilege('anon', 'public.set_orden_etapas(uuid, text[])', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.set_orden_etapas(uuid, text[])', 'execute') as sesion_puede;
--   -- false | true
-- =====================================================================
