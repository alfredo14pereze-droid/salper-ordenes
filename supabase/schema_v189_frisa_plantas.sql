-- =====================================================================
-- V189 — Frisa fase 5: inventario en las plantas de Frisa (2026-11-06)
-- =====================================================================
-- Aparte del inventario de la bodega de la fábrica (Alfredo: "eso es muy
-- diferente, hay que llevar el control separado"). Tablas propias frisa_pl_*.
--
--   stock en la planta = remisiones − facturas (por planta y clave)
--
-- Se alimenta SOLO con los reportes de Microsip "Diarios del inventario"
-- (Concepto: Remisión / Concepto: Venta) que se suben en la pestaña Plantas
-- Frisa. NO con el "Salió el chofer" de la página (si fueran los dos, cada
-- entrega se contaría doble). Cada documento (remisión o factura) se cuenta
-- una sola vez por su folio: si un archivo trae folios que ya están, se
-- saltan.
--
-- Arranque: lo acumulado al 15/10/2026 (resumen de salper-frisa: 18,867
-- remitidas − 16,170 facturadas = 2,697) entra con
-- datos_2026-11-06_frisa_plantas_inicial.sql, junto con la lista de folios
-- ya contados (776 remisiones y 70 facturas).
--
-- Permisos: fp.ver (admin_general, admin_fabrica, admin_tienda) y
-- fp.importar (admin_general). Aditivo; se puede correr dos veces. Requiere V184.
-- =====================================================================

insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fp.ver',      'Frisa plantas', 'Ver inventario en plantas de Frisa', 'Ver el stock en cada planta de Frisa (remitido − facturado), sus remisiones, facturas e importaciones.', 'ver', 101),
  ('fp.importar', 'Frisa plantas', 'Subir remisiones y facturas de Frisa', 'Subir los Diarios del inventario de Microsip (remisiones y facturas) para mover el stock de las plantas.', 'editar', 102)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave)
select r, 'fp.ver' from unnest(array['admin_general', 'admin_fabrica', 'admin_tienda']) r
on conflict do nothing;
insert into public.rol_permisos (rol, clave) values ('admin_general', 'fp.importar') on conflict do nothing;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.frisa_pl_plantas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (btrim(nombre) <> ''),       -- como se muestra: "Villa García"
  nombre_microsip  text not null check (btrim(nombre_microsip) <> ''),  -- como viene en Microsip: "FRISA VILLA GARCIA"
  orden            integer not null default 0,
  activa           boolean not null default true
);
create unique index if not exists frisa_pl_plantas_microsip_uq on public.frisa_pl_plantas (upper(btrim(nombre_microsip)));
insert into public.frisa_pl_plantas (nombre, nombre_microsip, orden) values
  ('Acería', 'FRISA ACERIA', 1), ('Aerospace', 'FRISA AEROSPACE', 2), ('Precision', 'FRISA PRECISION', 3),
  ('Santa Catarina', 'FRISA SANTA CATARINA', 4), ('Villa García', 'FRISA VILLA GARCIA', 5)
on conflict do nothing;

-- Cada archivo subido.
create table if not exists public.frisa_pl_importaciones (
  id                 uuid primary key default gen_random_uuid(),
  archivo            text,
  documentos         integer not null default 0,   -- nuevos que se contaron
  repetidos          integer not null default 0,   -- ya estaban (se saltaron)
  remisiones         integer not null default 0,
  facturas           integer not null default 0,
  piezas_remitidas   integer not null default 0,
  piezas_facturadas  integer not null default 0,
  renglones_sin_clave integer not null default 0,
  desde              date,
  hasta              date,
  notas              text,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now()
);

-- Folios ya contados (una remisión o factura cuenta una sola vez).
create table if not exists public.frisa_pl_folios (
  tipo            text not null check (tipo in ('remision', 'factura')),
  folio           text not null check (btrim(folio) <> ''),
  planta_id       uuid references public.frisa_pl_plantas(id) on delete restrict,
  fecha           date,
  orden_compra    text,
  importacion_id  uuid references public.frisa_pl_importaciones(id) on delete restrict,  -- null = carga inicial
  primary key (tipo, folio)
);

