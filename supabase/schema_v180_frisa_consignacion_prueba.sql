-- =====================================================================
-- V180 — Frisa: inventario a consignación (PRUEBA de concepto, 2026-11-04)
-- =====================================================================
-- Rama `frisa-prueba`. Sección "Frisa (prueba)" visible solo para
-- admin_general (el "super_admin" del prompt; ese rol no existe aquí).
--
-- Reglas del prompt de Alfredo:
--   · Solo tablas NUEVAS con prefijo frisa_. No se toca ninguna tabla,
--     función ni policy existente (tampoco productos_frisa de V155: ese
--     catálogo es de órdenes de producción; aquí los SKUs van aparte).
--   · El stock NUNCA se guarda como número editable: sale de sumar
--     frisa_movimientos (lo calcula la pantalla; las funciones de abajo lo
--     recalculan para validar).
--
-- Tablas:
--   frisa_plantas, frisa_productos, frisa_maximos, frisa_movimientos
--   (todas con es_prueba; "Borrar datos de prueba" quita lo que tenga true).
--
-- Movimientos (cantidad en piezas):
--   produccion           +bodega SALPER            (planta_id nulo, > 0)
--   entrega              −bodega, +planta          (> 0)
--   consumo              −planta (por quincena)    (> 0)
--   ajuste_confirmacion  ±planta = confirmado − calculado (puede ser 0:
--                        así queda registro de que la planta confirmó)
--
-- Seguridad (igual que Pedidos Colegio V57): RLS, lectura solo
-- admin_general, anon sin nada, escritura solo por funciones SECURITY
-- DEFINER que revisan el rol adentro.
--
-- Aditivo, se puede correr dos veces. Rollback completo al final
-- (comentado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create table if not exists public.frisa_plantas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (btrim(nombre) <> ''),
  activa     boolean not null default true,
  es_prueba  boolean not null default true,
  creado_en  timestamptz not null default now()
);
create unique index if not exists frisa_plantas_nombre_uq on public.frisa_plantas (lower(btrim(nombre)));

create table if not exists public.frisa_productos (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null check (btrim(sku) <> ''),
  nombre          text not null check (btrim(nombre) <> ''),
  precio_consumo  numeric(12,2) not null check (precio_consumo >= 0),
  activo          boolean not null default true,
  es_prueba       boolean not null default true,
  creado_en       timestamptz not null default now()
);
create unique index if not exists frisa_productos_sku_uq on public.frisa_productos (lower(btrim(sku)));

create table if not exists public.frisa_maximos (
  planta_id       uuid not null references public.frisa_plantas(id) on delete cascade,
  producto_id     uuid not null references public.frisa_productos(id) on delete cascade,
  maximo          integer not null check (maximo >= 0),
  actualizado_en  timestamptz not null default now(),
  primary key (planta_id, producto_id)
);

create table if not exists public.frisa_movimientos (
  id                 uuid primary key default gen_random_uuid(),
  fecha              date not null,
  tipo               text not null check (tipo in ('produccion', 'entrega', 'consumo', 'ajuste_confirmacion')),
  producto_id        uuid not null references public.frisa_productos(id) on delete restrict,
  planta_id          uuid references public.frisa_plantas(id) on delete restrict,
  cantidad           integer not null,
  confirmado         integer,            -- solo ajuste_confirmacion: lo que confirmó Frisa
  lote_id            uuid,               -- agrupa lo capturado junto (una entrega, una quincena…)
  referencia         text,
  notas              text,
  es_prueba          boolean not null default true,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  constraint frisa_mov_planta_ck check (
    (tipo = 'produccion' and planta_id is null) or (tipo <> 'produccion' and planta_id is not null)
  ),
  constraint frisa_mov_cantidad_ck check (
    (tipo = 'ajuste_confirmacion' and confirmado is not null and confirmado >= 0)
    or (tipo <> 'ajuste_confirmacion' and cantidad > 0 and confirmado is null)
  )
);
create index if not exists frisa_mov_producto_idx on public.frisa_movimientos (producto_id, planta_id);
create index if not exists frisa_mov_fecha_idx on public.frisa_movimientos (fecha desc);
create index if not exists frisa_mov_lote_idx on public.frisa_movimientos (lote_id);

-- ---------------------------------------------------------------------
-- 2) RLS: lectura solo admin_general; sin escritura directa
-- ---------------------------------------------------------------------
alter table public.frisa_plantas     enable row level security;
alter table public.frisa_productos   enable row level security;
alter table public.frisa_maximos     enable row level security;
alter table public.frisa_movimientos enable row level security;

