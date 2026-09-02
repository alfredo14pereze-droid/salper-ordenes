-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V12: catálogos de telas, clientes y productos por cliente
--
-- Todo aditivo — tablas nuevas + una columna nullable (orders.client_id) +
-- un parámetro opcional nuevo al final de create_order. Ninguna orden
-- existente se rompe: el frontend sigue funcionando igual si client_id o
-- las tallas de un item no traen tela_id/tela_nombre.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) telas
-- ---------------------------------------------------------------------
create table if not exists public.telas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (lower(trim(nombre))) stored,
  created_at timestamptz not null default now()
);
create unique index if not exists telas_nombre_normalizado_key on public.telas (nombre_normalizado);

alter table public.telas enable row level security;
drop policy if exists "Lectura pública telas" on public.telas;
create policy "Lectura pública telas" on public.telas for select to anon, authenticated using (true);
grant select on public.telas to anon, authenticated;

-- "Crear o reusar": mismo patrón idempotente que create_order_type — si ya
-- existe una tela con ese nombre (normalizado), regresa la existente en vez
-- de tronar.
create or replace function public.create_tela(p_nombre text) returns public.telas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tela public.telas;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la tela no puede estar vacío.';
  end if;

  insert into public.telas (nombre) values (trim(p_nombre))
  on conflict (nombre_normalizado) do nothing;

  select * into v_tela from public.telas where nombre_normalizado = lower(trim(p_nombre));
  return v_tela;
end;
$$;
revoke execute on function public.create_tela(text) from public;
grant execute on function public.create_tela(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) clientes
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text generated always as (lower(trim(nombre))) stored,
  created_at timestamptz not null default now()
);
create unique index if not exists clientes_nombre_normalizado_key on public.clientes (nombre_normalizado);

alter table public.clientes enable row level security;
drop policy if exists "Lectura pública clientes" on public.clientes;
create policy "Lectura pública clientes" on public.clientes for select to anon, authenticated using (true);
grant select on public.clientes to anon, authenticated;

create or replace function public.create_cliente(p_nombre text) returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del cliente no puede estar vacío.';
  end if;

  insert into public.clientes (nombre) values (trim(p_nombre))
  on conflict (nombre_normalizado) do nothing;

  select * into v_cliente from public.clientes where nombre_normalizado = lower(trim(p_nombre));
  return v_cliente;
end;
$$;
revoke execute on function public.create_cliente(text) from public;
grant execute on function public.create_cliente(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) productos (catálogo de productos por cliente, para autocompletar)
-- ---------------------------------------------------------------------
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  garment text,
  color text,
  pantone text,
  tela_id uuid references public.telas(id) on delete set null,
  foto_url text,
  foto_path text,
  created_at timestamptz not null default now()
);
create index if not exists productos_cliente_idx on public.productos (cliente_id);

alter table public.productos enable row level security;
drop policy if exists "Lectura pública productos" on public.productos;
create policy "Lectura pública productos" on public.productos for select to anon, authenticated using (true);
grant select on public.productos to anon, authenticated;

create or replace function public.create_producto(
  p_cliente_id uuid,
  p_nombre text,
  p_garment text,
  p_color text,
  p_pantone text,
  p_tela_id uuid,
  p_foto_url text,
  p_foto_path text
) returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del producto no puede estar vacío.';
  end if;

  insert into public.productos (cliente_id, nombre, garment, color, pantone, tela_id, foto_url, foto_path)
  values (p_cliente_id, trim(p_nombre), p_garment, p_color, p_pantone, p_tela_id, p_foto_url, p_foto_path)
  returning * into v_producto;

  return v_producto;
end;
$$;
revoke execute on function public.create_producto(uuid, text, text, text, text, uuid, text, text) from public;
grant execute on function public.create_producto(uuid, text, text, text, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4) orders.client_id: opcional, nullable. create_order gana un parámetro
--    nuevo AL FINAL (p_client_id). OJO: esto SÍ cambia la lista de tipos
--    de la función (aunque el parámetro nuevo tenga default), así que a
--    diferencia de solo cambiar el default de un parámetro que ya existía
--    (eso sí lo resuelve CREATE OR REPLACE solo), agregar un parámetro
--    nuevo crea un OVERLOAD aparte si no se tira la versión vieja primero
--    — mismo gotcha de siempre, documentado en SALPER_Contexto.md. Aquí sí
--    hace falta el DROP.
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists client_id uuid references public.clientes(id) on delete set null;

drop function if exists public.create_order(text, text, text, date, integer, jsonb);

create or replace function public.create_order(
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer default null,
  p_items jsonb default '[]'::jsonb,
  p_client_id uuid default null
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
    requested_delivery_date, estimated_production_days, items, client_id, created_by
  ) values (
    p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;
revoke execute on function public.create_order(text, text, text, date, integer, jsonb, uuid) from public;
grant execute on function public.create_order(text, text, text, date, integer, jsonb, uuid) to authenticated;
