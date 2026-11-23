-- 2026-11-23 (V215) — Cierra las filas de orden_etapas que se quedaron en
-- 'pendiente' / 'en_proceso' en órdenes que ya se terminaron por otro lado
-- (entrega masiva, "Corregir estado manualmente"…). Solo datos, sin esquema.
--
-- Cuáles: órdenes no canceladas ni eliminadas con status 'terminado' o
-- 'completado', o cuya etapa 'terminado' ya está completada; se cierran sus
-- etapas abiertas que NO son 'terminado'.
-- Cómo: estado 'completado', completado_en = cuando se completó terminado
-- (o ahora si no hay), iniciado_en en NULL → Tiempos por etapa las salta
-- ("sin inicio") y no ensucian los promedios. Ni orders.status ni la etapa
-- terminado se tocan (el disparador de ATR solo mira 'terminado').
-- Al 2026-11-23 eran 6 filas: ESC-035, ESC-052, IND-054, VEN-005 (costura)
-- y SUB-059 (costura y sublimado).

-- 1) Vista previa (lo que se va a cerrar)
select o.order_number, o.status, e.etapa, e.estado
from orden_etapas e
join orders o on o.id = e.order_id
where e.estado in ('pendiente', 'en_proceso')
  and e.etapa <> 'terminado'
  and o.cancelled_at is null and o.eliminada_en is null
  and (o.status in ('terminado', 'completado')
       or exists (select 1 from orden_etapas t
                  where t.order_id = o.id and t.etapa = 'terminado' and t.estado = 'completado'))
order by 1, 3;

-- 2) Cierre
update orden_etapas e
set estado = 'completado',
    iniciado_en = null,
    pausada_en = null,
    completado_en = coalesce(
      (select t.completado_en from orden_etapas t
       where t.order_id = e.order_id and t.etapa = 'terminado' and t.estado = 'completado'),
      now())
from orders o
where o.id = e.order_id
  and e.estado in ('pendiente', 'en_proceso')
  and e.etapa <> 'terminado'
  and o.cancelled_at is null and o.eliminada_en is null
  and (o.status in ('terminado', 'completado')
       or exists (select 1 from orden_etapas t
                  where t.order_id = o.id and t.etapa = 'terminado' and t.estado = 'completado'));

-- 3) Comprobación: debe dar 0
select count(*) as quedan_abiertas
from orden_etapas e
join orders o on o.id = e.order_id
where e.estado in ('pendiente', 'en_proceso')
  and e.etapa <> 'terminado'
  and o.cancelled_at is null and o.eliminada_en is null
  and (o.status in ('terminado', 'completado')
       or exists (select 1 from orden_etapas t
                  where t.order_id = o.id and t.etapa = 'terminado' and t.estado = 'completado'));
