-- =====================================================================
-- V184 — Niveles de inventario Frisa (2026-11-06)
-- =====================================================================
-- Reemplaza el Google Sheet "Consumos Frisa Niveles". La app pasa a ser la
-- fuente de verdad: el Sheet se importa una vez (pantalla "Importar" en
-- Frisa → Niveles) y después todo se maneja aquí.
--
-- Decisiones de Alfredo (2026-11-06):
--   · Tabla nueva ligada por clave (no se tocan productos_frisa de V155 ni
--     frisa_productos de V180/V181). La clave es la de Microsip
--     (ej. CAMFR-000L-01MZ1B1I) = frisa_productos.sku cuando exista.
--   · stock_actual = lo que hay en el ALMACÉN DE LA FÁBRICA (Torreón). Lo que
--     hay en cada planta de Frisa es otra cosa y por ahora no entra.
--   · Consultan todos los roles con sesión; capturan stock y editan supuestos
--     admin_general y admin_fabrica.
--
-- Niveles (NO se guardan: los calcula la pantalla, utils/frisaNiveles.js):
--   demanda diaria = consumo_2026 ÷ dias_periodo
--   mínimo  = ceil(demanda × dias_minimo)   stock ≤ mínimo  → CRÍTICO
--   reorden = ceil(demanda × dias_reorden)  stock ≤ reorden → PEDIR
--   máximo  = ceil(demanda × dias_maximo)   si no           → OK
--   Sin ventas en 2026 (demanda 0) → OK. (≤ como el Sheet, decisión de Alfredo.)
--   A PEDIR = máximo − stock (solo CRÍTICO o PEDIR)
--
-- Permisos (editables en "Roles y permisos", módulo "Frisa niveles"):
--   fn.ver        Ver niveles, detalle e historial de conteos
--   fn.capturar   Capturar el stock actual (queda en el historial)
--   fn.supuestos  Editar los supuestos e importar el Sheet
--
-- Aditivo: 3 tablas, 3 permisos, 3 funciones nuevas. No toca nada existente.
-- Se puede correr dos veces sin duplicar nada. Rollback al final.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permisos (van primero: las políticas de abajo los usan)
-- ---------------------------------------------------------------------
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fn.ver',       'Frisa niveles', 'Ver niveles de Frisa',      'Ver los niveles de inventario de Frisa (mínimo, reorden, máximo, a pedir), el detalle y el historial de conteos.', 'ver',    90),
  ('fn.capturar',  'Frisa niveles', 'Capturar stock de Frisa',   'Capturar el stock actual del almacén de la fábrica por clave (queda en el historial de conteos).', 'editar', 91),
  ('fn.supuestos', 'Frisa niveles', 'Editar supuestos de Frisa', 'Editar los días de mínimo, reorden, máximo y del periodo, e importar los consumos del Sheet.', 'editar', 92)
on conflict (clave) do nothing;

insert into public.rol_permisos (rol, clave)
select r.rol, s.clave
from (values
  ('fn.ver', array['ventas','contabilidad','admin_tienda','corte','bordado','sublimado','produccion',
                   'terminado','admin_fabrica','admin_general','lectura','tienda','captura_produccion',
                   'admin_fabrica_lectura','costura','consulta_tienda','chofer']),
  ('fn.capturar',  array['admin_fabrica','admin_general']),
  ('fn.supuestos', array['admin_fabrica','admin_general'])
) as s(clave, roles)
cross join lateral unnest(s.roles) as r(rol)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tablas
-- ---------------------------------------------------------------------
-- Supuestos: una sola fila (id = true).
create table if not exists public.frisa_niveles_config (
  id                    boolean primary key default true check (id),
  dias_periodo          integer not null check (dias_periodo > 0),
  dias_maximo           integer not null check (dias_maximo > 0),
  dias_reorden          integer not null check (dias_reorden > 0),
  dias_minimo           integer not null check (dias_minimo > 0),
  fecha_inicio_consumo  date,
  fecha_corte_consumo   date,
  actualizado_en        timestamptz not null default now(),
  actualizado_por       uuid references public.profiles(id) on delete set null,
  actualizado_por_nombre text,
  constraint frisa_niveles_config_orden_ck check (dias_minimo <= dias_reorden and dias_reorden <= dias_maximo)
);
insert into public.frisa_niveles_config (id, dias_periodo, dias_maximo, dias_reorden, dias_minimo, fecha_inicio_consumo, fecha_corte_consumo)
values (true, 289, 42, 28, 20, date '2026-01-01', date '2026-10-16')
on conflict (id) do nothing;

