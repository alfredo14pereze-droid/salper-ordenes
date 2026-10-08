-- =====================================================================
-- V145 — "Equipo" en la orden (identificador extra, opcional)
-- =====================================================================
-- En sublimación el cliente suele ser una persona ("Pablo Andrés") y lo
-- que de verdad identifica el pedido es el equipo ("Piratas"). Se agrega
-- orders.equipo (texto libre, opcional) para verlo en tarjetas, detalle,
-- estaciones, buscador y PDF.
--
-- Aditivo: una columna y una función nueva. No se redefine create_order
-- ni update_order_details: el equipo se guarda con set_orden_equipo
-- justo después de crear la orden y al editarla. No pide reconfirmación
-- de fábrica (no cambia qué se produce).
--
-- Rollback: drop function public.set_orden_equipo(uuid, text);
--           alter table public.orders drop column equipo;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
alter table public.orders add column if not exists equipo text;

create or replace function public.set_orden_equipo(p_order_id uuid, p_equipo text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Orden no encontrada.';
  end if;
  if v_order.eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  update public.orders set equipo = nullif(btrim(coalesce(p_equipo, '')), ''), updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.set_orden_equipo(uuid, text) from public, anon;
grant execute on function public.set_orden_equipo(uuid, text) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'orders' and column_name = 'equipo';   -- 1 fila
--   select has_function_privilege('anon', 'public.set_orden_equipo(uuid,text)', 'execute') as anon_puede,
--          has_function_privilege('authenticated', 'public.set_orden_equipo(uuid,text)', 'execute') as sesion_puede;
--   -- false | true
-- =====================================================================
