-- =====================================================================
-- V159 — Precio por línea (prenda + talla) y "Venta de mostrador" por línea
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo una
-- vez. Todo va en una sola transacción: si algo falla, no se aplica nada.
-- Se puede volver a correr sin daño.
-- =====================================================================
-- Solo AGREGA (tabla y funciones nuevas). Reemplaza 3 funciones de V77/V144
-- (orden_faltantes, orden_totales, fin_validar_entrega) solo si la versión
-- viva es la esperada (md5); si no, no se aplica NADA.
-- No toca orders.items, orders.total_orden, update_order_status ni etapas.
--
-- Una "línea" = una talla de una prenda de orders.items:
--   (item_index, size_index) → prenda, talla, cantidad (en orders.items)
--                            → precio_unitario, venta_mostrador (aquí)
-- Los precios no van en orders.items porque esa columna la lee producción.
-- Órdenes viejas: si una línea no tiene fila aquí, vale el precio por prenda
-- de V77 (orden_precios). Si tampoco hay, la línea queda "sin precio".
-- Tipos sin precio: frisa y venta_mostrador (función orden_tipo_lleva_precio).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas: versión viva esperada de lo que se reemplaza
-- ---------------------------------------------------------------------
do $$
declare
  esperado constant jsonb := '{
    "orden_faltantes":     "bbf78a18c3d92c09e74d9af004ee8280",
    "orden_totales":       "14e5b290409c20f3719b837b14aadeb8",
    "fin_validar_entrega": "952b946ad36abbf5a19c2b7e335f1288"}';
  r record; n int := 0;
begin
  for r in select proname, md5(prosrc) as h, prosrc from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('orden_faltantes', 'orden_totales', 'fin_validar_entrega') loop
    n := n + 1;
    -- Ya con V159 (segunda corrida): se deja pasar.
    if r.h is distinct from esperado->>r.proname and position('V159' in r.prosrc) = 0 then
      raise exception 'V159: % viva no es la esperada (V77/V144). No se aplicó nada.', r.proname;
    end if;
  end loop;
  if n <> 3 then raise exception 'V159: se esperaban 3 funciones, hay %. No se aplicó nada.', n; end if;
  if position('fin_validar_entrega' in (select prosrc from pg_proc where proname = 'update_order_status'
                                         and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception 'V159: update_order_status no llama a fin_validar_entrega. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Tabla de líneas (precio + bandera de mostrador)
-- ---------------------------------------------------------------------
create table if not exists public.orden_lineas (
  order_id        uuid not null references public.orders(id) on delete cascade,
  item_index      integer not null check (item_index >= 0),
  size_index      integer not null check (size_index >= 0),
  prenda          text not null,          -- copia, para detectar si la prenda cambió
  talla           text not null,          -- copia, igual
  precio_unitario numeric(12,2),
  venta_mostrador boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (order_id, item_index, size_index),
  -- Regla de precio en la base: si no es de mostrador, precio > 0.
  constraint orden_lineas_precio_ck
    check (venta_mostrador or (precio_unitario is not null and precio_unitario > 0))
);

alter table public.orden_lineas enable row level security;
drop policy if exists "fin lee lineas" on public.orden_lineas;
create policy "fin lee lineas" on public.orden_lineas
  for select to authenticated using (public.fin_puede_ver());
revoke all on public.orden_lineas from public, anon, authenticated;
grant select on public.orden_lineas to authenticated;

-- ---------------------------------------------------------------------
-- 2) Helpers internos (sin grant: solo los llaman otras funciones)
-- ---------------------------------------------------------------------
-- Tipos de orden que no llevan precio (un solo lugar).
create or replace function public.orden_tipo_lleva_precio(p_tipo text)
returns boolean language sql immutable as $$
  select coalesce(p_tipo, '') not in ('frisa', 'venta_mostrador');
$$;

-- Estado de cada línea con cantidad > 0 de una orden ya guardada.
create or replace function public.orden_lineas_calc(p_order_id uuid)
returns table (item_index int, size_index int, prenda text, talla text, cantidad numeric,
               precio_unitario numeric, extras jsonb, extras_pieza numeric,
               venta_mostrador boolean, con_precio boolean)
language sql stable security definer set search_path = public as $$
  with o as (
    select id, items, public.orden_tipo_lleva_precio(order_type_key) as lleva
    from public.orders where id = p_order_id
  ), it as (
    select (x.ord - 1)::int as idx, (s.ord - 1)::int as sidx,
           coalesce(x.item->>'garment', '') as garment,
           coalesce(btrim(s.sz->>'talla'), '') as talla,
           case when (s.sz->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' then (s.sz->>'cantidad')::numeric else 0 end as cant,
           o.lleva
    from o
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end) with ordinality x(item, ord)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(x.item->'sizes') = 'array' then x.item->'sizes' else '[]'::jsonb end) with ordinality s(sz, ord)
  )
  select it.idx, it.sidx, it.garment, it.talla, it.cant,
         case when coalesce(l.venta_mostrador, false) then null
              else coalesce(l.precio_unitario, p.precio_unitario) end,
         case when coalesce(l.venta_mostrador, false) then '[]'::jsonb else coalesce(p.extras, '[]'::jsonb) end,
         case when coalesce(l.venta_mostrador, false) then 0
              else coalesce((select sum((e->>'monto')::numeric) from jsonb_array_elements(p.extras) e), 0) end,
         coalesce(l.venta_mostrador, false) or not it.lleva,
         -- coalesce: sin fila, "precio > 0" daría NULL y la línea no contaría como faltante.
         coalesce(l.venta_mostrador, false) or not it.lleva
           or coalesce(l.precio_unitario, 0) > 0 or p.precio_unitario is not null
  from it
  left join public.orden_lineas l
    on l.order_id = p_order_id and l.item_index = it.idx and l.size_index = it.sidx
   and l.prenda = it.garment and l.talla = it.talla
  left join public.orden_precios p
    on p.order_id = p_order_id and p.item_index = it.idx and p.prenda = it.garment
  where it.cant > 0;
