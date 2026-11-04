-- =====================================================================
-- V181 — Frisa (prueba): orden de compra → orden de taller → armar → entregar
-- (2026-11-04, rama `frisa-prueba`)
-- =====================================================================
-- Sigue a V180. Pedido de Alfredo: que el flujo salga desde la orden de
-- compra (OC) que manda Frisa por correo en PDF. Decisiones de Alfredo:
--   · Cada OC es de UNA planta y trae fecha límite.
--   · Por ahora una orden de taller (OT) por OC con todo lo pedido (opción a);
--     queda listo el modo "tomar lo que haya en bodega" para cuando haya
--     inventario.
--   · Se arma y se entrega por OC completa (sin parciales).
--   · La remisión sale de Microsip: aquí solo se registra su folio.
--
-- Las OT viven DENTRO del módulo Frisa (no crean órdenes FR reales, no gastan
-- folios FR ni aparecen en las estaciones). Ligarlas a órdenes FR es el
-- siguiente paso cuando deje de ser prueba.
--
-- Solo toca tablas frisa_* (de V180) y crea nuevas frisa_*. Nada más.
-- Aditivo, se puede correr dos veces. Rollback al final (comentado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tallas: cada SKU es un modelo en una talla
-- ---------------------------------------------------------------------
alter table public.frisa_productos add column if not exists modelo text;
alter table public.frisa_productos add column if not exists talla text;

-- ---------------------------------------------------------------------
-- 2) Tablas nuevas
-- ---------------------------------------------------------------------
create table if not exists public.frisa_ordenes_compra (
  id                 uuid primary key default gen_random_uuid(),
  numero             text not null check (btrim(numero) <> ''),
  planta_id          uuid not null references public.frisa_plantas(id) on delete restrict,
  fecha_oc           date,
  fecha_limite       date,
  estado             text not null default 'recibida'
                     check (estado in ('recibida', 'en_taller', 'lista', 'armada', 'entregada', 'cancelada')),
  remision_folio     text,
  entregada_fecha    date,
  armada_en          timestamptz,
  cancelada_motivo   text,
  notas              text,
  leido_pdf          jsonb,             -- lo que leyó el sistema del PDF (para revisar después)
  es_prueba          boolean not null default true,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create unique index if not exists frisa_oc_numero_uq on public.frisa_ordenes_compra (lower(btrim(numero)));
create index if not exists frisa_oc_estado_idx on public.frisa_ordenes_compra (estado, fecha_limite);

create table if not exists public.frisa_oc_lineas (
  id                    uuid primary key default gen_random_uuid(),
  oc_id                 uuid not null references public.frisa_ordenes_compra(id) on delete cascade,
  producto_id           uuid not null references public.frisa_productos(id) on delete restrict,
  cantidad              integer not null check (cantidad > 0),
  descripcion_original  text,
  unique (oc_id, producto_id)
);

create sequence if not exists public.frisa_ot_folio_seq;

create table if not exists public.frisa_ordenes_taller (
  id                 uuid primary key default gen_random_uuid(),
  folio              text not null default ('OT-' || lpad(nextval('public.frisa_ot_folio_seq')::text, 4, '0')),
  oc_id              uuid references public.frisa_ordenes_compra(id) on delete restrict,
  estado             text not null default 'abierta' check (estado in ('abierta', 'terminada', 'cancelada')),
  fecha_compromiso   date,
  terminada_fecha    date,
  notas              text,
  es_prueba          boolean not null default true,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now()
);
create unique index if not exists frisa_ot_folio_uq on public.frisa_ordenes_taller (folio);
create index if not exists frisa_ot_oc_idx on public.frisa_ordenes_taller (oc_id);

create table if not exists public.frisa_ot_lineas (
  id           uuid primary key default gen_random_uuid(),
  ot_id        uuid not null references public.frisa_ordenes_taller(id) on delete cascade,
  producto_id  uuid not null references public.frisa_productos(id) on delete restrict,
  cantidad     integer not null check (cantidad > 0),
  unique (ot_id, producto_id)
);

-- Lo que el sistema aprende: "esta descripción del PDF es este SKU".
create table if not exists public.frisa_producto_alias (
  texto        text primary key,           -- descripción normalizada (mayúsculas, sin acentos ni espacios dobles) + '|' + talla
  producto_id  uuid not null references public.frisa_productos(id) on delete cascade,
  actualizado_en timestamptz not null default now()
);

-- Movimientos ligados a su OC / OT.
alter table public.frisa_movimientos add column if not exists oc_id uuid references public.frisa_ordenes_compra(id) on delete restrict;
alter table public.frisa_movimientos add column if not exists ot_id uuid references public.frisa_ordenes_taller(id) on delete restrict;
create index if not exists frisa_mov_oc_idx on public.frisa_movimientos (oc_id);

-- Un movimiento es "de prueba" solo si su SKU o su planta son de prueba.
-- (Las funciones de V180 lo dejaban siempre en true: con plantas y SKUs
-- reales, "Borrar datos de prueba" se habría llevado movimientos reales.)
create or replace function public.frisa_mov_es_prueba()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.es_prueba := exists (select 1 from public.frisa_productos where id = new.producto_id and es_prueba)
                or exists (select 1 from public.frisa_plantas where id = new.planta_id and es_prueba);
  return new;
end $$;
revoke execute on function public.frisa_mov_es_prueba() from public, anon, authenticated;
drop trigger if exists frisa_mov_es_prueba_trg on public.frisa_movimientos;
create trigger frisa_mov_es_prueba_trg before insert on public.frisa_movimientos
  for each row execute function public.frisa_mov_es_prueba();

-- ---------------------------------------------------------------------
-- 3) RLS: lectura solo admin_general; sin escritura directa
-- ---------------------------------------------------------------------
alter table public.frisa_ordenes_compra  enable row level security;
alter table public.frisa_oc_lineas       enable row level security;
alter table public.frisa_ordenes_taller  enable row level security;
alter table public.frisa_ot_lineas       enable row level security;
alter table public.frisa_producto_alias  enable row level security;

