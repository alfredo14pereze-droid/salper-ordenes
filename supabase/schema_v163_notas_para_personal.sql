-- =====================================================================
-- V163 — Notas para el personal (2026-10-28)
-- =====================================================================
-- Segunda pestaña de "Notas de tienda" (V158): los administrativos le dejan
-- notas al personal. Decisiones de Alfredo:
--   · Cada nota va a "Todo el personal" o a una persona en específico. Esa
--     persona solo ve las suyas y las de todos; quien escribe ve todas.
--   · Botón "Enterado": cada persona lo pulsa y quien escribe ve quién ya la
--     leyó y quién no.
--   · Escriben admin_tienda y admin_general.
--   · Foto opcional (mismo bucket nt-fotos de V158; los que escriben aquí
--     ya pueden subir ahí).
--
-- Permisos (editables en "Roles y permisos", módulo "Notas para el personal"):
--   np.ver       Ver notas para el personal (las suyas y las de todos)
--   np.enterado  Marcar "Enterado" (también define quiénes cuentan como
--                destinatarios de "Todo el personal")
--   np.escribir  Escribir notas para el personal, ver todas y quién las leyó,
--                y quitarlas
--
-- Aditivo: 2 tablas, 3 permisos, 4 funciones nuevas. No toca nada existente.
-- Se puede correr dos veces sin duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos (van primero: las políticas de abajo los usan)
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('np.ver',      'Notas para el personal', 'Ver notas para el personal', 'Leer las notas dirigidas a todo el personal o a uno mismo.', 'ver',    60),
  ('np.enterado', 'Notas para el personal', 'Marcar "Enterado"',          'Confirmar que leyó una nota. Quien tiene este permiso cuenta como destinatario de "Todo el personal".', 'editar', 61),
  ('np.escribir', 'Notas para el personal', 'Escribir notas para el personal', 'Dejar notas al personal (a todos o a una persona), ver quién ya las leyó y quitarlas.', 'editar', 62)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('np.ver',      array['ventas','contabilidad','tienda','admin_tienda','admin_general','consulta_tienda','lectura']),
  ('np.enterado', array['ventas','contabilidad','tienda']),
  ('np.escribir', array['admin_tienda','admin_general'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.np_notas (
  id                uuid primary key default gen_random_uuid(),
  texto             text not null check (btrim(texto) <> ''),
  para_id           uuid references public.profiles(id) on delete set null, -- null = todo el personal
  para_nombre       text,
  foto_path         text,
  foto_url          text,
  creado_por        uuid default auth.uid(),
  creado_por_nombre text,
  creado_en         timestamptz not null default now(),
  quitada_en        timestamptz -- "Quitar": se oculta para todos, queda en la base
);
create index if not exists np_notas_creado_idx on public.np_notas (creado_en desc) where quitada_en is null;

create table if not exists public.np_enterados (
  nota_id     uuid not null references public.np_notas(id) on delete cascade,
  usuario_id  uuid not null,
  nombre      text,
  enterado_en timestamptz not null default now(),
  primary key (nota_id, usuario_id)
);

alter table public.np_notas enable row level security;
alter table public.np_enterados enable row level security;

-- Quien escribe ve todas; los demás, solo las de todos y las suyas.
drop policy if exists "Lectura notas para el personal" on public.np_notas;
create policy "Lectura notas para el personal" on public.np_notas
  for select to authenticated using (
    quitada_en is null and (
      public.tiene_permiso('np.escribir')
      or (public.tiene_permiso('np.ver') and (para_id is null or para_id = auth.uid()))
    )
  );

-- Quien escribe ve todos los "Enterado"; los demás, solo los suyos.
drop policy if exists "Lectura enterados" on public.np_enterados;
create policy "Lectura enterados" on public.np_enterados
  for select to authenticated using (public.tiene_permiso('np.escribir') or usuario_id = auth.uid());

-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.np_notas, public.np_enterados from public, anon, authenticated;
grant select on public.np_notas, public.np_enterados to authenticated;

-- ---------------------------------------------------------------------
-- 3) Funciones
-- ---------------------------------------------------------------------
-- Personas a quienes se les puede escribir (y que cuentan para "Todo el
-- personal"): con permiso np.enterado y sin suspender.
create or replace function public.np_destinatarios()
returns table (id uuid, nombre text, rol text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tiene_permiso('np.escribir') then
    raise exception 'No tienes permiso para escribir notas para el personal.';
  end if;
  return query
    select p.id, p.full_name, p.role
      from public.profiles p
     where p.suspended_at is null
       and exists (select 1 from public.rol_permisos rp where rp.rol = p.role and rp.clave = 'np.enterado')
     order by p.full_name;
end; $$;
revoke execute on function public.np_destinatarios() from public;
grant execute on function public.np_destinatarios() to authenticated;

create or replace function public.np_crear_nota(
  p_texto text, p_para_id uuid default null, p_foto_path text default null, p_foto_url text default null
) returns public.np_notas
language plpgsql security definer set search_path = public as $$
declare
  v_row public.np_notas;
  v_para_nombre text;
begin
  if not public.tiene_permiso('np.escribir') then
    raise exception 'No tienes permiso para escribir notas para el personal.';
  end if;
  if btrim(coalesce(p_texto, '')) = '' then
    raise exception 'Escribe la nota.';
  end if;
  if p_para_id is not null then
    select full_name into v_para_nombre from public.profiles where id = p_para_id;
    if not found then raise exception 'La persona elegida no existe.'; end if;
  end if;

  insert into public.np_notas (texto, para_id, para_nombre, foto_path, foto_url, creado_por, creado_por_nombre)
  values (
    btrim(p_texto), p_para_id, v_para_nombre,
    nullif(p_foto_path, ''), nullif(p_foto_url, ''),
    auth.uid(), (select full_name from public.profiles where id = auth.uid())
  )
  returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.np_crear_nota(text, uuid, text, text) from public;
grant execute on function public.np_crear_nota(text, uuid, text, text) to authenticated;

create or replace function public.np_marcar_enterado(p_nota_id uuid)
returns public.np_enterados
language plpgsql security definer set search_path = public as $$
declare
  v_nota public.np_notas;
  v_row public.np_enterados;
begin
  if not public.tiene_permiso('np.enterado') then
    raise exception 'No tienes permiso para marcar notas como enterado.';
  end if;
  select * into v_nota from public.np_notas where id = p_nota_id and quitada_en is null;
  if v_nota.id is null or (v_nota.para_id is not null and v_nota.para_id <> auth.uid()) then
    raise exception 'Nota no encontrada.';
  end if;

  insert into public.np_enterados (nota_id, usuario_id, nombre)
  values (p_nota_id, auth.uid(), (select full_name from public.profiles where id = auth.uid()))
  on conflict (nota_id, usuario_id) do nothing;

  select * into v_row from public.np_enterados where nota_id = p_nota_id and usuario_id = auth.uid();
  return v_row;
end; $$;
revoke execute on function public.np_marcar_enterado(uuid) from public;
grant execute on function public.np_marcar_enterado(uuid) to authenticated;

create or replace function public.np_quitar_nota(p_id uuid)
returns public.np_notas
language plpgsql security definer set search_path = public as $$
declare v_row public.np_notas;
begin
  if not public.tiene_permiso('np.escribir') then
    raise exception 'No tienes permiso para quitar notas para el personal.';
  end if;
  update public.np_notas set quitada_en = now()
   where id = p_id and quitada_en is null
  returning * into v_row;
  if v_row.id is null then raise exception 'Nota no encontrada.'; end if;
  return v_row;
end; $$;
revoke execute on function public.np_quitar_nota(uuid) from public;
grant execute on function public.np_quitar_nota(uuid) to authenticated;
