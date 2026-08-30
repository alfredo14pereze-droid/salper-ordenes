-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V9: PARCHE DE SEGURIDAD CRÍTICO — cualquier visitante anónimo
-- podía llamar TODAS las funciones que crean/editan/cancelan órdenes,
-- cambian roles de usuario, publican anuncios, etc. Encontrado mientras
-- se preparaba el modo "invitado" (vista pública de solo lectura) —
-- había que arreglar esto antes de exponer la app sin login.
--
-- CAUSA RAÍZ (dos bugs independientes, ambos necesarios para el hueco):
--
-- 1) "revoke execute ... from anon" NO es suficiente. Postgres otorga
--    EXECUTE a PUBLIC automáticamente en cada CREATE FUNCTION (esto es
--    el comportamiento estándar de Postgres, no algo específico de
--    Supabase). PUBLIC es un pseudo-rol del que anon y authenticated
--    heredan — revocar el permiso del rol "anon" específicamente NO
--    quita el permiso heredado de PUBLIC. Cada vez que una función se
--    recreó con una firma distinta (DROP + CREATE, ej. al agregar un
--    parámetro) Postgres le devolvía a PUBLIC (y por lo tanto a anon)
--    acceso de ejecución, sin importar los "revoke ... from anon" de
--    versiones anteriores de este esquema. Verificado en vivo: las 17
--    funciones de escritura tenían has_function_privilege('anon', ...)
--    = true.
--
-- 2) Aunque solo tuviera acceso "authenticated" real, varias funciones
--    revisan el rol así: "if v_role not in ('tienda','admin') then
--    raise exception". En PL/pgSQL, si v_role es NULL (nadie ha iniciado
--    sesión, o current_user_role() no encontró perfil), la expresión
--    "NULL not in (...)" da NULL, y un IF con NULL se trata como FALSE
--    — o sea NO se lanza la excepción y la función sigue de largo.
--    Confirmado en vivo: llamar update_order_details sin sesión no dio
--    "no tienes permiso", dio "orden no encontrada" (pasó de largo el
--    check de rol).
--
-- Juntos: cualquiera con la anon key pública (que va incluida en el
-- bundle del sitio, no es secreta) podía crear/editar/cancelar órdenes,
-- cambiar el rol de cualquier usuario a admin, publicar/borrar
-- anuncios y pendientes, y subir/borrar fotos — sin haber iniciado
-- sesión nunca.
--
-- FIX: para cada función de escritura, (a) revoke execute FROM PUBLIC
-- explícitamente (no solo "from anon") + grant a authenticated, y
-- (b) donde había chequeo de rol, se envuelve con coalesce(...,'') para
-- que NULL nunca se cuele como "aprobado".
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funciones con chequeo de rol: se recrean con la condición a prueba
--    de NULL. Misma firma que la versión actual en cada caso (no hace
--    falta DROP).
-- ---------------------------------------------------------------------

create or replace function public.admin_update_user_role(
  p_user_id uuid,
  p_role text,
  p_full_name text default null
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'Solo un administrador puede cambiar roles de usuario.';
  end if;
  if p_role not in ('admin', 'tienda', 'fabrica') then
    raise exception 'Rol inválido: %', p_role;
  end if;

  update public.profiles
  set role = p_role,
      full_name = coalesce(p_full_name, full_name)
  where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Usuario % no encontrado', p_user_id;
  end if;

  return v_profile;
end;
$$;

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
  if coalesce(public.current_user_role(), '') not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;

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

create or replace function public.update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text default null
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_cancelled_at timestamptz;
begin
  if p_new_status not in (
    'en_confirmacion', 'confirmado', 'cortado', 'sublimado', 'en_produccion', 'completado'
  ) then
    raise exception 'Estado inválido: %', p_new_status;
  end if;

  if coalesce(v_role, '') not in ('fabrica', 'admin') then
    raise exception 'Solo fábrica o administrador pueden cambiar el estado de una orden.';
  end if;

  select cancelled_at into v_cancelled_at from public.orders where id = p_order_id;
  if v_cancelled_at is not null and v_role <> 'admin' then
    raise exception 'Esta orden está cancelada.';
  end if;

  update public.orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, p_new_status, p_notes, auth.uid());

  return v_order;
