-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema inicial (V1)
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase (https://app.supabase.com → tu proyecto → SQL Editor)
-- y ejecútalo una sola vez. Es seguro volver a correrlo (usa IF NOT EXISTS
-- y ON CONFLICT donde aplica).
-- =====================================================================

create extension if not exists pgcrypto; -- necesario para gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1) order_types: catálogo de tipos de orden (extensible)
--    V1 trae sublimación / escolar / industrial, pero está pensado para
--    poder agregar más tipos sin tocar código (ni siquiera este esquema):
--    el formulario de "Nueva orden" permite crear un tipo nuevo al vuelo.
-- ---------------------------------------------------------------------
create table if not exists public.order_types (
  key         text primary key,          -- slug interno, ej. 'sublimacion'
  label       text not null,             -- nombre visible, ej. 'Sublimación'
  color       text not null default '#64748b', -- color para badges/calendario
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.order_types (key, label, color, sort_order) values
  ('sublimacion', 'Sublimación', '#0ea5e9', 1),
  ('escolar',     'Escolar',     '#8b5cf6', 2),
  ('industrial',  'Industrial',  '#f59e0b', 3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2) orders: la orden de producción en sí
--
--    Campos "preparados para después" (no usados por la UI de V1 todavía):
--      - reference_photos: arreglo jsonb de {url, caption}. Cuando se
--        implemente la subida de fotos, solo hay que llenar este campo
--        y agregar el componente de UI; no requiere migración.
--      - share_token: uuid único por orden, listo para generar en el
--        futuro un link compartible tipo /orden/compartida/<share_token>
--        sin necesitar login.
--      - created_by: para cuando exista auth, aquí se guarda el usuario
--        que creó la orden.
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  order_number                text not null unique,
  client_name                 text not null,
  order_type_key              text not null references public.order_types(key),
  description                 text,
  requested_delivery_date     date not null,
  estimated_production_days   integer not null default 1 check (estimated_production_days > 0),
  status                      text not null default 'en_confirmacion'
                                check (status in (
                                  'en_confirmacion', 'confirmado', 'cortado',
                                  'sublimado', 'en_produccion', 'completado'
                                )),
  reference_photos            jsonb not null default '[]'::jsonb, -- preparado, no usado aún
  share_token                 uuid not null default gen_random_uuid(),  -- preparado, no usado aún
  created_by                  text,                                     -- preparado, no usado aún
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_delivery_date_idx on public.orders (requested_delivery_date);
create index if not exists orders_type_idx on public.orders (order_type_key);

-- ---------------------------------------------------------------------
-- 3) order_status_history: historial de cambios de estado
--    Cada vez que una orden cambia de estado se agrega un registro aquí
--    (vía la función update_order_status, más abajo). Esto es la base
--    para el historial/timeline que se pide en el detalle de la orden.
-- ---------------------------------------------------------------------
create table if not exists public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      text not null,
  changed_at  timestamptz not null default now(),
  changed_by  text,   -- preparado para cuando exista auth (quién hizo el cambio)
  notes       text
);

create index if not exists order_status_history_order_idx on public.order_status_history (order_id);

-- ---------------------------------------------------------------------
-- 4) Funciones RPC
--
--    En vez de dejar que el cliente (navegador) escriba directo en las
--    tablas orders / order_status_history, todas las escrituras pasan
--    por estas funciones "security definer". Ventajas:
--      - crear una orden y su primer registro de historial es atómico
--        (una sola llamada, una sola transacción).
--      - cambiar de estado y registrar el historial también es atómico.
--      - deja la puerta más cerrada de cara a cuando se agregue auth:
--        solo hay que empezar a validar el rol del usuario dentro de
--        estas funciones, sin tener que rediseñar el resto.
-- ---------------------------------------------------------------------

create or replace function public.create_order(
  p_order_number text,
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  insert into public.orders (
    order_number, client_name, order_type_key, description,
    requested_delivery_date, estimated_production_days
  ) values (
    p_order_number, p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes)
  values (v_order.id, v_order.status, 'Orden creada');

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
begin
  if p_new_status not in (
    'en_confirmacion', 'confirmado', 'cortado', 'sublimado', 'en_produccion', 'completado'
  ) then
    raise exception 'Estado inválido: %', p_new_status;
  end if;

  update public.orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes)
  values (p_order_id, p_new_status, p_notes);

  return v_order;
end;
$$;

create or replace function public.create_order_type(
  p_key text,
  p_label text,
  p_color text default '#64748b'
) returns public.order_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.order_types;
begin
  insert into public.order_types (key, label, color, sort_order)
  values (p_key, p_label, p_color, (select coalesce(max(sort_order), 0) + 1 from public.order_types))
  on conflict (key) do update set active = true, label = excluded.label
  returning * into v_type;

  return v_type;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Row Level Security
--
--    V1 no tiene login todavía, así que la lectura queda abierta a
--    quien tenga la anon key (necesario para que "varias personas
--    sepan en qué va cada orden sin preguntar"). Las escrituras NO
--    tienen policy de INSERT/UPDATE directo: solo se puede escribir
--    a través de las funciones RPC de arriba.
--
--    TODO (cuando se agregue auth / roles admin-produccion-consulta):
--    reemplazar las policies de "select using (true)" por policies que
--    revisen auth.uid() / el rol del usuario, y restringir también
--    quién puede ejecutar cada función RPC.
-- ---------------------------------------------------------------------
-- Nota: crear las tablas por SQL Editor no les da automáticamente permiso
-- de lectura a los roles anon/authenticated (a diferencia de tablas creadas
-- desde el Table Editor). Sin este GRANT, las policies de "select using (true)"
-- de abajo nunca se evalúan y el cliente recibe "permission denied for table X".
grant usage on schema public to anon, authenticated;
grant select on public.order_types, public.orders, public.order_status_history to anon, authenticated;

alter table public.order_types enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists "Lectura pública order_types" on public.order_types;
create policy "Lectura pública order_types" on public.order_types
  for select using (true);

drop policy if exists "Lectura pública orders" on public.orders;
create policy "Lectura pública orders" on public.orders
  for select using (true);

drop policy if exists "Lectura pública order_status_history" on public.order_status_history;
create policy "Lectura pública order_status_history" on public.order_status_history
  for select using (true);

grant execute on function public.create_order(text, text, text, text, date, integer) to anon, authenticated;
grant execute on function public.update_order_status(uuid, text, text) to anon, authenticated;
grant execute on function public.create_order_type(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Realtime
--    Habilita que el frontend reciba cambios en vivo (para que el
--    dashboard se actualice solo cuando alguien más mueve una orden).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_status_history;

-- =====================================================================
-- Preparado para más adelante (NO implementado en V1, solo referencia):
--
-- Roles y permisos (admin / produccion / consulta):
--   create table public.profiles (
--     id uuid primary key references auth.users(id) on delete cascade,
--     role text not null default 'consulta' check (role in ('admin','produccion','consulta')),
--     full_name text
--   );
--
-- Notificaciones:
--   create table public.notifications (
--     id uuid primary key default gen_random_uuid(),
--     order_id uuid references public.orders(id) on delete cascade,
--     channel text, -- 'email' | 'whatsapp' | etc.
--     sent_at timestamptz,
--     payload jsonb
--   );
--
-- Links compartibles: ya existe orders.share_token; cuando se implemente,
-- basta con crear una policy de "select using (true)" filtrando por
-- share_token en una vista pública, o una función RPC de solo lectura.
-- =====================================================================
