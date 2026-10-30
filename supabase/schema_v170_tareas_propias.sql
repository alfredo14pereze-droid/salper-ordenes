-- =====================================================================
-- V170 — Tareas propias (el chofer se agrega tareas a sí mismo) (2026-10-30)
-- =====================================================================
-- Pedido de Alfredo: el chofer puede anotarse sus propias tareas y solo
-- las ven él y admin_general (Alfredo). Hoy quien tiene ta.asignar
-- (admin_tienda y admin_general) ve TODAS las tareas; las propias se
-- esconden de admin_tienda.
--
-- Qué agrega:
--   · Permiso ta.propias ("Anotarse tareas propias"), sembrado al chofer y
--     editable en "Roles y permisos".
--   · ta_tareas.propia (boolean, por omisión false): las tareas de siempre
--     no cambian.
--   · ta_crear_tarea_propia(titulo, descripcion, fecha_limite): crea una
--     tarea para quien la escribe (destino persona = él mismo), marcada
--     como propia.
--   · Lectura de ta_tareas: una tarea propia solo la ven quien la anotó y
--     admin_general. Las demás, igual que en V164/V166.
--   · ta_quitar_tarea: además de quien asigna, quien anotó una tarea propia
--     la puede quitar. (Misma función de V164, con ese caso agregado.)
--
-- Rollback:
--   drop function public.ta_crear_tarea_propia(text, text, date);
--   volver a correr la política "Lectura tareas" y ta_quitar_tarea de V164;
--   delete from public.rol_permisos where clave = 'ta.propias';
--   delete from public.permisos_catalogo where clave = 'ta.propias';
--   alter table public.ta_tareas drop column propia;
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.ta_tareas') is null or to_regprocedure('public.ta_me_toca(text, text, uuid)') is null then
    raise exception 'V170: falta V164/V166 (tareas). No se aplicó nada.';
  end if;
end $$;

-- 1) Permiso
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('ta.propias', 'Tareas', 'Anotarse tareas propias',
   'Agregarse tareas a sí mismo. Solo las ven quien las anota y el administrador general.', 'editar', 73)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave) values ('chofer', 'ta.propias')
on conflict do nothing;

-- 2) Marca de tarea propia
alter table public.ta_tareas add column if not exists propia boolean not null default false;

-- 3) Quién ve cada tarea
drop policy if exists "Lectura tareas" on public.ta_tareas;
create policy "Lectura tareas" on public.ta_tareas
  for select to authenticated using (
    quitada_en is null and (
      case
        when propia then destino_id = auth.uid() or coalesce(public.current_user_role(), '') = 'admin_general'
        else public.tiene_permiso('ta.asignar') or public.ta_me_toca(destino_tipo, destino_rol, destino_id)
      end
    )
  );

-- 4) Anotarse una tarea propia
create or replace function public.ta_crear_tarea_propia(
  p_titulo text,
  p_descripcion text default null,
  p_fecha_limite date default null
) returns public.ta_tareas
language plpgsql security definer set search_path = public as $$
declare
  v_row public.ta_tareas;
  v_nombre text;
begin
  if not public.tiene_permiso('ta.propias') then
    raise exception 'No tienes permiso para anotarte tareas.';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'Escribe la tarea.';
  end if;
  select full_name into v_nombre from public.profiles where id = auth.uid();

  insert into public.ta_tareas (
    titulo, descripcion, destino_tipo, destino_rol, destino_id, destino_nombre,
    modo, fecha_limite, creado_por, creado_por_nombre, propia
  ) values (
    btrim(p_titulo),
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    'persona', null, auth.uid(), v_nombre,
    'cada_quien', p_fecha_limite, auth.uid(), v_nombre, true
  )
  returning * into v_row;
  return v_row;
end; $$;
revoke execute on function public.ta_crear_tarea_propia(text, text, date) from public, anon;
grant execute on function public.ta_crear_tarea_propia(text, text, date) to authenticated;

-- 5) Quitar: quien asigna (como siempre) o quien anotó su tarea propia
create or replace function public.ta_quitar_tarea(p_id uuid)
returns public.ta_tareas
language plpgsql security definer set search_path = public as $$
declare v_row public.ta_tareas;
begin
  if not public.tiene_permiso('ta.asignar') and not exists (
    select 1 from public.ta_tareas where id = p_id and propia and creado_por = auth.uid()
  ) then
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

-- Verificación (solo lectura):
--   select rol from public.rol_permisos where clave = 'ta.propias';   -- chofer
--   select count(*) from public.ta_tareas where propia;                -- 0
