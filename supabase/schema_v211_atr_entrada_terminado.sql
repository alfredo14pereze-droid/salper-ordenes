-- =====================================================================
-- V211 — Inventario ATR, Parte 3: entrada automática al completar Terminado
--
-- Aditivo: 6 funciones y 3 triggers nuevos. No toca funciones existentes.
-- Requiere V209 + V210.
--
-- Una sola regla, en la base (no depende de que la pestaña siga abierta):
--   Una orden de ATR debe tener sumado al inventario lo SURTIDO en Terminado
--   (items[i].sizes[j].cantidad_surtida) si y solo si su etapa Terminado está
--   'completado' y la orden no está eliminada.
--
-- atr_sincronizar_orden(order_id) compara lo que debería estar sumado contra
-- las entradas vigentes y corrige la diferencia:
--   * línea que ya no debe estar (se reabrió Terminado, se eliminó la orden,
--     cambió la cantidad surtida o la bata) → la entrada se marca revertida y
--     se agrega un 'reversa_produccion' negativo (nunca se borra nada);
--   * línea que falta → 'entrada_produccion' (el índice único de V209 impide
--     que la misma línea se sume dos veces).
-- Es idempotente: correrla dos veces seguidas no cambia nada.
--
-- Se dispara:
--   * orden_etapas (etapa terminado): insert / update de estado / delete;
--   * orders: cambio de items (se corrigió lo surtido), eliminada_en o client_id;
--   * orders: borrado definitivo (revierte antes de borrar).
--
-- Solo cuenta prendas elegidas del catálogo de ATR (items[].producto_id de
-- una bata de ATR). Tallas sin cantidad surtida capturada (o en 0) no suman.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Lo que DEBERÍA estar sumado de una orden (vacío si no aplica)
-- ---------------------------------------------------------------------
create or replace function public.atr_lineas_orden(p_order_id uuid)
returns table (item_index integer, size_index integer, producto_id uuid, talla text, cantidad integer)
language sql stable security definer set search_path = public as $$
  select (it.n - 1)::integer, (sz.m - 1)::integer, p.id, upper(btrim(sz.s->>'talla')),
         floor((sz.s->>'cantidad_surtida')::numeric)::integer
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality it(i, n)
  join public.productos p
    on p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id
  cross join lateral jsonb_array_elements(coalesce(it.i->'sizes', '[]'::jsonb)) with ordinality sz(s, m)
  where o.id = p_order_id
    and o.client_id = public.atr_cliente_id()
    and o.eliminada_en is null
    and exists (select 1 from public.orden_etapas e
                where e.order_id = o.id and e.etapa = 'terminado' and e.estado = 'completado')
    and coalesce(btrim(sz.s->>'talla'), '') <> ''
    and jsonb_typeof(sz.s->'cantidad_surtida') = 'number'
    and floor((sz.s->>'cantidad_surtida')::numeric) > 0
$$;
revoke execute on function public.atr_lineas_orden(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Sincronizar una orden
-- ---------------------------------------------------------------------
create or replace function public.atr_sincronizar_orden(p_order_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_quien text := coalesce(public.atr_usuario_nombre(), 'Sistema') || ' (automático)';
  v_mov record;
begin
  if p_order_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('atr_movimientos'));

  -- a) Revertir entradas vigentes que ya no corresponden
  for v_mov in
    select m.* from public.atr_movimientos m
    where m.order_id = p_order_id and m.tipo = 'entrada_produccion' and m.revertido_en is null
      and not exists (
        select 1 from public.atr_lineas_orden(p_order_id) d
        where d.item_index = m.item_index and d.size_index = m.size_index
          and d.producto_id = m.producto_id and d.talla = m.talla and d.cantidad = m.cantidad)
  loop
    update public.atr_movimientos set revertido_en = now() where id = v_mov.id;
    insert into public.atr_movimientos
      (producto_id, talla, tipo, cantidad, order_id, item_index, size_index, revierte_id, nota, usuario_id, usuario_nombre)
    values
      (v_mov.producto_id, v_mov.talla, 'reversa_produccion', -v_mov.cantidad, p_order_id,
       v_mov.item_index, v_mov.size_index, v_mov.id, p_motivo, auth.uid(), v_quien);
  end loop;

  -- b) Sumar lo que falta (una sola vez por línea gracias al índice único)
  insert into public.atr_movimientos
    (producto_id, talla, tipo, cantidad, order_id, item_index, size_index, usuario_id, usuario_nombre)
  select d.producto_id, d.talla, 'entrada_produccion', d.cantidad, p_order_id,
         d.item_index, d.size_index, auth.uid(), v_quien
  from public.atr_lineas_orden(p_order_id) d
  on conflict (order_id, item_index, size_index)
    where tipo = 'entrada_produccion' and revertido_en is null
  do nothing;