end;
$$;

create or replace function public.update_order_details(
  p_order_id uuid,
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date
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
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  if v_role = 'tienda' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se puede editar.';
  end if;

  update public.orders
  set client_name = p_client_name,
      order_type_key = p_order_type_key,
      description = p_description,
      requested_delivery_date = p_requested_delivery_date,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.set_order_items(
  p_order_id uuid,
  p_items jsonb
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
  if coalesce(v_role, '') not in ('tienda', 'admin') then
    raise exception 'No tienes permiso para editar las prendas de esta orden.';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  if v_role = 'tienda' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus prendas.';
  end if;

  update public.orders
  set items = coalesce(p_items, '[]'::jsonb),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.set_estimated_production_days(
  p_order_id uuid,
  p_days integer
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
  if coalesce(v_role, '') not in ('fabrica', 'admin') then
    raise exception 'Solo fábrica o administrador pueden capturar el tiempo estimado de producción.';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'El tiempo estimado debe ser de al menos 1 día.';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  if v_role = 'fabrica' and v_current_status <> 'en_confirmacion' then
    raise exception 'Solo se puede capturar el tiempo estimado mientras la orden está en confirmación.';
  end if;

  update public.orders
  set estimated_production_days = p_days, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_notes text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'Solo un administrador puede cancelar una orden.';
  end if;

  update public.orders
  set cancelled_at = now(), updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  return v_order;
end;
$$;

create or replace function public.uncancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'Solo un administrador puede reactivar una orden cancelada.';
  end if;

  update public.orders
  set cancelled_at = null, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Todas las funciones de escritura: revoke de PUBLIC (no solo anon)
--    + grant explícito a authenticated. Esto es lo que de verdad cierra
--    el hueco — sin esto, aunque el código de arriba ya no tenga el bug
--    de NULL, seguiría siendo ejecutable por cualquiera.
-- ---------------------------------------------------------------------

revoke execute on function public.admin_update_user_role(uuid, text, text) from public;
grant execute on function public.admin_update_user_role(uuid, text, text) to authenticated;

revoke execute on function public.create_order(text, text, text, date, integer, jsonb) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb) to authenticated;

revoke execute on function public.update_order_status(uuid, text, text) from public;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;

revoke execute on function public.update_order_details(uuid, text, text, text, date) from public;
grant execute on function public.update_order_details(uuid, text, text, text, date) to authenticated;

revoke execute on function public.set_order_items(uuid, jsonb) from public;
grant execute on function public.set_order_items(uuid, jsonb) to authenticated;

revoke execute on function public.set_estimated_production_days(uuid, integer) from public;
grant execute on function public.set_estimated_production_days(uuid, integer) to authenticated;

revoke execute on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;

revoke execute on function public.uncancel_order(uuid) from public;
grant execute on function public.uncancel_order(uuid) to authenticated;

revoke execute on function public.create_order_type(text, text, text, text) from public;
grant execute on function public.create_order_type(text, text, text, text) to authenticated;

revoke execute on function public.add_order_photos(uuid, jsonb) from public;
grant execute on function public.add_order_photos(uuid, jsonb) to authenticated;

revoke execute on function public.remove_order_photo(uuid, text) from public;
grant execute on function public.remove_order_photo(uuid, text) to authenticated;

revoke execute on function public.create_announcement(text, text, boolean) from public;
grant execute on function public.create_announcement(text, text, boolean) to authenticated;

revoke execute on function public.delete_announcement(uuid) from public;
grant execute on function public.delete_announcement(uuid) to authenticated;

revoke execute on function public.create_pending_item(text, text, text) from public;
grant execute on function public.create_pending_item(text, text, text) to authenticated;

revoke execute on function public.update_pending_item_status(uuid, text) from public;
grant execute on function public.update_pending_item_status(uuid, text) to authenticated;

revoke execute on function public.create_order_template(text, text, text, integer, jsonb, jsonb) from public;
grant execute on function public.create_order_template(text, text, text, integer, jsonb, jsonb) to authenticated;

revoke execute on function public.delete_order_template(uuid) from public;
grant execute on function public.delete_order_template(uuid) to authenticated;
