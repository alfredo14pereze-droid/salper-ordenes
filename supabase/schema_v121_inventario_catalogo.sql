-- =====================================================================
-- V121 — Inventario: catálogo estructurado (modelos, juegos de tallas,
-- clasificaciones, alias) y entrada por cuadrícula
-- =====================================================================
-- 100% ADITIVO. La base es compartida con lo que ya está en producción
-- (`main`): no se borra ni se renombra ninguna columna, y NO se cambia la
-- firma de ninguna función existente (todas las de aquí son nuevas). Los
-- artículos, movimientos, traspasos y conteos de V89-V119 siguen
-- funcionando igual, con o sin este archivo.
--
-- Qué agrega:
--   - "Cliente o línea" = inv_secciones (ya es exactamente eso: colegios
--     y líneas mezclados). Solo gana clasificación + liga opcional al
--     catálogo de clientes de Órdenes. No hay catálogo paralelo.
--   - inv_modelos: la prenda SIN talla (sección + tipo de prenda +
--     variante). inv_articulos gana modelo_id (NULL = "sin clasificar",
--     el artículo sigue funcionando como hoy).
--   - Un artículo creado desde un modelo guarda en `prenda` el texto
--     "Tipo + Variante" (ej. "Playera polo Blanca"), para que las
--     pantallas que ya están en producción lo agrupen igual que a los
--     viejos. El nombre completo ("Playera polo Instituto Tricio Blanca
--     T.12") se arma al mostrarlo, nunca se guarda.
--   - inv_catalogo(): regresa TODO el catálogo en un solo JSON. A
--     propósito no es `returns table`: PostgREST corta cualquier
--     respuesta de filas en 1000 (default de Supabase), y
--     inv_existencias(null) ya va en 465 artículos x 2 ubicaciones = 930
--     filas. Un solo valor JSON no tiene ese tope.
--
-- Permisos: los mismos helpers de V95, sin tocarlos.
--   ver    = inv_puede_ver()    — lectura de catálogos y de inv_catalogo()
--   mover  = inv_puede_mover()  — inv_entrada_modelo
--   editar = inv_puede_editar() — catálogos, modelos, alias, vincular
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez (es idempotente: se puede volver a correr sin duplicar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Normalización de texto (sin acentos, minúsculas, espacios simples)
--    — para que "Playera Pólo" y "playera  polo" cuenten como lo mismo
--    en los índices únicos. `translate` en vez de la extensión unaccent
--    para poder marcarla IMMUTABLE y usarla en índices.
-- ---------------------------------------------------------------------
create or replace function public.inv_norm(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun'),
    '\s+', ' ', 'g'))
$$;
revoke execute on function public.inv_norm(text) from public;
grant execute on function public.inv_norm(text) to authenticated;

-- ---------------------------------------------------------------------
-- B) Catálogos nuevos
-- ---------------------------------------------------------------------
create table if not exists public.inv_clasificaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_clasificaciones_nombre_key on public.inv_clasificaciones (public.inv_norm(nombre));
insert into public.inv_clasificaciones (nombre, orden) values
  ('Colegio', 1), ('Empresa', 2), ('Marca / Línea', 3)
on conflict do nothing;

