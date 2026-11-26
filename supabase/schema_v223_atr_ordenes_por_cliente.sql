-- =====================================================================
-- V223 — ATR: una orden es de ATR por su cliente (venga de donde venga)
--        y las cantidades de la orden de taller son libres.
--
-- Requiere V212, V216 y V217. Solo cambios aditivos; se puede correr dos veces.
--
-- Decisiones de Alfredo (2026-11-26):
--   * Una orden cuenta para ATR por su CLIENTE, no por dónde se creó. (Esto
--     ya era así en "En taller" y en la entrada al terminar: atr_faltantes y
--     atr_lineas_orden filtran por client_id = ATR + bata del catálogo ATR.
--     No se tocan.) orders.atr_inventario queda solo como dato informativo
--     ("se creó desde Qué nos falta").
--   * Toda orden de ATR va SIN PRECIO, también la que se hace desde
--     "Nueva orden" (lo que se le vende a ATR es la OC, no la orden interna).
--   * Cantidades de la orden de taller libres: basta con una línea > 0.
--
-- Qué hace:
--   1) orders_lineas_precio_guard: no exige precio a órdenes con cliente ATR
--      (antes: solo a las de atr_inventario).
--  1b) create_order_con_lineas ("Nueva orden"): se salta la validación de
--      precio si el cliente es ATR (parche al texto vivo, como V216).
--   2) Candado nuevo al CREAR una orden con cliente ATR: cada prenda con
--      piezas debe ser una bata del catálogo de ATR (producto_id). Solo en
--      INSERT: las órdenes viejas se siguen pudiendo editar y surtir.
--   3) atr_crear_orden_taller: ya no exige que cada bata tenga tallas; basta
--      con al menos una línea con cantidad > 0 en toda la orden (las batas
--      sin piezas se descartan).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.orders_lineas_precio_guard()') is null
     or to_regprocedure('public.atr_cliente_id()') is null
     or to_regprocedure('public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz)') is null then
    raise exception 'V223: falta V212/V210/V216. No se aplicó nada.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'orders_lineas_precio_guard'
                 and position('atr_inventario' in prosrc) > 0) then
    raise exception 'V223: orders_lineas_precio_guard no es la versión de V216. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Candado de precio: excepción por cliente ATR
-- ---------------------------------------------------------------------
create or replace function public.orders_lineas_precio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  -- V212: precio obligatorio siempre (se quitó el interruptor de V161).
  -- V216/V223: menos las órdenes de ATR (por cliente, vengan de donde vengan).
  if exists (select 1 from public.orders
             where id = new.id
               and (atr_inventario or client_id = public.atr_cliente_id())) then
    return null;
  end if;
  select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
  from public.orden_lineas_calc(new.id) c where not c.con_precio;
  if v_falta is not null then
    raise exception using errcode = 'check_violation',
      message = format('Falta el precio unitario en: %s. La orden no se guardó.', v_falta);
  end if;
  return null;
end; $$;

-- ---------------------------------------------------------------------
-- 1b) create_order_con_lineas ("Nueva orden"): no pedir precio si el cliente
--     es ATR. Se parcha el texto VIVO (como V216 con create_order); si el
--     texto esperado no está exactamente una vez, no se aplica nada.
-- ---------------------------------------------------------------------
do $$
declare
  v_oid oid;
  v_def text;
  v_viejo text := $t$perform public.orden_lineas_validar(p_order_type_key, p_items, p_lineas);$t$;
  v_nuevo text := $t$if p_client_id is distinct from public.atr_cliente_id() then perform public.orden_lineas_validar(p_order_type_key, p_items, p_lineas); end if; -- V223: ATR sin precio$t$;
  v_veces int;
begin
  select count(*) into v_veces from pg_proc where proname = 'create_order_con_lineas' and pronamespace = 'public'::regnamespace;
  if v_veces <> 1 then raise exception 'V223: se esperaba una sola create_order_con_lineas, hay %. No se aplicó nada.', v_veces; end if;
  select oid into v_oid from pg_proc where proname = 'create_order_con_lineas' and pronamespace = 'public'::regnamespace;
  v_def := pg_get_functiondef(v_oid);
  if position('V223: ATR sin precio' in v_def) > 0 then
    raise notice 'V223: create_order_con_lineas ya estaba parchada; no se cambia.';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces <> 1 then
    raise exception 'V223: en create_order_con_lineas la validación de precio aparece % veces (debe ser 1). No se aplicó nada.', v_veces;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ---------------------------------------------------------------------
