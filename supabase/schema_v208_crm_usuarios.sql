-- =====================================================================
-- V208 — CRM: lista de responsables (2026-11-13)
-- =====================================================================
-- La RLS de `profiles` solo deja a admin_general ver a todos; ventas y
-- admin_tienda solo se ven a sí mismos. Para elegir "Responsable" y ver
-- quién lleva cada prospecto, el CRM necesita los nombres de las personas
-- que lo usan. Esta función regresa SOLO id + nombre de los usuarios
-- activos cuyo rol tiene crm.usar, y solo a quien también tiene crm.usar.
--
-- Aditivo: 1 función nueva. No toca tablas ni políticas.
-- =====================================================================

create or replace function public.crm_usuarios()
returns table (id uuid, nombre text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tiene_permiso('crm.usar') then
    raise exception 'No tienes permiso para usar el CRM.';
  end if;
  return query
    select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Sin nombre')
      from public.profiles p
     where p.suspended_at is null
       and exists (select 1 from public.rol_permisos rp where rp.rol = p.role and rp.clave = 'crm.usar')
     order by 2;
end; $$;
revoke execute on function public.crm_usuarios() from public;
grant execute on function public.crm_usuarios() to authenticated;
