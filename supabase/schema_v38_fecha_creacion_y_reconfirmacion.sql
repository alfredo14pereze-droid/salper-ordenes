-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V38: dos cosas pedidas juntas por el usuario, sin relación
-- entre sí más que llegar en el mismo mensaje.
--
-- 1) Fecha de creación manual al hacer una orden nueva — TEMPORAL,
--    mientras se sube el historial de órdenes que ya están activas
--    (vienen de antes de usar SALPER, así que su fecha de creación real
--    no es "hoy"). Sin esto, esas órdenes migradas ensuciarían
--    Estadísticas (V35): "tiempo promedio de producción" se mediría
--    desde hoy, no desde cuándo se crearon de verdad. Ver
--    CAPTURA_FECHA_CREACION_HABILITADA en utils/featureFlags.js — el
--    plan es apagar ese flag (una sola línea) cuando se termine de subir
--    el historial; esta migración de SQL se queda para siempre (no hace
--    daño dejar el parámetro, solo el frontend deja de mandarlo).
--
-- 2) "Pendiente de reconfirmación": si una orden YA fue confirmada por
--    fábrica y CUALQUIER admin (tienda o general) le edita algo después
--    (datos generales o prendas/tallas), fábrica necesita enterarse de
--    que lo que ya tenía en la cabeza pudo haber cambiado. Se guarda
--    como un timestamp (pending_reconfirmation_at) en vez de un boolean
--    para poder ver desde cuándo lleva pendiente si algún día hace
--    falta. Se limpia con la función nueva confirm_order_changes, que
--    es exclusiva de fábrica (mismos roles que ya pueden confirmar una
--    orden nueva, ver canConfirmOrder en utils/permissions.js) — es
--    aparte de update_order_status/update_orden_etapa: no mueve status
--    ni ninguna etapa, solo apaga la bandera.
--
-- Ambos cambios son aditivos (columnas nullable con default, funciones
-- con parámetros opcionales al final) — ninguna orden existente se
-- rompe. update_order_details y set_order_items SÍ agregan una lógica
-- nueva a su cuerpo (marcar pending_reconfirmation_at) pero NO cambian
-- su firma, así que no hace falta ningún DROP FUNCTION para esas dos.
-- create_order SÍ gana un parámetro nuevo (p_created_at) — por el
-- gotcha de siempre, lleva su DROP FUNCTION + REVOKE/GRANT explícito.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

alter table public.orders add column if not exists pending_reconfirmation_at timestamptz;

-- ---------------------------------------------------------------------
-- 1) create_order gana p_created_at (opcional) — si se manda, se usa
--    esa fecha tanto en orders.created_at como en el primer registro de
--    order_status_history (para que Estadísticas mida el tiempo de
--    producción desde la fecha real, no desde "ahora"). Si no se manda,
--    se comporta exactamente igual que antes (now()).
-- ---------------------------------------------------------------------
drop function if exists public.create_order(
  text, text, text, date, integer, jsonb, uuid, text, text, text
);

create or replace function public.create_order(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_estimated_production_days integer default null, p_items jsonb default '[]'::jsonb, p_client_id uuid default null,
  p_client_telefono text default null, p_client_correo text default null, p_folio_externo text default null,
  p_created_at timestamptz default null
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
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;
  if p_created_at is not null and p_created_at > now() then
    raise exception 'La fecha de creación no puede ser en el futuro.';
  end if;

  insert into public.orders (
    client_name, order_type_key, description, requested_delivery_date,
    estimated_production_days, items, client_id, client_telefono, client_correo, folio_externo, created_by, created_at
  ) values (
    p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
    p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, v_telefono, v_correo,
    nullif(trim(coalesce(p_folio_externo, '')), ''), auth.uid(), v_created_at
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
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text, timestamptz) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2) update_order_details: misma firma de siempre, solo se le agrega
--    marcar pending_reconfirmation_at cuando la orden ya no está
--    "en_confirmacion" (o sea, fábrica ya la había confirmado o incluso
--    ya avanzó etapas) y sigue activa (ni completada ni cancelada — ahí
--    ya no tiene sentido pedirle a fábrica que "reconfirme" nada).
-- ---------------------------------------------------------------------
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
  v_cancelled_at timestamptz;
  v_needs_reconfirm boolean;
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
    folio_externo = nullif(trim(coalesce(p_folio_externo, '')), ''),
    pending_reconfirmation_at = case when v_needs_reconfirm then now() else pending_reconfirmation_at end,
    updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
