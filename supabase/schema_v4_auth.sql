-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V4: autenticación con roles (admin / tienda / fabrica)
--
-- Requiere haber corrido schema.sql, schema_v2.sql y schema_v3.sql antes.
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
--
-- CAMBIO IMPORTANTE: antes de este archivo, la app era de acceso abierto
-- (cualquiera con el link veía todo, sin login). Después de este archivo,
-- TODO requiere haber iniciado sesión — se revoca el acceso a `anon`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles: un renglón por usuario de auth.users, con su rol
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'tienda' check (role in ('admin', 'tienda', 'fabrica')),
  created_at  timestamptz not null default now()
);

-- Función auxiliar: el rol del usuario que está haciendo la petición.
-- security definer + el hecho de que esta tabla tiene RLS pero la función
-- la ejecuta el dueño (postgres, que no está sujeto a RLS a menos que se
-- fuerce) es lo que evita la recursión infinita de "para leer profiles
-- necesito una policy que lee profiles".
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Cuando se crea un usuario en auth.users (ver Edge Function
-- admin-create-user), se crea automáticamente su fila en profiles,
-- tomando el rol y nombre de los metadatos con los que se creó.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, ''),
    coalesce(new.raw_user_meta_data->>'role', 'tienda')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un admin puede cambiar el rol/nombre de cualquier usuario. Es la única
-- forma de escribir en profiles desde el cliente (no hay policy directa
-- de update).
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
  if public.current_user_role() <> 'admin' then
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

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant execute on function public.admin_update_user_role(uuid, text, text) to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "Ver el propio perfil" on public.profiles;
create policy "Ver el propio perfil" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "Admin ve todos los perfiles" on public.profiles;
create policy "Admin ve todos los perfiles" on public.profiles
  for select to authenticated
  using (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------
-- 2) orders: columnas nuevas + RPCs con reglas de rol
--
--    Reglas (ver también RLS más abajo):
--    - tienda / admin: crean órdenes.
--    - tienda: puede editar (datos generales y prendas) SOLO mientras la
--      orden sigue en "en_confirmacion". admin: siempre.
--    - fabrica / admin: capturan el tiempo estimado de producción
--      mientras la orden está en "en_confirmacion", confirman la orden
--      (en_confirmacion -> confirmado) y avanzan las demás etapas.
--    - admin: además puede cancelar cualquier orden.
-- ---------------------------------------------------------------------

