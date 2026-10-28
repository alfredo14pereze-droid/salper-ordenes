-- =====================================================================
-- V158 — Notas de tienda (2026-10-28)
-- =====================================================================
-- Sección nueva para el personal de tienda: dejar notas de producto
-- faltante, notas del día, errores u otras cosas. Decisiones de Alfredo:
--   · Ven y escriben: todo el personal de tienda (ventas, contabilidad,
--     tienda, admin_tienda) y admin_general. Fábrica no la ve.
--     consulta_tienda y lectura solo leen.
--   · 4 tipos fijos: faltante, dia, error, otro.
--   · Admin de tienda y admin general marcan "Resuelto" (y pueden
--     reabrir). Las resueltas se ocultan, pero quedan en el historial.
--   · Una foto opcional por nota (bucket público nt-fotos, como Talleros).
--
-- Los permisos viven en rol_permisos (V125), así que se pueden ajustar
-- desde "Roles y permisos" sin tocar código:
--   nt.ver       Ver notas de tienda
--   nt.escribir  Escribir notas (y subir su foto)
--   nt.resolver  Marcar como resuelta / reabrir
--
-- Aditivo: 1 tabla nueva, 3 permisos nuevos, 2 funciones nuevas, 1 bucket.
-- No toca nada existente. Se puede correr dos veces sin duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------
create table if not exists public.nt_notas (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null check (tipo in ('faltante', 'dia', 'error', 'otro')),
  texto               text not null check (btrim(texto) <> ''),
  foto_path           text,
  foto_url            text,
  creado_por          uuid default auth.uid(),
  creado_por_nombre   text,
  creado_en           timestamptz not null default now(),
  resuelta_en         timestamptz,
  resuelta_por        uuid,
  resuelta_por_nombre text
);
create index if not exists nt_notas_creado_idx on public.nt_notas (creado_en desc);
create index if not exists nt_notas_pendientes_idx on public.nt_notas (creado_en desc) where resuelta_en is null;

alter table public.nt_notas enable row level security;

drop policy if exists "Lectura notas de tienda" on public.nt_notas;
create policy "Lectura notas de tienda" on public.nt_notas
  for select to authenticated using (public.tiene_permiso('nt.ver'));

-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.nt_notas from public, anon, authenticated;
grant select on public.nt_notas to authenticated;

-- ---------------------------------------------------------------------
-- 2) Permisos (editables en "Roles y permisos")
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('nt.ver',      'Notas de tienda', 'Ver notas de tienda',       'Entrar a Notas de tienda y leer las notas.',                        'ver',    50),
  ('nt.escribir', 'Notas de tienda', 'Escribir notas',            'Dejar notas nuevas (faltantes, del día, errores…) con foto.',       'editar', 51),
  ('nt.resolver', 'Notas de tienda', 'Marcar notas como resueltas', 'Marcar una nota como resuelta o volver a abrirla.',               'editar', 52)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('nt.ver',      array['ventas','contabilidad','tienda','admin_tienda','admin_general','consulta_tienda','lectura']),
  ('nt.escribir', array['ventas','contabilidad','tienda','admin_tienda','admin_general']),
  ('nt.resolver', array['admin_tienda','admin_general'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) Funciones
-- ---------------------------------------------------------------------
create or replace function public.nt_crear_nota(
  p_tipo text, p_texto text, p_foto_path text default null, p_foto_url text default null
) returns public.nt_notas
language plpgsql security definer set search_path = public as $$
declare v_row public.nt_notas;
begin
  if not public.tiene_permiso('nt.escribir') then
    raise exception 'No tienes permiso para escribir notas de tienda.';
  end if;
  if coalesce(p_tipo, '') not in ('faltante', 'dia', 'error', 'otro') then
    raise exception 'Elige el tipo de nota.';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'Escribe la nota.';
  end if;

  insert into public.nt_notas (tipo, texto, foto_path, foto_url, creado_por, creado_por_nombre)
  values (
    p_tipo,
    btrim(p_texto),
    nullif(p_foto_path, ''),
    nullif(p_foto_url, ''),
    auth.uid(),
    (select full_name from public.profiles where id = auth.uid())
  )
  returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.nt_crear_nota(text, text, text, text) from public;
grant execute on function public.nt_crear_nota(text, text, text, text) to authenticated;

-- p_resuelta = true marca resuelta; false la vuelve a abrir.
create or replace function public.nt_resolver_nota(p_id uuid, p_resuelta boolean)
returns public.nt_notas
language plpgsql security definer set search_path = public as $$
declare v_row public.nt_notas;
begin
  if not public.tiene_permiso('nt.resolver') then
    raise exception 'No tienes permiso para resolver notas de tienda.';
  end if;

  update public.nt_notas set
    resuelta_en         = case when p_resuelta then now() else null end,
    resuelta_por        = case when p_resuelta then auth.uid() else null end,
    resuelta_por_nombre = case when p_resuelta then (select full_name from public.profiles where id = auth.uid()) else null end
  where id = p_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Nota no encontrada.'; end if;
  return v_row;
end; $$;
revoke execute on function public.nt_resolver_nota(uuid, boolean) from public;
grant execute on function public.nt_resolver_nota(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Fotos: bucket público (como mt-fotos); sube quien puede escribir notas
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('nt-fotos', 'nt-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Lectura pública nt-fotos" on storage.objects;
create policy "Lectura pública nt-fotos" on storage.objects
  for select using (bucket_id = 'nt-fotos');

drop policy if exists "Subida notas nt-fotos" on storage.objects;
create policy "Subida notas nt-fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nt-fotos' and public.tiene_permiso('nt.escribir'));
