-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V30: teléfono/correo de cliente al crear una orden + 2 roles
-- nuevos ('lectura' de solo lectura total, 'tienda' con acceso mínimo).
--
-- =====================================================================
-- PARTE 1 — Teléfono y correo del cliente
-- =====================================================================
-- Aditivo: 2 columnas nullable en `clientes` (para reusar la próxima
-- vez que ese cliente haga un pedido) + 2 columnas nullable en `orders`
-- (snapshot de lo que se usó en ESA orden en particular — mismo criterio
-- que ya existe para client_name/client_id: el catálogo puede cambiar
-- después sin romper órdenes viejas).
--
-- create_cliente gana 2 parámetros opcionales al final: si el cliente ya
-- existe (mismo nombre normalizado), actualiza su teléfono/correo SOLO
-- si se mandó un valor no vacío (nunca borra un dato ya guardado por
-- dejar el campo en blanco en una orden nueva).
--
-- create_order gana los mismos 2 parámetros: guarda el snapshot en la
-- orden, y si la orden trae client_id (cliente del catálogo), también
-- actualiza clientes.telefono/correo — así la próxima orden de ese mismo
-- cliente ya viene prellenada. Todo en una sola función/transacción, sin
-- ida y vuelta extra del frontend.
--
-- update_order_details gana los mismos 2 parámetros para poder editarlos
-- después de creada la orden (mismo patrón que client_name ahí: solo
-- toca la orden, no el catálogo).
--
-- OJO — mismo gotcha documentado en schema_v12_catalogos.sql: agregar un
-- parámetro nuevo (aunque tenga default) SÍ cambia la lista de tipos de
-- la función, así que crea un OVERLOAD aparte si no se tira la versión
-- vieja primero — un CREATE OR REPLACE con una firma distinta no la
-- reemplaza in-place. Por eso los 3 DROP FUNCTION de abajo antes de cada
-- redefinición, y el REVOKE/GRANT explícito después de cada una (una
-- función nueva no hereda los permisos de la que reemplazó — y por
-- default de Supabase, una función nueva en `public` nace abierta a
-- `anon`/`authenticated`, así que sin este REVOKE quedaría más abierta
-- de lo que debería). Se encontró y corrigió en vivo antes de dar por
-- terminado esto — verificado con has_function_privilege que solo queda
-- una versión de cada función y que anon no puede ejecutarlas.
-- =====================================================================

alter table public.clientes
  add column if not exists telefono text,
  add column if not exists correo text;

alter table public.orders
  add column if not exists client_telefono text,
  add column if not exists client_correo text;

drop function if exists public.create_cliente(text);

create or replace function public.create_cliente(p_nombre text, p_telefono text default null, p_correo text default null)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_telefono text := nullif(trim(coalesce(p_telefono, '')), '');
  v_correo text := nullif(trim(coalesce(p_correo, '')), '');
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del cliente no puede estar vacío.';
  end if;

  insert into public.clientes (nombre, telefono, correo)
  values (trim(p_nombre), v_telefono, v_correo)
  on conflict (nombre_normalizado) do update set
    telefono = coalesce(v_telefono, public.clientes.telefono),
    correo = coalesce(v_correo, public.clientes.correo);

  select * into v_cliente from public.clientes where nombre_normalizado = lower(trim(p_nombre));
  return v_cliente;
end;
$$;
revoke execute on function public.create_cliente(text, text, text) from public;
grant execute on function public.create_cliente(text, text, text) to authenticated;

drop function if exists public.create_order(text, text, text, date, integer, jsonb, uuid);

create or replace function public.create_order(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_estimated_production_days integer default null, p_items jsonb default '[]'::jsonb, p_client_id uuid default null,
  p_client_telefono text default null, p_client_correo text default null
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
    estimated_production_days, items, client_id, client_telefono, client_correo, created_by
  ) values (
    p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
    p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, v_telefono, v_correo, auth.uid()
  ) returning * into v_order;

  -- Si el cliente viene del catálogo y se dio teléfono/correo, se guarda
  -- también ahí para la próxima vez (solo si no vino vacío).
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
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb, uuid, text, text) to authenticated;

