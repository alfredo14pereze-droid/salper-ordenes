-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V6: "hoja de orden" (los datos exactos de la hoja física de
-- taller) + función para guardarla, usada por el PDF de confirmación.
--
-- Requiere haber corrido los esquemas anteriores (schema.sql...v5).
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
--
-- order_sheet es un jsonb con esta forma (todos los campos son texto
-- libre excepto sizes, que es un objeto { "20": cantidad, "22": cantidad,
-- ... "50": cantidad } con las tallas fijas pares de la hoja física):
--
-- {
--   "vendedor": "",
--   "torneos": "",
--   "contact_name": "",
--   "contact_address": "",
--   "contact_phone": "",
--   "sections": {
--     "playera": { "cliente":"", "color":"", "manga":"", "vivos":"",
--                  "cuello":"", "punos":"", "tela":"", "logotipos":"",
--                  "numeros":"", "sizes": {} },
--     "short":   { ... mismos campos ... }
--   }
-- }
-- =====================================================================

alter table public.orders add column if not exists order_sheet jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- create_order: agrega el parámetro opcional p_order_sheet (default '{}').
-- Firma distinta a la de schema_v5 → hay que tirar esa versión primero.
-- ---------------------------------------------------------------------
drop function if exists public.create_order(text, text, text, date, integer, jsonb);

create or replace function public.create_order(
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer,
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
    p_requested_delivery_date, p_estimated_production_days,
    coalesce(p_items, '[]'::jsonb), coalesce(p_order_sheet, '{}'::jsonb), auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;

grant execute on function public.create_order(text, text, text, date, integer, jsonb, jsonb) to authenticated;
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, jsonb) from anon;

-- ---------------------------------------------------------------------
-- set_order_sheet: mismas reglas que set_order_items / update_order_details
-- (tienda solo mientras sigue "en_confirmacion"; admin siempre; fábrica no
-- toca esto).
-- ---------------------------------------------------------------------
create or replace function public.set_order_sheet(
  p_order_id uuid,
  p_order_sheet jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
begin
  if v_role not in ('tienda', 'admin') then
    raise exception 'No tienes permiso para editar la hoja de orden.';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  if v_role = 'tienda' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se puede editar.';
  end if;

  update public.orders
  set order_sheet = coalesce(p_order_sheet, '{}'::jsonb),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.set_order_sheet(uuid, jsonb) to authenticated;
revoke execute on function public.set_order_sheet(uuid, jsonb) from anon;
