-- =====================================================================
-- V89 — Módulo de Inventario (artículos por fuera de Microsip)  (BORRADOR:
-- NO aplicado todavía)
-- =====================================================================
-- No existe un "Inventario de Tela" previo en este proyecto (se buscó en
-- todo el código y no hay tablas de stock con ese nombre). El precedente
-- real más parecido — catálogo + historial de movimientos, folio de
-- secuencia que nunca se reutiliza, escritura solo por RPC — es Talleros
-- (schema_v63_talleros.sql: mt_contenedores + mt_movimientos), así que es
-- el patrón que se reusa aquí.
--
-- Todo NUEVO, prefijo `inv_`, no toca ninguna tabla existente.
--
-- MODO PRUEBA (punto D): todas las tablas tienen RLS gateado por
-- inv_tiene_acceso(), que hoy solo es verdad para TU usuario (tabla
-- inv_acceso_beta, una fila). Abrirlo a más gente después es agregar filas
-- a esa tabla (o cambiar inv_tiene_acceso() para que también mire el rol) —
-- no hay que tocar ninguna policy ni RPC.
--
-- Existencia: NUNCA se guarda un número que se sobrescribe. Siempre es
-- SUM(cantidad) de inv_movimientos para ese artículo (+ ubicación).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Acceso (modo prueba) — helpers primero, se usan en todas las policies
-- ---------------------------------------------------------------------
create table if not exists public.inv_acceso_beta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
-- RLS sin ninguna policy de SELECT a propósito: nadie necesita leer esta
-- tabla directo (ni siquiera tu usuario) — solo la consulta
-- inv_tiene_acceso() por dentro, como security definer. Así queda
-- invisible incluso por API/REST directa.
alter table public.inv_acceso_beta enable row level security;
revoke all on public.inv_acceso_beta from public, anon, authenticated;
-- (la fila de tu usuario se agrega al final de este archivo, cuando confirmes el correo)

create or replace function public.inv_tiene_acceso() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inv_acceso_beta where user_id = auth.uid())
$$;

-- Ver el módulo: SOLO los 3 roles admin (general/tienda/fábrica) — ni
-- ventas/contabilidad ni los roles de línea de fábrica. "fábrica, solo ver":
-- admin_fabrica consulta pero no mueve nada.
create or replace function public.inv_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select public.inv_tiene_acceso()
     and coalesce(public.current_user_role(), '') in ('admin_general', 'admin_tienda', 'admin_fabrica')
$$;

-- Movimientos/conteos/traspasos: admin_tienda / admin_general. admin_fabrica
-- queda fuera a propósito (solo ve).
create or replace function public.inv_puede_mover() returns boolean
language sql stable security definer set search_path = public as $$
  select public.inv_tiene_acceso()
     and coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_general')
$$;

-- Altas/ediciones de catálogos (artículos, secciones, ubicaciones, motivos):
-- mismo grupo que puede mover.
create or replace function public.inv_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select public.inv_puede_mover()
$$;

revoke execute on function public.inv_tiene_acceso() from public;
revoke execute on function public.inv_puede_ver() from public;
revoke execute on function public.inv_puede_mover() from public;
revoke execute on function public.inv_puede_editar() from public;
grant execute on function public.inv_tiene_acceso() to authenticated;
grant execute on function public.inv_puede_ver() to authenticated;
grant execute on function public.inv_puede_mover() to authenticated;
grant execute on function public.inv_puede_editar() to authenticated;

-- ---------------------------------------------------------------------
-- B) Catálogos
-- ---------------------------------------------------------------------
create table if not exists public.inv_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_ubicaciones_nombre_key on public.inv_ubicaciones (lower(btrim(nombre)));
insert into public.inv_ubicaciones (nombre, orden) values ('Bodega (tercer piso)', 1), ('Tienda', 2)
on conflict do nothing;

create table if not exists public.inv_secciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_secciones_nombre_key on public.inv_secciones (lower(btrim(nombre)));

-- Catálogo de tallas: el orden lógico vive aquí (columna `orden`), no se
-- recalcula en el frontend. Ver la propuesta de orden en el mensaje.
create table if not exists public.inv_tallas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden integer not null,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_tallas_nombre_key on public.inv_tallas (lower(btrim(nombre)));

