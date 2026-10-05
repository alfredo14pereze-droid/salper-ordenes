-- =====================================================================
-- V135 — "Venta Mostrador": plantilla de etapas, backfill y cliente Salper
-- =====================================================================
-- El tipo de orden 'venta_mostrador' se creó con "+ Nuevo tipo…" (29-sep-2026)
-- y nunca tuvo filas en plantillas_etapas, así que sus órdenes (VEN-001 a
-- VEN-004) nacieron sin orden_etapas y no le aparecen a ninguna estación.
--
-- 1) Plantilla: corte (1) → produccion (2, la reporta costura) → terminado (4).
--    El 3 queda libre: 'bordado' no va en la plantilla; create_order lo agrega
--    con secuencia 3 solo si alguna prenda trae lleva_bordado (igual que en
--    los demás tipos).
-- 2) Cliente "Salper" en el catálogo, con las tres categorías (aparece en
--    todos los tipos de orden).
-- 3) Backfill: a las órdenes activas del tipo que no tienen ninguna etapa se
--    les insertan las de la plantilla en 'pendiente' (más bordado si alguna
--    prenda lo lleva; hoy ninguna). No se toca orders.status.
-- 4) Esas órdenes pasan al cliente Salper (client_id y client_name).
--
-- Aditivo salvo el punto 4 (cambia client_name/client_id de 4 órdenes; antes
-- decían "Venta Mostrador" sin cliente ligado). No toca ninguna función.
-- Se puede correr dos veces sin duplicar nada.
-- =====================================================================
begin;

do $$
declare
  v_cliente_id uuid;
  v_n integer;
begin
  if not exists (select 1 from public.order_types where key = 'venta_mostrador') then
    raise exception 'V135: no existe el tipo de orden venta_mostrador.';
  end if;

  -- 1) Plantilla
  insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values
    ('venta_mostrador', 'corte', 1),
    ('venta_mostrador', 'produccion', 2),
    ('venta_mostrador', 'terminado', 4)
  on conflict (order_type_key, etapa) do nothing;

  -- 2) Cliente Salper
  insert into public.clientes (nombre, tipo_orden)
  values ('Salper', array['escolar', 'industrial', 'sublimacion'])
  on conflict (nombre_normalizado) do nothing;
  select id into v_cliente_id from public.clientes where nombre_normalizado = 'salper';
  if v_cliente_id is null then
    raise exception 'V135: no se pudo crear el cliente Salper.';
  end if;

  -- 3) Backfill de etapas: solo órdenes activas del tipo que no tienen NINGUNA etapa
  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select o.id, pe.etapa, 'pendiente', pe.orden_secuencia
  from public.orders o
  join public.plantillas_etapas pe on pe.order_type_key = o.order_type_key
  where o.order_type_key = 'venta_mostrador'
    and o.cancelled_at is null and o.eliminada_en is null and o.status <> 'completado'
    and not exists (select 1 from public.orden_etapas oe where oe.order_id = o.id)
  on conflict (order_id, etapa) do nothing;
  get diagnostics v_n = row_count;
  raise notice 'V135: % filas de orden_etapas insertadas (esperado 12).', v_n;

  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select o.id, 'bordado', 'pendiente', 3
  from public.orders o
  where o.order_type_key = 'venta_mostrador'
    and o.cancelled_at is null and o.eliminada_en is null and o.status <> 'completado'
    and exists (
      select 1 from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
      where coalesce((it->>'lleva_bordado')::boolean, false)
    )
  on conflict (order_id, etapa) do nothing;

  -- 4) Cliente de esas órdenes → Salper
  update public.orders o
  set client_id = v_cliente_id, client_name = 'Salper'
  where o.order_type_key = 'venta_mostrador'
    and o.cancelled_at is null and o.eliminada_en is null and o.status <> 'completado'
    and (o.client_id is distinct from v_cliente_id or o.client_name is distinct from 'Salper');
  get diagnostics v_n = row_count;
  raise notice 'V135: % órdenes pasadas al cliente Salper (esperado 4).', v_n;
end $$;

commit;

-- Verificación (después de correr):
--   select etapa, orden_secuencia from public.plantillas_etapas
--    where order_type_key = 'venta_mostrador' order by orden_secuencia;
--   -- esperado: corte 1, produccion 2, terminado 4
--
--   select o.order_number, o.client_name, c.nombre, o.status,
--          string_agg(oe.etapa || ':' || oe.estado, ', ' order by oe.orden_secuencia) as etapas
--   from public.orders o
--   left join public.clientes c on c.id = o.client_id
--   left join public.orden_etapas oe on oe.order_id = o.id
--   where o.order_type_key = 'venta_mostrador'
--   group by 1, 2, 3, 4 order by 1;
--   -- esperado: VEN-001..004, Salper / Salper, confirmado,
--   --           corte:pendiente, produccion:pendiente, terminado:pendiente