drop policy if exists frisa_plantas_select on public.frisa_plantas;
create policy frisa_plantas_select on public.frisa_plantas
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_productos_select on public.frisa_productos;
create policy frisa_productos_select on public.frisa_productos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_maximos_select on public.frisa_maximos;
create policy frisa_maximos_select on public.frisa_maximos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_movimientos_select on public.frisa_movimientos;
create policy frisa_movimientos_select on public.frisa_movimientos
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

revoke all on public.frisa_plantas, public.frisa_productos, public.frisa_maximos, public.frisa_movimientos from anon, public;
revoke insert, update, delete, truncate on public.frisa_plantas, public.frisa_productos, public.frisa_maximos, public.frisa_movimientos from authenticated;
grant select on public.frisa_plantas, public.frisa_productos, public.frisa_maximos, public.frisa_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- 3) Ayudantes internos (no se exponen a la app)
-- ---------------------------------------------------------------------
create or replace function public.frisa_exigir_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo el administrador general puede usar Frisa (prueba).' using errcode = '42501';
  end if;
end $$;

-- Stock en bodega SALPER de un producto (todas las fechas).
create or replace function public.frisa_stock_bodega(p_producto uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case tipo when 'produccion' then cantidad when 'entrega' then -cantidad else 0 end), 0)::int
  from public.frisa_movimientos where producto_id = p_producto;
$$;

-- Stock en una planta de un producto, hasta una fecha (incluida).
create or replace function public.frisa_stock_planta(p_planta uuid, p_producto uuid, p_hasta date default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case tipo when 'entrega' then cantidad when 'consumo' then -cantidad
                                when 'ajuste_confirmacion' then cantidad else 0 end), 0)::int
  from public.frisa_movimientos
  where planta_id = p_planta and producto_id = p_producto and (p_hasta is null or fecha <= p_hasta);
$$;

-- Nombre de quien captura (como created_by_nombre de V137).
create or replace function public.frisa_nombre_usuario()
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(full_name), '') from public.profiles where id = auth.uid();
$$;

revoke execute on function public.frisa_exigir_admin() from public, anon, authenticated;
revoke execute on function public.frisa_stock_bodega(uuid) from public, anon, authenticated;
revoke execute on function public.frisa_stock_planta(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.frisa_nombre_usuario() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Escritura (solo admin_general)
-- ---------------------------------------------------------------------

-- 4a) Producción terminada que entra a bodega SALPER.
create or replace function public.frisa_registrar_produccion(
  p_fecha date, p_producto_id uuid, p_cantidad integer, p_referencia text default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.frisa_exigir_admin();
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a 0.'; end if;
  if not exists (select 1 from public.frisa_productos where id = p_producto_id) then
    raise exception 'Producto no encontrado.';
  end if;
  insert into public.frisa_movimientos (fecha, tipo, producto_id, cantidad, referencia, notas, creado_por_nombre)
  values (p_fecha, 'produccion', p_producto_id, p_cantidad, nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''),
          public.frisa_nombre_usuario())
  returning id into v_id;
  return v_id;
end $$;

-- 4b) Entrega (un viaje): p_lineas = [{planta_id, producto_id, cantidad}].
-- Sin parciales: si la bodega no alcanza para TODO lo pedido de algún SKU,
-- no se registra nada.
create or replace function public.frisa_registrar_entrega(
  p_fecha date, p_lineas jsonb, p_referencia text default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid := gen_random_uuid();
  v_nombre text := public.frisa_nombre_usuario();
  r record;
  v_faltan text := '';
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La entrega no trae cantidades.';
  end if;

  drop table if exists _frisa_lineas;
  create temp table _frisa_lineas on commit drop as
  select (l->>'planta_id')::uuid as planta_id, (l->>'producto_id')::uuid as producto_id, (l->>'cantidad')::int as cantidad
  from jsonb_array_elements(p_lineas) l;
  delete from _frisa_lineas where coalesce(cantidad, 0) = 0;

  if not exists (select 1 from _frisa_lineas) then raise exception 'La entrega no trae cantidades.'; end if;
  if exists (select 1 from _frisa_lineas where cantidad < 0) then raise exception 'No se aceptan cantidades negativas.'; end if;
  if exists (select 1 from _frisa_lineas l where not exists (select 1 from public.frisa_plantas p where p.id = l.planta_id)
                                            or not exists (select 1 from public.frisa_productos p where p.id = l.producto_id)) then
    raise exception 'Planta o producto no encontrado.';
  end if;
  if exists (select 1 from _frisa_lineas group by planta_id, producto_id having count(*) > 1) then
    raise exception 'Una planta trae el mismo SKU dos veces.';
  end if;

  for r in
    select l.producto_id, p.sku, sum(l.cantidad)::int as pedido, public.frisa_stock_bodega(l.producto_id) as bodega
    from _frisa_lineas l join public.frisa_productos p on p.id = l.producto_id
    group by l.producto_id, p.sku
  loop
    if r.pedido > r.bodega then
      v_faltan := v_faltan || format('%s (pide %s, hay %s); ', r.sku, r.pedido, r.bodega);
    end if;
  end loop;
  if v_faltan <> '' then
    raise exception 'La bodega no alcanza para completar la entrega (no se aceptan parciales): %', rtrim(v_faltan, '; ');
  end if;

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, lote_id, referencia, notas, creado_por_nombre)
  select p_fecha, 'entrega', producto_id, planta_id, cantidad, v_lote, nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''), v_nombre
  from _frisa_lineas;
  return v_lote;