create table if not exists public.inv_motivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  sistema boolean not null default false, -- 'Conteo inicial'/'Conteo físico': los usa el sistema, no se editan/borran desde la UI
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
create unique index if not exists inv_motivos_nombre_key on public.inv_motivos (lower(btrim(nombre)));
insert into public.inv_motivos (nombre, orden) values
  ('Venta', 1), ('Entrada de producción', 2), ('Apartado', 3),
  ('Devolución', 4), ('Ajuste', 5), ('Otro', 6)
on conflict do nothing;
insert into public.inv_motivos (nombre, sistema, orden) values
  ('Conteo inicial', true, 90), ('Conteo físico', true, 91), ('Traspaso', true, 92)
on conflict do nothing;

alter table public.inv_ubicaciones enable row level security;
alter table public.inv_secciones enable row level security;
alter table public.inv_tallas enable row level security;
alter table public.inv_motivos enable row level security;
drop policy if exists "inv ve ubicaciones" on public.inv_ubicaciones;
create policy "inv ve ubicaciones" on public.inv_ubicaciones for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve secciones" on public.inv_secciones;
create policy "inv ve secciones" on public.inv_secciones for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve tallas" on public.inv_tallas;
create policy "inv ve tallas" on public.inv_tallas for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve motivos" on public.inv_motivos;
create policy "inv ve motivos" on public.inv_motivos for select to authenticated using (public.inv_puede_ver());
revoke all on public.inv_ubicaciones, public.inv_secciones, public.inv_tallas, public.inv_motivos from public, anon, authenticated;
grant select on public.inv_ubicaciones, public.inv_secciones, public.inv_tallas, public.inv_motivos to authenticated;

-- ---------------------------------------------------------------------
-- C) Artículos
-- ---------------------------------------------------------------------
create table if not exists public.inv_articulos (
  id uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references public.inv_secciones(id),
  prenda text not null,
  talla_id uuid not null references public.inv_tallas(id),
  minimo integer,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists inv_articulos_unicos on public.inv_articulos (seccion_id, lower(btrim(prenda)), talla_id);
create index if not exists inv_articulos_seccion_idx on public.inv_articulos (seccion_id);

alter table public.inv_articulos enable row level security;
drop policy if exists "inv ve articulos" on public.inv_articulos;
create policy "inv ve articulos" on public.inv_articulos for select to authenticated using (public.inv_puede_ver());
revoke all on public.inv_articulos from public, anon, authenticated;
grant select on public.inv_articulos to authenticated;

-- ---------------------------------------------------------------------
-- D) Movimientos — bitácora, append-only. cantidad SIEMPRE firmada
--    (entrada/conteo inicial positiva; salida negativa; ajuste/conteo
--    físico según el signo de la diferencia).
-- ---------------------------------------------------------------------
create table if not exists public.inv_movimientos (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references public.inv_articulos(id),
  ubicacion_id uuid not null references public.inv_ubicaciones(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'conteo')),
  cantidad integer not null check (cantidad <> 0),
  motivo_id uuid not null references public.inv_motivos(id),
  nota text,
  traspaso_id uuid, -- FK real se agrega en la sección E (orden de declaración)
  conteo_id uuid,   -- FK real se agrega en la sección F
  creado_por uuid references public.profiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists inv_movimientos_articulo_idx on public.inv_movimientos (articulo_id, ubicacion_id);
create index if not exists inv_movimientos_fecha_idx on public.inv_movimientos (creado_en);

alter table public.inv_movimientos enable row level security;
drop policy if exists "inv ve movimientos" on public.inv_movimientos;
create policy "inv ve movimientos" on public.inv_movimientos for select to authenticated using (public.inv_puede_ver());
revoke all on public.inv_movimientos from public, anon, authenticated;
grant select on public.inv_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- E) Traspasos (folio T-0001…, nunca se reutiliza)
-- ---------------------------------------------------------------------
create sequence if not exists public.inv_traspaso_folio_seq;