$$;

-- Valida líneas contra p_items ANTES de crear la orden (no gasta folio).
-- p_lineas = [{"item_index":0,"size_index":1,"precio_unitario":250,"venta_mostrador":false}, ...]
create or replace function public.orden_lineas_validar(p_tipo text, p_items jsonb, p_lineas jsonb)
returns void language plpgsql stable set search_path = public as $$
declare v_falta text;
begin
  if not public.orden_tipo_lleva_precio(p_tipo) then return; end if;
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' then raise exception 'Formato de líneas inválido.'; end if;
  select string_agg(coalesce(x.item->>'garment', 'prenda') || ' ' || coalesce(s.sz->>'talla', ''), ', ')
    into v_falta
  from jsonb_array_elements(
         case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality x(item, ord)
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(x.item->'sizes') = 'array' then x.item->'sizes' else '[]'::jsonb end) with ordinality s(sz, ord)
  where (s.sz->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' and (s.sz->>'cantidad')::numeric > 0
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
      where (l->>'item_index')::int = x.ord - 1 and (l->>'size_index')::int = s.ord - 1
        and (coalesce((l->>'venta_mostrador')::boolean, false)
             or coalesce((l->>'precio_unitario')::numeric, 0) > 0));
  if v_falta is not null then
    raise exception 'Falta precio unitario en: %. Captúralo o márcala como venta de mostrador.', v_falta;
  end if;
end; $$;

