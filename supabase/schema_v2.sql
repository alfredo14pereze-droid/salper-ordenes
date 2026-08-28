-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V2: fotos de referencia, anuncios internos, pendientes
--
-- Requiere haber corrido supabase/schema.sql primero.
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez. Es seguro volver a
-- correrlo (usa IF NOT EXISTS y ON CONFLICT donde aplica).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fotos de referencia (Supabase Storage)
--    orders.reference_photos (jsonb) ya existía desde V1 como campo
--    preparado; aquí se agrega el bucket donde viven los archivos y las
--    funciones para escribir el arreglo de fotos de una orden.
--    Cada elemento del arreglo tiene la forma: {"url": "...", "path": "...", "name": "..."}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do nothing;

drop policy if exists "Lectura pública order-photos" on storage.objects;
create policy "Lectura pública order-photos" on storage.objects
  for select using (bucket_id = 'order-photos');

drop policy if exists "Subida pública order-photos" on storage.objects;
create policy "Subida pública order-photos" on storage.objects
  for insert with check (bucket_id = 'order-photos');

drop policy if exists "Borrado público order-photos" on storage.objects;
create policy "Borrado público order-photos" on storage.objects
  for delete using (bucket_id = 'order-photos');

create or replace function public.add_order_photos(
  p_order_id uuid,
  p_photos jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
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
  p_order_id uuid,
  p_photo_path text
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
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

grant execute on function public.add_order_photos(uuid, jsonb) to anon, authenticated;
grant execute on function public.remove_order_photo(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Anuncios internos
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  pinned      boolean not null default false,
  created_by  text,   -- preparado para cuando exista auth
  created_at  timestamptz not null default now()
);

create index if not exists announcements_created_at_idx on public.announcements (created_at desc);

create or replace function public.create_announcement(
  p_title text,
  p_body text,
  p_pinned boolean default false
) returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement public.announcements;
begin
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
  delete from public.announcements where id = p_id;
end;
$$;

grant select on public.announcements to anon, authenticated;
alter table public.announcements enable row level security;

drop policy if exists "Lectura pública announcements" on public.announcements;
create policy "Lectura pública announcements" on public.announcements
  for select using (true);

grant execute on function public.create_announcement(text, text, boolean) to anon, authenticated;
grant execute on function public.delete_announcement(uuid) to anon, authenticated;

alter publication supabase_realtime add table public.announcements;

-- ---------------------------------------------------------------------
-- 3) Pendientes (cosas fuera del flujo de órdenes: reparaciones externas,
--    trámites, compras, etc. — no tienen etapas de producción)
-- ---------------------------------------------------------------------
create table if not exists public.pending_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text,   -- texto libre, ej. 'Reparación', 'Compra', 'Trámite'
  status        text not null default 'pendiente' check (status in ('pendiente', 'resuelto')),
  created_by    text,   -- preparado para cuando exista auth
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists pending_items_status_idx on public.pending_items (status);

create or replace function public.create_pending_item(
  p_title text,
  p_description text,
  p_category text
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
  insert into public.pending_items (title, description, category)
  values (p_title, p_description, p_category)
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.update_pending_item_status(
  p_id uuid,
  p_status text
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
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

grant select on public.pending_items to anon, authenticated;
alter table public.pending_items enable row level security;

drop policy if exists "Lectura pública pending_items" on public.pending_items;
create policy "Lectura pública pending_items" on public.pending_items
  for select using (true);

grant execute on function public.create_pending_item(text, text, text) to anon, authenticated;
grant execute on function public.update_pending_item_status(uuid, text) to anon, authenticated;

alter publication supabase_realtime add table public.pending_items;