create table if not exists public.inv_traspasos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('T-' || lpad(nextval('public.inv_traspaso_folio_seq')::text, 4, '0')),
  origen_id uuid not null references public.inv_ubicaciones(id),
  destino_id uuid not null references public.inv_ubicaciones(id),
  estado text not null default 'aplicado' check (estado in ('aplicado', 'en_transito')), -- hoy solo 'aplicado'; listo para 'en_transito' después
  nota text,
  creado_por uuid references public.profiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  check (origen_id <> destino_id)
);

create table if not exists public.inv_traspaso_lineas (
  id uuid primary key default gen_random_uuid(),
  traspaso_id uuid not null references public.inv_traspasos(id) on delete cascade,
  articulo_id uuid not null references public.inv_articulos(id),
  cantidad integer not null check (cantidad > 0)
);
create index if not exists inv_traspaso_lineas_idx on public.inv_traspaso_lineas (traspaso_id);

alter table public.inv_movimientos add constraint inv_movimientos_traspaso_fk
  foreign key (traspaso_id) references public.inv_traspasos(id) on delete set null;

alter table public.inv_traspasos enable row level security;
alter table public.inv_traspaso_lineas enable row level security;
drop policy if exists "inv ve traspasos" on public.inv_traspasos;
create policy "inv ve traspasos" on public.inv_traspasos for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve traspaso lineas" on public.inv_traspaso_lineas;
create policy "inv ve traspaso lineas" on public.inv_traspaso_lineas for select to authenticated using (public.inv_puede_ver());
revoke all on public.inv_traspasos, public.inv_traspaso_lineas from public, anon, authenticated;
grant select on public.inv_traspasos, public.inv_traspaso_lineas to authenticated;

-- ---------------------------------------------------------------------
-- F) Conteos físicos: snapshot de "sistema" al imprimir + captura después.
-- ---------------------------------------------------------------------
create table if not exists public.inv_conteos (
  id uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references public.inv_secciones(id),
  ubicacion_id uuid not null references public.inv_ubicaciones(id),
  creado_por uuid references public.profiles(id) on delete set null,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  confirmado_por_nombre text
);
create index if not exists inv_conteos_seccion_idx on public.inv_conteos (seccion_id, ubicacion_id);

create table if not exists public.inv_conteo_lineas (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.inv_conteos(id) on delete cascade,
  articulo_id uuid not null references public.inv_articulos(id),
  sistema integer not null, -- snapshot de la existencia al momento de imprimir
  conteo integer            -- lo que se captura después; null = no capturado
);
create index if not exists inv_conteo_lineas_idx on public.inv_conteo_lineas (conteo_id);

alter table public.inv_movimientos add constraint inv_movimientos_conteo_fk
  foreign key (conteo_id) references public.inv_conteos(id) on delete set null;

alter table public.inv_conteos enable row level security;
alter table public.inv_conteo_lineas enable row level security;
drop policy if exists "inv ve conteos" on public.inv_conteos;
create policy "inv ve conteos" on public.inv_conteos for select to authenticated using (public.inv_puede_ver());
drop policy if exists "inv ve conteo lineas" on public.inv_conteo_lineas;
create policy "inv ve conteo lineas" on public.inv_conteo_lineas for select to authenticated using (public.inv_puede_ver());
revoke all on public.inv_conteos, public.inv_conteo_lineas from public, anon, authenticated;
grant select on public.inv_conteos, public.inv_conteo_lineas to authenticated;

-- =====================================================================
-- G) RPCs
-- =====================================================================

