-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V32: folio externo (formato "ORD-0001") — pedido explícito
-- del usuario. Al empezar a cargar las órdenes reales, muchas ya tienen
-- un folio asignado en su sistema/control anterior (formato "ORD" +
-- 4 dígitos) — este campo lo guarda tal cual, aparte del folio propio
-- de SALPER (SUB-001, ESC-001...), para no perder esa referencia ni
-- confundirse con las órdenes ya existentes fuera del sistema.
--
-- Es un campo de texto libre, capturado a mano (no autogenerado como el
-- folio de SALPER) — cada orden real que se migre ya trae su propio
-- número del control anterior, no tiene sentido generarlo aquí.
--
-- OJO — mismo gotcha de siempre (ya documentado en schema_v12 y
-- corregido en vivo en V30): agregar un parámetro nuevo a una función
-- existente crea un OVERLOAD aparte si no se tira la versión vieja
-- primero. Por eso el DROP FUNCTION antes de cada redefinición, y el
-- REVOKE/GRANT explícito después — confirmado en vivo con
-- has_function_privilege que las firmas actuales de create_order y
-- update_order_details (después de V30) son exactamente las que se
-- tiran abajo, antes de escribir esto.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders add column if not exists folio_externo text;

drop function if exists public.create_order(
  text, text, text, date, integer, jsonb, uuid, text, text
);

create or replace function public.create_order(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_estimated_production_days integer default null, p_items jsonb default '[]'::jsonb, p_client_id uuid default null,
  p_client_telefono text default null, p_client_correo text default null, p_folio_externo text default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_telefono text := nullif(trim(coalesce(p_client_telefono, '')), '');
  v_correo text := nullif(trim(coalesce(p_client_correo, '')), '');
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;
  insert into public.orders (
    client_name, order_type_key, description, requested_delivery_date,
    estimated_production_days, items, client_id, client_telefono, client_correo, folio_externo, created_by
  ) values (
    p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
    p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, v_telefono, v_correo,
    nullif(trim(coalesce(p_folio_externo, '')), ''), auth.uid()
  ) returning * into v_order;

  if p_client_id is not null and (v_telefono is not null or v_correo is not null) then
    update public.clientes set
      telefono = coalesce(v_telefono, telefono),
      correo = coalesce(v_correo, correo)
    where id = p_client_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select v_order.id, pe.etapa, 'pendiente', pe.orden_secuencia
  from public.plantillas_etapas pe
  where pe.order_type_key = v_order.order_type_key and pe.etapa <> 'bordado';

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where coalesce((it->>'lleva_bordado')::boolean, false)
  ) then
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    values (
      v_order.id, 'bordado', 'pendiente',
      coalesce((select orden_secuencia from public.plantillas_etapas where order_type_key = v_order.order_type_key and etapa = 'bordado'), 3)
    )
    on conflict (order_id, etapa) do nothing;
  end if;

  return v_order;
end;
$function$;
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text) to authenticated;

drop function if exists public.update_order_details(
  uuid, text, text, text, date, text, text
);

create or replace function public.update_order_details(
  p_order_id uuid, p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_client_telefono text default null, p_client_correo text default null, p_folio_externo text default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se puede editar.';
  end if;
  update public.orders set
    client_name = p_client_name,
    order_type_key = p_order_type_key,
    description = p_description,
    requested_delivery_date = p_requested_delivery_date,
    client_telefono = nullif(trim(coalesce(p_client_telefono, '')), ''),
    client_correo = nullif(trim(coalesce(p_client_correo, '')), ''),
    folio_externo = nullif(trim(coalesce(p_folio_externo, '')), ''),
    updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
revoke execute on function public.update_order_details(uuid, text, text, text, date, text, text, text) from public;
grant execute on function public.update_order_details(uuid, text, text, text, date, text, text, text) to authenticated;

-- Verificación sugerida después de aplicar (debe salir 1 fila cada una,
-- con el parámetro p_folio_externo al final):
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc where proname in ('create_order','update_order_details');
