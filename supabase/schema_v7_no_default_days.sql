-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V7: tienda ya no captura el tiempo estimado de producción.
--
-- Antes, "Nueva orden" pedía un número de días (con 3 como default) que
-- ponía la tienda al crear la orden. Eso no tiene sentido: el tiempo de
-- producción lo decide fábrica, y solo lo puede hacer una vez que la
-- orden ya está en_confirmacion (ver set_estimated_production_days /
-- EstimatedDaysCard, sin cambios). A partir de aquí, una orden recién
-- creada nace con estimated_production_days = NULL hasta que fábrica lo
-- captura.
--
-- Requiere haber corrido los esquemas anteriores (schema.sql...v6).
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders alter column estimated_production_days drop not null;
alter table public.orders alter column estimated_production_days drop default;

-- create_order: p_estimated_production_days ahora es opcional (default
-- null) — la tienda ya no manda este dato al crear la orden. Mismo tipo
-- y mismo orden de parámetros que antes, así que no hace falta un
-- DROP FUNCTION (Postgres permite cambiar defaults con CREATE OR REPLACE
-- siempre que los tipos de los parámetros no cambien).
create or replace function public.create_order(
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer default null,
  p_items jsonb default '[]'::jsonb,
  p_order_sheet jsonb default '{}'::jsonb
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
    requested_delivery_date, estimated_production_days, items, order_sheet, created_by
  ) values (
    p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb), coalesce(p_order_sheet, '{}'::jsonb), auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;