-- --- Catálogos (admin) --------------------------------------------------
create or replace function public.inv_guardar_seccion(p_id uuid, p_nombre text, p_activa boolean, p_orden integer)
returns public.inv_secciones
language plpgsql security definer set search_path = public as $$
declare v public.inv_secciones;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar secciones.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre de la sección.'; end if;
  if p_id is null then
    insert into public.inv_secciones (nombre, activa, orden) values (btrim(p_nombre), coalesce(p_activa, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_secciones set nombre = btrim(p_nombre), activa = coalesce(p_activa, activa), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'La sección no existe.'; end if;
  end if;
  return v;
end; $$;

create or replace function public.inv_guardar_ubicacion(p_id uuid, p_nombre text, p_activa boolean, p_orden integer)
returns public.inv_ubicaciones
language plpgsql security definer set search_path = public as $$
declare v public.inv_ubicaciones;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar ubicaciones.'; end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre de la ubicación.'; end if;
  if p_id is null then
    insert into public.inv_ubicaciones (nombre, activa, orden) values (btrim(p_nombre), coalesce(p_activa, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_ubicaciones set nombre = btrim(p_nombre), activa = coalesce(p_activa, activa), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'La ubicación no existe.'; end if;
  end if;
  return v;
end; $$;

create or replace function public.inv_guardar_motivo(p_id uuid, p_nombre text, p_activo boolean, p_orden integer)
returns public.inv_motivos
language plpgsql security definer set search_path = public as $$
declare v public.inv_motivos;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar motivos.'; end if;
  if p_id is not null and exists (select 1 from public.inv_motivos m where m.id = p_id and m.sistema) then
    raise exception 'Este motivo lo usa el sistema y no se puede editar.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe el nombre del motivo.'; end if;
  if p_id is null then
    insert into public.inv_motivos (nombre, activo, orden) values (btrim(p_nombre), coalesce(p_activo, true), coalesce(p_orden, 50))
    returning * into v;
  else
    update public.inv_motivos set nombre = btrim(p_nombre), activo = coalesce(p_activo, activo), orden = coalesce(p_orden, orden)
     where id = p_id returning * into v;
    if v.id is null then raise exception 'El motivo no existe.'; end if;
  end if;
  return v;
end; $$;

-- Artículo: p_talla_nombre resuelve/crea la talla en el catálogo inv_tallas
-- (con el orden que le corresponda si es nueva — ver inv_talla_orden_sugerido).
create or replace function public.inv_guardar_articulo(
  p_id uuid, p_seccion_id uuid, p_prenda text, p_talla_id uuid, p_minimo integer, p_activo boolean
) returns public.inv_articulos
language plpgsql security definer set search_path = public as $$
declare v public.inv_articulos;
begin
  if not public.inv_puede_editar() then raise exception 'No tienes permiso para editar artículos.'; end if;
  if btrim(coalesce(p_prenda, '')) = '' then raise exception 'Escribe el nombre de la prenda.'; end if;
  if p_seccion_id is null or p_talla_id is null then raise exception 'Elige la sección y la talla.'; end if;
  if p_minimo is not null and p_minimo < 0 then raise exception 'El mínimo no puede ser negativo.'; end if;
  if p_id is null then
    insert into public.inv_articulos (seccion_id, prenda, talla_id, minimo, activo)
    values (p_seccion_id, btrim(p_prenda), p_talla_id, p_minimo, coalesce(p_activo, true))
    returning * into v;
  else
    update public.inv_articulos
       set seccion_id = p_seccion_id, prenda = btrim(p_prenda), talla_id = p_talla_id, minimo = p_minimo,
           activo = coalesce(p_activo, activo), actualizado_en = now()
     where id = p_id returning * into v;
    if v.id is null then raise exception 'El artículo no existe.'; end if;
  end if;
  return v;
exception when unique_violation then
  raise exception 'Ya existe un artículo con esa sección, prenda y talla.';
end; $$;

-- --- Movimiento manual (+ / -) -----------------------------------------
create or replace function public.inv_registrar_movimiento(
  p_articulo_id uuid, p_ubicacion_id uuid, p_tipo text, p_cantidad integer, p_motivo_id uuid, p_nota text
) returns public.inv_movimientos
language plpgsql security definer set search_path = public as $$
declare v public.inv_movimientos; v_existencia integer;
begin
  if not public.inv_puede_mover() then raise exception 'No tienes permiso para registrar movimientos de inventario.'; end if;
  if p_tipo not in ('entrada', 'salida') then raise exception 'Tipo de movimiento inválido.'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if exists (select 1 from public.inv_motivos m where m.id = p_motivo_id and m.sistema) then
    raise exception 'Ese motivo es de uso interno del sistema.';
  end if;
  if p_tipo = 'salida' then
    select coalesce(sum(cantidad), 0) into v_existencia from public.inv_movimientos
     where articulo_id = p_articulo_id and ubicacion_id = p_ubicacion_id;
    if v_existencia < p_cantidad then
      raise exception 'No hay suficiente existencia en esa ubicación (hay %).', v_existencia;
    end if;
  end if;
  insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, nota, creado_por, creado_por_nombre)
  values (p_articulo_id, p_ubicacion_id, p_tipo, case when p_tipo = 'salida' then -p_cantidad else p_cantidad end,
          p_motivo_id, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.inv_nombre_actual())
  returning * into v;
  return v;
end; $$;

create or replace function public.inv_nombre_actual() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from public.profiles where id = auth.uid()), '')
$$;
revoke execute on function public.inv_nombre_actual() from public;
grant execute on function public.inv_nombre_actual() to authenticated;

-- --- Existencias (lectura calculada — nunca se guarda un total) ---------
create or replace function public.inv_existencias(p_seccion_id uuid default null)
returns table (
  articulo_id uuid, seccion_id uuid, prenda text, talla_id uuid, talla text, talla_orden integer,
  minimo integer, ubicacion_id uuid, ubicacion text, existencia integer
)
language sql stable security definer set search_path = public as $$
  select a.id, a.seccion_id, a.prenda, a.talla_id, t.nombre, t.orden, a.minimo, u.id, u.nombre,
         coalesce((select sum(m.cantidad) from public.inv_movimientos m
                    where m.articulo_id = a.id and m.ubicacion_id = u.id), 0)::integer
  from public.inv_articulos a
  join public.inv_tallas t on t.id = a.talla_id
  cross join public.inv_ubicaciones u
  where a.activo and u.activa and (p_seccion_id is null or a.seccion_id = p_seccion_id)
    and public.inv_puede_ver();
$$;
revoke execute on function public.inv_existencias(uuid) from public;
grant execute on function public.inv_existencias(uuid) to authenticated;

create or replace function public.inv_historial_articulo(p_articulo_id uuid)
returns table (
  id uuid, ubicacion text, tipo text, cantidad integer, motivo text, nota text,
  usuario text, creado_en timestamptz, traspaso_folio text, conteo_id uuid
)
language sql stable security definer set search_path = public as $$
  select m.id, u.nombre, m.tipo, m.cantidad, mo.nombre, m.nota, m.creado_por_nombre, m.creado_en,
         tr.folio, m.conteo_id
  from public.inv_movimientos m
  join public.inv_ubicaciones u on u.id = m.ubicacion_id
  join public.inv_motivos mo on mo.id = m.motivo_id
  left join public.inv_traspasos tr on tr.id = m.traspaso_id
  where m.articulo_id = p_articulo_id and public.inv_puede_ver()
  order by m.creado_en desc;
$$;
revoke execute on function public.inv_historial_articulo(uuid) from public;
grant execute on function public.inv_historial_articulo(uuid) to authenticated;

-- --- Traspasos -----------------------------------------------------------
-- p_lineas: [{"articulo_id":"...","cantidad":3}, ...]. Todo o nada: si una
-- línea no alcanza existencia en origen, se revierte el traspaso completo
-- (una función = una transacción).
create or replace function public.inv_crear_traspaso(
  p_origen_id uuid, p_destino_id uuid, p_nota text, p_lineas jsonb
) returns public.inv_traspasos
language plpgsql security definer set search_path = public as $$
declare
  v_trasp public.inv_traspasos; v_motivo_id uuid; ln jsonb; v_art uuid; v_cant integer; v_exist integer;
begin
  if not public.inv_puede_mover() then raise exception 'No tienes permiso para hacer traspasos.'; end if;
  if p_origen_id is null or p_destino_id is null or p_origen_id = p_destino_id then
    raise exception 'Elige un origen y un destino distintos.';
  end if;
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lineas, '[]'::jsonb)) = 0 then
    raise exception 'Agrega al menos una prenda al traspaso.';
  end if;
  select id into v_motivo_id from public.inv_motivos where nombre = 'Traspaso' and sistema;

  insert into public.inv_traspasos (origen_id, destino_id, nota, creado_por, creado_por_nombre)
  values (p_origen_id, p_destino_id, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), public.inv_nombre_actual())
  returning * into v_trasp;

  for ln in select * from jsonb_array_elements(p_lineas) loop
    v_art := (ln->>'articulo_id')::uuid;
    v_cant := (ln->>'cantidad')::integer;
    if v_art is null or coalesce(v_cant, 0) <= 0 then
      raise exception 'Cada línea necesita un artículo y una cantidad mayor a cero.';
    end if;
    select coalesce(sum(cantidad), 0) into v_exist from public.inv_movimientos
     where articulo_id = v_art and ubicacion_id = p_origen_id;
    if v_exist < v_cant then
      raise exception 'No hay suficiente existencia en el origen para una de las prendas (hay %, se pidieron %).', v_exist, v_cant;
    end if;
    insert into public.inv_traspaso_lineas (traspaso_id, articulo_id, cantidad) values (v_trasp.id, v_art, v_cant);
    insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, traspaso_id, creado_por, creado_por_nombre)
    values (v_art, p_origen_id, 'salida', -v_cant, v_motivo_id, v_trasp.id, auth.uid(), public.inv_nombre_actual());
    insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, traspaso_id, creado_por, creado_por_nombre)
    values (v_art, p_destino_id, 'entrada', v_cant, v_motivo_id, v_trasp.id, auth.uid(), public.inv_nombre_actual());
  end loop;
  return v_trasp;