revoke execute on function public.update_order_details(uuid, text, text, text, date, text, text, text) from public;
grant execute on function public.update_order_details(uuid, text, text, text, date, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) set_order_items: mismo criterio — editar prendas/tallas de una
--    orden ya confirmada también marca pending_reconfirmation_at.
-- ---------------------------------------------------------------------
create or replace function public.set_order_items(p_order_id uuid, p_items jsonb)
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
  v_cancelled_at timestamptz;
  v_needs_bordado boolean;
  v_bordado_estado text;
  v_needs_reconfirm boolean;
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar las prendas de esta orden.';
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
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus prendas.';
  end if;

  v_needs_reconfirm := v_current_status not in ('en_confirmacion', 'completado') and v_cancelled_at is null;

  update public.orders set
    items = coalesce(p_items, '[]'::jsonb),
    pending_reconfirmation_at = case when v_needs_reconfirm then now() else pending_reconfirmation_at end,
    updated_at = now()
  where id = p_order_id returning * into v_order;

  select exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where coalesce((it->>'lleva_bordado')::boolean, false)
  ) into v_needs_bordado;

  select estado into v_bordado_estado from public.orden_etapas where order_id = p_order_id and etapa = 'bordado';

  if v_needs_bordado and v_bordado_estado is null then
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    values (
      p_order_id, 'bordado', 'pendiente',
      coalesce((select orden_secuencia from public.plantillas_etapas where order_type_key = v_order.order_type_key and etapa = 'bordado'), 3)
    );
  elsif not v_needs_bordado and v_bordado_estado = 'pendiente' then
    delete from public.orden_etapas where order_id = p_order_id and etapa = 'bordado';
  end if;

  return v_order;
end;
$function$;
revoke execute on function public.set_order_items(uuid, jsonb) from public;
grant execute on function public.set_order_items(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) confirm_order_changes: exclusivo de fábrica (mismos roles que
--    canConfirmOrder) — apaga pending_reconfirmation_at sin tocar
--    status ni orden_etapas. Firma nueva, no necesita DROP FUNCTION.
-- ---------------------------------------------------------------------
create or replace function public.confirm_order_changes(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') not in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo fábrica puede confirmar los cambios de esta orden.';
  end if;
  update public.orders set pending_reconfirmation_at = null
  where id = p_order_id
  returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$function$;
revoke execute on function public.confirm_order_changes(uuid) from public;
grant execute on function public.confirm_order_changes(uuid) to authenticated;

-- Verificación sugerida después de aplicar:
--
-- select proname, pronargs from pg_proc
-- where proname in ('create_order','update_order_details','set_order_items','confirm_order_changes')
--   and pronamespace = 'public'::regnamespace
-- order by proname;
-- -- create_order=11, update_order_details=8, set_order_items=2,
-- -- confirm_order_changes=1 — una sola fila cada una.
--
-- select has_function_privilege('authenticated','public.create_order(text,text,text,date,integer,jsonb,uuid,text,text,text,timestamptz)','EXECUTE'); -- true
-- select has_function_privilege('anon','public.create_order(text,text,text,date,integer,jsonb,uuid,text,text,text,timestamptz)','EXECUTE');          -- false
-- select has_function_privilege('authenticated','public.confirm_order_changes(uuid)','EXECUTE'); -- true
-- select has_function_privilege('anon','public.confirm_order_changes(uuid)','EXECUTE');          -- false