create table if not exists public.frisa_productos_niveles (
  id                       uuid primary key default gen_random_uuid(),
  clave                    text not null check (btrim(clave) <> ''),
  nombre                   text not null default '',
  tipo                     text,
  reflejante               text,
  manga                    text,
  color                    text,
  consumo_2025             integer not null default 0 check (consumo_2025 >= 0),
  consumo_2026             integer not null default 0 check (consumo_2026 >= 0),
  clase_abc                text,
  tendencia                text,
  nota                     text,
  stock_actual             integer not null default 0 check (stock_actual >= 0),
  stock_actualizado_en     timestamptz,
  stock_actualizado_por    uuid references public.profiles(id) on delete set null,
  stock_actualizado_por_nombre text,
  activo                   boolean not null default true,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);
create unique index if not exists frisa_productos_niveles_clave_uq
  on public.frisa_productos_niveles (lower(btrim(clave)));

create table if not exists public.frisa_conteos_stock (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null references public.frisa_productos_niveles(id) on delete cascade,
  clave           text not null,
  stock_anterior  integer,
  stock_nuevo     integer not null check (stock_nuevo >= 0),
  origen          text not null default 'captura' check (origen in ('captura', 'importacion')),
  usuario_id      uuid references public.profiles(id) on delete set null default auth.uid(),
  usuario_nombre  text,
  fecha           timestamptz not null default now(),
  comentario      text
);
create index if not exists frisa_conteos_stock_producto_idx
  on public.frisa_conteos_stock (producto_id, fecha desc);

-- ---------------------------------------------------------------------
-- 3) RLS: lectura con fn.ver; sin escritura directa (todo por función)
-- ---------------------------------------------------------------------
alter table public.frisa_niveles_config    enable row level security;
alter table public.frisa_productos_niveles enable row level security;
alter table public.frisa_conteos_stock     enable row level security;

drop policy if exists frisa_niveles_config_select on public.frisa_niveles_config;
create policy frisa_niveles_config_select on public.frisa_niveles_config
  for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_productos_niveles_select on public.frisa_productos_niveles;
create policy frisa_productos_niveles_select on public.frisa_productos_niveles
  for select to authenticated using (public.tiene_permiso('fn.ver'));
drop policy if exists frisa_conteos_stock_select on public.frisa_conteos_stock;
create policy frisa_conteos_stock_select on public.frisa_conteos_stock
  for select to authenticated using (public.tiene_permiso('fn.ver'));

revoke all on public.frisa_niveles_config, public.frisa_productos_niveles, public.frisa_conteos_stock from anon, public;
revoke insert, update, delete, truncate on public.frisa_niveles_config, public.frisa_productos_niveles, public.frisa_conteos_stock from authenticated;
grant select on public.frisa_niveles_config, public.frisa_productos_niveles, public.frisa_conteos_stock to authenticated;

-- ---------------------------------------------------------------------
-- 4) Funciones de escritura
-- ---------------------------------------------------------------------
-- Nombre de quien captura.
create or replace function public.frisa_niveles_nombre_usuario()
returns text language sql stable security definer set search_path = public as $$
  select nullif(btrim(full_name), '') from public.profiles where id = auth.uid();
$$;
revoke execute on function public.frisa_niveles_nombre_usuario() from public, anon, authenticated;

-- 4a) Capturar el stock de una clave. Regresa la fila actualizada.
create or replace function public.frisa_niveles_capturar_stock(p_clave text, p_stock integer, p_comentario text default null)
returns public.frisa_productos_niveles
language plpgsql security definer set search_path = public as $$
declare
  v_fila public.frisa_productos_niveles;
  v_nombre text := public.frisa_niveles_nombre_usuario();
begin
  if not public.tiene_permiso('fn.capturar') then
    raise exception 'No tienes permiso para capturar el stock de Frisa.' using errcode = '42501';
  end if;
  if p_stock is null or p_stock < 0 then
    raise exception 'El stock debe ser un número entero de 0 o más.';
  end if;

  select * into v_fila from public.frisa_productos_niveles
  where lower(btrim(clave)) = lower(btrim(coalesce(p_clave, '')))
  for update;
  if not found then
    raise exception 'No existe la clave %.', p_clave;
  end if;

  insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
  values (v_fila.id, v_fila.clave, v_fila.stock_actual, p_stock, 'captura', auth.uid(), v_nombre, nullif(btrim(coalesce(p_comentario, '')), ''));

  update public.frisa_productos_niveles
     set stock_actual = p_stock,
         stock_actualizado_en = now(),
         stock_actualizado_por = auth.uid(),
         stock_actualizado_por_nombre = v_nombre,
         actualizado_en = now()
   where id = v_fila.id
  returning * into v_fila;
  return v_fila;