end; $$;

create or replace function public.inv_traspaso_detalle(p_traspaso_id uuid)
returns table (articulo_id uuid, prenda text, talla text, cantidad integer)
language sql stable security definer set search_path = public as $$
  select l.articulo_id, a.prenda, t.nombre, l.cantidad
  from public.inv_traspaso_lineas l
  join public.inv_articulos a on a.id = l.articulo_id
  join public.inv_tallas t on t.id = a.talla_id
  where l.traspaso_id = p_traspaso_id and public.inv_puede_ver()
  order by a.prenda, t.orden;
$$;
revoke execute on function public.inv_traspaso_detalle(uuid) from public;
grant execute on function public.inv_traspaso_detalle(uuid) to authenticated;

-- --- Conteos físicos -------------------------------------------------
-- Genera el snapshot (para imprimir) de todos los artículos activos de una
-- sección, en una ubicación, con su existencia de HOY.
create or replace function public.inv_crear_conteo(p_seccion_id uuid, p_ubicacion_id uuid)
returns public.inv_conteos
language plpgsql security definer set search_path = public as $$
declare v public.inv_conteos;
begin
  if not public.inv_puede_mover() then raise exception 'No tienes permiso para hacer conteos de inventario.'; end if;
  insert into public.inv_conteos (seccion_id, ubicacion_id, creado_por, creado_por_nombre)
  values (p_seccion_id, p_ubicacion_id, auth.uid(), public.inv_nombre_actual())
  returning * into v;

  insert into public.inv_conteo_lineas (conteo_id, articulo_id, sistema)
  select v.id, a.id, coalesce((select sum(m.cantidad) from public.inv_movimientos m
                                 where m.articulo_id = a.id and m.ubicacion_id = p_ubicacion_id), 0)
  from public.inv_articulos a
  where a.seccion_id = p_seccion_id and a.activo;
  return v;
