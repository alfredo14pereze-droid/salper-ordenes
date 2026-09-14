-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V42: tres pedidos del usuario en el mismo mensaje.
--
-- 1) Varios folios externos por orden: un cliente puede pedir cosas muy
--    distintas que en su control anterior (antes de SALPER) quedaron en
--    VARIAS órdenes de taller separadas — hasta ahora `folio_externo`
--    solo guardaba una. Se reemplaza por `folios_externos text[]`. Ya
--    hay 2 órdenes reales en producción con `folio_externo` capturado
--    (SUB-001 "ORD3148", SUB-002 "ORD3155") — se migran a la columna
--    nueva antes de dejar de usar la vieja (que se queda en la tabla,
--    sin usarse, por si algún día hace falta ver qué tenía antes).
--
-- 2) Total de la orden + restante: además del anticipo (ya existía,
--    schema_v16_anticipos.sql), ahora se puede capturar el total
--    acordado con el cliente — "Restante" (total - anticipos recibidos)
--    se calcula en el frontend, no se guarda (siempre es correcto,
--    nunca se puede desincronizar). Solo se agrega `orders.total_orden`
--    y una función aparte para editarlo después de creada la orden
--    (`set_order_total` — no se mete a update_order_details a propósito,
--    así cambiar el total no dispara pending_reconfirmation_at: no es
--    algo que fábrica necesite reconfirmar).
--
-- 3) Constancia de situación fiscal del CLIENTE (no de la orden — un
--    cliente casi siempre pide varias veces, y su constancia no cambia
--    entre pedidos). Mismo bucket privado que cotización/orden de
--    compra/factura (orden-documentos), con su propio prefijo de ruta
--    (`clientes/<id>/...`) — la policy de ese bucket ya es por
--    bucket_id, no por ruta, así que no hace falta ninguna policy nueva.
--
-- create_order gana parámetros nuevos (folios_externos, total_orden) —
-- por el gotcha de siempre, con su DROP FUNCTION + REVOKE/GRANT.
-- update_order_details SÍ cambia de firma esta vez (folio_externo text
-- -> folios_externos text[]), así que también lleva su DROP FUNCTION
-- (a diferencia de V38, donde no hizo falta porque no le cambió la
-- firma). set_order_total y set_cliente_constancia_fiscal son funciones
-- nuevas, no necesitan DROP.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders add column if not exists folios_externos text[] not null default '{}'::text[];
alter table public.orders add column if not exists total_orden numeric;
alter table public.clientes add column if not exists constancia_fiscal_path text;

-- Migra lo que ya había en folio_externo (2 órdenes reales) a la columna
-- nueva — idempotente, no vuelve a tocar una fila ya migrada.
update public.orders
set folios_externos = array[folio_externo]
where folio_externo is not null and folios_externos = '{}'::text[];

-- ---------------------------------------------------------------------
-- 1) create_order: folio_externo -> folios_externos, + total_orden.
-- ---------------------------------------------------------------------
drop function if exists public.create_order(
  text, text, text, date, integer, jsonb, uuid, text, text, text, timestamptz
);

create or replace function public.create_order(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_estimated_production_days integer default null, p_items jsonb default '[]'::jsonb, p_client_id uuid default null,
  p_client_telefono text default null, p_client_correo text default null,
  p_folios_externos text[] default '{}'::text[], p_created_at timestamptz default null,
  p_total_orden numeric default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_telefono text := nullif(trim(coalesce(p_client_telefono, '')), '');
  v_correo text := nullif(trim(coalesce(p_client_correo, '')), '');
  v_created_at timestamptz := coalesce(p_created_at, now());
  v_folios text[] := coalesce(
    (select array_agg(f) from unnest(coalesce(p_folios_externos, '{}'::text[])) f where trim(f) <> ''),
    '{}'::text[]
  );
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;
  if p_created_at is not null and p_created_at > now() then
    raise exception 'La fecha de creación no puede ser en el futuro.';
  end if;
  if p_total_orden is not null and p_total_orden < 0 then
    raise exception 'El total de la orden no puede ser negativo.';
  end if;

  insert into public.orders (
    client_name, order_type_key, description, requested_delivery_date,
    estimated_production_days, items, client_id, client_telefono, client_correo, folios_externos,
    created_by, created_at, total_orden
  ) values (
    p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
    p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, v_telefono, v_correo,
    v_folios, auth.uid(), v_created_at, p_total_orden
  ) returning * into v_order;

  if p_client_id is not null and (v_telefono is not null or v_correo is not null) then
    update public.clientes set
      telefono = coalesce(v_telefono, telefono),
      correo = coalesce(v_correo, correo)
    where id = p_client_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by, changed_at)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid(), v_created_at);

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
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text[], timestamptz, numeric) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text[], timestamptz, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 2) update_order_details: folio_externo -> folios_externos (SÍ cambia
--    la firma esta vez, a diferencia de V38 — lleva su DROP FUNCTION).
-- ---------------------------------------------------------------------
drop function if exists public.update_order_details(
  uuid, text, text, text, date, text, text, text
);