create table if not exists public.inv_tipos_prenda (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden integer not null default 50,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_tipos_prenda_nombre_key on public.inv_tipos_prenda (public.inv_norm(nombre));
-- Semilla: los tipos del pedido + los que ya existen en el inventario
-- real (para que la sugerencia de "Artículos sin clasificar" funcione
-- desde el primer día). Todos editables/desactivables desde Administración.
insert into public.inv_tipos_prenda (nombre, orden) values
  ('Playera polo', 10), ('Playera cuello redondo', 11), ('Playera deportiva', 12),
  ('Camisa', 20), ('Filipina', 21), ('Juego quirúrgico', 22),
  ('Pants', 30), ('Pantalonera', 31), ('Pantalón', 32), ('Short', 33), ('Bermuda', 34),
  ('Falda', 40), ('Vestido', 41),
  ('Chamarra', 50), ('Sudadera', 51), ('Chaleco', 52),
  ('Cachucha', 60)
on conflict do nothing;

create table if not exists public.inv_juegos_tallas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden integer not null default 50,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_juegos_tallas_nombre_key on public.inv_juegos_tallas (public.inv_norm(nombre));

create table if not exists public.inv_juego_tallas_det (
  juego_id uuid not null references public.inv_juegos_tallas(id) on delete cascade,
  talla_id uuid not null references public.inv_tallas(id),
  orden integer not null default 0,
  primary key (juego_id, talla_id)
);

-- Semilla de juegos (decisión confirmada: adulto usa L/XL/2XL, las tallas
-- que ya existen en inv_tallas — no G/XG/XXG, para no tener dos tallas
-- que son la misma).
do $$
declare v_juego uuid;
begin
  if not exists (select 1 from public.inv_juegos_tallas where public.inv_norm(nombre) = 'escolar infantil') then
    insert into public.inv_juegos_tallas (nombre, orden) values ('Escolar infantil', 1) returning id into v_juego;
    insert into public.inv_juego_tallas_det (juego_id, talla_id, orden)
    select v_juego, t.id, t.orden from public.inv_tallas t
     where t.nombre in ('2', '4', '6', '8', '10', '12', '14', '16');
  end if;
  if not exists (select 1 from public.inv_juegos_tallas where public.inv_norm(nombre) = 'adulto') then
    insert into public.inv_juegos_tallas (nombre, orden) values ('Adulto', 2) returning id into v_juego;
    insert into public.inv_juego_tallas_det (juego_id, talla_id, orden)
    select v_juego, t.id, t.orden from public.inv_tallas t
     where t.nombre in ('CH', 'M', 'L', 'XL', '2XL');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- C) "Cliente o línea" = inv_secciones (+ clasificación y liga a clientes)
-- ---------------------------------------------------------------------
alter table public.inv_secciones
  add column if not exists clasificacion_id uuid references public.inv_clasificaciones(id),
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
-- Un cliente de Órdenes corresponde a lo más a una sección de Inventario.
create unique index if not exists inv_secciones_cliente_key on public.inv_secciones (cliente_id) where cliente_id is not null;

-- ---------------------------------------------------------------------
-- D) Modelos (prenda sin talla) + liga desde el artículo
-- ---------------------------------------------------------------------
create table if not exists public.inv_modelos (
  id uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references public.inv_secciones(id),
  tipo_prenda_id uuid not null references public.inv_tipos_prenda(id),
  variante text, -- opcional, texto libre: "Blanca", "Niña", "Manga larga", "Gen 2032"
  juego_tallas_id uuid references public.inv_juegos_tallas(id),
  activo boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);
-- El candado contra duplicados: misma sección + tipo + variante (sin
-- importar acentos/mayúsculas/espacios) es el MISMO modelo.
create unique index if not exists inv_modelos_unicos
  on public.inv_modelos (seccion_id, tipo_prenda_id, public.inv_norm(variante));
create index if not exists inv_modelos_seccion_idx on public.inv_modelos (seccion_id);

alter table public.inv_articulos
  add column if not exists modelo_id uuid references public.inv_modelos(id);
create index if not exists inv_articulos_modelo_idx on public.inv_articulos (modelo_id);
-- Un modelo no puede tener dos artículos de la misma talla.
create unique index if not exists inv_articulos_modelo_talla_key
  on public.inv_articulos (modelo_id, talla_id) where modelo_id is not null;