end; $$;

create or replace function public.inv_conteo_lineas_detalle(p_conteo_id uuid)
returns table (linea_id uuid, articulo_id uuid, prenda text, talla text, talla_orden integer, sistema integer, conteo integer)
language sql stable security definer set search_path = public as $$
  select l.id, l.articulo_id, a.prenda, t.nombre, t.orden, l.sistema, l.conteo
  from public.inv_conteo_lineas l
  join public.inv_articulos a on a.id = l.articulo_id
  join public.inv_tallas t on t.id = a.talla_id
  where l.conteo_id = p_conteo_id and public.inv_puede_ver()
  order by a.prenda, t.orden;
$$;
revoke execute on function public.inv_conteo_lineas_detalle(uuid) from public;
grant execute on function public.inv_conteo_lineas_detalle(uuid) to authenticated;

-- p_lineas: [{"linea_id":"...","conteo":N}, ...]. Solo genera un ajuste
-- donde conteo <> sistema; conteo NULL = no capturada (se ignora, no se
-- toca como si fuera 0).
create or replace function public.inv_confirmar_conteo(p_conteo_id uuid, p_lineas jsonb)
returns public.inv_conteos
language plpgsql security definer set search_path = public as $$
declare
  v_conteo public.inv_conteos; v_motivo_id uuid; ln jsonb; v_linea public.inv_conteo_lineas; v_dif integer;
