-- =====================================================================
-- Datos 2026-11-09 — Frisa: borrar la orden de taller FR recién creada
-- =====================================================================
-- Pedido de Alfredo: "Acabo de crear una orden de taller, bórrala".
-- Toma la ÚNICA orden de taller creada desde Restock en las últimas 24 horas
-- (sin subir a bodega). Si hay 0 o más de una, NO hace nada y avisa cuáles hay.
--   1) Regresa al anaquel la playera lisa que apartó (movimiento 'devolucion').
--   2) La quita del Restock.
--   3) La manda a la papelera (eliminada_en), igual que "Eliminar orden": se
--      puede recuperar con restore_order. El folio FR ya no se reutiliza.
-- =====================================================================
do $$
declare
  v_n int;
  v_id uuid;
  v_num text;
  v_lista text;
begin
  select count(*), string_agg(o.order_number, ', ')
    into v_n, v_lista
  from public.frisa_restock_ordenes r
  join public.orders o on o.id = r.order_id
  where r.origen = 'restock' and r.ingresado_en is null and o.eliminada_en is null
    and r.creado_en > now() - interval '24 hours';
  if v_n <> 1 then
    raise exception 'No se borró nada: hay % órdenes de taller creadas desde Restock en las últimas 24 horas (%). Dime cuál es.', v_n, coalesce(v_lista, 'ninguna');
  end if;

  select o.id, o.order_number into v_id, v_num
  from public.frisa_restock_ordenes r
  join public.orders o on o.id = r.order_id
  where r.origen = 'restock' and r.ingresado_en is null and o.eliminada_en is null
    and r.creado_en > now() - interval '24 hours';

  -- 1) Playera lisa de regreso al anaquel (lo neto que se descontó por esta orden).
  insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, order_id, referencia, creado_por, creado_por_nombre)
  select m.lisa_id, 'devolucion', -sum(m.cantidad), v_id, format('Se borró la orden de taller %s', v_num), null, 'Alfredo'
  from public.frisa_lisa_movimientos m
  where m.order_id = v_id and m.tipo in ('consumo', 'devolucion')
  group by m.lisa_id
  having sum(m.cantidad) < 0;

  -- 2) Fuera del Restock.
  delete from public.frisa_restock_ordenes where order_id = v_id;

  -- 3) A la papelera.
  update public.orders set eliminada_en = now(), updated_at = now() where id = v_id;
  insert into public.order_status_history (order_id, status, notes, changed_by)
  select v_id, o.status, 'Orden eliminada. Orden de taller de Frisa creada por error.', null from public.orders o where o.id = v_id;

  raise notice 'Se borró la orden %', v_num;
end $$;

-- Comprobación: la orden borrada (eliminada_en con fecha), fuera del restock (0) y la lisa que regresó.
select o.order_number as orden_borrada, o.eliminada_en,
       (select count(*) from public.frisa_restock_ordenes r where r.order_id = o.id) as sigue_en_restock,
       (select coalesce(sum(m.cantidad), 0) from public.frisa_lisa_movimientos m where m.order_id = o.id and m.tipo = 'devolucion') as lisas_regresadas,
       (select coalesce(sum(m.cantidad), 0) from public.frisa_lisa_movimientos m where m.order_id = o.id) as lisa_neto_debe_ser_0
from public.orders o
where o.eliminada_en > now() - interval '10 minutes' and o.order_type_key = 'frisa'
order by o.eliminada_en desc
limit 3;
