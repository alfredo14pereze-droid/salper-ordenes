-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V8: arregla "column order_sheet of relation orders does not
-- exist" al crear una orden desde tienda.
--
-- Causa raíz: la función create_order de 7 parámetros (con
-- p_order_sheet, de schema_v6/v7) quedó coexistiendo con la de 6
-- parámetros (de schema_v5) porque la columna orders.order_sheet nunca
-- llegó a crearse en esta base de datos (el ALTER TABLE de schema_v6 no
-- se aplicó, aunque las funciones sí). Como el frontend ya no manda
-- p_estimated_production_days ni p_order_sheet (ver schema_v7 y la
-- limpieza de la hoja de orden), Postgres resolvía la llamada contra la
-- versión de 7 parámetros (todos sus argumentos faltantes tienen
-- default) — que intentaba insertar en una columna inexistente.
--
-- Este esquema deja UNA sola versión de create_order (6 parámetros, sin
-- order_sheet, que es lo único que el frontend usa hoy) y tira la de 7.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

drop function if exists public.create_order(text, text, text, date, integer, jsonb);
drop function if exists public.create_order(text, text, text, date, integer, jsonb, jsonb);

create or replace function public.create_order(
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer default null,
  p_items jsonb default '[]'::jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if public.current_user_role() not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;

  -- order_number lo asigna trg_assign_order_folio (BEFORE INSERT) — no
  -- se manda aquí ni se puede forzar desde el cliente.
  insert into public.orders (
    client_name, order_type_key, description,
    requested_delivery_date, estimated_production_days, items, created_by
  ) values (
    p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb), auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;

grant execute on function public.create_order(text, text, text, date, integer, jsonb) to authenticated;
revoke execute on function public.create_order(text, text, text, date, integer, jsonb) from anon;

-- set_order_sheet también quedó de la función anterior que ya no se usa
-- desde ningún lado en el frontend (la hoja de orden se quitó) — se tira
-- por si acaso, para no dejar código muerto que referencie una columna
-- que no existe.
drop function if exists public.set_order_sheet(uuid, jsonb);
