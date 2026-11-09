-- =====================================================================
-- V196 — Manuales (2026-11-09)
-- =====================================================================
-- Módulo "Manuales" en el menú: cómo se hace cada proceso.
-- Dos niveles: Sección (ej. "Frisa") → Manual (ej. "Cómo surtir una orden").
-- El contenido de cada manual es texto en markdown.
--
-- Quién puede qué:
--   · Leer: cualquier usuario con sesión (todos los roles).
--   · Crear / editar / eliminar / reordenar: permiso nuevo `man.editar`,
--     que se le da solo a admin_general ("super_admin" del pedido). Se puede
--     cambiar después en "Roles y permisos" sin tocar código.
--
-- Igual que el resto del sistema: sin políticas de escritura para el
-- cliente; todo cambio pasa por las funciones man_* (security definer),
-- que revisan el permiso.
--
-- Eliminar = soft-delete (`eliminado_en`), en manuales y en secciones.
-- Una sección solo se puede eliminar si ya no tiene manuales.
--
-- Aditivo: 2 tablas, 1 permiso, 5 funciones nuevas. No toca nada existente.
-- Se puede correr dos veces sin duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permiso
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('man.editar', 'Manuales', 'Editar manuales',
   'Crear, editar, eliminar y reordenar secciones y manuales. Leer los manuales lo puede cualquiera con sesión.',
   'editar', 70)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave) values ('admin_general', 'man.editar')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.manual_secciones (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (btrim(nombre) <> ''),
  descripcion    text,
  icono          text,                       -- opcional: un emoji
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);
create unique index if not exists manual_secciones_nombre_uq
  on public.manual_secciones (lower(btrim(nombre))) where eliminado_en is null;

create table if not exists public.manuales (
  id                     uuid primary key default gen_random_uuid(),
  seccion_id             uuid not null references public.manual_secciones(id),
  titulo                 text not null check (btrim(titulo) <> ''),
  contenido              text not null default '',   -- markdown
  orden                  integer not null default 0,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid,
  actualizado_por_nombre text,
  eliminado_en           timestamptz
);
create index if not exists manuales_seccion_idx
  on public.manuales (seccion_id, orden) where eliminado_en is null;

alter table public.manual_secciones enable row level security;
alter table public.manuales enable row level security;

drop policy if exists "Lectura secciones de manuales" on public.manual_secciones;
create policy "Lectura secciones de manuales" on public.manual_secciones
  for select to authenticated using (eliminado_en is null);

drop policy if exists "Lectura manuales" on public.manuales;
create policy "Lectura manuales" on public.manuales
  for select to authenticated using (
    eliminado_en is null
    and exists (select 1 from public.manual_secciones s where s.id = seccion_id and s.eliminado_en is null)
  );

revoke all on public.manual_secciones, public.manuales from public, anon, authenticated;
grant select on public.manual_secciones, public.manuales to authenticated;

-- ---------------------------------------------------------------------
-- 3) Funciones (solo con man.editar)
-- ---------------------------------------------------------------------

-- Crear (p_id null) o editar una sección. Las nuevas quedan al final.
create or replace function public.man_guardar_seccion(
  p_id uuid, p_nombre text, p_descripcion text default null, p_icono text default null
) returns public.manual_secciones
language plpgsql security definer set search_path = public as $$
declare v_row public.manual_secciones;
begin
  if not public.tiene_permiso('man.editar') then
    raise exception 'No tienes permiso para editar manuales.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre de la sección.';
  end if;
  if exists (select 1 from public.manual_secciones
              where eliminado_en is null and lower(btrim(nombre)) = lower(btrim(p_nombre))
                and id is distinct from p_id) then
    raise exception 'Ya hay una sección con ese nombre.';
  end if;

  if p_id is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), nullif(btrim(coalesce(p_icono, '')), ''),
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning * into v_row;
  else
    update public.manual_secciones
       set nombre = btrim(p_nombre),
           descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
           icono = nullif(btrim(coalesce(p_icono, '')), ''),
           actualizado_en = now()
     where id = p_id and eliminado_en is null
    returning * into v_row;
    if not found then raise exception 'La sección no existe.'; end if;
  end if;
  return v_row;
end; $$;

