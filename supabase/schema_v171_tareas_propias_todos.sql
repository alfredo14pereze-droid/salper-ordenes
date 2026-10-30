-- =====================================================================
-- V171 — Todos se anotan tareas propias, desde la página de Tareas (2026-10-30)
-- =====================================================================
-- Pedido de Alfredo: que cualquiera que usa Tareas pueda agregarse tareas
-- a sí mismo. Igual que en V170, una tarea propia solo la ven quien la
-- anotó y admin_general.
--
-- Al revisar producción, el permiso ta.propias del chofer (V170) no estaba
-- en rol_permisos. Por eso este archivo vuelve a crear TODO lo de V170
-- (permiso, columna, lectura, función para crear, quitar) además de darlo
-- a todos. Si V170 sí quedó aplicada en parte, no pasa nada: todo es
-- "si no existe" o "crear o reemplazar".
--
-- Qué cambia:
--   · ta.propias se da a todos los roles que completan tareas
--     (hoy: ventas, contabilidad, tienda, admin_tienda, admin_general,
--     chofer). Se sigue pudiendo quitar por rol en "Roles y permisos".
--   · Lo demás queda igual que V170.
--
-- Rollback:
--   delete from public.rol_permisos where clave = 'ta.propias' and rol <> 'chofer';
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regclass('public.ta_tareas') is null or to_regprocedure('public.ta_me_toca(text, text, uuid)') is null then
    raise exception 'V171: falta V164/V166 (tareas). No se aplicó nada.';
  end if;
end $$;

-- 1) Permiso
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('ta.propias', 'Tareas', 'Anotarse tareas propias',
   'Agregarse tareas a sí mismo. Solo las ven quien las anota y el administrador general.', 'editar', 73)
on conflict (clave) do nothing;

-- A todos los roles que completan tareas (y al chofer, por si acaso).
insert into public.rol_permisos (rol, clave)
select distinct rol, 'ta.propias' from public.rol_permisos where clave = 'ta.completar'
union
select 'chofer', 'ta.propias'
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
--   select rol from public.rol_permisos where clave = 'ta.propias' order by 1;
--   -- admin_general, admin_tienda, chofer, contabilidad, tienda, ventas
