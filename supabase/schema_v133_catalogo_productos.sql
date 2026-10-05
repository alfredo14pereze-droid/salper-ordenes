-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V133: catálogo de productos por cliente — ficha completa
--
-- La tabla `productos` (V12) solo guardaba prenda/color/pantone/tela y UNA
-- foto. Para cargar las fichas "Layout Uniformes Escolares" hace falta
-- guardar también especificaciones (manga, vivos, cuello, puños, bies,
-- hilo, técnicas, proveedor, observaciones), los bordados por default,
-- la serie de tallas, varias fotos y una marca de "datos por validar".
--
-- Todo aditivo: 7 columnas nuevas con default en `productos` y UNA función
-- nueva. No se toca `create_producto` ni `delete_producto`, así que la
-- versión que está hoy en producción sigue funcionando exactamente igual
-- (sus productos nuevos nacen con las columnas nuevas vacías).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede correr dos veces sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas nuevas de productos
--    · especificaciones: { manga, vivos, cuello, punos, bies, hilo,
--        tecnicas[], proveedor, observaciones, tela_extra, ficha,
--        color_sugerido_de_foto } — solo las llaves que apliquen.
--    · bordados: [{ ubicacion, descripcion }] — default del producto; al
--        elegirlo en una orden se COPIAN a la prenda (no es una liga).
--    · tallas: serie ya convertida a las tallas de la app, en orden
--        (ej. {2,4,6,8,10,12,14,XS,CH,M,L,XL}). Vacío = se capturan a mano.
--    · tallas_rango: el texto original de la ficha ("2-XL"), de referencia.
--    · fotos: [{ url, path }], mismo formato que orders.reference_photos.
--        foto_url/foto_path (V12) se quedan y siempre traen la PRIMERA
--        foto, para que la versión vieja del frontend siga mostrándola.
--    · pendiente_validar + notas_validacion: ficha incompleta o con datos
--        sugeridos; las notas dicen qué falta revisar.
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists especificaciones jsonb not null default '{}'::jsonb,
  add column if not exists bordados jsonb not null default '[]'::jsonb,
  add column if not exists tallas text[] not null default '{}'::text[],
  add column if not exists tallas_rango text,
  add column if not exists fotos jsonb not null default '[]'::jsonb,
  add column if not exists pendiente_validar boolean not null default false,
  add column if not exists notas_validacion text;

create index if not exists productos_pendiente_validar_idx
  on public.productos (cliente_id) where pendiente_validar;

-- ---------------------------------------------------------------------
-- 2) guardar_producto — crea o actualiza la ficha completa.
--    · Con p_id: actualiza ESE producto (edición desde Catálogos).
--    · Sin p_id: busca por cliente + nombre (sin distinguir mayúsculas);
--      si ya existe lo actualiza, si no lo crea. Eso hace que la carga
--      del catálogo se pueda repetir sin duplicar nada.
--    Deliberadamente NO se agrega un índice único por cliente + nombre:
--    "Guardar como producto" (create_producto, en producción) usa el
--    nombre de la prenda como nombre del producto, y un índice único haría
--    fallar guardar la misma prenda en dos colores.
--    Mismos roles que create_producto (V36): ventas y admin_general.
-- ---------------------------------------------------------------------
create or replace function public.guardar_producto(
  p_cliente_id uuid,
  p_nombre text,
  p_garment text default null,
  p_color text default null,
  p_pantone text default null,
  p_tela_id uuid default null,
  p_especificaciones jsonb default '{}'::jsonb,
  p_bordados jsonb default '[]'::jsonb,
  p_tallas text[] default '{}'::text[],
  p_tallas_rango text default null,
  p_fotos jsonb default '[]'::jsonb,
  p_pendiente_validar boolean default false,
  p_notas_validacion text default null,
  p_id uuid default null
) returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos;
  v_id uuid := p_id;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_especificaciones jsonb := coalesce(p_especificaciones, '{}'::jsonb);
  v_bordados jsonb := coalesce(p_bordados, '[]'::jsonb);
  v_fotos jsonb := coalesce(p_fotos, '[]'::jsonb);
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden guardar productos.';
  end if;

  if v_nombre = '' then
    raise exception 'El nombre del producto no puede estar vacío.';
  end if;
  if jsonb_typeof(v_especificaciones) <> 'object' then
    raise exception 'Las especificaciones deben ser un objeto.';
  end if;
  if jsonb_typeof(v_bordados) <> 'array' or jsonb_typeof(v_fotos) <> 'array' then
    raise exception 'Los bordados y las fotos deben ser una lista.';
  end if;

  if v_id is null then
    select id into v_id
    from public.productos
    where cliente_id = p_cliente_id and lower(trim(nombre)) = lower(v_nombre)
    order by created_at
    limit 1;
  end if;

  if v_id is null then
    insert into public.productos (
      cliente_id, nombre, garment, color, pantone, tela_id,
      especificaciones, bordados, tallas, tallas_rango, fotos,
      foto_url, foto_path, pendiente_validar, notas_validacion
    ) values (
      p_cliente_id, v_nombre, p_garment, p_color, p_pantone, p_tela_id,
      v_especificaciones, v_bordados, coalesce(p_tallas, '{}'::text[]), p_tallas_rango, v_fotos,
      v_fotos -> 0 ->> 'url', v_fotos -> 0 ->> 'path',
      coalesce(p_pendiente_validar, false), nullif(trim(coalesce(p_notas_validacion, '')), '')
    )
    returning * into v_producto;
  else
    update public.productos set
      nombre = v_nombre,
      garment = p_garment,
      color = p_color,
      pantone = p_pantone,
      tela_id = p_tela_id,
      especificaciones = v_especificaciones,
      bordados = v_bordados,
      tallas = coalesce(p_tallas, '{}'::text[]),
      tallas_rango = p_tallas_rango,
      fotos = v_fotos,
      foto_url = v_fotos -> 0 ->> 'url',
      foto_path = v_fotos -> 0 ->> 'path',
      pendiente_validar = coalesce(p_pendiente_validar, false),
      notas_validacion = nullif(trim(coalesce(p_notas_validacion, '')), '')
    where id = v_id
    returning * into v_producto;

    if v_producto.id is null then
      raise exception 'Producto % no encontrado.', v_id;
    end if;
  end if;

  return v_producto;
end;
$$;
revoke execute on function public.guardar_producto(uuid, text, text, text, text, uuid, jsonb, jsonb, text[], text, jsonb, boolean, text, uuid) from public;
grant execute on function public.guardar_producto(uuid, text, text, text, text, uuid, jsonb, jsonb, text[], text, jsonb, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Verificación sugerida después de aplicar (solo lectura):
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'productos'
--   order by ordinal_position;                       -- 17 columnas
--
--   select pg_get_function_identity_arguments(oid)
--   from pg_proc where proname = 'guardar_producto';  -- una sola fila
--
--   select has_function_privilege('anon', 'public.guardar_producto(uuid, text, text, text, text, uuid, jsonb, jsonb, text[], text, jsonb, boolean, text, uuid)', 'EXECUTE');
--   -- debe dar false
-- ---------------------------------------------------------------------