-- Movimientos del stock en plantas. stock = suma de cantidad.
create table if not exists public.frisa_pl_movimientos (
  id                 uuid primary key default gen_random_uuid(),
  planta_id          uuid not null references public.frisa_pl_plantas(id) on delete restrict,
  producto_id        uuid not null references public.frisa_productos_niveles(id) on delete restrict,
  clave              text not null,
  tipo               text not null check (tipo in ('remision', 'factura', 'ajuste')),
  cantidad           integer not null,
  folio              text,          -- folio de Microsip; "Acumulado al 15/10/2026" en la carga inicial
  fecha              date,
  orden_compra       text,
  descripcion        text,          -- como venía en Microsip
  importacion_id     uuid references public.frisa_pl_importaciones(id) on delete restrict,
  notas              text,
  creado_por         uuid references public.profiles(id) on delete set null default auth.uid(),
  creado_por_nombre  text,
  creado_en          timestamptz not null default now(),
  constraint frisa_pl_mov_cantidad_ck check (
    (tipo = 'remision' and cantidad > 0) or (tipo = 'factura' and cantidad < 0) or (tipo = 'ajuste' and cantidad <> 0)
  )
);
create index if not exists frisa_pl_mov_idx on public.frisa_pl_movimientos (planta_id, producto_id);
create index if not exists frisa_pl_mov_fecha_idx on public.frisa_pl_movimientos (fecha desc);

drop trigger if exists frisa_pl_mov_inmutable_trg on public.frisa_pl_movimientos;
create trigger frisa_pl_mov_inmutable_trg before update or delete on public.frisa_pl_movimientos
  for each row execute function public.frisa_inv_mov_inmutable();

alter table public.frisa_pl_plantas        enable row level security;
alter table public.frisa_pl_importaciones  enable row level security;
alter table public.frisa_pl_folios         enable row level security;
alter table public.frisa_pl_movimientos    enable row level security;
drop policy if exists frisa_pl_plantas_select on public.frisa_pl_plantas;
create policy frisa_pl_plantas_select on public.frisa_pl_plantas for select to authenticated using (public.tiene_permiso('fp.ver'));
drop policy if exists frisa_pl_importaciones_select on public.frisa_pl_importaciones;
create policy frisa_pl_importaciones_select on public.frisa_pl_importaciones for select to authenticated using (public.tiene_permiso('fp.ver'));
drop policy if exists frisa_pl_folios_select on public.frisa_pl_folios;
create policy frisa_pl_folios_select on public.frisa_pl_folios for select to authenticated using (public.tiene_permiso('fp.ver'));
drop policy if exists frisa_pl_movimientos_select on public.frisa_pl_movimientos;
create policy frisa_pl_movimientos_select on public.frisa_pl_movimientos for select to authenticated using (public.tiene_permiso('fp.ver'));
revoke all on public.frisa_pl_plantas, public.frisa_pl_importaciones, public.frisa_pl_folios, public.frisa_pl_movimientos from anon, public;
revoke insert, update, delete, truncate on public.frisa_pl_plantas, public.frisa_pl_importaciones, public.frisa_pl_folios, public.frisa_pl_movimientos from authenticated;
grant select on public.frisa_pl_plantas, public.frisa_pl_importaciones, public.frisa_pl_folios, public.frisa_pl_movimientos to authenticated;

-- ---------------------------------------------------------------------
-- Importar un archivo de Diarios del inventario (ya leído y ligado por la pantalla).
-- p_docs: [{tipo: 'remision'|'factura', folio, fecha, planta (como en Microsip), orden,
--           lineas: [{producto_id, descripcion, cantidad (positiva)}]}]
-- Los documentos cuyo folio ya está se saltan. Regresa la importación.
-- ---------------------------------------------------------------------
create or replace function public.frisa_pl_importar(p_archivo text, p_docs jsonb, p_sin_clave integer default 0, p_notas text default null)
returns public.frisa_pl_importaciones
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_imp public.frisa_pl_importaciones;
  v_d jsonb;
  v_l jsonb;
  v_tipo text;
  v_folio text;
  v_planta uuid;
  v_prod public.frisa_productos_niveles;
  v_cant integer;
  v_fecha date;
  v_nuevos integer := 0;
  v_rep integer := 0;
  v_rem integer := 0;
  v_fac integer := 0;
  v_prem integer := 0;
  v_pfac integer := 0;
  v_desde date;
  v_hasta date;