drop policy if exists frisa_oc_select on public.frisa_ordenes_compra;
create policy frisa_oc_select on public.frisa_ordenes_compra
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_oc_lineas_select on public.frisa_oc_lineas;
create policy frisa_oc_lineas_select on public.frisa_oc_lineas
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_ot_select on public.frisa_ordenes_taller;
create policy frisa_ot_select on public.frisa_ordenes_taller
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_ot_lineas_select on public.frisa_ot_lineas;
create policy frisa_ot_lineas_select on public.frisa_ot_lineas
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');
drop policy if exists frisa_alias_select on public.frisa_producto_alias;
create policy frisa_alias_select on public.frisa_producto_alias
  for select to authenticated using (coalesce(public.current_user_role(), '') = 'admin_general');

revoke all on public.frisa_ordenes_compra, public.frisa_oc_lineas, public.frisa_ordenes_taller, public.frisa_ot_lineas,
  public.frisa_producto_alias from anon, public;
revoke insert, update, delete, truncate on public.frisa_ordenes_compra, public.frisa_oc_lineas, public.frisa_ordenes_taller,
  public.frisa_ot_lineas, public.frisa_producto_alias from authenticated;
grant select on public.frisa_ordenes_compra, public.frisa_oc_lineas, public.frisa_ordenes_taller, public.frisa_ot_lineas,
  public.frisa_producto_alias to authenticated;
revoke all on sequence public.frisa_ot_folio_seq from anon, public, authenticated;

-- ---------------------------------------------------------------------
-- 4) Ayudantes internos
-- ---------------------------------------------------------------------
-- Piezas apartadas por OCs ya armadas que todavía no se entregan.
create or replace function public.frisa_apartado(p_producto uuid, p_excepto_oc uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.cantidad), 0)::int
  from public.frisa_oc_lineas l join public.frisa_ordenes_compra o on o.id = l.oc_id
  where l.producto_id = p_producto and o.estado = 'armada' and (p_excepto_oc is null or o.id <> p_excepto_oc);
$$;
revoke execute on function public.frisa_apartado(uuid, uuid) from public, anon, authenticated;