end $$;

-- 4c) Consumo de una quincena en una planta: p_lineas = [{producto_id, cantidad}].
-- p_fecha = último día de la quincena (15 o fin de mes). No deja capturar dos
-- veces la misma quincena/planta/SKU ni consumir más de lo que hay.
create or replace function public.frisa_registrar_consumo(
  p_fecha date, p_planta_id uuid, p_lineas jsonb, p_referencia text default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid := gen_random_uuid();
  v_nombre text := public.frisa_nombre_usuario();
  v_ini date;
  v_fin date;
  r record;
  v_err text := '';
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  if not exists (select 1 from public.frisa_plantas where id = p_planta_id) then raise exception 'Planta no encontrada.'; end if;
  if p_fecha > (now() at time zone 'America/Monterrey')::date then
    raise exception 'Esa quincena todavía no termina: el consumo se captura cuando Frisa lo reporta.';
  end if;
  -- Quincena de p_fecha: del 1 al 15, o del 16 a fin de mes.
  if extract(day from p_fecha) <= 15 then
    v_ini := date_trunc('month', p_fecha)::date;
    v_fin := v_ini + 14;
  else
    v_ini := date_trunc('month', p_fecha)::date + 15;
    v_fin := (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
  end if;

  drop table if exists _frisa_lineas;
  create temp table _frisa_lineas on commit drop as
  select (l->>'producto_id')::uuid as producto_id, (l->>'cantidad')::int as cantidad
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l;
  delete from _frisa_lineas where coalesce(cantidad, 0) = 0;
  if not exists (select 1 from _frisa_lineas) then raise exception 'No hay consumo capturado.'; end if;
  if exists (select 1 from _frisa_lineas where cantidad < 0) then raise exception 'No se aceptan cantidades negativas.'; end if;
  if exists (select 1 from _frisa_lineas group by producto_id having count(*) > 1) then raise exception 'Un SKU viene dos veces.'; end if;

  for r in
    select l.producto_id, l.cantidad, p.sku,
           public.frisa_stock_planta(p_planta_id, l.producto_id) as stock,
           exists (select 1 from public.frisa_movimientos m
                   where m.tipo = 'consumo' and m.planta_id = p_planta_id and m.producto_id = l.producto_id
                     and m.fecha between v_ini and v_fin) as repetido
    from _frisa_lineas l left join public.frisa_productos p on p.id = l.producto_id
  loop
    if r.sku is null then raise exception 'Producto no encontrado.'; end if;
    if r.repetido then v_err := v_err || format('%s ya tiene consumo en esta quincena; ', r.sku);
    elsif r.cantidad > r.stock then v_err := v_err || format('%s consume %s pero la planta solo tiene %s; ', r.sku, r.cantidad, r.stock);
    end if;
  end loop;
  if v_err <> '' then raise exception 'No se guardó el consumo: %', rtrim(v_err, '; '); end if;

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, lote_id, referencia, notas, creado_por_nombre)
  select p_fecha, 'consumo', producto_id, p_planta_id, cantidad, v_lote, nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''), v_nombre
  from _frisa_lineas;
  return v_lote;
end $$;

