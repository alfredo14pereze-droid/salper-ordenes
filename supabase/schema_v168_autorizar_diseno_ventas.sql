-- =====================================================================
-- V168 — "Autorizar diseños" pasa de sublimado a ventas (2026-10-29)
-- =====================================================================
-- Pedido de Alfredo: Samuel (sublimado) ya no autoriza diseños; los
-- autoriza Gis, que es de ventas. Los permisos van por rol, así que todo
-- el rol ventas puede autorizar.
--
-- Solo datos en rol_permisos (lo mismo que hacer el cambio desde "Roles y
-- permisos", módulo Sublimación). No toca tablas ni funciones:
-- autorizar_diseno (V165) ya revisa tiene_permiso('dis.autorizar').
--
-- Quedan con el permiso: ventas, admin_fabrica, admin_general.
--
-- Rollback: insert into public.rol_permisos (rol, clave) values ('sublimado', 'dis.autorizar') on conflict do nothing;
--           delete from public.rol_permisos where rol = 'ventas' and clave = 'dis.autorizar';
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if not exists (select 1 from public.permisos_catalogo where clave = 'dis.autorizar') then
    raise exception 'V168: falta V165 (permiso dis.autorizar). No se aplicó nada.';
  end if;
end $$;

delete from public.rol_permisos where rol = 'sublimado' and clave = 'dis.autorizar';

insert into public.rol_permisos (rol, clave) values ('ventas', 'dis.autorizar')
on conflict do nothing;

-- Verificación (solo lectura):
--   select rol from public.rol_permisos where clave = 'dis.autorizar' order by 1;
--   -- admin_fabrica, admin_general, ventas