-- 2) Orden nueva de ATR: solo batas del catálogo de ATR
-- ---------------------------------------------------------------------
create or replace function public.orders_atr_catalogo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_atr uuid := public.atr_cliente_id();
  v_malo text;
begin
  if v_atr is null or new.client_id is distinct from v_atr then return new; end if;
  -- Prendas con al menos una talla con cantidad > 0 que no son del catálogo ATR.
  select string_agg(coalesce(nullif(btrim(it->>'garment'), ''), 'prenda sin nombre'), ', ') into v_malo
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
  where exists (select 1 from jsonb_array_elements(coalesce(it->'sizes', '[]'::jsonb)) s
                where coalesce(s->>'cantidad', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                  and (s->>'cantidad')::numeric > 0)
    and not exists (select 1 from public.productos p
                    where p.id::text = it->>'producto_id' and p.cliente_id = v_atr);
  if v_malo is not null then
    raise exception using errcode = 'check_violation',
      message = format('En órdenes de ATR cada bata se elige del catálogo de ATR (revisa: %s). La orden no se guardó.', v_malo);
  end if;
  return new;
end; $$;

drop trigger if exists orders_atr_catalogo_chk on public.orders;
create trigger orders_atr_catalogo_chk
  before insert on public.orders
  for each row execute function public.orders_atr_catalogo_guard();

-- ---------------------------------------------------------------------
-- 3) Orden de taller ATR: cantidades libres
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
  v_items jsonb;
  v_order public.orders;
begin
  if not public.tiene_permiso('atr.taller') then
    raise exception 'No tienes permiso para crear órdenes de taller de ATR.';
  end if;
  if v_atr is null then raise exception 'No existe el cliente ATR.'; end if;
  if p_requested_delivery_date is null then raise exception 'Falta la fecha de entrega.'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Agrega al menos una bata.'; end if;

  -- V223: se quedan solo las batas con al menos una talla con cantidad > 0.
  select coalesce(jsonb_agg(it order by n), '[]'::jsonb) into v_items
  from jsonb_array_elements(p_items) with ordinality x(it, n)
  where exists (
    select 1 from jsonb_array_elements(coalesce(it->'sizes', '[]'::jsonb)) s
    where coalesce(btrim(s->>'talla'), '') <> ''
      and (s->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' and (s->>'cantidad')::numeric > 0);
  if jsonb_array_length(v_items) = 0 then
    raise exception 'Captura al menos una talla con cantidad mayor a 0.';
  end if;

  select string_agg(coalesce(nullif(it->>'garment', ''), 'prenda sin nombre'), ', ') into v_malo
  from jsonb_array_elements(v_items) it
  where not exists (select 1 from public.productos p where p.id::text = it->>'producto_id' and p.cliente_id = v_atr);
  if v_malo is not null then
    raise exception 'Solo se pueden pedir batas del catálogo de ATR (revisa: %).', v_malo;
  end if;

  select nombre into v_nombre from public.clientes where id = v_atr;

  perform set_config('salper.atr_taller', 'si', true);
  v_order := public.create_order(v_nombre, 'industrial', p_description, p_requested_delivery_date,
                                 null, v_items, v_atr, null, null,
                                 coalesce(p_folios_externos, '{}'::text[]), p_created_at, null);
  perform set_config('salper.atr_taller', '', true);

  update public.orders set atr_inventario = true where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz) from public, anon;
grant execute on function public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Comprobación (debe dar: true · true · true · true · false)
--   candado de precio por cliente · Nueva orden sin precio para ATR ·
--   candado de catálogo · taller libre · anon puede crear
-- ---------------------------------------------------------------------
select
  (select position('atr_cliente_id' in prosrc) > 0 from pg_proc
     where proname = 'orders_lineas_precio_guard')                                             as precio_por_cliente,
  (select position('V223: ATR sin precio' in prosrc) > 0 from pg_proc
     where proname = 'create_order_con_lineas' and pronamespace = 'public'::regnamespace)      as nueva_orden_sin_precio,
  exists (select 1 from pg_trigger where tgname = 'orders_atr_catalogo_chk'
          and tgrelid = 'public.orders'::regclass)                                             as candado_catalogo,
  (select position('V223' in prosrc) > 0 from pg_proc
     where proname = 'atr_crear_orden_taller')                                                 as taller_libre,
  has_function_privilege('anon', 'public.atr_crear_orden_taller(text, date, jsonb, text[], timestamptz)', 'EXECUTE') as anon_puede;
