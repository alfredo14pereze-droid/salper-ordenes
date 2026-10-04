-- =====================================================================
-- V130 — Notas internas: botón "Resolver"
-- =====================================================================
-- Una nota interna (orders.notas_internas) ahora se puede marcar como RESUELTA
-- cuando ya se atendió lo que pedía. Resuelta = deja de pintarse el indicador
-- morado en las tarjetas (V128); la nota y su texto se conservan y se puede
-- "Reabrir". Si alguien EDITA el texto de la nota, vuelve a quedar sin resolver
-- (cambió lo que dice, hay que revisarla otra vez).
--
-- Aditivo: 2 columnas nullable en orders, 1 trigger BEFORE UPDATE OF
-- notas_internas (no se reescribe set_order_notas_internas, que tiene candados
-- por rol de V66/V88) y 1 RPC nuevo. Las notas que ya existen quedan sin
-- resolver (columnas en null): siguen marcadas hasta que alguien las resuelva.
-- =====================================================================

alter table public.orders
  add column if not exists nota_resuelta_en timestamptz,
  add column if not exists nota_resuelta_por_nombre text;

-- Si cambia el texto de la nota (o se borra), deja de estar resuelta.
create or replace function public.orders_nota_reabrir()
returns trigger
language plpgsql
as $$
begin
  if new.notas_internas is distinct from old.notas_internas then
    new.nota_resuelta_en := null;
    new.nota_resuelta_por_nombre := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_nota_reabrir_trg on public.orders;
create trigger orders_nota_reabrir_trg
  before update of notas_internas on public.orders
  for each row execute function public.orders_nota_reabrir();

-- Marcar / desmarcar como resuelta. Mismo criterio de rol que escribir la nota
-- (no 'lectura', 'captura_produccion' ni los de solo lectura).
create or replace function public.resolver_nota_orden(p_order_id uuid, p_resuelta boolean default true)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := coalesce(public.current_user_role(), '');
begin
  if v_role in ('', 'lectura', 'captura_produccion', 'admin_fabrica_lectura', 'consulta_tienda') then
    raise exception 'No tienes permiso para resolver las notas de esta orden.';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Orden % no encontrada', p_order_id; end if;
  if v_order.eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if btrim(coalesce(v_order.notas_internas, '')) = '' then
    raise exception 'Esta orden no tiene nota.';
  end if;

  update public.orders
  set nota_resuelta_en = case when coalesce(p_resuelta, true) then now() end,
      nota_resuelta_por_nombre = case when coalesce(p_resuelta, true)
        then (select full_name from public.profiles where id = auth.uid()) end
  where id = p_order_id
  returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.resolver_nota_orden(uuid, boolean) from public;
grant execute on function public.resolver_nota_orden(uuid, boolean) to authenticated;

-- Verificación (después de correr):
--   select has_function_privilege('anon', 'public.resolver_nota_orden(uuid,boolean)', 'EXECUTE');  -- esperado: false
--   select count(*) from public.orders where nota_resuelta_en is not null;                          -- esperado: 0