begin
  if not public.inv_puede_mover() then raise exception 'No tienes permiso para hacer conteos de inventario.'; end if;
  select * into v_conteo from public.inv_conteos where id = p_conteo_id for update;
  if v_conteo.id is null then raise exception 'Conteo no encontrado.'; end if;
  if v_conteo.confirmado_en is not null then raise exception 'Este conteo ya se confirmó.'; end if;
  select id into v_motivo_id from public.inv_motivos where nombre = 'Conteo físico' and sistema;

  for ln in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    select * into v_linea from public.inv_conteo_lineas where id = (ln->>'linea_id')::uuid and conteo_id = p_conteo_id;
    if v_linea.id is null then continue; end if;
    update public.inv_conteo_lineas set conteo = (ln->>'conteo')::integer where id = v_linea.id;
    v_dif := (ln->>'conteo')::integer - v_linea.sistema;
    if v_dif <> 0 then
      insert into public.inv_movimientos (articulo_id, ubicacion_id, tipo, cantidad, motivo_id, conteo_id, creado_por, creado_por_nombre)
      values (v_linea.articulo_id, v_conteo.ubicacion_id, 'ajuste', v_dif, v_motivo_id, p_conteo_id, auth.uid(), public.inv_nombre_actual());
    end if;
  end loop;

  update public.inv_conteos set confirmado_en = now(), confirmado_por_nombre = public.inv_nombre_actual()
   where id = p_conteo_id returning * into v_conteo;
  return v_conteo;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'inv_guardar_seccion(uuid, text, boolean, integer)', 'inv_guardar_ubicacion(uuid, text, boolean, integer)',
    'inv_guardar_motivo(uuid, text, boolean, integer)', 'inv_guardar_articulo(uuid, uuid, text, uuid, integer, boolean)',
    'inv_registrar_movimiento(uuid, uuid, text, integer, uuid, text)',
    'inv_crear_traspaso(uuid, uuid, text, jsonb)', 'inv_crear_conteo(uuid, uuid)', 'inv_confirmar_conteo(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- H) Catálogo de tallas — orden propuesto (ver mensaje para la lista
-- completa). Semilla con las 38 tallas que trae el CSV, ya con el typo de
-- "Quirurjico"/"Quirurjio" corregido en secciones/prendas (eso lo hace el
-- script de importación, no esta tabla).
-- =====================================================================
insert into public.inv_tallas (nombre, orden) values
  ('0', 0), ('0 TALL', 2),
  ('1', 10), ('1(20)', 11), ('1 TALL', 12),
  ('2', 20), ('2(22)', 21), ('2 TALL', 22),
  ('4', 40), ('4 TALL', 42),
  ('6', 60), ('6 TALL', 62),
  ('8', 80), ('10', 100), ('12', 120), ('14', 140), ('16', 160),
  ('2XS', 1000), ('XS', 1010), ('CH', 1020), ('M', 1030), ('L', 1040),
  ('XL', 1050), ('2XL', 1060), ('3XL', 1070), ('4XL', 1080), ('5XL', 1090),
  ('28', 2000), ('30', 2010), ('32', 2020), ('34', 2030), ('36', 2040),
  ('38', 2050), ('40', 2060), ('42', 2070), ('44', 2080),
  ('Sin talla', 9000)
on conflict do nothing;

-- =====================================================================
-- I) Acceso beta — reemplaza el correo antes de aplicar.
-- =====================================================================
insert into public.inv_acceso_beta (user_id)
select id from auth.users where email = 'alfredo14pereze@gmail.com'
on conflict do nothing;