-- Reemplaza las líneas de una orden (toma prenda/talla de orders.items).
-- Líneas sin precio y sin mostrador no se guardan (quedan "sin precio").
create or replace function public.orden_lineas_guardar(p_order_id uuid, p_lineas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l jsonb; v_items jsonb; v_item jsonb; v_size jsonb; v_most boolean; v_precio numeric;
begin
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' then raise exception 'Formato de líneas inválido.'; end if;
  select items into v_items from public.orders where id = p_order_id;
  delete from public.orden_lineas where order_id = p_order_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    v_item := v_items -> ((l->>'item_index')::int);
    v_size := v_item -> 'sizes' -> ((l->>'size_index')::int);
    if v_size is null then raise exception 'Línea fuera de la orden (prenda %, talla %).',
      (l->>'item_index')::int + 1, (l->>'size_index')::int + 1; end if;
    v_most := coalesce((l->>'venta_mostrador')::boolean, false);
    v_precio := nullif(l->>'precio_unitario', '')::numeric;
    if not v_most and v_precio is not null and v_precio <= 0 then
      raise exception 'El precio unitario debe ser mayor a 0 (%, talla %).', v_item->>'garment', v_size->>'talla';
    end if;
    if v_most or v_precio is not null then
      insert into public.orden_lineas (order_id, item_index, size_index, prenda, talla, precio_unitario, venta_mostrador)
      values (p_order_id, (l->>'item_index')::int, (l->>'size_index')::int,
              coalesce(v_item->>'garment', ''), coalesce(btrim(v_size->>'talla'), ''),
              case when v_most then null else round(v_precio, 2) end, v_most);
    end if;
  end loop;
end; $$;

revoke execute on function public.orden_tipo_lleva_precio(text) from public;
revoke execute on function public.orden_lineas_calc(uuid) from public;
revoke execute on function public.orden_lineas_validar(text, jsonb, jsonb) from public;
revoke execute on function public.orden_lineas_guardar(uuid, jsonb) from public;

-- ---------------------------------------------------------------------
-- 3) Candado en la base: una orden NUEVA no se guarda con líneas sin precio
--    (se revisa al final de la transacción, cuando ya se guardaron las líneas).
--    Solo INSERT: las órdenes que ya existen no se tocan.
-- ---------------------------------------------------------------------
create or replace function public.orders_lineas_precio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
  from public.orden_lineas_calc(new.id) c where not c.con_precio;
  if v_falta is not null then
    raise exception 'La orden no se puede guardar: falta precio unitario en %.', v_falta;
  end if;
  return null;
end; $$;

drop trigger if exists orders_lineas_precio_chk on public.orders;
create constraint trigger orders_lineas_precio_chk
  after insert on public.orders
  deferrable initially deferred
  for each row execute function public.orders_lineas_precio_guard();