end $$;

-- 4b) Guardar los supuestos.
create or replace function public.frisa_niveles_guardar_config(
  p_dias_periodo integer, p_dias_maximo integer, p_dias_reorden integer, p_dias_minimo integer,
  p_fecha_inicio date default null, p_fecha_corte date default null)
returns public.frisa_niveles_config
language plpgsql security definer set search_path = public as $$
declare
  v_fila public.frisa_niveles_config;
begin
  if not public.tiene_permiso('fn.supuestos') then
    raise exception 'No tienes permiso para editar los supuestos de Frisa.' using errcode = '42501';
  end if;
  if coalesce(p_dias_periodo, 0) <= 0 or coalesce(p_dias_maximo, 0) <= 0
     or coalesce(p_dias_reorden, 0) <= 0 or coalesce(p_dias_minimo, 0) <= 0 then
    raise exception 'Todos los días deben ser mayores que 0.';
  end if;
  if not (p_dias_minimo <= p_dias_reorden and p_dias_reorden <= p_dias_maximo) then
    raise exception 'Debe cumplirse: días de mínimo ≤ días de reorden ≤ días de máximo.';
  end if;
  if p_fecha_inicio is not null and p_fecha_corte is not null and p_fecha_corte < p_fecha_inicio then
    raise exception 'La fecha de corte no puede ser antes de la fecha de inicio.';
  end if;

  insert into public.frisa_niveles_config as c (id, dias_periodo, dias_maximo, dias_reorden, dias_minimo,
         fecha_inicio_consumo, fecha_corte_consumo, actualizado_en, actualizado_por, actualizado_por_nombre)
  values (true, p_dias_periodo, p_dias_maximo, p_dias_reorden, p_dias_minimo, p_fecha_inicio, p_fecha_corte,
          now(), auth.uid(), public.frisa_niveles_nombre_usuario())
  on conflict (id) do update set
    dias_periodo = excluded.dias_periodo, dias_maximo = excluded.dias_maximo,
    dias_reorden = excluded.dias_reorden, dias_minimo = excluded.dias_minimo,
    fecha_inicio_consumo = excluded.fecha_inicio_consumo, fecha_corte_consumo = excluded.fecha_corte_consumo,
    actualizado_en = now(), actualizado_por = excluded.actualizado_por,
    actualizado_por_nombre = excluded.actualizado_por_nombre
  returning * into v_fila;
  return v_fila;
end $$;

