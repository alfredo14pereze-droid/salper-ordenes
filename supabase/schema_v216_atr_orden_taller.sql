-- =====================================================================
-- V216 — ATR: orden de taller para inventario (sin precio) creada desde
--        "Qué nos falta", también por admin_fabrica y contabilidad.
--
-- Requiere V209–V215 y V212. Se puede correr dos veces.
--
-- Decisiones de Alfredo (2026-11-23):
--   * admin_fabrica y contabilidad crean órdenes SOLO de ATR (desde el botón
--     de "Qué nos falta"). Quién crea las demás órdenes no cambia.
--   * Las órdenes de ATR para inventario van SIN PRECIO (lo que se vende es
--     la OC de ATR, no la orden interna).
--
-- Qué hace:
--   1) orders.atr_inventario (boolean, nueva columna, default false).
--   2) Permisos: contabilidad recibe atr.ver y atr.taller (admin_general y
--      admin_fabrica ya tienen atr.taller desde V215).
--   3) create_order: se le agrega UNA condición a su revisión de rol para
--      que deje pasar a atr_crear_orden_taller. Se parcha el texto VIVO de
--      la función (no una copia del repo); si el texto esperado no está
--      exactamente una vez, no se aplica nada y avisa.
--   4) orders_lineas_precio_guard (V212): no exige precio a una orden con
--      atr_inventario = true. Todas las demás siguen igual.
--   5) atr_crear_orden_taller(...): crea la orden con cliente ATR, tipo
--      industrial, solo batas del catálogo de ATR, sin líneas de precio, y
--      la marca atr_inventario. Pide atr.taller.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas: lo que se va a parchar debe estar como se espera
-- ---------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_proc where proname = 'create_order' and pronamespace = 'public'::regnamespace;
  if n <> 1 then raise exception 'V216: se esperaba una sola función create_order, hay %. No se aplicó nada.', n; end if;
  if to_regprocedure('public.orders_lineas_precio_guard()') is null
     or to_regprocedure('public.orden_lineas_calc(uuid)') is null
     or to_regprocedure('public.atr_cliente_id()') is null then
    raise exception 'V216: falta V159/V212 o V210. No se aplicó nada.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'orders_lineas_precio_guard'
                 and position('V212: precio obligatorio siempre' in prosrc) > 0) then
    raise exception 'V216: orders_lineas_precio_guard no es la versión de V212. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Marca de orden de inventario ATR
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists atr_inventario boolean not null default false;

-- ---------------------------------------------------------------------
-- 2) Permisos de contabilidad
-- ---------------------------------------------------------------------
insert into public.rol_permisos (rol, clave) values
  ('contabilidad', 'atr.ver'), ('contabilidad', 'atr.taller')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) create_order: dejar pasar a atr_crear_orden_taller (texto vivo)
--    Antes:  ... not in ('ventas', 'admin_tienda', 'admin_general') then
--    Después: ... not in (...) and coalesce(current_setting('salper.atr_taller', true), '') <> 'si' then
--    'salper.atr_taller' solo lo pone atr_crear_orden_taller, local a su
--    transacción, y lo quita en cuanto se crea la orden.
-- ---------------------------------------------------------------------
do $$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $t$if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then$t$;
  v_nuevo text := $t$if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') and coalesce(current_setting('salper.atr_taller', true), '') <> 'si' then$t$;
  v_veces int;
begin
  select oid into v_oid from pg_proc where proname = 'create_order' and pronamespace = 'public'::regnamespace;
  v_def := pg_get_functiondef(v_oid);
  if position('salper.atr_taller' in v_def) > 0 then
    raise notice 'V216: create_order ya estaba parchada; no se cambia.';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces <> 1 then
    raise exception 'V216: en create_order la revisión de rol esperada aparece % veces (debe ser 1). No se aplicó nada.', v_veces;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ---------------------------------------------------------------------
