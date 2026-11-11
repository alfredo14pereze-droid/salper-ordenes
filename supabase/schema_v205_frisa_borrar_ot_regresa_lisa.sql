-- =====================================================================
-- V205 — Frisa: borrar o cancelar una orden de taller regresa su playera lisa (2026-11-11)
-- =====================================================================
-- Falla encontrada con Alfredo: la lisa que descuenta una orden de taller solo
-- regresaba al anaquel si la orden se quitaba desde Restock. Si la orden se
-- BORRABA o CANCELABA desde Órdenes, la lisa se quedaba descontada y la orden
-- seguía ligada al restock (FR-013: −1 de M azul marino manga corta).
--   · Ahora, al borrar o cancelar una orden de taller que está en el restock y
--     que todavía no se subió a bodega, se regresa su lisa y se quita del restock.
--   · Las que ya estaban borradas/canceladas se arreglan aquí mismo.
-- Requiere V186, V187. Se puede correr dos veces.
-- =====================================================================

create or replace function public.frisa_restock_soltar_orden(p_order_id uuid, p_motivo text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_r public.frisa_restock_ordenes;
  v_o public.orders;
  v_n integer := 0;
begin
  select * into v_r from public.frisa_restock_ordenes where order_id = p_order_id for update;
  if not found or v_r.ingresado_en is not null then return 0; end if;
  select * into v_o from public.orders where id = p_order_id;
  insert into public.frisa_lisa_movimientos (lisa_id, tipo, cantidad, order_id, referencia, creado_por, creado_por_nombre)
  select m.lisa_id, 'devolucion', -sum(m.cantidad), p_order_id, format('%s la orden %s', p_motivo, v_o.order_number),
         auth.uid(), public.frisa_niveles_nombre_usuario()
  from public.frisa_lisa_movimientos m
  where m.order_id = p_order_id and m.tipo in ('consumo', 'devolucion')
  group by m.lisa_id
  having sum(m.cantidad) < 0;
  get diagnostics v_n = row_count;
  delete from public.frisa_restock_ordenes where order_id = p_order_id;
  return v_n;
end $$;
revoke execute on function public.frisa_restock_soltar_orden(uuid, text) from public, anon, authenticated;

create or replace function public.frisa_orden_baja_regresa_lisa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.eliminada_en is not null and old.eliminada_en is null then
    perform public.frisa_restock_soltar_orden(new.id, 'Se borró');
  elsif new.cancelled_at is not null and old.cancelled_at is null then
    perform public.frisa_restock_soltar_orden(new.id, 'Se canceló');
  end if;
  return new;
end $$;
revoke execute on function public.frisa_orden_baja_regresa_lisa() from public, anon, authenticated;
drop trigger if exists orders_frisa_baja_lisa_trg on public.orders;
create trigger orders_frisa_baja_lisa_trg
  after update of eliminada_en, cancelled_at on public.orders
  for each row execute function public.frisa_orden_baja_regresa_lisa();

-- Las que ya estaban borradas o canceladas (FR-013…): regresa su lisa y se quitan del restock.
select o.order_number as orden, public.frisa_restock_soltar_orden(o.id, case when o.eliminada_en is not null then 'Se borró' else 'Se canceló' end) as tallas_regresadas
from public.frisa_restock_ordenes r
join public.orders o on o.id = r.order_id
where r.ingresado_en is null and (o.eliminada_en is not null or o.cancelled_at is not null);

-- Comprobación: ya no debe quedar ninguna borrada/cancelada en el restock (0) y cómo quedó la lisa negativa.
select (select count(*) from public.frisa_restock_ordenes r join public.orders o on o.id = r.order_id
         where r.ingresado_en is null and (o.eliminada_en is not null or o.cancelled_at is not null)) as bajas_en_restock,
       (select string_agg(color || ' ' || manga || ' ' || talla || ': ' || stock, ', ' order by manga, talla)
          from public.frisa_lisas where stock < 0) as lisas_en_negativo;