create or replace function public.frisa_texto_alias(p_texto text, p_talla text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(upper(translate(coalesce(p_texto, ''), 'áéíóúÁÉÍÓÚüÜñ', 'aeiouAEIOUuUÑ')), '\s+', ' ', 'g')
         || '|' || upper(btrim(coalesce(p_talla, '')));
$$;
revoke execute on function public.frisa_texto_alias(text, text) from public, anon;
grant execute on function public.frisa_texto_alias(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Catálogo (plantas y SKUs reales)
-- ---------------------------------------------------------------------
create or replace function public.frisa_guardar_planta(p_id uuid, p_nombre text, p_activa boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.frisa_exigir_admin();
  if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Falta el nombre de la planta.'; end if;
  if exists (select 1 from public.frisa_plantas where lower(btrim(nombre)) = lower(btrim(p_nombre)) and id is distinct from p_id) then
    raise exception 'Ya hay una planta con ese nombre.';
  end if;
  if p_id is null then
    insert into public.frisa_plantas (nombre, activa, es_prueba) values (btrim(p_nombre), coalesce(p_activa, true), false) returning id into v_id;
  else
    update public.frisa_plantas set nombre = btrim(p_nombre), activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Planta no encontrada.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.frisa_guardar_producto(
  p_id uuid, p_sku text, p_modelo text, p_talla text, p_precio numeric, p_activo boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nombre text;
begin
  perform public.frisa_exigir_admin();
  if btrim(coalesce(p_sku, '')) = '' then raise exception 'Falta el SKU.'; end if;
  if btrim(coalesce(p_modelo, '')) = '' then raise exception 'Falta el modelo.'; end if;
  if coalesce(p_precio, -1) < 0 then raise exception 'Falta el precio de consumo.'; end if;
  if exists (select 1 from public.frisa_productos where lower(btrim(sku)) = lower(btrim(p_sku)) and id is distinct from p_id) then
    raise exception 'Ya hay un producto con el SKU %.', upper(btrim(p_sku));
  end if;
  v_nombre := btrim(p_modelo) || coalesce(' · ' || nullif(upper(btrim(p_talla)), ''), '');
  if p_id is null then
    insert into public.frisa_productos (sku, nombre, modelo, talla, precio_consumo, activo, es_prueba)
    values (upper(btrim(p_sku)), v_nombre, btrim(p_modelo), nullif(upper(btrim(p_talla)), ''), p_precio, coalesce(p_activo, true), false)
    returning id into v_id;
  else
    update public.frisa_productos set sku = upper(btrim(p_sku)), nombre = v_nombre, modelo = btrim(p_modelo),
      talla = nullif(upper(btrim(p_talla)), ''), precio_consumo = p_precio, activo = coalesce(p_activo, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Producto no encontrado.'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6) Órdenes de compra
-- ---------------------------------------------------------------------
-- p_lineas = [{producto_id, cantidad, descripcion?, talla_pdf?}]. Si
-- p_aprender, guarda "descripción del PDF + talla → SKU" para la próxima.
create or replace function public.frisa_guardar_oc(
  p_numero text, p_planta_id uuid, p_fecha_oc date, p_fecha_limite date, p_lineas jsonb,
  p_notas text default null, p_leido jsonb default null, p_aprender boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.frisa_exigir_admin();
  if btrim(coalesce(p_numero, '')) = '' then raise exception 'Falta el número de la orden de compra.'; end if;
  if not exists (select 1 from public.frisa_plantas where id = p_planta_id) then raise exception 'Elige la planta.'; end if;
  if exists (select 1 from public.frisa_ordenes_compra where lower(btrim(numero)) = lower(btrim(p_numero))) then
    raise exception 'La orden de compra % ya está registrada.', btrim(p_numero);
  end if;

  drop table if exists _frisa_oc_l;
  create temp table _frisa_oc_l on commit drop as
  select (l->>'producto_id')::uuid as producto_id, (l->>'cantidad')::int as cantidad,
         nullif(btrim(l->>'descripcion'), '') as descripcion, l->>'talla_pdf' as talla_pdf
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l;
  delete from _frisa_oc_l where coalesce(cantidad, 0) = 0;
  if not exists (select 1 from _frisa_oc_l) then raise exception 'La orden de compra no trae productos.'; end if;
  if exists (select 1 from _frisa_oc_l where producto_id is null) then raise exception 'Hay renglones sin SKU: elige el producto de cada uno.'; end if;
  if exists (select 1 from _frisa_oc_l where cantidad < 0) then raise exception 'No se aceptan cantidades negativas.'; end if;
  if exists (select 1 from _frisa_oc_l l where not exists (select 1 from public.frisa_productos p where p.id = l.producto_id)) then
    raise exception 'Producto no encontrado.';
  end if;
  if exists (select 1 from _frisa_oc_l group by producto_id having count(*) > 1) then
    raise exception 'El mismo SKU viene en dos renglones: júntalos en uno.';
  end if;

  insert into public.frisa_ordenes_compra (numero, planta_id, fecha_oc, fecha_limite, notas, leido_pdf, es_prueba, creado_por_nombre)
  values (btrim(p_numero), p_planta_id, p_fecha_oc, p_fecha_limite, nullif(btrim(p_notas), ''), p_leido,
          exists (select 1 from public.frisa_plantas where id = p_planta_id and es_prueba), public.frisa_nombre_usuario())
  returning id into v_id;

  insert into public.frisa_oc_lineas (oc_id, producto_id, cantidad, descripcion_original)
  select v_id, producto_id, cantidad, descripcion from _frisa_oc_l;

  if coalesce(p_aprender, true) then
    insert into public.frisa_producto_alias (texto, producto_id)
    select distinct on (public.frisa_texto_alias(descripcion, talla_pdf)) public.frisa_texto_alias(descripcion, talla_pdf), producto_id
    from _frisa_oc_l where descripcion is not null
    on conflict (texto) do update set producto_id = excluded.producto_id, actualizado_en = now();
  end if;
  return v_id;
end $$;

create or replace function public.frisa_cancelar_oc(p_oc_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.frisa_exigir_admin();
  select estado into v_estado from public.frisa_ordenes_compra where id = p_oc_id for update;
  if v_estado is null then raise exception 'Orden de compra no encontrada.'; end if;
  if v_estado in ('entregada', 'cancelada') then raise exception 'Esta orden de compra ya está %.', v_estado; end if;
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Escribe el motivo de la cancelación.'; end if;
  update public.frisa_ordenes_compra set estado = 'cancelada', cancelada_motivo = btrim(p_motivo), actualizado_en = now() where id = p_oc_id;
  update public.frisa_ordenes_taller set estado = 'cancelada' where oc_id = p_oc_id and estado = 'abierta';
end $$;

-- ---------------------------------------------------------------------
-- 7) Órdenes de taller
-- ---------------------------------------------------------------------
-- p_lineas = [{producto_id, cantidad}] (lo que se va a producir; la pantalla
-- propone todo lo de la OC, o solo lo que falta si se toma de bodega).
create or replace function public.frisa_crear_ot(
  p_oc_id uuid, p_lineas jsonb, p_fecha_compromiso date default null, p_notas text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_oc record; v_id uuid;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  select * into v_oc from public.frisa_ordenes_compra where id = p_oc_id for update;
  if v_oc.id is null then raise exception 'Orden de compra no encontrada.'; end if;
  if v_oc.estado not in ('recibida', 'lista') then raise exception 'Esta orden de compra está "%": no se le puede hacer orden de taller.', v_oc.estado; end if;
  if exists (select 1 from public.frisa_ordenes_taller where oc_id = p_oc_id and estado = 'abierta') then
    raise exception 'Esta orden de compra ya tiene una orden de taller abierta.';
  end if;

  drop table if exists _frisa_ot_l;
  create temp table _frisa_ot_l on commit drop as
  select (l->>'producto_id')::uuid as producto_id, (l->>'cantidad')::int as cantidad
  from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l;
  delete from _frisa_ot_l where coalesce(cantidad, 0) = 0;
  if not exists (select 1 from _frisa_ot_l) then raise exception 'No hay nada que producir.'; end if;
  if exists (select 1 from _frisa_ot_l where cantidad < 0) then raise exception 'No se aceptan cantidades negativas.'; end if;
  if exists (select 1 from _frisa_ot_l group by producto_id having count(*) > 1) then raise exception 'Un SKU viene dos veces.'; end if;
  if exists (select 1 from _frisa_ot_l t where not exists (select 1 from public.frisa_oc_lineas l where l.oc_id = p_oc_id and l.producto_id = t.producto_id)) then
    raise exception 'La orden de taller trae un SKU que no está en la orden de compra.';
  end if;

  insert into public.frisa_ordenes_taller (oc_id, fecha_compromiso, notas, es_prueba, creado_por_nombre)
  values (p_oc_id, coalesce(p_fecha_compromiso, v_oc.fecha_limite), nullif(btrim(p_notas), ''), v_oc.es_prueba, public.frisa_nombre_usuario())
  returning id into v_id;
  insert into public.frisa_ot_lineas (ot_id, producto_id, cantidad) select v_id, producto_id, cantidad from _frisa_ot_l;
  update public.frisa_ordenes_compra set estado = 'en_taller', actualizado_en = now() where id = p_oc_id;
  return v_id;
end $$;

-- Terminar la OT: lo producido entra a la bodega SALPER.
create or replace function public.frisa_terminar_ot(p_ot_id uuid, p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
declare v_ot record;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  select * into v_ot from public.frisa_ordenes_taller where id = p_ot_id for update;
  if v_ot.id is null then raise exception 'Orden de taller no encontrada.'; end if;
  if v_ot.estado <> 'abierta' then raise exception 'Esta orden de taller ya está %.', v_ot.estado; end if;
  if p_fecha is null then raise exception 'Falta la fecha.'; end if;

  insert into public.frisa_movimientos (fecha, tipo, producto_id, cantidad, ot_id, oc_id, referencia, es_prueba, creado_por_nombre)
  select p_fecha, 'produccion', l.producto_id, l.cantidad, v_ot.id, v_ot.oc_id, v_ot.folio, v_ot.es_prueba, public.frisa_nombre_usuario()
  from public.frisa_ot_lineas l where l.ot_id = p_ot_id;

  update public.frisa_ordenes_taller set estado = 'terminada', terminada_fecha = p_fecha where id = p_ot_id;
  update public.frisa_ordenes_compra set estado = 'lista', actualizado_en = now() where id = v_ot.oc_id and estado = 'en_taller';
end $$;

-- ---------------------------------------------------------------------
-- 8) Armar y entregar (por OC completa)
-- ---------------------------------------------------------------------
-- Armar = la bodega tiene TODO (descontando lo apartado por otras OCs
-- armadas); las piezas quedan apartadas para esta OC.
create or replace function public.frisa_armar_oc(p_oc_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_oc record; r record; v_faltan text := '';
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  select * into v_oc from public.frisa_ordenes_compra where id = p_oc_id for update;
  if v_oc.id is null then raise exception 'Orden de compra no encontrada.'; end if;
  if v_oc.estado not in ('recibida', 'lista', 'en_taller') then raise exception 'Esta orden de compra está "%": no se puede armar.', v_oc.estado; end if;
  for r in
    select p.sku, l.cantidad, public.frisa_stock_bodega(l.producto_id) - public.frisa_apartado(l.producto_id, p_oc_id) as disponible
    from public.frisa_oc_lineas l join public.frisa_productos p on p.id = l.producto_id where l.oc_id = p_oc_id
  loop
    if r.cantidad > r.disponible then v_faltan := v_faltan || format('%s (pide %s, hay %s); ', r.sku, r.cantidad, greatest(r.disponible, 0)); end if;
  end loop;
  if v_faltan <> '' then raise exception 'No alcanza para armar la orden completa (no se aceptan parciales): %', rtrim(v_faltan, '; '); end if;
  update public.frisa_ordenes_compra set estado = 'armada', armada_en = now(), actualizado_en = now() where id = p_oc_id;
end $$;

-- Desarmar: regresa las piezas apartadas (por si se armó por error).
create or replace function public.frisa_desarmar_oc(p_oc_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  perform public.frisa_exigir_admin();
  select estado into v_estado from public.frisa_ordenes_compra where id = p_oc_id for update;
  if v_estado is distinct from 'armada' then raise exception 'Solo se puede desarmar una orden armada.'; end if;
  update public.frisa_ordenes_compra set armada_en = null, actualizado_en = now(),
    estado = case when exists (select 1 from public.frisa_ordenes_taller where oc_id = p_oc_id and estado = 'abierta') then 'en_taller'
                  when exists (select 1 from public.frisa_ordenes_taller where oc_id = p_oc_id and estado = 'terminada') then 'lista'
                  else 'recibida' end
  where id = p_oc_id;
end $$;

-- Entregar: con el folio de la remisión de Microsip. Las piezas salen de la
-- bodega y entran a la planta de la OC.
create or replace function public.frisa_entregar_oc(p_oc_id uuid, p_fecha date, p_remision text)
returns void language plpgsql security definer set search_path = public as $$
declare v_oc record;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  select * into v_oc from public.frisa_ordenes_compra where id = p_oc_id for update;
  if v_oc.id is null then raise exception 'Orden de compra no encontrada.'; end if;
  if v_oc.estado <> 'armada' then raise exception 'Primero arma la orden de compra.'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de entrega.'; end if;
  if btrim(coalesce(p_remision, '')) = '' then raise exception 'Escribe el folio de la remisión de Microsip.'; end if;
  if exists (select 1 from public.frisa_oc_lineas l where l.oc_id = p_oc_id
             and l.cantidad > public.frisa_stock_bodega(l.producto_id) - public.frisa_apartado(l.producto_id, p_oc_id)) then
    raise exception 'La bodega ya no tiene todo lo de esta orden (¿se movió algo?). Desármala y vuelve a armarla.';
  end if;

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, oc_id, lote_id, referencia, es_prueba, creado_por_nombre)
  select p_fecha, 'entrega', l.producto_id, v_oc.planta_id, l.cantidad, v_oc.id, v_oc.id,
         format('Rem. %s · OC %s', btrim(p_remision), v_oc.numero), v_oc.es_prueba, public.frisa_nombre_usuario()
  from public.frisa_oc_lineas l where l.oc_id = p_oc_id;

  update public.frisa_ordenes_compra set estado = 'entregada', remision_folio = btrim(p_remision), entregada_fecha = p_fecha,
    actualizado_en = now() where id = p_oc_id;
end $$;

-- ---------------------------------------------------------------------
-- 9) Datos de prueba (reemplaza las de V180: misma firma)
-- ---------------------------------------------------------------------
-- p_datos = { plantas, productos: [{sku, nombre, modelo, talla, precio_consumo}], maximos,
--   ordenes_compra: [{numero, planta, fecha_oc, fecha_limite, estado, remision_folio?, entregada_fecha?,
--                     lineas: [{sku, cantidad, descripcion}]}],
--   ordenes_taller: [{folio, oc, estado, fecha_compromiso, terminada_fecha?, lineas: [{sku, cantidad}]}],
--   movimientos: [{fecha, tipo, sku, planta|null, cantidad, confirmado?, lote?, referencia?, notas?, oc?, ot?}] }
create or replace function public.frisa_cargar_datos_prueba(p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := public.frisa_nombre_usuario();
  v_mov int;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  if exists (select 1 from public.frisa_plantas where es_prueba) or exists (select 1 from public.frisa_productos where es_prueba)
     or exists (select 1 from public.frisa_movimientos where es_prueba) or exists (select 1 from public.frisa_ordenes_compra where es_prueba) then
    raise exception 'Ya hay datos de prueba cargados. Bórralos primero.';
  end if;

  insert into public.frisa_plantas (nombre, es_prueba)
  select x->>'nombre', true from jsonb_array_elements(p_datos->'plantas') x;

  insert into public.frisa_productos (sku, nombre, modelo, talla, precio_consumo, es_prueba)
  select x->>'sku', x->>'nombre', x->>'modelo', x->>'talla', (x->>'precio_consumo')::numeric, true
  from jsonb_array_elements(p_datos->'productos') x;

  insert into public.frisa_maximos (planta_id, producto_id, maximo)
  select pl.id, pr.id, (x->>'maximo')::int
  from jsonb_array_elements(p_datos->'maximos') x
  join public.frisa_plantas pl on pl.es_prueba and pl.nombre = x->>'planta'
  join public.frisa_productos pr on pr.es_prueba and pr.sku = x->>'sku';

  insert into public.frisa_ordenes_compra (numero, planta_id, fecha_oc, fecha_limite, estado, remision_folio, entregada_fecha,
    armada_en, es_prueba, creado_por_nombre)
  select x->>'numero', pl.id, (x->>'fecha_oc')::date, (x->>'fecha_limite')::date, x->>'estado', x->>'remision_folio',
         (x->>'entregada_fecha')::date, case when x->>'estado' = 'armada' then now() end, true, v_nombre
  from jsonb_array_elements(coalesce(p_datos->'ordenes_compra', '[]')) x
  join public.frisa_plantas pl on pl.es_prueba and pl.nombre = x->>'planta';

  insert into public.frisa_oc_lineas (oc_id, producto_id, cantidad, descripcion_original)
  select o.id, pr.id, (l->>'cantidad')::int, l->>'descripcion'
  from jsonb_array_elements(coalesce(p_datos->'ordenes_compra', '[]')) x
  cross join lateral jsonb_array_elements(x->'lineas') l
  join public.frisa_ordenes_compra o on o.es_prueba and o.numero = x->>'numero'
  join public.frisa_productos pr on pr.es_prueba and pr.sku = l->>'sku';

  insert into public.frisa_ordenes_taller (folio, oc_id, estado, fecha_compromiso, terminada_fecha, es_prueba, creado_por_nombre)
  select x->>'folio', o.id, x->>'estado', (x->>'fecha_compromiso')::date, (x->>'terminada_fecha')::date, true, v_nombre
  from jsonb_array_elements(coalesce(p_datos->'ordenes_taller', '[]')) x
  join public.frisa_ordenes_compra o on o.es_prueba and o.numero = x->>'oc';

  insert into public.frisa_ot_lineas (ot_id, producto_id, cantidad)
  select t.id, pr.id, (l->>'cantidad')::int
  from jsonb_array_elements(coalesce(p_datos->'ordenes_taller', '[]')) x
  cross join lateral jsonb_array_elements(x->'lineas') l
  join public.frisa_ordenes_taller t on t.es_prueba and t.folio = x->>'folio'
  join public.frisa_productos pr on pr.es_prueba and pr.sku = l->>'sku';

  insert into public.frisa_movimientos (fecha, tipo, producto_id, planta_id, cantidad, confirmado, lote_id, referencia, notas,
    oc_id, ot_id, es_prueba, creado_por_nombre)
  select (x->>'fecha')::date, x->>'tipo', pr.id, pl.id, (x->>'cantidad')::int, (x->>'confirmado')::int,
         case when x->>'lote' is not null then md5('frisa-prueba-' || (x->>'lote'))::uuid
              when x->>'tipo' = 'entrega' then o.id end,
         coalesce(x->>'referencia', case when x->>'tipo' = 'entrega' and o.id is not null
                                         then format('Rem. %s · OC %s', o.remision_folio, o.numero) end),
         x->>'notas', o.id, t.id, true, v_nombre
  from jsonb_array_elements(p_datos->'movimientos') x
  join public.frisa_productos pr on pr.es_prueba and pr.sku = x->>'sku'
  left join public.frisa_plantas pl on pl.es_prueba and pl.nombre = x->>'planta'
  left join public.frisa_ordenes_compra o on o.es_prueba and o.numero = x->>'oc'
  left join public.frisa_ordenes_taller t on t.es_prueba and t.folio = x->>'ot';
  get diagnostics v_mov = row_count;
  if v_mov <> jsonb_array_length(p_datos->'movimientos') then
    raise exception 'Datos de prueba inconsistentes: % de % movimientos con SKU/planta válidos.', v_mov, jsonb_array_length(p_datos->'movimientos');
  end if;

  if exists (select 1 from public.frisa_productos pr where pr.es_prueba and public.frisa_stock_bodega(pr.id) - public.frisa_apartado(pr.id) < 0)
     or exists (select 1 from public.frisa_plantas pl cross join public.frisa_productos pr
                where pl.es_prueba and pr.es_prueba and public.frisa_stock_planta(pl.id, pr.id) < 0) then
    raise exception 'Datos de prueba inconsistentes: quedaría stock negativo.';
  end if;

  return jsonb_build_object(
    'plantas', (select count(*) from public.frisa_plantas where es_prueba),
    'productos', (select count(*) from public.frisa_productos where es_prueba),
    'ordenes_compra', (select count(*) from public.frisa_ordenes_compra where es_prueba),
    'movimientos', v_mov);
end $$;

create or replace function public.frisa_borrar_datos_prueba()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mov int; v_oc int; v_pl int; v_pr int;
begin
  perform public.frisa_exigir_admin();
  perform pg_advisory_xact_lock(hashtext('frisa_movimientos'));
  delete from public.frisa_movimientos where es_prueba;
  get diagnostics v_mov = row_count;
  delete from public.frisa_ordenes_taller where es_prueba;
  delete from public.frisa_ordenes_compra where es_prueba;
  get diagnostics v_oc = row_count;
  delete from public.frisa_maximos m using public.frisa_plantas pl where m.planta_id = pl.id and pl.es_prueba;
  delete from public.frisa_maximos m using public.frisa_productos pr where m.producto_id = pr.id and pr.es_prueba;
  delete from public.frisa_producto_alias a using public.frisa_productos pr where a.producto_id = pr.id and pr.es_prueba;
  delete from public.frisa_plantas where es_prueba
    and not exists (select 1 from public.frisa_movimientos m where m.planta_id = frisa_plantas.id)
    and not exists (select 1 from public.frisa_ordenes_compra o where o.planta_id = frisa_plantas.id);
  get diagnostics v_pl = row_count;
  delete from public.frisa_productos where es_prueba
    and not exists (select 1 from public.frisa_movimientos m where m.producto_id = frisa_productos.id)
    and not exists (select 1 from public.frisa_oc_lineas l where l.producto_id = frisa_productos.id)
    and not exists (select 1 from public.frisa_ot_lineas l where l.producto_id = frisa_productos.id);
  get diagnostics v_pr = row_count;
  return jsonb_build_object('movimientos', v_mov, 'ordenes_compra', v_oc, 'plantas', v_pl, 'productos', v_pr);
end $$;

-- Permisos de ejecución
revoke execute on function public.frisa_guardar_planta(uuid, text, boolean) from public, anon;
revoke execute on function public.frisa_guardar_producto(uuid, text, text, text, numeric, boolean) from public, anon;
revoke execute on function public.frisa_guardar_oc(text, uuid, date, date, jsonb, text, jsonb, boolean) from public, anon;
revoke execute on function public.frisa_cancelar_oc(uuid, text) from public, anon;
revoke execute on function public.frisa_crear_ot(uuid, jsonb, date, text) from public, anon;
revoke execute on function public.frisa_terminar_ot(uuid, date) from public, anon;
revoke execute on function public.frisa_armar_oc(uuid) from public, anon;
revoke execute on function public.frisa_desarmar_oc(uuid) from public, anon;
revoke execute on function public.frisa_entregar_oc(uuid, date, text) from public, anon;
revoke execute on function public.frisa_cargar_datos_prueba(jsonb) from public, anon;
revoke execute on function public.frisa_borrar_datos_prueba() from public, anon;
grant execute on function public.frisa_guardar_planta(uuid, text, boolean) to authenticated;
grant execute on function public.frisa_guardar_producto(uuid, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.frisa_guardar_oc(text, uuid, date, date, jsonb, text, jsonb, boolean) to authenticated;
grant execute on function public.frisa_cancelar_oc(uuid, text) to authenticated;
grant execute on function public.frisa_crear_ot(uuid, jsonb, date, text) to authenticated;
grant execute on function public.frisa_terminar_ot(uuid, date) to authenticated;
grant execute on function public.frisa_armar_oc(uuid) to authenticated;
grant execute on function public.frisa_desarmar_oc(uuid) to authenticated;
grant execute on function public.frisa_entregar_oc(uuid, date, text) to authenticated;
grant execute on function public.frisa_cargar_datos_prueba(jsonb) to authenticated;
grant execute on function public.frisa_borrar_datos_prueba() to authenticated;

-- ---------------------------------------------------------------------
-- Verificación (aparte):
--   select tablename from pg_tables where tablename like 'frisa\_%' order by 1;        -- 9 filas
--   select proname, count(*) from pg_proc where proname like 'frisa\_%' group by 1 having count(*) > 1;  -- 0 filas
--
-- Rollback (solo lo de V181; V180 queda como estaba antes, salvo las 2
-- funciones de datos de prueba, que se restauran corriendo otra vez su parte
-- de schema_v180):
--   drop function if exists public.frisa_entregar_oc(uuid, date, text), public.frisa_desarmar_oc(uuid),
--     public.frisa_armar_oc(uuid), public.frisa_terminar_ot(uuid, date), public.frisa_crear_ot(uuid, jsonb, date, text),
--     public.frisa_cancelar_oc(uuid, text), public.frisa_guardar_oc(text, uuid, date, date, jsonb, text, jsonb, boolean),
--     public.frisa_guardar_producto(uuid, text, text, text, numeric, boolean), public.frisa_guardar_planta(uuid, text, boolean),
--     public.frisa_texto_alias(text, text), public.frisa_apartado(uuid, uuid);
--   drop trigger if exists frisa_mov_es_prueba_trg on public.frisa_movimientos; drop function if exists public.frisa_mov_es_prueba();
--   alter table public.frisa_movimientos drop column if exists ot_id, drop column if exists oc_id;
--   drop table if exists public.frisa_producto_alias, public.frisa_ot_lineas, public.frisa_ordenes_taller,
--     public.frisa_oc_lineas, public.frisa_ordenes_compra;
--   drop sequence if exists public.frisa_ot_folio_seq;
--   alter table public.frisa_productos drop column if exists talla, drop column if exists modelo;
-- =====================================================================