-- created_by / changed_by ya existían como texto ("preparado para cuando
-- exista auth" — pues ya existe). Se convierten a uuid apuntando a
-- auth.users; como nunca se usaron, todas las filas existentes tienen
-- NULL ahí, así que el cast es seguro.
alter table public.orders alter column created_by type uuid using created_by::uuid;
alter table public.orders add constraint orders_created_by_fkey foreign key (created_by) references auth.users(id);

alter table public.order_status_history alter column changed_by type uuid using changed_by::uuid;
alter table public.order_status_history add constraint order_status_history_changed_by_fkey foreign key (changed_by) references auth.users(id);

alter table public.orders add column if not exists cancelled_at timestamptz;

-- create_order: firma nueva (con p_items) reemplaza la función; hay que
-- tirar explícitamente la versión vieja de 6 parámetros primero porque
-- Postgres trata una firma distinta como una función nueva, no un
-- reemplazo, y las dos firmas coexistiendo causan "function is not
-- unique" al llamarla con argumentos nombrados.
drop function if exists public.create_order(text, text, text, text, date, integer);
drop function if exists public.create_order(text, text, text, text, date, integer, jsonb);

create or replace function public.create_order(
  p_order_number text,
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer,
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

  insert into public.orders (
    order_number, client_name, order_type_key, description,
    requested_delivery_date, estimated_production_days, items, created_by
  ) values (
    p_order_number, p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb), auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;

-- update_order_status: tienda NO puede llamarla (no cambia estados).
-- fabrica/admin sí. No se permite tocar una orden cancelada salvo admin.
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

  if v_role not in ('fabrica', 'admin') then
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

-- Edita los datos generales de una orden (tienda solo si sigue en
-- "en_confirmacion"; admin siempre).
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
  if v_role not in ('tienda', 'admin') then
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

-- set_order_items: mismas reglas que update_order_details (es "editar la
-- orden" — fabrica no toca las prendas, solo el tiempo/etapa).
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
  if v_role not in ('tienda', 'admin') then
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

-- Fábrica captura el tiempo estimado de producción, solo mientras la
-- orden sigue en "en_confirmacion" (admin no tiene esa restricción).
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
  if v_role not in ('fabrica', 'admin') then
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

-- Cancelar / reactivar: exclusivo de admin.
create or replace function public.cancel_order(p_order_id uuid, p_notes text default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Solo un administrador puede cancelar una orden.';
  end if;

  update public.orders
  set cancelled_at = now(), updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, v_order.status, coalesce(p_notes, 'Orden cancelada'), auth.uid());

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
  if public.current_user_role() <> 'admin' then
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

grant execute on function public.create_order(text, text, text, text, date, integer, jsonb) to authenticated;
grant execute on function public.update_order_status(uuid, text, text) to authenticated;
grant execute on function public.update_order_details(uuid, text, text, text, date) to authenticated;
grant execute on function public.set_order_items(uuid, jsonb) to authenticated;
grant execute on function public.set_estimated_production_days(uuid, integer) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.uncancel_order(uuid) to authenticated;

revoke execute on function public.create_order(text, text, text, text, date, integer, jsonb) from anon;
revoke execute on function public.update_order_status(uuid, text, text) from anon;
revoke execute on function public.set_order_items(uuid, jsonb) from anon;
revoke execute on function public.create_order_type(text, text, text) from anon;
revoke execute on function public.add_order_photos(uuid, jsonb) from anon;
revoke execute on function public.remove_order_photo(uuid, text) from anon;
revoke execute on function public.create_announcement(text, text, boolean) from anon;
revoke execute on function public.delete_announcement(uuid) from anon;
revoke execute on function public.create_pending_item(text, text, text) from anon;
revoke execute on function public.update_pending_item_status(uuid, text) from anon;
revoke execute on function public.create_order_template(text, text, text, integer, jsonb, jsonb) from anon;
revoke execute on function public.delete_order_template(uuid) from anon;

-- ---------------------------------------------------------------------
-- 3) RLS: de aquí en adelante TODO requiere sesión iniciada.
--    Se revoca el SELECT de anon en todas las tablas y se reemplazan
--    las policies "using (true)" (abiertas a cualquiera) por
--    "to authenticated using (true)" (abiertas a cualquier rol, pero
--    solo si iniciaste sesión).
-- ---------------------------------------------------------------------
revoke select on public.orders from anon;
revoke select on public.order_status_history from anon;
revoke select on public.order_types from anon;
revoke select on public.order_templates from anon;
revoke select on public.announcements from anon;
revoke select on public.pending_items from anon;

drop policy if exists "Lectura pública orders" on public.orders;
create policy "Usuarios con sesión ven las órdenes" on public.orders
  for select to authenticated using (true);

drop policy if exists "Lectura pública order_status_history" on public.order_status_history;
create policy "Usuarios con sesión ven el historial" on public.order_status_history
  for select to authenticated using (true);

drop policy if exists "Lectura pública order_types" on public.order_types;
create policy "Usuarios con sesión ven los tipos de orden" on public.order_types
  for select to authenticated using (true);

drop policy if exists "Lectura pública order_templates" on public.order_templates;
create policy "Usuarios con sesión ven las plantillas" on public.order_templates
  for select to authenticated using (true);

drop policy if exists "Lectura pública announcements" on public.announcements;
create policy "Usuarios con sesión ven los anuncios" on public.announcements
  for select to authenticated using (true);

drop policy if exists "Lectura pública pending_items" on public.pending_items;
create policy "Usuarios con sesión ven los pendientes" on public.pending_items
  for select to authenticated using (true);

-- Storage (fotos de referencia): subir/borrar requiere sesión; ver una
-- foto sigue siendo por URL pública (el bucket ya es público) para que
-- las imágenes carguen directo en <img src="..."> sin mandar el token.
drop policy if exists "Subida pública order-photos" on storage.objects;
create policy "Subida autenticada order-photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'order-photos');

drop policy if exists "Borrado público order-photos" on storage.objects;
create policy "Borrado autenticado order-photos" on storage.objects
  for delete to authenticated using (bucket_id = 'order-photos');

alter publication supabase_realtime add table public.profiles;
