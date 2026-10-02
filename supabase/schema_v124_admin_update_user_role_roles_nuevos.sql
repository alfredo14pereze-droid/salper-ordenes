-- =====================================================================
-- V124 — Usuarios: admin_update_user_role acepta costura y consulta_tienda
-- =====================================================================
-- V111 (costura) y V116 (consulta_tienda) agregaron los roles al CHECK de
-- profiles, pero esta función quedó con la lista de V88 y rechazaba ambos:
-- "Rol inválido: costura" al intentar cambiar a Carmen desde Usuarios.
--
-- Único cambio: la lista de roles válidos. Misma firma, mismo permiso
-- (solo admin_general), mismo cuerpo — create or replace, sin duplicar.
-- =====================================================================

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
    'costura', 'consulta_tienda'
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
