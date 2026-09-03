-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V13: más etapas de producción (entrando / terminada cada una)
--
-- Antes: en_confirmacion, confirmado, cortado, sublimado, en_produccion,
-- completado (6 estados). Ahora cada actividad de producción (corte,
-- sublimado, terminado) tiene un estado de "entrando" y uno de "ya se
-- terminó esa etapa", igual que ya pasaba con confirmación
-- (en_confirmacion → confirmado):
--
--   en_confirmacion → confirmado
--   en_corte        → cortado
--   en_sublimado    → sublimado
--   en_terminado    → terminado
--   completado
--
-- "en_produccion" desaparece — las 2 órdenes que estaban ahí se migran a
-- "en_terminado" (la etapa que mejor representa "ya se cortó y sublimó,
-- falta terminar/armar"), antes de endurecer el CHECK constraint para que
-- no truene con datos existentes.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- El DROP va ANTES del UPDATE a propósito: el constraint viejo no permite
-- 'en_terminado' todavía, así que el UPDATE tronaría si se intenta primero
-- con el constraint viejo puesto.
alter table public.orders drop constraint if exists orders_status_check;

update public.orders set status = 'en_terminado' where status = 'en_produccion';
update public.order_status_history set status = 'en_terminado' where status = 'en_produccion';

alter table public.orders add constraint orders_status_check check (status in (
  'en_confirmacion', 'confirmado',
  'en_corte', 'cortado',
  'en_sublimado', 'sublimado',
  'en_terminado', 'terminado',
  'completado'
));

-- update_order_status: misma función, misma firma (no hace falta DROP) —
-- solo se amplía la lista de estados válidos.
create or replace function public.update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text default null
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_cancelled_at timestamptz;
begin
  if p_new_status not in (
    'en_confirmacion', 'confirmado',
    'en_corte', 'cortado',
    'en_sublimado', 'sublimado',
    'en_terminado', 'terminado',
    'completado'
  ) then
    raise exception 'Estado inválido: %', p_new_status;
  end if;

  if coalesce(v_role, '') not in ('fabrica', 'admin') then
    raise exception 'Solo fábrica o administrador pueden cambiar el estado de una orden.';
  end if;

  select cancelled_at into v_cancelled_at from public.orders where id = p_order_id;
  if v_cancelled_at is not null and v_role <> 'admin' then
    raise exception 'Esta orden está cancelada.';
  end if;

  update public.orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, p_new_status, p_notes, auth.uid());

  return v_order;
end;
$$;
