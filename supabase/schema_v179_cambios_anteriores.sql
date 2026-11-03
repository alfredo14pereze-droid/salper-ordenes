-- =====================================================================
-- V179 — Cambios anteriores a V178 en el "Historial de cambios"
-- =====================================================================
-- Pedido de Alfredo (2026-11-03): que las órdenes que ya estaban en azul
-- ("se modificó después de confirmarse", sin aceptar) también muestren sus
-- cambios como las nuevas.
--
-- Solo DATOS (no cambia tablas ni funciones). Para cada orden con la
-- bandera pending_reconfirmation_at puesta:
--   1. PRENDAS: cada guardado de prendas hecho por quien edita órdenes
--      (ventas, admin_tienda, admin_general) después de que la orden salió
--      de "por confirmar", tomado de orden_items_historial (V152, existe
--      desde el 14-oct-2026). Con quién, cuándo y las prendas antes/después,
--      así la pantalla muestra "Talla M: 10 → 12", etc.
--   2. DATOS GENERALES: antes de V178 no se guardaba qué campo cambió. Si el
--      último cambio de la orden (la hora de la bandera) no fue de prendas,
--      se agrega un renglón que dice que se modificaron los datos generales,
--      sin poder decir cuál (tampoco se sabe quién).
-- Todo queda "pendiente de aceptar"; al pulsar "Aceptar cambios" se acepta
-- igual que lo nuevo (trigger de V178).
-- Los guardados que ya registró V178 no se repiten. Se puede correr dos
-- veces: la segunda no agrega nada (marca "_anterior" en campos).
--
-- Rollback: delete from public.orden_cambios where campos ? '_anterior';
-- =====================================================================

with pendientes as (
  select o.id, o.order_number, o.pending_reconfirmation_at as bandera,
         coalesce((select min(h.changed_at) from public.order_status_history h
                    where h.order_id = o.id and h.status <> 'en_confirmacion'), o.created_at) as confirmada_desde
  from public.orders o
  where o.pending_reconfirmation_at is not null
    and o.eliminada_en is null
    and not exists (select 1 from public.orden_cambios c where c.order_id = o.id and c.campos ? '_anterior')
),
prendas as (
  select p.id as order_id, p.order_number, ih.items_antes, ih.items_despues,
         ih.cambiado_por, ih.cambiado_por_nombre, ih.cambiado_en
  from pendientes p
  join public.orden_items_historial ih on ih.order_id = p.id
  join public.profiles pr on pr.id = ih.cambiado_por
  where ih.accion = 'cambio'
    and ih.cambiado_en > p.confirmada_desde
    and ih.cambiado_en <= p.bandera
    and pr.role in ('ventas', 'admin_tienda', 'admin_general')
    -- ya registrado por V178
    and not exists (select 1 from public.orden_cambios c where c.order_id = p.id and c.hecho_en = ih.cambiado_en)
),
ins_prendas as (
  insert into public.orden_cambios (order_id, order_number, campos, items_antes, items_despues,
                                    requiere_aceptar, hecho_por, hecho_por_nombre, hecho_en)
  select order_id, order_number, '{"_anterior": true}'::jsonb, items_antes, items_despues,
         true, cambiado_por, cambiado_por_nombre, cambiado_en
  from prendas
  returning order_id
)
insert into public.orden_cambios (order_id, order_number, campos, requiere_aceptar, hecho_en)
select p.id, p.order_number,
       jsonb_build_object('_anterior', true,
                          '_nota', 'Se modificaron los datos generales (cliente, fecha, descripción, teléfono, correo o folios). Fue antes de que se guardara el detalle: no se sabe cuál ni quién.'),
       true, p.bandera
from pendientes p
where not exists (select 1 from public.orden_items_historial ih where ih.order_id = p.id and ih.cambiado_en = p.bandera)
  and not exists (select 1 from public.orden_cambios c where c.order_id = p.id and c.hecho_en = p.bandera);

-- Resultado: órdenes en azul y cuántos cambios quedaron listados para cada una.
select o.order_number,
       o.pending_reconfirmation_at,
       count(c.id) filter (where c.items_despues is not null) as cambios_de_prendas,
       count(c.id) filter (where c.campos ? '_nota') as cambio_datos_sin_detalle
from public.orders o
left join public.orden_cambios c on c.order_id = o.id and c.requiere_aceptar and c.aceptado_en is null
where o.pending_reconfirmation_at is not null and o.eliminada_en is null
group by o.order_number, o.pending_reconfirmation_at
order by o.pending_reconfirmation_at desc;