-- ---------------------------------------------------------------------
-- 4) Crear orden con líneas (una sola transacción; valida antes del folio)
-- ---------------------------------------------------------------------
create or replace function public.create_order_con_lineas(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_items jsonb, p_lineas jsonb,
  p_client_id uuid default null, p_client_telefono text default null, p_client_correo text default null,
  p_folios_externos text[] default '{}'::text[], p_created_at timestamptz default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.fin_puede_editar() then raise exception 'Solo tienda o administrador pueden crear órdenes.'; end if;
  perform public.orden_lineas_validar(p_order_type_key, p_items, p_lineas);
  v_order := public.create_order(p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
                                 null, p_items, p_client_id, p_client_telefono, p_client_correo,
                                 p_folios_externos, p_created_at, null);
  perform public.orden_lineas_guardar(v_order.id, p_lineas);
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end; $$;

create or replace function public.create_order_maquila_con_lineas(
  p_client_id uuid, p_producto_id uuid, p_numero_corte text, p_requested_delivery_date date,
  p_items jsonb, p_lineas jsonb,
  p_description text default null, p_folios_externos text[] default '{}'::text[]
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.fin_puede_editar() then raise exception 'Solo tienda o administrador pueden crear órdenes.'; end if;
  perform public.orden_lineas_validar('maquila', p_items, p_lineas);
  v_order := public.create_order_maquila(p_client_id, p_producto_id, p_numero_corte, p_requested_delivery_date,
                                         p_items, p_description, p_folios_externos, null);
  perform public.orden_lineas_guardar(v_order.id, p_lineas);
  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end; $$;

-- ---------------------------------------------------------------------
-- 5) Editar líneas de una orden existente (precio y/o mostrador)
-- ---------------------------------------------------------------------
create or replace function public.set_orden_lineas(p_order_id uuid, p_lineas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para capturar precios.'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;
  if v_o.status = 'completado' then raise exception 'La orden ya fue entregada; sus precios ya no se pueden cambiar.'; end if;
  perform public.orden_lineas_guardar(p_order_id, p_lineas);
  return public.orden_totales(p_order_id);
end; $$;

-- Etiqueta "Mostrador" en listado y detalle para TODOS los roles
-- (solo dice qué líneas son de mostrador; nunca precios).
create or replace function public.orden_lineas_mostrador(p_order_ids uuid[])
returns table (order_id uuid, item_index int, size_index int)
language sql stable security definer set search_path = public as $$
  select l.order_id, l.item_index, l.size_index from public.orden_lineas l
  where l.venta_mostrador and l.order_id = any(p_order_ids) and auth.uid() is not null;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_order_con_lineas(text, text, text, date, jsonb, jsonb, uuid, text, text, text[], timestamptz)',
    'create_order_maquila_con_lineas(uuid, uuid, text, date, jsonb, jsonb, text, text[])',
    'set_orden_lineas(uuid, jsonb)', 'orden_lineas_mostrador(uuid[])'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) Reemplazo de faltantes y totales (ahora por línea; mostrador fuera)
-- ---------------------------------------------------------------------
create or replace function public.orden_faltantes(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sin jsonb; v_fact public.orden_facturacion;
begin
  -- V159: por línea (prenda + talla); mostrador y tipos sin precio no cuentan.
  select coalesce(jsonb_agg(jsonb_build_object('item_index', c.item_index, 'size_index', c.size_index,
                                               'prenda', c.prenda, 'talla', c.talla)
                            order by c.item_index, c.size_index), '[]'::jsonb)
    into v_sin
  from public.orden_lineas_calc(p_order_id) c where not c.con_precio;
  select * into v_fact from public.orden_facturacion f where f.order_id = p_order_id;
  return jsonb_build_object(
    'renglones_sin_precio', v_sin,
    'falta_razon_social', coalesce(v_fact.requiere_factura, false) and v_fact.razon_social_id is null and not public.fin_fiscal_completo(v_fact.fiscal_snapshot)); -- V144
end; $$;

create or replace function public.orden_totales(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fact public.orden_facturacion; v_req boolean; v_inc boolean;
  v_sub numeric := 0; v_base numeric; v_iva numeric := 0; v_total numeric; v_ant numeric; v_falt jsonb;
  v_renglones jsonb;
begin
  if not public.fin_puede_ver() then
    raise exception 'No tienes permiso para ver precios ni facturación.';
  end if;
  select * into v_fact from public.orden_facturacion f where f.order_id = p_order_id;
  v_req := coalesce(v_fact.requiere_factura, false);
  v_inc := coalesce(v_fact.precios_incluyen_iva, true);

  -- V159: total = suma de cantidad × (precio + extras) de líneas que NO son de mostrador.
  select coalesce(sum(case when not c.venta_mostrador and c.precio_unitario is not null
                           then c.cantidad * (c.precio_unitario + c.extras_pieza) else 0 end), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'item_index', c.item_index, 'size_index', c.size_index, 'prenda', c.prenda, 'talla', c.talla,
           'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario, 'venta_mostrador', c.venta_mostrador,
           'extras', c.extras, 'extras_por_pieza', c.extras_pieza,
           'subtotal_renglon', case when c.venta_mostrador or c.precio_unitario is null then 0
                                    else round(c.cantidad * (c.precio_unitario + c.extras_pieza), 2) end)
           order by c.item_index, c.size_index), '[]'::jsonb)
    into v_sub, v_renglones
  from public.orden_lineas_calc(p_order_id) c;

  if v_req and v_inc then
    v_total := v_sub; v_base := round(v_sub / 1.16, 2); v_iva := v_total - v_base;
  elsif v_req then
    v_base := v_sub; v_iva := round(v_sub * 0.16, 2); v_total := v_base + v_iva;
  else
    v_base := v_sub; v_iva := 0; v_total := v_sub;
  end if;
  v_total := round(v_total, 2);

  select coalesce(sum(a.monto), 0) into v_ant from public.anticipos a where a.order_id = p_order_id;
  v_falt := public.orden_faltantes(p_order_id);

  return jsonb_build_object(
    'requiere_factura', v_req, 'precios_incluyen_iva', v_inc,
    'renglones', v_renglones,
    'subtotal', v_base, 'iva', v_iva, 'total', v_total,
    'anticipos', v_ant, 'saldo', round(v_total - v_ant, 2),
    'faltantes', v_falt,
    'lista_para_entregar',
      jsonb_array_length(v_falt->'renglones_sin_precio') = 0 and not (v_falt->>'falta_razon_social')::boolean);
end; $$;

-- ---------------------------------------------------------------------
-- 7) Regla de entrega + EXCEPCIÓN TEMPORAL
-- ---------------------------------------------------------------------
-- ┌───────────────────────────────────────────────────────────────────┐
-- │ EXCEPCIÓN TEMPORAL (V159): hasta el 28-oct-2026 23:59 hora de     │
-- │ Monterrey (UTC-6) se puede entregar SIN precio. Está en UNA fila: │
-- │ fin_config.entrega_sin_precio_hasta. El 29-oct-2026 correr:       │
-- │   delete from public.fin_config                                    │
-- │   where clave = 'entrega_sin_precio_hasta';                        │
-- │ (después de esa hora ya no hace nada; borrarla deja todo limpio)   │
-- └───────────────────────────────────────────────────────────────────┘
insert into public.fin_config (clave, valor)
values ('entrega_sin_precio_hasta', '2026-10-28 23:59:59-06')
on conflict (clave) do update set valor = excluded.valor;