-- 4d) Confirmación mensual de una planta: p_lineas = [{producto_id, confirmado}].
-- El sistema calcula el stock a esa fecha y guarda el ajuste (confirmado −
-- calculado), aunque sea 0, para que quede registro de la confirmación.
create or replace function public.frisa_registrar_confirmacion(
  p_fecha date, p_planta_id uuid, p_lineas jsonb, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid := gen_random_uuid();
  v_nombre text := public.frisa_nombre_usuario();
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;
  if not exists (select 1 from public.frisa_plantas where id = p_planta_id) then raise exception 'Planta no encontrada.'; end if;

  drop table if exists _frisa_lineas;
  create temp table _frisa_lineas on commit drop as
  select (l->>'producto_id')::uuid as producto_id, (l->>'confirmado')::int as confirmado
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  where l ? 'confirmado' and l->>'confirmado' is not null;
  if not exists (select 1 from _frisa_lineas) then raise exception 'No hay stock confirmado capturado.'; end if;
  if exists (select 1 from _frisa_lineas where confirmado < 0) then raise exception 'El stock confirmado no puede ser negativo.'; end if;
  if exists (select 1 from _frisa_lineas group by producto_id having count(*) > 1) then raise exception 'Un SKU viene dos veces.'; end if;
  if exists (select 1 from _frisa_lineas l where not exists (select 1 from public.frisa_productos p where p.id = l.producto_id)) then
    raise exception 'Producto no encontrado.';
  end if;

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, confirmado, lote_id, notas, creado_por_nombre)
  select p_fecha, 'ajuste_confirmacion', producto_id, p_planta_id,
         confirmado - public.frisa_stock_planta(p_planta_id, producto_id, p_fecha),
         confirmado, v_lote, nullif(btrim(p_notas), ''), v_nombre
  from _frisa_lineas;
  return v_lote;
end $$;

-- 4e) Máximo de una planta/SKU (lo define Frisa). null = quitarlo.
create or replace function public.frisa_set_maximo(p_planta_id uuid, p_producto_id uuid, p_maximo integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.frisa_exigir_admin();
  if p_maximo is null then
    delete from public.frisa_maximos where planta_id = p_planta_id and producto_id = p_producto_id;
    return;
  end if;
  if p_maximo < 0 then raise exception 'El máximo no puede ser negativo.'; end if;
  insert into public.frisa_maximos (planta_id, producto_id, maximo) values (p_planta_id, p_producto_id, p_maximo)
  on conflict (planta_id, producto_id) do update set maximo = excluded.maximo, actualizado_en = now();
end $$;

-- 4f) Cargar datos de prueba (los arma la pantalla). p_datos =
--   { plantas: [{nombre}], productos: [{sku, nombre, precio_consumo}],
--     maximos: [{planta, sku, maximo}],
--     movimientos: [{fecha, tipo, sku, planta|null, cantidad, confirmado?, lote?, referencia?, notas?}] }
-- Todo queda con es_prueba = true. Se niega si ya hay datos de prueba.
create or replace function public.frisa_cargar_datos_prueba(p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := public.frisa_nombre_usuario();
  v_mov int;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  if exists (select 1 from public.frisa_plantas where es_prueba) or exists (select 1 from public.frisa_productos where es_prueba)
     or exists (select 1 from public.frisa_movimientos where es_prueba) then
    raise exception 'Ya hay datos de prueba cargados. Bórralos primero.';
  end if;

  insert into public.frisa_plantas (nombre, es_prueba)
  select x->>'nombre', true from jsonb_array_elements(p_datos->'plantas') x;

  insert into public.frisa_productos (sku, nombre, precio_consumo, es_prueba)
  select x->>'sku', x->>'nombre', (x->>'precio_consumo')::numeric, true from jsonb_array_elements(p_datos->'productos') x;

  insert into public.frisa_maximos (planta_id, producto_id, maximo)
  select pl.id, pr.id, (x->>'maximo')::int
  from jsonb_array_elements(p_datos->'maximos') x
  join public.frisa_plantas pl on pl.es_prueba and pl.nombre = x->>'planta'
  join public.frisa_productos pr on pr.es_prueba and pr.sku = x->>'sku';

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, confirmado, lote_id, referencia, notas, es_prueba, creado_por_nombre)
  select (x->>'fecha')::date, x->>'tipo', pr.id, pl.id, (x->>'cantidad')::int, (x->>'confirmado')::int,
         case when x->>'lote' is null then null else md5('frisa-prueba-' || (x->>'lote'))::uuid end,
         x->>'referencia', x->>'notas', true, v_nombre
  from jsonb_array_elements(p_datos->'movimientos') x
  join public.frisa_productos pr on pr.es_prueba and pr.sku = x->>'sku'
  left join public.frisa_plantas pl on pl.es_prueba and pl.nombre = x->>'planta';
  get diagnostics v_mov = row_count;
  if v_mov <> jsonb_array_length(p_datos->'movimientos') then
    raise exception 'Datos de prueba inconsistentes: % de % movimientos con SKU/planta válidos.', v_mov, jsonb_array_length(p_datos->'movimientos');
  end if;

  -- Ningún stock negativo (bodega ni planta).
  if exists (select 1 from public.frisa_productos pr where pr.es_prueba and public.frisa_stock_bodega(pr.id) < 0)
     or exists (select 1 from public.frisa_plantas pl cross join public.frisa_productos pr
                where pl.es_prueba and pr.es_prueba and public.frisa_stock_planta(pl.id, pr.id) < 0) then
    raise exception 'Datos de prueba inconsistentes: quedaría stock negativo.';
  end if;

  return jsonb_build_object(
    'plantas', (select count(*) from public.frisa_plantas where es_prueba),
    'productos', (select count(*) from public.frisa_productos where es_prueba),
    'movimientos', v_mov);