create or replace function public.update_order_details(
  p_order_id uuid, p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_client_telefono text default null, p_client_correo text default null,
  p_folios_externos text[] default '{}'::text[]
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
  v_cancelled_at timestamptz;
  v_needs_reconfirm boolean;
  v_folios text[] := coalesce(
    (select array_agg(f) from unnest(coalesce(p_folios_externos, '{}'::text[])) f where trim(f) <> ''),
    '{}'::text[]
  );
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select status, eliminada_en, cancelled_at into v_current_status, v_eliminada_en, v_cancelled_at
  from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se puede editar.';
  end if;

  v_needs_reconfirm := v_current_status not in ('en_confirmacion', 'completado') and v_cancelled_at is null;

  update public.orders set
    client_name = p_client_name,
    order_type_key = p_order_type_key,
    description = p_description,
    requested_delivery_date = p_requested_delivery_date,
    client_telefono = nullif(trim(coalesce(p_client_telefono, '')), ''),
    client_correo = nullif(trim(coalesce(p_client_correo, '')), ''),
    folios_externos = v_folios,
    pending_reconfirmation_at = case when v_needs_reconfirm then now() else pending_reconfirmation_at end,
    updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
revoke execute on function public.update_order_details(uuid, text, text, text, date, text, text, text[]) from public;
grant execute on function public.update_order_details(uuid, text, text, text, date, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3) set_order_total: aparte de update_order_details a propósito — el
--    total no es algo que fábrica necesite "reconfirmar" (no dispara
--    pending_reconfirmation_at). Mismo candado que editar la orden.
-- ---------------------------------------------------------------------
create or replace function public.set_order_total(p_order_id uuid, p_total numeric)
returns public.orders
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
    raise exception 'No tienes permiso para editar el total de esta orden.';
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
  if p_total is not null and p_total < 0 then
    raise exception 'El total no puede ser negativo.';
  end if;

  update public.orders set total_orden = p_total, updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
revoke execute on function public.set_order_total(uuid, numeric) from public;
grant execute on function public.set_order_total(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 4) set_cliente_constancia_fiscal: documento del CLIENTE, no de la
--    orden — mismos roles "tienda" que ya editan documentos de orden
--    (contabilidad incluida, es quien más la necesita al facturar).
-- ---------------------------------------------------------------------
create or replace function public.set_cliente_constancia_fiscal(p_cliente_id uuid, p_path text)
returns public.clientes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente public.clientes;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar los documentos de este cliente.';
  end if;
  update public.clientes set constancia_fiscal_path = p_path where id = p_cliente_id returning * into v_cliente;
  if v_cliente.id is null then
    raise exception 'Cliente % no encontrado', p_cliente_id;
  end if;
  return v_cliente;
end;
$function$;
revoke execute on function public.set_cliente_constancia_fiscal(uuid, text) from public;
grant execute on function public.set_cliente_constancia_fiscal(uuid, text) to authenticated;

-- Verificación sugerida después de aplicar:
--
-- select order_number, folio_externo, folios_externos from public.orders order by created_at;
-- -- SUB-001 debe traer folios_externos = {ORD3148}, SUB-002 = {ORD3155}.
--
-- select proname, pronargs from pg_proc
-- where proname in ('create_order','update_order_details','set_order_total','set_cliente_constancia_fiscal')
--   and pronamespace = 'public'::regnamespace
-- order by proname;
-- -- create_order=12, update_order_details=8, set_order_total=2,
-- -- set_cliente_constancia_fiscal=2 — una sola fila cada una.
--
-- select has_function_privilege('authenticated','public.create_order(text,text,text,date,integer,jsonb,uuid,text,text,text[],timestamptz,numeric)','EXECUTE'); -- true
-- select has_function_privilege('anon','public.create_order(text,text,text,date,integer,jsonb,uuid,text,text,text[],timestamptz,numeric)','EXECUTE');          -- false
-- select has_function_privilege('authenticated','public.update_order_details(uuid,text,text,text,date,text,text,text[])','EXECUTE'); -- true
-- select has_function_privilege('anon','public.update_order_details(uuid,text,text,text,date,text,text,text[])','EXECUTE');          -- false