create or replace function public.fin_validar_entrega(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_desde timestamptz; v_hasta timestamptz; v_falt jsonb; v_msg text := '';
begin
  select * into v_o from public.orders o where o.id = p_order_id;
  select valor::timestamptz into v_desde from public.fin_config where clave = 'candado_desde';
  if v_o.id is null or v_o.created_at < v_desde then return; end if;   -- órdenes anteriores a V77: sin candado
  -- V159: excepción temporal (ver fin_config.entrega_sin_precio_hasta).
  select valor::timestamptz into v_hasta from public.fin_config where clave = 'entrega_sin_precio_hasta';
  v_falt := public.orden_faltantes(p_order_id);
  if (v_hasta is null or now() > v_hasta)
     and jsonb_array_length(v_falt->'renglones_sin_precio') > 0 then
    v_msg := 'Falta precio en: ' || (select string_agg(coalesce(e->>'prenda', 'prenda') || ' ' || coalesce(e->>'talla', ''), ', ')
                                     from jsonb_array_elements(v_falt->'renglones_sin_precio') e) || '. ';
  end if;
  if (v_falt->>'falta_razon_social')::boolean then
    v_msg := v_msg || 'La orden requiere factura y no tiene razón social. ';
  end if;
  if v_msg <> '' then
    raise exception 'No se puede marcar como entregada. %', btrim(v_msg);
  end if;
end; $$;
revoke execute on function public.fin_validar_entrega(uuid) from public;

-- =====================================================================
-- Verificación (solo lectura) después de aplicar:
--   select to_regclass('public.orden_lineas');                         -- no null
--   select tgname from pg_trigger where tgname = 'orders_lineas_precio_chk';
--   select valor from fin_config where clave = 'entrega_sin_precio_hasta';
--   select proname, position('V159' in prosrc) > 0 from pg_proc
--    where proname in ('orden_faltantes','orden_totales','fin_validar_entrega');
-- =====================================================================