-- Eliminar una sección (soft). Solo si ya no tiene manuales.
create or replace function public.man_eliminar_seccion(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('man.editar') then
    raise exception 'No tienes permiso para editar manuales.';
  end if;
  if exists (select 1 from public.manuales where seccion_id = p_id and eliminado_en is null) then
    raise exception 'La sección todavía tiene manuales. Elimínalos o muévelos primero.';
  end if;
  update public.manual_secciones set eliminado_en = now(), actualizado_en = now()
   where id = p_id and eliminado_en is null;
  if not found then raise exception 'La sección no existe.'; end if;
end; $$;

-- Crear (p_id null) o editar un manual. Si cambia de sección, queda al final de la nueva.
create or replace function public.man_guardar_manual(
  p_id uuid, p_seccion_id uuid, p_titulo text, p_contenido text
) returns public.manuales
language plpgsql security definer set search_path = public as $$
declare
  v_row public.manuales;
  v_nombre text := (select full_name from public.profiles where id = auth.uid());
  v_siguiente integer;
begin
  if not public.tiene_permiso('man.editar') then
    raise exception 'No tienes permiso para editar manuales.';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'Escribe el título del manual.';
  end if;
  if not exists (select 1 from public.manual_secciones where id = p_seccion_id and eliminado_en is null) then
    raise exception 'La sección no existe.';
  end if;
  v_siguiente := coalesce((select max(orden) from public.manuales
                            where seccion_id = p_seccion_id and eliminado_en is null), 0) + 1;

  if p_id is null then
    insert into public.manuales (seccion_id, titulo, contenido, orden, actualizado_por, actualizado_por_nombre)
    values (p_seccion_id, btrim(p_titulo), coalesce(p_contenido, ''), v_siguiente, auth.uid(), v_nombre)
    returning * into v_row;
  else
    update public.manuales
       set titulo = btrim(p_titulo),
           contenido = coalesce(p_contenido, ''),
           orden = case when seccion_id = p_seccion_id then orden else v_siguiente end,
           seccion_id = p_seccion_id,
           actualizado_en = now(),
           actualizado_por = auth.uid(),
           actualizado_por_nombre = v_nombre
     where id = p_id and eliminado_en is null
    returning * into v_row;
    if not found then raise exception 'El manual no existe.'; end if;
  end if;
  return v_row;
end; $$;

-- Eliminar un manual (soft-delete).
create or replace function public.man_eliminar_manual(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.tiene_permiso('man.editar') then
    raise exception 'No tienes permiso para editar manuales.';
  end if;
  update public.manuales
     set eliminado_en = now(), actualizado_en = now(),
         actualizado_por = auth.uid(),
         actualizado_por_nombre = (select full_name from public.profiles where id = auth.uid())
   where id = p_id and eliminado_en is null;
  if not found then raise exception 'El manual no existe.'; end if;
end; $$;

-- Subir (p_dir = -1) o bajar (p_dir = 1) una sección o un manual un lugar.
-- p_tipo: 'seccion' | 'manual'. Reescribe el orden 1..n para que no haya empates.
create or replace function public.man_mover(p_tipo text, p_id uuid, p_dir integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_pos integer;
  v_otro integer;
begin
  if not public.tiene_permiso('man.editar') then
    raise exception 'No tienes permiso para editar manuales.';
  end if;
  if p_dir not in (-1, 1) then raise exception 'Dirección no válida.'; end if;

  if p_tipo = 'seccion' then
    select array_agg(id order by orden, creado_en) into v_ids
      from public.manual_secciones where eliminado_en is null;
  elsif p_tipo = 'manual' then
    select array_agg(m.id order by m.orden, m.creado_en) into v_ids
      from public.manuales m
     where m.eliminado_en is null
       and m.seccion_id = (select seccion_id from public.manuales where id = p_id);
  else
    raise exception 'Tipo no válido.';
  end if;

  v_pos := array_position(v_ids, p_id);
  if v_pos is null then raise exception 'No existe.'; end if;
  v_otro := v_pos + p_dir;
  if v_otro < 1 or v_otro > array_length(v_ids, 1) then return; end if; -- ya está en la orilla

  v_ids[v_pos] := v_ids[v_otro];
  v_ids[v_otro] := p_id;

  if p_tipo = 'seccion' then
    update public.manual_secciones s set orden = x.n
      from unnest(v_ids) with ordinality as x(id, n) where s.id = x.id;
  else
    update public.manuales m set orden = x.n
      from unnest(v_ids) with ordinality as x(id, n) where m.id = x.id;
  end if;
end; $$;

revoke execute on function public.man_guardar_seccion(uuid, text, text, text) from public;
revoke execute on function public.man_eliminar_seccion(uuid) from public;
revoke execute on function public.man_guardar_manual(uuid, uuid, text, text) from public;
revoke execute on function public.man_eliminar_manual(uuid) from public;
revoke execute on function public.man_mover(text, uuid, integer) from public;
grant execute on function public.man_guardar_seccion(uuid, text, text, text) to authenticated;
grant execute on function public.man_eliminar_seccion(uuid) to authenticated;
grant execute on function public.man_guardar_manual(uuid, uuid, text, text) to authenticated;
grant execute on function public.man_eliminar_manual(uuid) to authenticated;
grant execute on function public.man_mover(text, uuid, integer) to authenticated;