-- ---------------------------------------------------------------------
-- E) Alias (nombres de Microsip, de proveedor, apodos internos) — de un
--    modelo completo (aplica a todas sus tallas) o de un artículo suelto.
-- ---------------------------------------------------------------------
create table if not exists public.inv_alias (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid references public.inv_modelos(id) on delete cascade,
  articulo_id uuid references public.inv_articulos(id) on delete cascade,
  alias text not null,
  origen text not null default 'interno' check (origen in ('microsip', 'proveedor', 'interno')),
  creado_en timestamptz not null default now(),
  check (num_nonnulls(modelo_id, articulo_id) = 1)
);
create unique index if not exists inv_alias_modelo_key on public.inv_alias (modelo_id, public.inv_norm(alias)) where modelo_id is not null;
create unique index if not exists inv_alias_articulo_key on public.inv_alias (articulo_id, public.inv_norm(alias)) where articulo_id is not null;

-- ---------------------------------------------------------------------
-- F) RLS — mismo patrón que V89: lectura por inv_puede_ver(), escritura
--    solo por RPC security definer.
-- ---------------------------------------------------------------------
alter table public.inv_clasificaciones enable row level security;
alter table public.inv_tipos_prenda enable row level security;
alter table public.inv_juegos_tallas enable row level security;
alter table public.inv_juego_tallas_det enable row level security;
alter table public.inv_modelos enable row level security;
alter table public.inv_alias enable row level security;

drop policy if exists "inv ve clasificaciones" on public.inv_clasificaciones;
create policy "inv ve clasificaciones" on public.inv_clasificaciones for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve tipos prenda" on public.inv_tipos_prenda;
create policy "inv ve tipos prenda" on public.inv_tipos_prenda for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve juegos tallas" on public.inv_juegos_tallas;
create policy "inv ve juegos tallas" on public.inv_juegos_tallas for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve juego tallas det" on public.inv_juego_tallas_det;
create policy "inv ve juego tallas det" on public.inv_juego_tallas_det for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve modelos" on public.inv_modelos;
create policy "inv ve modelos" on public.inv_modelos for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve alias" on public.inv_alias;
create policy "inv ve alias" on public.inv_alias for select to authenticated using (public.inv_puede_ver());

revoke all on public.inv_clasificaciones, public.inv_tipos_prenda, public.inv_juegos_tallas,
  public.inv_juego_tallas_det, public.inv_modelos, public.inv_alias from public, anon, authenticated;
grant select on public.inv_clasificaciones, public.inv_tipos_prenda, public.inv_juegos_tallas,
  public.inv_juego_tallas_det, public.inv_modelos, public.inv_alias to authenticated;

