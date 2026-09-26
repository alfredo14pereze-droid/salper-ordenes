-- V79 — profiles_role_check: agrega 'lectura' y 'tienda'.
-- Esos dos roles existen en el código (UsersPage, permisos, edge function
-- admin-create-user) desde V30, pero la restricción de la base nunca los
-- aceptó, así que era imposible asignarlos a un usuario. Solo AMPLÍA la lista
-- (los perfiles actuales ya cumplen: ventas, contabilidad, admin_fabrica,
-- admin_general). No cambia permisos de nadie.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general',
  'lectura', 'tienda',
  'captura_produccion'
));