end $$;

-- 4g) Borrar todo lo de prueba (movimientos, máximos, plantas y SKUs).
create or replace function public.frisa_borrar_datos_prueba()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mov int; v_pl int; v_pr int;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  delete from public.frisa_movimientos where es_prueba;
  get diagnostics v_mov = row_count;
  delete from public.frisa_maximos m using public.frisa_plantas pl
    where m.planta_id = pl.id and pl.es_prueba;
  delete from public.frisa_maximos m using public.frisa_productos pr
    where m.producto_id = pr.id and pr.es_prueba;
  delete from public.frisa_plantas where es_prueba
    and not exists (select 1 from public.frisa_movimientos m where m.planta_id = frisa_plantas.id);
  get diagnostics v_pl = row_count;
  delete from public.frisa_productos where es_prueba
    and not exists (select 1 from public.frisa_movimientos m where m.producto_id = frisa_productos.id);
  get diagnostics v_pr = row_count;
  return jsonb_build_object('movimientos', v_mov, 'plantas', v_pl, 'productos', v_pr);
end $$;

-- Permisos de ejecución: solo con sesión (el rol se revisa adentro).
revoke execute on function public.frisa_registrar_produccion(date, uuid, integer, text, text) from public, anon;
revoke execute on function public.frisa_registrar_entrega(date, jsonb, text, text) from public, anon;
revoke execute on function public.frisa_registrar_consumo(date, uuid, jsonb, text, text) from public, anon;
revoke execute on function public.frisa_registrar_confirmacion(date, uuid, jsonb, text) from public, anon;
revoke execute on function public.frisa_set_maximo(uuid, uuid, integer) from public, anon;
revoke execute on function public.frisa_cargar_datos_prueba(jsonb) from public, anon;
revoke execute on function public.frisa_borrar_datos_prueba() from public, anon;
grant execute on function public.frisa_registrar_produccion(date, uuid, integer, text, text) to authenticated;
grant execute on function public.frisa_registrar_entrega(date, jsonb, text, text) to authenticated;
grant execute on function public.frisa_registrar_consumo(date, uuid, jsonb, text, text) to authenticated;
grant execute on function public.frisa_registrar_confirmacion(date, uuid, jsonb, text) to authenticated;
grant execute on function public.frisa_set_maximo(uuid, uuid, integer) to authenticated;
grant execute on function public.frisa_cargar_datos_prueba(jsonb) to authenticated;
grant execute on function public.frisa_borrar_datos_prueba() to authenticated;

-- ---------------------------------------------------------------------
-- Verificación rápida (correr aparte después de aplicar):
--   select tablename from pg_tables where tablename like 'frisa\_%';           -- 4 filas
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where proname like 'frisa\_%' order by 1;                                   -- 11 filas, 1 por nombre
--   select has_function_privilege('anon', 'public.frisa_borrar_datos_prueba()', 'EXECUTE');  -- false
--
-- Rollback (quita TODO lo de V180; no toca nada más):
--   drop function if exists public.frisa_borrar_datos_prueba(), public.frisa_cargar_datos_prueba(jsonb),
--     public.frisa_set_maximo(uuid, uuid, integer), public.frisa_registrar_confirmacion(date, uuid, jsonb, text),
--     public.frisa_registrar_consumo(date, uuid, jsonb, text, text), public.frisa_registrar_entrega(date, jsonb, text, text),
--     public.frisa_registrar_produccion(date, uuid, integer, text, text), public.frisa_nombre_usuario(),
--     public.frisa_stock_planta(uuid, uuid, date), public.frisa_stock_bodega(uuid), public.frisa_exigir_admin();
--   drop table if exists public.frisa_movimientos, public.frisa_maximos, public.frisa_productos, public.frisa_plantas;
-- =====================================================================
