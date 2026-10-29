-- =====================================================================
-- V164 — Tareas para el personal (2026-10-29)
-- =====================================================================
-- Sección "Tareas": los administrativos le asignan tareas al personal y cada
-- persona las marca como hechas. Decisiones de Alfredo:
--   · Se asigna a "Todo el personal", a un rol (ventas, tienda, contabilidad…)
--     o a una persona.
--   · En tareas de grupo se elige en cada una cómo se completa:
--       cada_quien = cada persona la marca por su cuenta (se ve quién falta)
--       uno        = basta con que una persona del grupo la marque
--     (A una persona siempre es "cada_quien".)
--   · No se repiten: cada tarea se hace una vez.
--   · Fecha límite opcional (la pantalla la pinta en rojo si venció).
--   · Asignan admin_tienda y admin_general.
--
-- Permisos (editables en "Roles y permisos", módulo "Tareas"):
--   ta.ver        Ver sus tareas (las de todos, las de su rol y las suyas)
--   ta.completar  Marcar tareas como hechas. Quien lo tiene cuenta como
--                 parte de "Todo el personal"; los roles con este permiso son
--                 los que se ofrecen en "por rol".
--   ta.asignar    Asignar tareas, ver todas y quién las completó, y quitarlas
--
-- Aditivo: 2 tablas, 3 permisos, 5 funciones nuevas. No toca nada existente.
-- Se puede correr dos veces sin duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos (van primero: las políticas de abajo los usan)
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('ta.ver',       'Tareas', 'Ver sus tareas',        'Ver las tareas de todo el personal, las de su rol y las suyas.', 'ver',    70),
  ('ta.completar', 'Tareas', 'Completar tareas',      'Marcar sus tareas como hechas. Quien lo tiene cuenta como parte de "Todo el personal".', 'editar', 71),
  ('ta.asignar',   'Tareas', 'Asignar tareas',        'Asignar tareas (a todos, a un rol o a una persona), ver quién las completó y quitarlas.', 'editar', 72)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('ta.ver',       array['ventas','contabilidad','tienda','admin_tienda','admin_general','consulta_tienda','lectura']),
  ('ta.completar', array['ventas','contabilidad','tienda']),
  ('ta.asignar',   array['admin_tienda','admin_general'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.ta_tareas (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null check (btrim(titulo) <> ''),
  descripcion       text,
  destino_tipo      text not null check (destino_tipo in ('todos', 'rol', 'persona')),
  destino_rol       text,
  destino_id        uuid references public.profiles(id) on delete set null,
  destino_nombre    text,
  modo              text not null default 'cada_quien' check (modo in ('cada_quien', 'uno')),
  fecha_limite      date,
  creado_por        uuid default auth.uid(),
  creado_por_nombre text,
  creado_en         timestamptz not null default now(),
  quitada_en        timestamptz, -- "Quitar tarea": se oculta para todos, queda en la base
  check (destino_tipo <> 'rol' or destino_rol is not null),
  check (destino_tipo <> 'persona' or (destino_id is not null and modo = 'cada_quien'))
);
create index if not exists ta_tareas_creado_idx on public.ta_tareas (creado_en desc) where quitada_en is null;

create table if not exists public.ta_completadas (
  tarea_id      uuid not null references public.ta_tareas(id) on delete cascade,
  usuario_id    uuid not null,
  nombre        text,
  completada_en timestamptz not null default now(),
  primary key (tarea_id, usuario_id)
);

-- ¿Le toca esta tarea al usuario actual? (para la RLS y para marcarla)
create or replace function public.ta_me_toca(p_tipo text, p_rol text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'todos'   then public.tiene_permiso('ta.ver')
    when 'rol'     then public.tiene_permiso('ta.ver') and coalesce(public.current_user_role(), '') = p_rol
    when 'persona' then public.tiene_permiso('ta.ver') and p_id = auth.uid()
    else false
  end
$$;
revoke execute on function public.ta_me_toca(text, text, uuid) from public;
grant execute on function public.ta_me_toca(text, text, uuid) to authenticated;

alter table public.ta_tareas enable row level security;
alter table public.ta_completadas enable row level security;

-- Quien asigna ve todas; los demás, las que les tocan.
drop policy if exists "Lectura tareas" on public.ta_tareas;
create policy "Lectura tareas" on public.ta_tareas
  for select to authenticated using (
    quitada_en is null and (
      public.tiene_permiso('ta.asignar')
      or public.ta_me_toca(destino_tipo, destino_rol, destino_id)
    )
  );

-- Se ve quién completó una tarea si se puede ver la tarea (así, en "basta
-- con uno", todos ven quién ya la hizo).
drop policy if exists "Lectura tareas completadas" on public.ta_completadas;
create policy "Lectura tareas completadas" on public.ta_completadas
  for select to authenticated using (
    exists (select 1 from public.ta_tareas t where t.id = tarea_id)
  );

-- Sin políticas de escritura: todo pasa por las funciones de abajo.
revoke all on public.ta_tareas, public.ta_completadas from public, anon, authenticated;
grant select on public.ta_tareas, public.ta_completadas to authenticated;

-- ---------------------------------------------------------------------
-- 3) Funciones
-- ---------------------------------------------------------------------
-- Personas que pueden recibir tareas (con ta.completar, sin suspender). La
-- pantalla saca de aquí la lista de personas, la de roles y quién falta.
create or replace function public.ta_destinatarios()
returns table (id uuid, nombre text, rol text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tiene_permiso('ta.asignar') then
    raise exception 'No tienes permiso para asignar tareas.';
  end if;
  return query
    select p.id, p.full_name, p.role
      from public.profiles p
     where p.suspended_at is null
       and exists (select 1 from public.rol_permisos rp where rp.rol = p.role and rp.clave = 'ta.completar')
     order by p.full_name;
end; $$;
revoke execute on function public.ta_destinatarios() from public;
grant execute on function public.ta_destinatarios() to authenticated;

create or replace function public.ta_crear_tarea(
  p_titulo text,
  p_descripcion text default null,
  p_destino_tipo text default 'todos',
  p_destino_rol text default null,
  p_destino_id uuid default null,
  p_modo text default 'cada_quien',
  p_fecha_limite date default null
) returns public.ta_tareas
language plpgsql security definer set search_path = public as $$
declare
  v_row public.ta_tareas;
  v_nombre text;
  v_modo text := coalesce(nullif(p_modo, ''), 'cada_quien');
begin
  if not public.tiene_permiso('ta.asignar') then
    raise exception 'No tienes permiso para asignar tareas.';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'Escribe la tarea.';
  end if;
  if coalesce(p_destino_tipo, '') not in ('todos', 'rol', 'persona') then
    raise exception 'Elige a quién va la tarea.';
  end if;
  if v_modo not in ('cada_quien', 'uno') then
    raise exception 'Elige cómo se completa la tarea.';
  end if;

  if p_destino_tipo = 'rol' then
    if not exists (select 1 from public.rol_permisos where rol = p_destino_rol and clave = 'ta.completar') then
      raise exception 'Ese rol no recibe tareas.';
    end if;
  elsif p_destino_tipo = 'persona' then
    select full_name into v_nombre from public.profiles where id = p_destino_id;
    if not found then raise exception 'La persona elegida no existe.'; end if;
    v_modo := 'cada_quien';
  end if;

  insert into public.ta_tareas (
    titulo, descripcion, destino_tipo, destino_rol, destino_id, destino_nombre,
    modo, fecha_limite, creado_por, creado_por_nombre
  ) values (
    btrim(p_titulo),
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    p_destino_tipo,
    case when p_destino_tipo = 'rol' then p_destino_rol end,
    case when p_destino_tipo = 'persona' then p_destino_id end,
    v_nombre,
    v_modo,
    p_fecha_limite,
    auth.uid(),
    (select full_name from public.profiles where id = auth.uid())
  )
  returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.ta_crear_tarea(text, text, text, text, uuid, text, date) from public;
grant execute on function public.ta_crear_tarea(text, text, text, text, uuid, text, date) to authenticated;

-- p_hecha = true la marca como hecha; false la desmarca (solo la propia).
create or replace function public.ta_marcar_tarea(p_tarea_id uuid, p_hecha boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t public.ta_tareas;
  v_quien text;
begin
  if not public.tiene_permiso('ta.completar') then
    raise exception 'No tienes permiso para completar tareas.';
  end if;
  select * into v_t from public.ta_tareas where id = p_tarea_id and quitada_en is null;
  if v_t.id is null or not public.ta_me_toca(v_t.destino_tipo, v_t.destino_rol, v_t.destino_id) then
    raise exception 'Tarea no encontrada.';
  end if;

  if not p_hecha then
    delete from public.ta_completadas where tarea_id = p_tarea_id and usuario_id = auth.uid();
    return;
  end if;

  if v_t.modo = 'uno' then
    select nombre into v_quien from public.ta_completadas
     where tarea_id = p_tarea_id and usuario_id <> auth.uid() limit 1;
    if found then
      raise exception 'Esta tarea ya la completó %.', coalesce(nullif(v_quien, ''), 'alguien más');
    end if;
  end if;

  insert into public.ta_completadas (tarea_id, usuario_id, nombre)
  values (p_tarea_id, auth.uid(), (select full_name from public.profiles where id = auth.uid()))
  on conflict (tarea_id, usuario_id) do nothing;
end; $$;
revoke execute on function public.ta_marcar_tarea(uuid, boolean) from public;
grant execute on function public.ta_marcar_tarea(uuid, boolean) to authenticated;

create or replace function public.ta_quitar_tarea(p_id uuid)
returns public.ta_tareas
language plpgsql security definer set search_path = public as $$
declare v_row public.ta_tareas;
begin
  if not public.tiene_permiso('ta.asignar') then
    raise exception 'No tienes permiso para quitar tareas.';
  end if;
  update public.ta_tareas set quitada_en = now()
   where id = p_id and quitada_en is null
  returning * into v_row;
  if v_row.id is null then raise exception 'Tarea no encontrada.'; end if;
  return v_row;
end; $$;
revoke execute on function public.ta_quitar_tarea(uuid) from public;
grant execute on function public.ta_quitar_tarea(uuid) to authenticated;
