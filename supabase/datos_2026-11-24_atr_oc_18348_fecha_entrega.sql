-- =====================================================================
-- Datos 2026-11-24 — OC 18348 de ATR: fecha de entrega 5-nov-2026
-- =====================================================================
-- El PDF dice 11/05/2026 (formato mes/día/año = 5 de noviembre) y se leyó como
-- día/mes (11 de mayo). Solo cambia la fecha de entrega de esa OC, y SOLO si
-- hay exactamente una OC activa (no cancelada) con "18348" en el número; si
-- hay 0 o más de 1, no cambia nada y avisa.
-- =====================================================================
do $$
declare v_n int; v_id bigint;
begin
  select count(*), min(id) into v_n, v_id
  from public.atr_ordenes_compra
  where numero_oc ilike '%18348%' and estado <> 'cancelada';
  if v_n <> 1 then
    raise exception 'Hay % OC activas con 18348 en el número (debe ser 1). No se cambió nada.', v_n;
  end if;
  update public.atr_ordenes_compra set fecha_entrega = date '2026-11-05' where id = v_id;
end $$;

-- Cómo quedó (revisa también la fecha de la OC: si se leyó al revés, dímelo)
select numero_oc, fecha_oc, fecha_entrega, estado, notas, creado_por_nombre
from public.atr_ordenes_compra
where numero_oc ilike '%18348%';

-- ---------------------------------------------------------------------
-- 2) (corrido después) La fecha de la OC también se leyó al revés:
--    quedó 2026-06-10 y el PDF dice 10/06/2026 = 6 de octubre (6-oct + 30
--    días = 5-nov, la entrega). Solo si sigue en 2026-06-10.
-- ---------------------------------------------------------------------
update public.atr_ordenes_compra set fecha_oc = date '2026-10-06'
 where numero_oc = 'C18348' and estado <> 'cancelada' and fecha_oc = date '2026-06-10';

select numero_oc, fecha_oc, fecha_entrega, fecha_entrega - fecha_oc as dias
from public.atr_ordenes_compra where numero_oc = 'C18348';
