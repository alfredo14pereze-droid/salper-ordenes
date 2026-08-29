-- =====================================================================
-- SALPER · Fix: permisos de service_role sobre profiles
--
-- Bug encontrado al probar "Nueva usuario" en vivo: la Edge Function
-- admin-create-user usa la service role key para leer public.profiles
-- (y confirmar que quien llama es admin), pero la tabla nunca recibió el
-- GRANT correspondiente — mismo patrón de bug que ya habíamos visto con
-- anon/authenticated: crear una tabla desde el SQL Editor no le da
-- automáticamente los permisos que sí obtienen las tablas creadas desde
-- el Table Editor. Sin este GRANT, la consulta fallaba con
-- "permission denied for table profiles" (42501), y la función lo
-- reportaba (de forma confusa) como "Solo un administrador puede...".
-- =====================================================================

grant select on public.profiles to service_role;

-- Salvaguarda general: cualquier tabla nueva que se cree desde el SQL
-- Editor de aquí en adelante hereda automáticamente acceso completo
-- para service_role (uso interno de Edge Functions / operaciones admin),
-- sin tener que acordarnos de este GRANT cada vez.
alter default privileges in schema public grant all on tables to service_role;

-- Y nos aseguramos de que todas las tablas ya existentes también lo tengan.
grant all on all tables in schema public to service_role;
