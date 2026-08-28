-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V3: prendas (tallas/cantidades/color/pantone) y plantillas
--
-- Requiere haber corrido schema.sql y schema_v2.sql primero.
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) orders.items: prendas de la orden
--    Cada elemento del arreglo: { garment, color, pantone, sizes: [{talla, cantidad}] }
--    pantone solo se usa si el tipo de orden es sublimación (regla de UI,
--    no se valida aquí porque el tipo puede cambiar independientemente).
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;

-- create_order ahora acepta también los items iniciales de la orden.
-- Hay que tirar la versión vieja (6 parámetros) primero: Postgres trata
-- una firma distinta como una función nueva, no como un reemplazo, y las
-- dos firmas coexistiendo causan "function is not unique" al llamarla
-- con argumentos nombrados.
drop function if exists public.create_order(text, text, text, text, date, integer);

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
  insert into public.orders (
    order_number, client_name, order_type_key, description,
    requested_delivery_date, estimated_production_days, items
  ) values (
    p_order_number, p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb)
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes)
  values (v_order.id, v_order.status, 'Orden creada');

  return v_order;
end;
$$;

-- Reemplaza por completo el arreglo de prendas de una orden (edición desde
-- el detalle: agregar/quitar prendas, cambiar tallas, etc.)
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
begin
  update public.orders
  set items = coalesce(p_items, '[]'::jsonb),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  return v_order;
end;
$$;

grant execute on function public.create_order(text, text, text, text, date, integer, jsonb) to anon, authenticated;
grant execute on function public.set_order_items(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Plantillas de orden (para pedidos habituales, ej. "Polo Colegio X")
--    Guardan tipo, descripción, días estimados, prendas y fotos por
--    default, para prellenar el formulario de Nueva Orden de un clic.
-- ---------------------------------------------------------------------
create table if not exists public.order_templates (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  order_type_key              text not null references public.order_types(key),
  description                 text,
  estimated_production_days   integer not null default 1,
  items                       jsonb not null default '[]'::jsonb,
  reference_photos            jsonb not null default '[]'::jsonb,
  created_at                  timestamptz not null default now()
);

create index if not exists order_templates_type_idx on public.order_templates (order_type_key);

create or replace function public.create_order_template(
  p_name text,
  p_order_type_key text,
  p_description text,
  p_estimated_production_days integer,
  p_items jsonb default '[]'::jsonb,
  p_reference_photos jsonb default '[]'::jsonb
) returns public.order_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.order_templates;
begin
  insert into public.order_templates (
    name, order_type_key, description, estimated_production_days, items, reference_photos
  ) values (
    p_name, p_order_type_key, p_description, coalesce(p_estimated_production_days, 1),
    coalesce(p_items, '[]'::jsonb), coalesce(p_reference_photos, '[]'::jsonb)
  )
  returning * into v_template;

  return v_template;
end;
$$;

create or replace function public.delete_order_template(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.order_templates where id = p_id;
end;
$$;

grant select on public.order_templates to anon, authenticated;
alter table public.order_templates enable row level security;

drop policy if exists "Lectura pública order_templates" on public.order_templates;
create policy "Lectura pública order_templates" on public.order_templates
  for select using (true);

grant execute on function public.create_order_template(text, text, text, integer, jsonb, jsonb) to anon, authenticated;
grant execute on function public.delete_order_template(uuid) to anon, authenticated;