-- =====================================================================
-- G) RPCs de catálogos (editar)
-- =====================================================================
create or replace function public.inv_guardar_clasificacion(p_id uuid, p_nombre text, p_activa boolean, p_orden integer)
returns public.inv_clasificaciones
language plpgsql security definer set search_path = public as $$
declare v public.inv_clasificaciones;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar clasificaciones.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre de la clasificación.'; end if;
  if p_id is null then
    insert into public.inv_clasificaciones (nombre, activa, orden) values (btrim(p_nombre), coalesce(p_activa, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_clasificaciones set nombre = btrim(p_nombre), activa = coalesce(p_activa, activa), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'La clasificación no existe.'; end if;
  end if;
  return v;
exception when unique_violation then
  raise exception 'Ya existe una clasificación con ese nombre.';
end; $$;

create or replace function public.inv_guardar_tipo_prenda(p_id uuid, p_nombre text, p_activo boolean, p_orden integer)
returns public.inv_tipos_prenda
language plpgsql security definer set search_path = public as $$
declare v public.inv_tipos_prenda;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar tipos de prenda.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre del tipo de prenda.'; end if;
  if p_id is null then
    insert into public.inv_tipos_prenda (nombre, activo, orden) values (btrim(p_nombre), coalesce(p_activo, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_tipos_prenda set nombre = btrim(p_nombre), activo = coalesce(p_activo, activo), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'El tipo de prenda no existe.'; end if;
  end if;
  return v;
exception when unique_violation then
  raise exception 'Ya existe un tipo de prenda con ese nombre.';
end; $$;

-- Talla nueva en el catálogo general (ej. "18", que hoy no existe). El
-- `orden` decide dónde cae: infantil < 1000 (convención: número x 10),
-- letra 1000-1999, pantalón 2000-8999, "Sin talla" 9000.
create or replace function public.inv_guardar_talla(p_id uuid, p_nombre text, p_orden integer)
returns public.inv_tallas
language plpgsql security definer set search_path = public as $$
declare v public.inv_tallas;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar tallas.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe la talla.'; end if;
  if p_orden is null then raise exception 'Indica el orden de la talla.'; end if;
  if p_id is null then
    insert into public.inv_tallas (nombre, orden) values (btrim(p_nombre), p_orden) returning * into v;
  else
    -- Solo se puede mover de lugar; el nombre de una talla ya usada no se cambia.
    update public.inv_tallas set orden = p_orden where id = p_id returning * into v;
    if v.id is null then raise exception 'La talla no existe.'; end if;
  end if;
  return v;
exception when unique_violation then
  raise exception 'Esa talla ya existe en el catálogo.';
end; $$;

-- p_talla_ids: las tallas del juego EN EL ORDEN en que deben mostrarse.
create or replace function public.inv_guardar_juego_tallas(
  p_id uuid, p_nombre text, p_activo boolean, p_orden integer, p_talla_ids uuid[]
) returns public.inv_juegos_tallas
language plpgsql security definer set search_path = public as $$
declare v public.inv_juegos_tallas;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar juegos de tallas.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre del juego de tallas.'; end if;
  if coalesce(array_length(p_talla_ids, 1), 0) = 0 then raise exception 'Elige al menos una talla.'; end if;
  if p_id is null then
    insert into public.inv_juegos_tallas (nombre, activo, orden) values (btrim(p_nombre), coalesce(p_activo, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_juegos_tallas set nombre = btrim(p_nombre), activo = coalesce(p_activo, activo), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'El juego de tallas no existe.'; end if;
    delete from public.inv_juego_tallas_det where juego_id = v.id;
  end if;
  -- Cambiar un juego NO toca los modelos que ya se crearon con él: el
  -- juego solo es la plantilla al momento de crear el modelo.
  insert into public.inv_juego_tallas_det (juego_id, talla_id, orden)
  select v.id, x.talla_id, min(x.pos)::integer
    from unnest(p_talla_ids) with ordinality as x(talla_id, pos)
   group by x.talla_id;
  return v;
exception when unique_violation then
  raise exception 'Ya existe un juego de tallas con ese nombre.';
end; $$;

-- Clasificación / cliente de una sección. Función aparte (no un parámetro
-- nuevo en inv_guardar_seccion) para no cambiar la firma de una función
-- que el frontend de producción ya usa.
create or replace function public.inv_clasificar_seccion(p_seccion_id uuid, p_clasificacion_id uuid, p_cliente_id uuid)
returns public.inv_secciones
language plpgsql security definer set search_path = public as $$
declare v public.inv_secciones;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar secciones.'; end if;
  update public.inv_secciones set clasificacion_id = p_clasificacion_id, cliente_id = p_cliente_id
   where id = p_seccion_id returning * into v;
  if v.id is null then raise exception 'La sección no existe.'; end if;
  return v;
exception when unique_violation then
  raise exception 'Ese cliente ya está ligado a otra sección de Inventario.';
end; $$;

-- =====================================================================
-- H) Modelos
-- =====================================================================
-- Crea el modelo y TODAS sus tallas con existencia 0 (no se crea ningún
-- movimiento: la existencia es SUM(inv_movimientos), sin filas = 0).
-- Todo en una transacción. Si el modelo ya existe NO cambia nada y regresa
-- ya_existia = true, para que la pantalla avise.
-- Si en esa sección ya había artículos sueltos (sin modelo) con
-- exactamente el mismo texto de prenda ("Tipo + Variante"), no se
-- duplican: se vinculan a este modelo — los de las tallas elegidas y
-- también los de cualquier otra talla, para que la misma prenda no quede
-- partida en dos grupos. La pantalla lo avisa en la vista previa.
create or replace function public.inv_crear_modelo(
  p_seccion_id uuid, p_tipo_prenda_id uuid, p_variante text, p_juego_tallas_id uuid, p_talla_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_modelo public.inv_modelos; v_variante text := nullif(btrim(regexp_replace(coalesce(p_variante, ''), '\s+', ' ', 'g')), '');
  v_tipo text; v_prenda text; v_talla uuid; v_art public.inv_articulos; v_creados integer := 0; v_vinculados integer := 0; v_extra integer := 0;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para crear modelos.'; end if;
  if p_seccion_id is null or not exists (select 1 from public.inv_secciones where id = p_seccion_id) then
    raise exception 'Elige el cliente o línea.';
  end if;
  select nombre into v_tipo from public.inv_tipos_prenda where id = p_tipo_prenda_id;
  if v_tipo is null then raise exception 'Elige el tipo de prenda.'; end if;
  if coalesce(array_length(p_talla_ids, 1), 0) = 0 then raise exception 'Elige al menos una talla.'; end if;

  select * into v_modelo from public.inv_modelos
   where seccion_id = p_seccion_id and tipo_prenda_id = p_tipo_prenda_id
     and public.inv_norm(variante) = public.inv_norm(v_variante);
  if v_modelo.id is not null then
    return jsonb_build_object('modelo_id', v_modelo.id, 'ya_existia', true, 'creados', 0, 'vinculados', 0);
  end if;

  insert into public.inv_modelos (seccion_id, tipo_prenda_id, variante, juego_tallas_id, creado_por)
  values (p_seccion_id, p_tipo_prenda_id, v_variante, p_juego_tallas_id, auth.uid())
  returning * into v_modelo;

  v_prenda := v_tipo || coalesce(' ' || v_variante, '');
  for v_talla in select distinct t from unnest(p_talla_ids) as t loop
    select * into v_art from public.inv_articulos
     where seccion_id = p_seccion_id and lower(btrim(prenda)) = lower(btrim(v_prenda)) and talla_id = v_talla;
    if v_art.id is null then
      insert into public.inv_articulos (seccion_id, prenda, talla_id, modelo_id)
      values (p_seccion_id, v_prenda, v_talla, v_modelo.id);
      v_creados := v_creados + 1;
    elsif v_art.modelo_id is null then
      update public.inv_articulos set modelo_id = v_modelo.id, activo = true, actualizado_en = now() where id = v_art.id;
      v_vinculados := v_vinculados + 1;
    else
      raise exception 'La prenda "%" ya pertenece a otro modelo en esta sección.', v_prenda;
    end if;
  end loop;

  update public.inv_articulos set modelo_id = v_modelo.id, actualizado_en = now()
   where seccion_id = p_seccion_id and lower(btrim(prenda)) = lower(btrim(v_prenda)) and modelo_id is null;
  get diagnostics v_extra = row_count;

  return jsonb_build_object('modelo_id', v_modelo.id, 'ya_existia', false, 'creados', v_creados, 'vinculados', v_vinculados + v_extra);
end; $$;

-- Talla extra para un modelo que ya existe (ej. T.18), sin rehacerlo.
-- Toma el texto de `prenda` de los artículos que el modelo ya tiene (así
-- las pantallas viejas la agrupan junto con sus hermanas); si el modelo
-- no tiene ninguno, usa "Tipo + Variante".
create or replace function public.inv_modelo_agregar_talla(p_modelo_id uuid, p_talla_id uuid)
returns public.inv_articulos
language plpgsql security definer set search_path = public as $$
declare v_modelo public.inv_modelos; v_prenda text; v public.inv_articulos;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para agregar tallas a un modelo.'; end if;
  select * into v_modelo from public.inv_modelos where id = p_modelo_id;
  if v_modelo.id is null then raise exception 'El modelo no existe.'; end if;
  if not exists (select 1 from public.inv_tallas where id = p_talla_id) then raise exception 'Elige la talla.'; end if;

  select * into v from public.inv_articulos where modelo_id = p_modelo_id and talla_id = p_talla_id;
  if v.id is not null then
    if v.activo then raise exception 'Este modelo ya tiene esa talla.'; end if;
    update public.inv_articulos set activo = true, actualizado_en = now() where id = v.id returning * into v;
    return v;
  end if;

  select a.prenda into v_prenda from public.inv_articulos a
   where a.modelo_id = p_modelo_id group by a.prenda order by count(*) desc, a.prenda limit 1;
  if v_prenda is null then
    select t.nombre || coalesce(' ' || v_modelo.variante, '') into v_prenda
      from public.inv_tipos_prenda t where t.id = v_modelo.tipo_prenda_id;
  end if;

  select * into v from public.inv_articulos
   where seccion_id = v_modelo.seccion_id and lower(btrim(prenda)) = lower(btrim(v_prenda)) and talla_id = p_talla_id;
  if v.id is not null then
    if v.modelo_id is not null then raise exception 'Esa prenda y talla ya pertenecen a otro modelo.'; end if;
    update public.inv_articulos set modelo_id = p_modelo_id, activo = true, actualizado_en = now() where id = v.id returning * into v;
    return v;
  end if;

  insert into public.inv_articulos (seccion_id, prenda, talla_id, modelo_id)
  values (v_modelo.seccion_id, v_prenda, p_talla_id, p_modelo_id)
  returning * into v;
  return v;
end; $$;

-- Entrada por cuadrícula: p_lineas = [{"articulo_id":"...","cantidad":5}, ...]
-- SOLO con las tallas que llegaron (las que se dejan vacías no se mandan,
-- así que no se mueven). Todo o nada.
create or replace function public.inv_entrada_modelo(
  p_modelo_id uuid, p_ubicacion_id uuid, p_motivo_id uuid, p_nota text, p_lineas jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare ln jsonb; v_art uuid; v_cant integer; v_n integer := 0; v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if not public.inv_puede_mover() then raise exception 'No tienes permiso para registrar movimientos de inventario.'; end if;
  if not exists (select 1 from public.inv_modelos where id = p_modelo_id) then raise exception 'El modelo no existe.'; end if;
  if not exists (select 1 from public.inv_ubicaciones where id = p_ubicacion_id) then raise exception 'Elige la ubicación.'; end if;
  if not exists (select 1 from public.inv_motivos m where m.id = p_motivo_id) then raise exception 'Elige el motivo.'; end if;
  if exists (select 1 from public.inv_motivos m where m.id = p_motivo_id and m.sistema) then
    raise exception 'Ese motivo es de uso interno del sistema.';
  end if;
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lineas, '[]'::jsonb)) = 0 then
    raise exception 'Captura la cantidad de al menos una talla.';
  end if;

  for ln in select * from jsonb_array_elements(p_lineas) loop
    v_art := (ln->>'articulo_id')::uuid;
    v_cant := (ln->>'cantidad')::integer;
    if v_art is null or coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada talla capturada necesita una cantidad mayor a cero.';
    end if;
    if not exists (select 1 from public.inv_articulos a where a.id = v_art and a.modelo_id = p_modelo_id) then
      raise exception 'Una de las tallas no pertenece a este modelo.';
    end if;
    insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, nota, creado_por, creado_por_nombre)
    values (v_art, p_ubicacion_id, 'entrada', v_cant, p_motivo_id, v_nota, auth.uid(), public.inv_nombre_actual());
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- =====================================================================
-- I) Alias
-- =====================================================================
create or replace function public.inv_guardar_alias(p_modelo_id uuid, p_articulo_id uuid, p_alias text, p_origen text)
returns public.inv_alias
language plpgsql security definer set search_path = public as $$
declare v public.inv_alias;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar alias.'; end if;
  if btrim(coalesce(p_alias, '')) = '' then raise exception 'Escribe el alias.'; end if;
  if num_nonnulls(p_modelo_id, p_articulo_id) <> 1 then raise exception 'El alias va en un modelo o en un artículo, no en ambos.'; end if;
  if coalesce(p_origen, 'interno') not in ('microsip', 'proveedor', 'interno') then raise exception 'Origen de alias inválido.'; end if;
  insert into public.inv_alias (modelo_id, articulo_id, alias, origen)
  values (p_modelo_id, p_articulo_id, btrim(p_alias), coalesce(p_origen, 'interno'))
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'Ese alias ya está dado de alta.';
end; $$;

create or replace function public.inv_quitar_alias(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar alias.'; end if;
  delete from public.inv_alias where id = p_id;
end; $$;

-- =====================================================================
-- J) Artículos que ya existían: vincular a un modelo
-- =====================================================================
-- p_grupos = [{"seccion_id":"...","tipo_prenda_id":"...","variante":"Gen 2032",
--              "articulo_ids":["...","..."]}, ...]
-- Por cada grupo busca (o crea) el modelo y le pone modelo_id a esos
-- artículos. NO renombra `prenda`, NO cambia talla ni sección, NO toca
-- movimientos. Todo o nada.
create or replace function public.inv_vincular_articulos(p_grupos jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  g jsonb; v_seccion uuid; v_tipo uuid; v_variante text; v_modelo uuid; v_ids uuid[]; v_n integer := 0; v_count integer;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para clasificar artículos.'; end if;
  if jsonb_typeof(coalesce(p_grupos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_grupos, '[]'::jsonb)) = 0 then
    raise exception 'No hay nada que clasificar.';
  end if;

  for g in select * from jsonb_array_elements(p_grupos) loop
    v_seccion := (g->>'seccion_id')::uuid;
    v_tipo := (g->>'tipo_prenda_id')::uuid;
    v_variante := nullif(btrim(regexp_replace(coalesce(g->>'variante', ''), '\s+', ' ', 'g')), '');
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(coalesce(g->'articulo_ids', '[]'::jsonb)) as x;
    if v_seccion is null or v_tipo is null or coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'A cada grupo le falta cliente o línea, tipo de prenda o artículos.';
    end if;
    if not exists (select 1 from public.inv_tipos_prenda where id = v_tipo) then raise exception 'El tipo de prenda no existe.'; end if;
    if exists (select 1 from public.inv_articulos a where a.id = any(v_ids) and a.seccion_id <> v_seccion) then
      raise exception 'Un artículo no pertenece al cliente o línea indicado.';
    end if;
    if exists (select 1 from public.inv_articulos a where a.id = any(v_ids) and a.modelo_id is not null) then
      raise exception 'Uno de los artículos ya está clasificado.';
    end if;

    select id into v_modelo from public.inv_modelos
     where seccion_id = v_seccion and tipo_prenda_id = v_tipo and public.inv_norm(variante) = public.inv_norm(v_variante);
    if v_modelo is null then
      insert into public.inv_modelos (seccion_id, tipo_prenda_id, variante, creado_por)
      values (v_seccion, v_tipo, v_variante, auth.uid()) returning id into v_modelo;
    end if;

    begin
      update public.inv_articulos set modelo_id = v_modelo, actualizado_en = now() where id = any(v_ids);
      get diagnostics v_count = row_count;
    exception when unique_violation then
      raise exception 'Ese modelo ya tiene un artículo con una de esas tallas (revisa que no sean dos prendas distintas con el mismo tipo y variante).';
    end;
    v_n := v_n + v_count;
  end loop;
  return v_n;
end; $$;

-- Deshacer una clasificación equivocada: el artículo vuelve a "sin
-- clasificar" (solo limpia modelo_id; no toca prenda, talla ni
-- existencia). Un modelo que se queda sin ningún artículo se elimina
-- (junto con sus alias), para que no quede un modelo vacío estorbando en
-- la lista ni bloqueando volver a crearlo.
create or replace function public.inv_desvincular_articulos(p_articulo_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_modelos uuid[];
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para clasificar artículos.'; end if;
  select array_agg(distinct modelo_id) into v_modelos from public.inv_articulos
   where id = any(p_articulo_ids) and modelo_id is not null;
  update public.inv_articulos set modelo_id = null, actualizado_en = now()
   where id = any(p_articulo_ids) and modelo_id is not null;
  get diagnostics v_count = row_count;
  delete from public.inv_modelos mo
   where mo.id = any(coalesce(v_modelos, '{}'::uuid[]))
     and not exists (select 1 from public.inv_articulos a where a.modelo_id = mo.id);
  return v_count;
end; $$;

-- =====================================================================
-- K) Lectura: todo el catálogo en un solo JSON (ver nota del encabezado
--    sobre el tope de 1000 filas). Compacto a propósito:
--      articulos:   [{id, s (sección), p (prenda), t (talla), m (modelo), min}]
--      existencias: [[articulo_id, ubicacion_id, cantidad]]  (solo <> 0)
--      modelos:     [{id, s, tp (tipo de prenda), v (variante), j (juego)}]
--      alias:       [{id, m, a, alias, origen}]
--    NULL si quien llama no puede ver Inventario.
-- =====================================================================
create or replace function public.inv_catalogo() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'articulos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 's', a.seccion_id, 'p', a.prenda, 't', a.talla_id, 'm', a.modelo_id, 'min', a.minimo))
        from public.inv_articulos a where a.activo), '[]'::jsonb),
    'existencias', coalesce((
      select jsonb_agg(jsonb_build_array(x.articulo_id, x.ubicacion_id, x.n))
        from (select m.articulo_id, m.ubicacion_id, sum(m.cantidad)::integer as n
                from public.inv_movimientos m group by m.articulo_id, m.ubicacion_id
              having sum(m.cantidad) <> 0) x), '[]'::jsonb),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object('id', mo.id, 's', mo.seccion_id, 'tp', mo.tipo_prenda_id, 'v', mo.variante, 'j', mo.juego_tallas_id))
        from public.inv_modelos mo where mo.activo), '[]'::jsonb),
    'alias', coalesce((
      select jsonb_agg(jsonb_build_object('id', al.id, 'm', al.modelo_id, 'a', al.articulo_id, 'alias', al.alias, 'origen', al.origen))
        from public.inv_alias al), '[]'::jsonb)
  )
  where public.inv_puede_ver();
$$;

-- =====================================================================
-- L) Permisos de ejecución
-- =====================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'inv_guardar_clasificacion(uuid, text, boolean, integer)', 'inv_guardar_tipo_prenda(uuid, text, boolean, integer)',
    'inv_guardar_talla(uuid, text, integer)', 'inv_guardar_juego_tallas(uuid, text, boolean, integer, uuid[])',
    'inv_clasificar_seccion(uuid, uuid, uuid)',
    'inv_crear_modelo(uuid, uuid, text, uuid, uuid[])', 'inv_modelo_agregar_talla(uuid, uuid)',
    'inv_entrada_modelo(uuid, uuid, uuid, text, jsonb)',
    'inv_guardar_alias(uuid, uuid, text, text)', 'inv_quitar_alias(uuid)',
    'inv_vincular_articulos(jsonb)', 'inv_desvincular_articulos(uuid[])',
    'inv_catalogo()'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