begin
  if not public.tiene_permiso('fp.importar') then
    raise exception 'No tienes permiso para subir remisiones y facturas de Frisa.' using errcode = '42501';
  end if;
  if p_docs is null or jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) = 0 then
    raise exception 'El archivo no trae remisiones ni facturas.';
  end if;
  perform pg_advisory_xact_lock(hashtext('frisa_plantas'));

  insert into public.frisa_pl_importaciones (archivo, notas, creado_por, creado_por_nombre)
  values (nullif(btrim(coalesce(p_archivo, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_nombre)
  returning * into v_imp;

  for v_d in select * from jsonb_array_elements(p_docs) loop
    v_tipo := v_d->>'tipo';
    if v_tipo not in ('remision', 'factura') then raise exception 'Tipo de documento inválido: %.', v_tipo; end if;
    v_folio := upper(btrim(coalesce(v_d->>'folio', '')));
    if v_folio = '' then raise exception 'Hay un documento sin folio.'; end if;
    if exists (select 1 from public.frisa_pl_folios where tipo = v_tipo and folio = v_folio) then
      v_rep := v_rep + 1;
      continue;
    end if;
    select id into v_planta from public.frisa_pl_plantas where upper(btrim(nombre_microsip)) = upper(btrim(coalesce(v_d->>'planta', '')));
    if v_planta is null then
      raise exception 'La planta "%" (folio %) no es una de las plantas de Frisa.', v_d->>'planta', v_folio;
    end if;
    v_fecha := nullif(v_d->>'fecha', '')::date;
    insert into public.frisa_pl_folios (tipo, folio, planta_id, fecha, orden_compra, importacion_id)
    values (v_tipo, v_folio, v_planta, v_fecha, nullif(btrim(coalesce(v_d->>'orden', '')), ''), v_imp.id);
    for v_l in select * from jsonb_array_elements(coalesce(v_d->'lineas', '[]'::jsonb)) loop
      select * into v_prod from public.frisa_productos_niveles where id = nullif(v_l->>'producto_id', '')::uuid;
      if not found then raise exception 'Una línea del folio % no tiene clave.', v_folio; end if;
      v_cant := (v_l->>'cantidad')::int;
      if coalesce(v_cant, 0) <= 0 then continue; end if;
      insert into public.frisa_pl_movimientos (planta_id, producto_id, clave, tipo, cantidad, folio, fecha, orden_compra, descripcion,
             importacion_id, creado_por, creado_por_nombre)
      values (v_planta, v_prod.id, v_prod.clave, v_tipo, case when v_tipo = 'remision' then v_cant else -v_cant end, v_folio, v_fecha,
              nullif(btrim(coalesce(v_d->>'orden', '')), ''), nullif(btrim(coalesce(v_l->>'descripcion', '')), ''), v_imp.id, auth.uid(), v_nombre);
      if v_tipo = 'remision' then v_prem := v_prem + v_cant; else v_pfac := v_pfac + v_cant; end if;
    end loop;
    v_nuevos := v_nuevos + 1;
    if v_tipo = 'remision' then v_rem := v_rem + 1; else v_fac := v_fac + 1; end if;
    v_desde := least(coalesce(v_desde, v_fecha), v_fecha);
    v_hasta := greatest(coalesce(v_hasta, v_fecha), v_fecha);
  end loop;

  update public.frisa_pl_importaciones set documentos = v_nuevos, repetidos = v_rep, remisiones = v_rem, facturas = v_fac,
         piezas_remitidas = v_prem, piezas_facturadas = v_pfac, renglones_sin_clave = greatest(coalesce(p_sin_clave, 0), 0),
         desde = v_desde, hasta = v_hasta
   where id = v_imp.id returning * into v_imp;
  return v_imp;
end $$;

revoke execute on function public.frisa_pl_importar(text, jsonb, integer, text) from public, anon;
grant execute on function public.frisa_pl_importar(text, jsonb, integer, text) to authenticated;

-- Comprobación.
select (select count(*) from public.frisa_pl_plantas) as plantas,
       (select count(*) from public.rol_permisos where clave = 'fp.ver') as roles_ven,
       (select count(*) from public.rol_permisos where clave = 'fp.importar') as roles_importan;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V189):
--   drop function if exists public.frisa_pl_importar(text, jsonb, integer, text);
--   drop table if exists public.frisa_pl_movimientos, public.frisa_pl_folios, public.frisa_pl_importaciones, public.frisa_pl_plantas;
--   delete from public.rol_permisos where clave in ('fp.ver', 'fp.importar');
--   delete from public.permisos_catalogo where clave in ('fp.ver', 'fp.importar');
-- ---------------------------------------------------------------------