end;
$$;
revoke execute on function public.atr_sincronizar_orden(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Triggers
-- ---------------------------------------------------------------------
create or replace function public.atr_orden_etapas_trg()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  if coalesce(new.etapa, old.etapa) <> 'terminado' then return null; end if;
  -- Solo órdenes de ATR (o que lo fueron: puede haber entradas que revertir)
  if not exists (select 1 from public.orders where id = v_order and client_id = public.atr_cliente_id())
     and not exists (select 1 from public.atr_movimientos where order_id = v_order) then
    return null;
  end if;
  perform public.atr_sincronizar_orden(v_order,
    case when tg_op = 'DELETE' then 'Se quitó la etapa Terminado'
         when new.estado <> 'completado' then 'Se reabrió Terminado'
         else null end);
  return null;
end;
$$;

drop trigger if exists orden_etapas_atr_trg on public.orden_etapas;
create trigger orden_etapas_atr_trg
  after insert or delete or update of estado on public.orden_etapas
  for each row execute function public.atr_orden_etapas_trg();

create or replace function public.atr_orders_trg()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_atr uuid := public.atr_cliente_id();
begin
  if v_atr is null then return null; end if;
  if new.client_id is distinct from v_atr and old.client_id is distinct from v_atr
     and not exists (select 1 from public.atr_movimientos where order_id = new.id) then
    return null;
  end if;
  perform public.atr_sincronizar_orden(new.id,
    case when new.eliminada_en is not null and old.eliminada_en is null then 'Orden eliminada'
         when new.client_id is distinct from old.client_id then 'Cambió el cliente de la orden'
         when new.items is distinct from old.items then 'Se corrigió lo surtido'
         else null end);
  return null;
end;
$$;

drop trigger if exists orders_atr_trg on public.orders;
create trigger orders_atr_trg
  after update of items, eliminada_en, client_id on public.orders
  for each row
  when (old.items is distinct from new.items
        or old.eliminada_en is distinct from new.eliminada_en
        or old.client_id is distinct from new.client_id)
  execute function public.atr_orders_trg();

-- Borrado definitivo de una orden de ATR: revertir ANTES de que se borre
-- (después ya no se podría ligar la reversa a la orden).
create or replace function public.atr_orders_borrar_trg()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quien text := coalesce(public.atr_usuario_nombre(), 'Sistema') || ' (automático)';
  v_mov record;
begin
  for v_mov in
    select m.* from public.atr_movimientos m
    where m.order_id = old.id and m.tipo = 'entrada_produccion' and m.revertido_en is null
  loop
    update public.atr_movimientos set revertido_en = now() where id = v_mov.id;
    insert into public.atr_movimientos
      (producto_id, talla, tipo, cantidad, order_id, item_index, size_index, revierte_id, nota, usuario_id, usuario_nombre)
    values
      (v_mov.producto_id, v_mov.talla, 'reversa_produccion', -v_mov.cantidad, null,
       v_mov.item_index, v_mov.size_index, v_mov.id,
       'Orden ' || coalesce(old.order_number, '') || ' borrada', auth.uid(), v_quien);
  end loop;
  return old;
end;
$$;

drop trigger if exists orders_atr_borrar_trg on public.orders;
create trigger orders_atr_borrar_trg
  before delete on public.orders
  for each row execute function public.atr_orders_borrar_trg();

-- Funciones de trigger: nadie las llama directo
revoke execute on function public.atr_orden_etapas_trg() from public, anon, authenticated;
revoke execute on function public.atr_orders_trg() from public, anon, authenticated;
revoke execute on function public.atr_orders_borrar_trg() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Estado para la etiqueta de la orden (lo puede leer cualquier sesión;
--    no expone cantidades del inventario, solo lo de esa orden)
-- ---------------------------------------------------------------------
create or replace function public.atr_estado_orden(p_order_id uuid)
returns table (es_atr boolean, sumado boolean, piezas integer, sumado_en timestamptz, prendas_sin_ligar integer)
language sql stable security definer set search_path = public as $$
  select
    o.client_id is not distinct from public.atr_cliente_id(),
    exists (select 1 from public.atr_movimientos m
            where m.order_id = o.id and m.tipo = 'entrada_produccion' and m.revertido_en is null),
    coalesce((select sum(m.cantidad) from public.atr_movimientos m
              where m.order_id = o.id and m.tipo = 'entrada_produccion' and m.revertido_en is null), 0)::integer,
    (select max(m.creado_en) from public.atr_movimientos m
     where m.order_id = o.id and m.tipo = 'entrada_produccion' and m.revertido_en is null),
    (select count(*) from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it(i)
     where not exists (select 1 from public.productos p
                       where p.id::text = it.i->>'producto_id' and p.cliente_id = o.client_id))::integer
  from public.orders o
  where o.id = p_order_id and auth.uid() is not null
$$;
revoke execute on function public.atr_estado_orden(uuid) from public, anon;
grant execute on function public.atr_estado_orden(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Órdenes de ATR que YA tienen Terminado completado al aplicar esto:
--    se suman ahora (una sola vez). Si no hay, no hace nada.
-- ---------------------------------------------------------------------
select public.atr_sincronizar_orden(o.id, null)
from public.orders o
where o.client_id = public.atr_cliente_id();

-- Comprobación (debe dar: 3 triggers · false)
select
  (select count(*) from pg_trigger
   where tgname in ('orden_etapas_atr_trg', 'orders_atr_trg', 'orders_atr_borrar_trg') and not tgisinternal) as triggers,
  has_function_privilege('anon', 'public.atr_estado_orden(uuid)', 'EXECUTE')       as anon_puede;
