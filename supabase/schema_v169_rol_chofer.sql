-- =====================================================================
-- V169 — Rol nuevo: chofer (2026-10-29)
-- =====================================================================
-- Pedido de Alfredo. Primer paso del chofer:
--   · Tareas: ve las suyas y las marca como hechas (ta.ver, ta.completar).
--   · Pendientes tienda ↔ fábrica: solo consulta (pf.ver), para saber qué
--     lleva y qué trae.
--   · Órdenes "Lista para entregar": solo consulta, sin precios. Las
--     órdenes ya se leen con cualquier sesión; la pantalla es la que
--     recorta (no hace falta nada aquí).
-- No puede crear, cambiar ni entregar nada más.
--
-- Qué cambia:
--   1) profiles_role_check acepta 'chofer'.
--   2) admin_update_user_role acepta 'chofer' (para cambiar a alguien a
--      Chofer desde Usuarios). Misma función de V124, solo se agrega el rol.
--   3) rol_permisos: chofer recibe ta.ver, ta.completar y pf.ver.
--
-- Rollback (sin usuarios con rol chofer):
--   delete from public.rol_permisos where rol = 'chofer';
--   y volver a correr schema_v116 (CHECK) y schema_v124 (función).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if not exists (select 1 from public.permisos_catalogo where clave = 'ta.completar') then
    raise exception 'V169: falta V164 (permisos de tareas). No se aplicó nada.';
  end if;
  if not exists (select 1 from public.permisos_catalogo where clave = 'pf.ver') then
    raise exception 'V169: falta V125 (permiso pf.ver). No se aplicó nada.';
  end if;
end $$;

-- 1) Roles permitidos en profiles (lista de V116 + chofer)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
  'terminado','admin_fabrica','admin_general','lectura','tienda','captura_produccion',
  'admin_fabrica_lectura','costura','consulta_tienda','chofer'
));

-- 2) Cambiar el rol de una cuenta desde Usuarios (V124 + chofer)
create or replace function public.admin_update_user_role(
  p_user_id uuid, p_role text, p_full_name text default null
) returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_profile public.profiles;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador puede cambiar roles de usuario.';
  end if;
  if p_role not in (
    'ventas', 'contabilidad', 'admin_tienda',
    'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
    'admin_general',
    'captura_produccion',
    'lectura', 'tienda',
    'admin_fabrica_lectura',
    'costura', 'consulta_tienda',
    'chofer'
  ) then
    raise exception 'Rol inválido: %', p_role;
  end if;
  update public.profiles set role = p_role, full_name = coalesce(p_full_name, full_name)
  where id = p_user_id returning * into v_profile;
  if v_profile.id is null then
    raise exception 'Usuario % no encontrado', p_user_id;
  end if;
  return v_profile;
end;
$function$;

-- 3) Permisos del chofer (editables después en "Roles y permisos")
insert into public.rol_permisos (rol, clave)
select 'chofer', c from unnest(array['ta.ver', 'ta.completar', 'pf.ver']) as c
on conflict do nothing;

-- Verificación (solo lectura):
--   select clave from public.rol_permisos where rol = 'chofer' order by 1;
--   -- pf.ver, ta.completar, ta.ver
--   select pg_get_constraintdef(oid) like '%chofer%' from pg_constraint where conname = 'profiles_role_check';
--   -- true
