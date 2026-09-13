-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V31: 'tienda' ahora SÍ puede resolver pendientes (antes de
-- V31, solo podía agregarlos) — específicamente para marcar en verde/
-- listo cuando ya terminó una orden de reparación. Corrige
-- update_pending_item_status (V30 la había cerrado también para
-- 'tienda' por error de interpretación — el pedido real del usuario es
-- que 'tienda' sí resuelva, solo 'lectura' se queda sin poder tocar
-- nada).
--
-- Aditivo/seguro: mismo cuerpo que V30, solo cambia la condición del
-- candado.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

create or replace function public.update_pending_item_status(
  p_id uuid, p_status text
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
  if coalesce(public.current_user_role(), '') = 'lectura' then
    raise exception 'No tienes permiso para cambiar el estado de un pendiente.';
  end if;
  if p_status not in ('pendiente', 'resuelto') then
    raise exception 'Estado inválido: %', p_status;
  end if;
  update public.pending_items
  set status = p_status,
      resolved_at = case when p_status = 'resuelto' then now() else null end
  where id = p_id
  returning * into v_item;
  if v_item.id is null then
    raise exception 'Pendiente % no encontrado', p_id;
  end if;
  return v_item;
end;
$$;

-- Verificación sugerida después de aplicar:
-- select coalesce(pg_get_functiondef('public.update_pending_item_status(uuid, text)'::regprocedure), '');
