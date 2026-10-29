-- =====================================================================
-- V166 — Tareas: cada quien ve las suyas y todos pueden marcarlas (2026-10-29)
-- =====================================================================
-- Ajuste a V164 pedido por Alfredo:
--   · Todos pueden marcar sus tareas como hechas: ta.completar también para
--     admin_tienda y admin_general (así también se les pueden asignar tareas).
--   · "Todo el personal" NO incluye a quien asigna (admin_tienda /
--     admin_general): no les salen como suyas las tareas que ellos mismos
--     mandan a todos. A un admin se le asigna por persona o por su rol.
--   · La pantalla separa "Mis tareas" (solo las que le tocan a uno) de
--     "Asignadas" (todas, para quien asigna). La RLS no cambia: quien asigna
--     sigue pudiendo leer todas para ver el avance.
--
-- Cambia: 2 permisos nuevos en rol_permisos, ta_me_toca y ta_destinatarios
-- (ahora devuelve también en_todos). Nada más. Se puede correr dos veces.
-- =====================================================================

-- 1) Todos los que ven sus tareas (salvo los de solo lectura) pueden marcarlas.
insert into public.rol_permisos (rol, clave) values
  ('admin_tienda', 'ta.completar'),
  ('admin_general', 'ta.completar')
on conflict do nothing;

-- 2) "Todo el personal" ya no incluye a quien asigna.
create or replace function public.ta_me_toca(p_tipo text, p_rol text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'todos'   then public.tiene_permiso('ta.ver') and not public.tiene_permiso('ta.asignar')
    when 'rol'     then public.tiene_permiso('ta.ver') and coalesce(public.current_user_role(), '') = p_rol
    when 'persona' then public.tiene_permiso('ta.ver') and p_id = auth.uid()
    else false
  end
$$;

-- 3) Personas que pueden recibir tareas; en_todos = cuenta para "Todo el personal".
--    Cambia lo que devuelve, por eso se borra y se vuelve a crear.
drop function if exists public.ta_destinatarios();
create function public.ta_destinatarios()
returns table (id uuid, nombre text, rol text, en_todos boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tiene_permiso('ta.asignar') then
    raise exception 'No tienes permiso para asignar tareas.';
  end if;
  return query
    select p.id, p.full_name, p.role,
           not exists (select 1 from public.rol_permisos rp where rp.rol = p.role and rp.clave = 'ta.asignar')
      from public.profiles p
     where p.suspended_at is null
       and exists (select 1 from public.rol_permisos rp where rp.rol = p.role and rp.clave = 'ta.completar')
     order by p.full_name;
end; $$;
revoke execute on function public.ta_destinatarios() from public;
grant execute on function public.ta_destinatarios() to authenticated;