drop function if exists public.update_order_details(uuid, text, text, text, date);

create or replace function public.update_order_details(
  p_order_id uuid, p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_client_telefono text default null, p_client_correo text default null
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
    updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
revoke execute on function public.update_order_details(uuid, text, text, text, date, text, text) from public;
grant execute on function public.update_order_details(uuid, text, text, text, date, text, text) to authenticated;

-- =====================================================================
-- PARTE 2 — Roles 'lectura' (solo lectura total) y 'tienda' (mínimo)
-- =====================================================================
-- current_user_role() ya es agnóstico al nombre del rol — no necesita
-- ningún cambio. Los roles nuevos entran solos con valor cero en TODAS
-- las funciones que ya usan allowlist (update_order_status, cancel_order,
-- set_order_document, anticipos, etc.) porque 'lectura'/'tienda' nunca
-- aparecen en esas listas.
--
-- Las únicas 4 funciones de escritura que hasta V29 NO tenían ningún
-- candado de rol (abiertas a cualquier cuenta con sesión, sin distinción)
-- son estas — se les agrega un bloqueo específico para los 2 roles
-- nuevos, dejando a TODOS los demás roles exactamente igual que antes:
--   - create_announcement / delete_announcement
--   - add_order_photos / remove_order_photo
--   - update_pending_item_status (create_pending_item se deja abierta,
--     es la única escritura que sí tiene 'tienda' — solo se le cierra a
--     'lectura').
-- =====================================================================

create or replace function public.create_announcement(
  p_title text, p_body text, p_pinned boolean default false
) returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement public.announcements;
begin
  if coalesce(public.current_user_role(), '') in ('lectura', 'tienda') then
    raise exception 'No tienes permiso para publicar anuncios.';
  end if;
  insert into public.announcements (title, body, pinned)
  values (p_title, p_body, coalesce(p_pinned, false))
  returning * into v_announcement;
  return v_announcement;
end;
$$;

create or replace function public.delete_announcement(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.current_user_role(), '') in ('lectura', 'tienda') then
    raise exception 'No tienes permiso para borrar anuncios.';
  end if;
  delete from public.announcements where id = p_id;
end;
$$;

create or replace function public.add_order_photos(
  p_order_id uuid, p_photos jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') in ('lectura', 'tienda') then
    raise exception 'No tienes permiso para subir fotos a esta orden.';
  end if;
  update public.orders
  set reference_photos = coalesce(reference_photos, '[]'::jsonb) || p_photos,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$$;

create or replace function public.remove_order_photo(
  p_order_id uuid, p_photo_path text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') in ('lectura', 'tienda') then
    raise exception 'No tienes permiso para borrar fotos de esta orden.';
  end if;
  update public.orders
  set reference_photos = (
        select coalesce(jsonb_agg(photo), '[]'::jsonb)
        from jsonb_array_elements(reference_photos) as photo
        where photo->>'path' <> p_photo_path
      ),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$$;

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
  if coalesce(public.current_user_role(), '') in ('lectura', 'tienda') then
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

create or replace function public.create_pending_item(
  p_title text, p_description text, p_category text,
  p_garment text default null, p_talla text default null, p_cantidad integer default null,
  p_foto_url text default null, p_foto_path text default null, p_inventariado boolean default null
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
  -- 'tienda' SÍ puede — es la única escritura que tiene en todo el
  -- sistema. Solo se bloquea 'lectura'.
  if coalesce(public.current_user_role(), '') = 'lectura' then
    raise exception 'No tienes permiso para agregar pendientes.';
  end if;
  insert into public.pending_items (title, description, category, garment, talla, cantidad, foto_url, foto_path, inventariado)
  values (p_title, p_description, p_category, p_garment, p_talla, p_cantidad, p_foto_url, p_foto_path, p_inventariado)
  returning * into v_item;
  return v_item;
end;
$$;

-- Verificación sugerida después de aplicar:
-- select conname, pg_get_function_identity_arguments(oid)
-- from pg_proc where proname = 'create_order';
-- (debe traer los 2 parámetros nuevos al final)
