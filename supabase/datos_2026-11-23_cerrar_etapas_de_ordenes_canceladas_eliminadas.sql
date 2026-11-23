-- 2026-11-23 (V215, 2ª parte) — Cierra las etapas que se quedaron en
-- 'pendiente' / 'en_proceso' en órdenes canceladas o eliminadas, para que no
-- quede nada abierto. Solo datos. Pedido de Alfredo el 2026-11-23.
-- Revisado antes: ninguna es de ATR (el disparador de ATR mira terminado) ni
-- está ligada a frisa_restock_ordenes (frisa_orden_terminada no las vuelve
-- "por entrar"). Se cierra por orden_secuencia, de menor a mayor, para que el
-- candado de secuencia de Frisa (orden_etapas_frisa_secuencia) vea la etapa
-- anterior ya completada. completado_en = cuándo se canceló/eliminó;
-- iniciado_en NULL (Tiempos por etapa las salta).
-- Al 2026-11-23: 27 órdenes (26 eliminadas, 1 cancelada), 92 filas.

-- 1) Vista previa
select count(distinct o.id) as ordenes, count(*) as filas
from orden_etapas e join orders o on o.id = e.order_id
where e.estado in ('pendiente', 'en_proceso')
  and (o.cancelled_at is not null or o.eliminada_en is not null);

-- 2) Cierre
do $$
declare s int;
begin
  for s in
    select distinct e.orden_secuencia from orden_etapas e join orders o on o.id = e.order_id
    where e.estado in ('pendiente', 'en_proceso') and (o.cancelled_at is not null or o.eliminada_en is not null)
    order by 1 nulls last
  loop
    update orden_etapas e
    set estado = 'completado', iniciado_en = null, pausada_en = null,
        completado_en = coalesce(o.cancelled_at, o.eliminada_en, now())
    from orders o
    where o.id = e.order_id
      and e.estado in ('pendiente', 'en_proceso')
      and (o.cancelled_at is not null or o.eliminada_en is not null)
      and e.orden_secuencia is not distinct from s;
  end loop;
end $$;

-- 3) Comprobación: debe dar 0
select count(*) as quedan_abiertas
from orden_etapas e join orders o on o.id = e.order_id
where e.estado in ('pendiente', 'en_proceso')
  and (o.cancelled_at is not null or o.eliminada_en is not null);