-- 4) Candado de precio (V212) + excepción para inventario ATR
-- ---------------------------------------------------------------------
create or replace function public.orders_lineas_precio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  -- V212: precio obligatorio siempre (se quitó el interruptor de V161).
  -- V216: menos las órdenes de taller para inventario de ATR (sin precio).
  if exists (select 1 from public.orders where id = new.id and atr_inventario) then return null; end if;
  select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
  from public.orden_lineas_calc(new.id) c where not c.con_precio;
  if v_falta is not null then
    raise exception using errcode = 'check_violation',
      message = format('Falta el precio unitario en: %s. La orden no se guardó.', v_falta);
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------
-- 5) Crear la orden de taller ATR
--    p_items: mismo formato que orders.items (lo arma el formulario normal);
--    cada prenda debe ser una bata del catálogo de ATR (producto_id) y
--    tener al menos una talla con cantidad > 0.
-- ---------------------------------------------------------------------
create or replace function public.atr_crear_orden_taller(
  p_description text,
  p_requested_delivery_date date,
  p_items jsonb,
  p_folios_externos text[] default '{}'::text[],
  p_created_at timestamptz default null
)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_atr uuid := public.atr_cliente_id();
  v_nombre text;
  v_malo text;
  v_order public.orders;
begin
  if not public.tiene_permiso('atr.taller') then
    raise exception 'No tienes permiso para crear órdenes de taller de ATR.';
  end if;
  if v_atr is null then raise exception 'No existe el cliente ATR.'; end if;
  if p_requested_delivery_date is null then raise exception 'Falta la fecha de entrega.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos una bata.';
  end if;

  select string_agg(coalesce(nullif(it->>'garment', ''), 'prenda sin nombre'), ', ') into v_malo
  from jsonb_array_elements(p_items) it
  where not exists (select 1 from public.productos p where p.id::text = it->>'producto_id' and p.cliente_id = v_atr);
  if v_malo is not null then
    raise exception 'Solo se pueden pedir batas del catálogo de ATR (revisa: %).', v_malo;
  end if;

  select string_agg(coalesce(it->>'garment', 'prenda'), ', ') into v_malo
  from jsonb_array_elements(p_items) it
  where not exists (
    select 1 from jsonb_array_elements(coalesce(it->'sizes', '[]'::jsonb)) s
    where coalesce(btrim(s->>'talla'), '') <> ''
      and (s->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' and (s->>'cantidad')::numeric > 0);
  if v_malo is not null then
    raise exception 'Cada bata necesita al menos una talla con cantidad (revisa: %).', v_malo;
  end if;

  select nombre into v_nombre from public.clientes where id = v_atr;

  perform set_config('salper.atr_taller', 'si', true);
  v_order := public.create_order(v_nombre, 'industrial', p_description, p_requested_delivery_date,
                                 null, p_items, v_atr, null, null,
                                 coalesce(p_folios_externos, '{}'::text[]), p_created_at, null);
  perform set_config('salper.atr_taller', '', true);

  update public.orders set atr_inventario = true where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz) from public, anon;
grant execute on function public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: true · 2 · true · true · true · false)
--   columna · permisos de contabilidad · create_order parchada ·
--   candado con excepción · función nueva · anon puede crear
-- ---------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'orders' and column_name = 'atr_inventario')                       as columna,
  (select count(*) from public.rol_permisos where rol = 'contabilidad'
     and clave in ('atr.ver', 'atr.taller'))                                                   as permisos_contabilidad,
  (select position('salper.atr_taller' in prosrc) > 0 from pg_proc
     where proname = 'create_order' and pronamespace = 'public'::regnamespace)                 as create_order_parchada,
  (select position('atr_inventario' in prosrc) > 0 from pg_proc
     where proname = 'orders_lineas_precio_guard')                                             as candado_con_excepcion,
  to_regprocedure('public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz)') is not null as funcion_nueva,
  has_function_privilege('anon', 'public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz)', 'EXECUTE') as anon_puede;
