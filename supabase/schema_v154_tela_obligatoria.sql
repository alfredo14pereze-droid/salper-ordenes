-- =====================================================================
-- V154 — Tela obligatoria al crear órdenes que pasan por corte
-- =====================================================================
-- Pedido de Alfredo (2026-10-16): no se puede crear una orden sin tela. Sin
-- tela, corte no puede registrar lo que usa (VEN-004, IND-007 y 9 más).
--
-- Trigger before insert en orders: si el tipo de orden tiene la etapa
-- corte en su plantilla (salvo maquila, donde la tela es del cliente, y
-- bordado), cada prenda con contenido (prenda o alguna talla) necesita
-- tela_id. Corre antes de trg_assign_order_folio (orden alfabético), así
-- que un rechazo no gasta folio.
--
-- Solo al CREAR: las órdenes que ya existen sin tela se pueden seguir
-- editando y moviendo (la app pide la tela al editar prendas mientras la
-- orden no se haya cortado).
--
-- Aditivo: una función y un trigger. No toca create_order.
-- Rollback: drop trigger orders_tela_obligatoria_ins on public.orders;
--           drop function public.orders_tela_obligatoria();
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
create or replace function public.orders_tela_obligatoria()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prenda text;
begin
  if new.order_type_key in ('maquila', 'bordado')
     or not exists (select 1 from public.plantillas_etapas where order_type_key = new.order_type_key and etapa = 'corte') then
    return new;
  end if;

  select coalesce(nullif(btrim(it->>'garment'), ''), 'Una prenda') into v_prenda
  from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) it
  where jsonb_typeof(it) = 'object'
    and (btrim(coalesce(it->>'garment', '')) <> ''
         or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
                    where jsonb_typeof(sz) = 'object' and btrim(coalesce(sz->>'talla', '')) <> ''))
    and btrim(coalesce(it->>'tela_id', '')) = ''
  limit 1;

  if v_prenda is not null then
    raise exception '%: falta elegir la tela. Es obligatoria para que corte pueda registrar lo que usa.', v_prenda;
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_tela_obligatoria() from public, anon, authenticated;

drop trigger if exists orders_tela_obligatoria_ins on public.orders;
create trigger orders_tela_obligatoria_ins
  before insert on public.orders
  for each row execute function public.orders_tela_obligatoria();

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select tgname from pg_trigger where tgname = 'orders_tela_obligatoria_ins';   -- 1 fila
-- =====================================================================