-- 4c) Importar (o reimportar) desde el Sheet. Upsert por clave:
--   · clave nueva   → se crea con todo, incluido el stock del CSV, y queda un
--                     conteo "importacion" en el historial.
--   · clave que ya existe → se actualizan nombre, atributos, consumos, clase
--                     ABC y tendencia; la nota solo si el CSV trae una. El
--                     STOCK NO SE TOCA (ya se captura en la app).
--   · claves que no vienen en el CSV no se tocan.
-- p_productos: [{clave, nombre, tipo, reflejante, manga, color, consumo_2025,
--               consumo_2026, clase_abc, tendencia, nota, stock_actual}]
-- p_config (opcional): {dias_periodo, dias_maximo, dias_reorden, dias_minimo,
--               fecha_inicio_consumo, fecha_corte_consumo}
create or replace function public.frisa_niveles_importar(p_productos jsonb, p_config jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_p jsonb;
  v_clave text;
  v_id uuid;
  v_nuevos integer := 0;
  v_actualizados integer := 0;
  v_nombre text := public.frisa_niveles_nombre_usuario();
  v_stock integer;
  v_cfg public.frisa_niveles_config;
begin
  if not public.tiene_permiso('fn.supuestos') then
    raise exception 'No tienes permiso para importar los niveles de Frisa.' using errcode = '42501';
  end if;
  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'No hay claves para importar.';
  end if;
  -- Claves repetidas en el archivo: se rechaza todo.
  if (select count(*) <> count(distinct lower(btrim(e->>'clave'))) from jsonb_array_elements(p_productos) e) then
    raise exception 'El archivo trae claves repetidas.';
  end if;

  perform pg_advisory_xact_lock(hashtext('frisa_niveles_importar'));

  if p_config is not null then
    select * into v_cfg from public.frisa_niveles_config where id;
    perform public.frisa_niveles_guardar_config(
      coalesce((p_config->>'dias_periodo')::int, v_cfg.dias_periodo),
      coalesce((p_config->>'dias_maximo')::int,  v_cfg.dias_maximo),
      coalesce((p_config->>'dias_reorden')::int, v_cfg.dias_reorden),
      coalesce((p_config->>'dias_minimo')::int,  v_cfg.dias_minimo),
      coalesce((p_config->>'fecha_inicio_consumo')::date, v_cfg.fecha_inicio_consumo),
      coalesce((p_config->>'fecha_corte_consumo')::date,  v_cfg.fecha_corte_consumo));
  end if;

  for v_p in select * from jsonb_array_elements(p_productos) loop
    v_clave := btrim(coalesce(v_p->>'clave', ''));
    if v_clave = '' then
      raise exception 'Hay un renglón sin clave.';
    end if;
    if coalesce((v_p->>'consumo_2025')::int, 0) < 0 or coalesce((v_p->>'consumo_2026')::int, 0) < 0 then
      raise exception 'Consumo negativo en %.', v_clave;
    end if;

    select id into v_id from public.frisa_productos_niveles where lower(btrim(clave)) = lower(v_clave) for update;
    if found then
      update public.frisa_productos_niveles set
        nombre       = coalesce(nullif(btrim(v_p->>'nombre'), ''), nombre),
        tipo         = nullif(btrim(v_p->>'tipo'), ''),
        reflejante   = nullif(btrim(v_p->>'reflejante'), ''),
        manga        = nullif(btrim(v_p->>'manga'), ''),
        color        = nullif(btrim(v_p->>'color'), ''),
        consumo_2025 = coalesce((v_p->>'consumo_2025')::int, 0),
        consumo_2026 = coalesce((v_p->>'consumo_2026')::int, 0),
        clase_abc    = nullif(btrim(v_p->>'clase_abc'), ''),
        tendencia    = nullif(btrim(v_p->>'tendencia'), ''),
        nota         = coalesce(nullif(btrim(v_p->>'nota'), ''), nota),
        activo       = true,
        actualizado_en = now()
      where id = v_id;
      v_actualizados := v_actualizados + 1;
    else
      v_stock := coalesce((v_p->>'stock_actual')::int, 0);
      if v_stock < 0 then
        raise exception 'Stock negativo en %.', v_clave;
      end if;
      insert into public.frisa_productos_niveles (clave, nombre, tipo, reflejante, manga, color,
        consumo_2025, consumo_2026, clase_abc, tendencia, nota, stock_actual,
        stock_actualizado_en, stock_actualizado_por, stock_actualizado_por_nombre)
      values (v_clave, coalesce(btrim(v_p->>'nombre'), ''), nullif(btrim(v_p->>'tipo'), ''),
        nullif(btrim(v_p->>'reflejante'), ''), nullif(btrim(v_p->>'manga'), ''), nullif(btrim(v_p->>'color'), ''),
        coalesce((v_p->>'consumo_2025')::int, 0), coalesce((v_p->>'consumo_2026')::int, 0),
        nullif(btrim(v_p->>'clase_abc'), ''), nullif(btrim(v_p->>'tendencia'), ''), nullif(btrim(v_p->>'nota'), ''),
        v_stock, now(), auth.uid(), v_nombre)
      returning id into v_id;
      insert into public.frisa_conteos_stock (producto_id, clave, stock_anterior, stock_nuevo, origen, usuario_id, usuario_nombre, comentario)
      values (v_id, v_clave, null, v_stock, 'importacion', auth.uid(), v_nombre, 'Importación inicial del Sheet');
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;

  return jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados);
end $$;

revoke execute on function public.frisa_niveles_capturar_stock(text, integer, text) from public, anon;
revoke execute on function public.frisa_niveles_guardar_config(integer, integer, integer, integer, date, date) from public, anon;
revoke execute on function public.frisa_niveles_importar(jsonb, jsonb) from public, anon;
grant execute on function public.frisa_niveles_capturar_stock(text, integer, text) to authenticated;
grant execute on function public.frisa_niveles_guardar_config(integer, integer, integer, integer, date, date) to authenticated;
grant execute on function public.frisa_niveles_importar(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Rollback (NO correr salvo que se quiera quitar todo V184):
--   drop function if exists public.frisa_niveles_importar(jsonb, jsonb);
--   drop function if exists public.frisa_niveles_guardar_config(integer, integer, integer, integer, date, date);
--   drop function if exists public.frisa_niveles_capturar_stock(text, integer, text);
--   drop function if exists public.frisa_niveles_nombre_usuario();
--   drop table if exists public.frisa_conteos_stock;
--   drop table if exists public.frisa_productos_niveles;
--   drop table if exists public.frisa_niveles_config;
--   delete from public.rol_permisos where clave in ('fn.ver','fn.capturar','fn.supuestos');
--   delete from public.permisos_catalogo where clave in ('fn.ver','fn.capturar','fn.supuestos');
-- ---------------------------------------------------------------------
