-- ============================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V26: terminado (cantidad surtida) + remisión en PDF (Fase 2,
-- Parte 4)
--
-- No existe una tabla "orden_items" separada — las prendas viven en
-- orders.items (JSONB), y cada prenda trae su propio arreglo `sizes`
-- (talla + cantidad). La "línea de producto" del pedido (cantidad
-- pedida vs surtida) se mapea 1:1 a cada fila de `sizes`, no a la
-- prenda completa (una prenda casi siempre tiene varias tallas, cada
-- una con su propia cantidad pedida — comparar por prenda mezclaría
-- cantidades de tallas distintas).
--
-- `items[].sizes[]` gana dos claves por talla: `cantidad_surtida`
-- (numeric, nullable) y `comentario_surtido` (text, opcional). Sin
-- migración de datos: las tallas existentes simplemente no las traen.
--
-- set_item_surtido: único punto de escritura para el rol `terminado` —
-- SOLO puede tocar esas dos claves de UNA talla de UNA prenda, nunca el
-- resto de la orden. No puede tocar cliente, fechas, tipo, cantidades
-- pedidas originales, ni otras etapas — reforzado aquí mismo (el RPC
-- solo hace jsonb_set sobre esas dos claves, nunca reemplaza el resto
-- del array como sí hace set_order_items). Mismo guard de eliminada_en
-- que el resto de las funciones de escritura.
--
-- La prenda se localiza por ÍNDICE dentro de items[] (p_item_index,
-- base 0), no por el `id` que Parte 3 empezó a agregar a cada prenda —
-- una orden creada/editada antes de Parte 3 no trae ese `id` en la base
-- todavía (solo se persiste cuando alguien vuelve a guardar sus prendas
-- vía OrderItemsCard), así que depender de él aquí habría dejado sin
-- forma de capturar lo surtido a cualquier orden vieja no re-guardada.
-- El índice siempre existe y es estable mientras nadie reordene/borre
-- prendas de en medio (algo que terminado no puede hacer de todos
-- modos — set_order_items es exclusivo de ventas/admin_tienda/
-- admin_general).
-- ============================================================================

-- Nota de aplicación: la primera versión de este archivo usaba
-- p_item_id text (localizando por el `id` de la prenda) — se descubrió
-- el problema de arriba antes de escribir el frontend y se corrigió en
-- la misma sesión con un DROP FUNCTION + CREATE (cambia el tipo de un
-- parámetro, así que CREATE OR REPLACE solo no alcanza).
drop function if exists public.set_item_surtido(uuid, text, text, numeric, text);

create or replace function public.set_item_surtido(
  p_order_id uuid, p_item_index integer, p_talla text, p_cantidad_surtida numeric, p_comentario_surtido text default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_order public.orders;
  v_eliminada_en timestamptz;
  v_items jsonb;
  v_new_items jsonb;
  v_found boolean;
begin
  if coalesce(v_role, '') not in ('terminado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo terminado o administrador de fábrica pueden capturar lo surtido.';
  end if;

  select eliminada_en, items into v_eliminada_en, v_items from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_items is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  if p_item_index < 0 or p_item_index >= jsonb_array_length(v_items) then
    raise exception 'Índice de prenda inválido: %', p_item_index;
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(v_items->p_item_index->'sizes', '[]'::jsonb)) sz
    where sz->>'talla' = p_talla
  ) into v_found;
  if not v_found then
    raise exception 'No se encontró la talla indicada en esa prenda.';
  end if;

  select jsonb_agg(
    case when (ord - 1) = p_item_index
      then jsonb_set(
        it, '{sizes}',
        (
          select jsonb_agg(
            case when sz->>'talla' = p_talla
              then jsonb_set(
                jsonb_set(sz, '{cantidad_surtida}', to_jsonb(p_cantidad_surtida)),
                '{comentario_surtido}', to_jsonb(nullif(trim(coalesce(p_comentario_surtido, '')), ''))
              )
              else sz
            end
          )
          from jsonb_array_elements(coalesce(it->'sizes', '[]'::jsonb)) sz
        )
      )
      else it
    end order by ord
  ) into v_new_items
  from jsonb_array_elements(v_items) with ordinality as t(it, ord);

  update public.orders set items = v_new_items, updated_at = now()
  where id = p_order_id returning * into v_order;

  return v_order;
end;
$function$;
revoke execute on function public.set_item_surtido(uuid, integer, text, numeric, text) from public;
grant execute on function public.set_item_surtido(uuid, integer, text, numeric, text) to authenticated;
