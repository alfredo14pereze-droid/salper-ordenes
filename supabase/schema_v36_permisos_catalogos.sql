-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V36: candado de rol en el servidor para dar de alta clientes/telas.
--
-- Hueco encontrado al revisar los permisos completos del sistema:
-- create_cliente (schema_v12_catalogos.sql, ampliada en schema_v30 con
-- teléfono/correo), create_tela y create_producto (ambas de
-- schema_v12_catalogos.sql) nunca revisaron el rol adentro — a
-- diferencia de create_order y el resto de las funciones de escritura,
-- que sí llaman a current_user_role() y rechazan si no corresponde. Solo
-- estaban protegidas porque la pantalla de Catálogos las escondía detrás
-- de un candado del lado del cliente (RequireRole); cualquier rol con
-- sesión que llamara el RPC directo (no desde la pantalla) podía crear
-- un cliente, tela o producto sin que el servidor lo rechazara.
--
-- Mismo momento, el usuario decidió abrir quién puede DAR DE ALTA cada
-- catálogo (antes de esto, toda la pantalla de Catálogos —incluido dar de
-- alta— era exclusiva de admin_general):
--   - Clientes:  ventas + admin_general.
--   - Telas:     ventas + admin_fabrica + admin_general.
--   - Productos: mismo criterio que Clientes (ventas + admin_general) —
--                se capturan juntos, un producto siempre es "de" un
--                cliente ya elegido en la misma pantalla.
-- BORRAR (hard-delete) sigue siendo exclusivo de admin_general, sin
-- excepción — eso no cambió (ver canManageCatalogs en utils/permissions.js,
-- que sigue igual). El espejo del lado del cliente de estas reglas nuevas
-- vive en canCreateCliente/canCreateTela/canCreateProducto
-- (utils/permissions.js) — decide qué se muestra en la pantalla, no
-- reemplaza este chequeo.
--
-- Las 3 funciones mantienen la MISMA firma que ya tenían (mismo tipo y
-- cantidad de parámetros) — no hace falta ningún DROP FUNCTION ni volver
-- a correr GRANT/REVOKE, solo se reemplaza el cuerpo con CREATE OR REPLACE
-- (Postgres permite esto sin problema cuando la firma no cambia).
--
-- Requiere haber corrido los esquemas anteriores (incluido
-- schema_v30_contacto_cliente_y_roles.sql, que dejó a create_cliente con
-- 3 parámetros). Cómo aplicarlo: pegar completo en el SQL Editor de
-- Supabase y correrlo una sola vez.
-- =====================================================================

create or replace function public.create_cliente(p_nombre text, p_telefono text default null, p_correo text default null)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_telefono text := nullif(trim(coalesce(p_telefono, '')), '');
  v_correo text := nullif(trim(coalesce(p_correo, '')), '');
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden dar de alta clientes.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del cliente no puede estar vacío.';
  end if;

  insert into public.clientes (nombre, telefono, correo)
  values (trim(p_nombre), v_telefono, v_correo)
  on conflict (nombre_normalizado) do update set
    telefono = coalesce(v_telefono, public.clientes.telefono),
    correo = coalesce(v_correo, public.clientes.correo);

  select * into v_cliente from public.clientes where nombre_normalizado = lower(trim(p_nombre));
  return v_cliente;
end;
$$;

create or replace function public.create_tela(p_nombre text)
returns public.telas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tela public.telas;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo ventas, administrador de fábrica o administrador general pueden dar de alta telas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre de la tela no puede estar vacío.';
  end if;

  insert into public.telas (nombre) values (trim(p_nombre))
  on conflict (nombre_normalizado) do nothing;

  select * into v_tela from public.telas where nombre_normalizado = lower(trim(p_nombre));
  return v_tela;
end;
$$;

create or replace function public.create_producto(
  p_cliente_id uuid,
  p_nombre text,
  p_garment text,
  p_color text,
  p_pantone text,
  p_tela_id uuid,
  p_foto_url text,
  p_foto_path text
) returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden dar de alta productos.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del producto no puede estar vacío.';
  end if;

  insert into public.productos (cliente_id, nombre, garment, color, pantone, tela_id, foto_url, foto_path)
  values (p_cliente_id, trim(p_nombre), p_garment, p_color, p_pantone, p_tela_id, p_foto_url, p_foto_path)
  returning * into v_producto;

  return v_producto;
end;
$$;

-- Verificación sugerida después de aplicar (en el mismo SQL Editor):
--
-- select proname, pronargs from pg_proc
-- where proname in ('create_cliente', 'create_tela', 'create_producto') and pronamespace = 'public'::regnamespace;
-- -- debe regresar exactamente 1 fila por cada una (create_cliente con 3
-- -- argumentos, create_tela con 1, create_producto con 8) — si aparece
-- -- más de una fila para el mismo nombre, hay un overload viejo que revisar.
--
-- select has_function_privilege('authenticated', 'public.create_cliente(text,text,text)', 'EXECUTE'); -- true
-- select has_function_privilege('authenticated', 'public.create_tela(text)', 'EXECUTE');               -- true
-- select has_function_privilege('authenticated', 'public.create_producto(uuid,text,text,text,text,uuid,text,text)', 'EXECUTE'); -- true
-- (el candado de ROL vive ADENTRO del cuerpo de cada función —
-- current_user_role()— no en el GRANT, que se queda igual que antes:
-- abierto a cualquier `authenticated`. Es la función la que ahora
-- rechaza si el rol no aplica, con un mensaje de error claro.)
