-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V14: etapa de bordado + "Orden de reparación" en Pendientes
--
-- Dos cambios independientes, aplicados juntos porque llegaron en la
-- misma sesión:
--
-- 1) Nueva pareja de estados de producción "en_bordado" / "bordado",
--    junto a corte/sublimado/terminado (mismo patrón: claro = entrando,
--    sólido = esa etapa ya se cerró). No hay datos que migrar — es un
--    estado nuevo, no un reemplazo de uno viejo.
--
-- 2) pending_items gana columnas opcionales (garment, talla, cantidad,
--    foto_url, foto_path) para el tipo "Orden de reparación": una prenda
--    específica que se manda a reparar, con su talla/cantidad, comentarios
--    (ya existía como `description`) y una foto. Todo nullable — un
--    pendiente "general" (sin estos datos) se sigue viendo y editando sin
--    error.
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estado "bordado"
-- ---------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'en_confirmacion', 'confirmado',
  'en_corte', 'cortado',
  'en_sublimado', 'sublimado',
  'en_bordado', 'bordado',
  'en_terminado', 'terminado',
  'completado'
));

-- Misma firma que la versión anterior (no hace falta DROP) — solo se
-- amplía la lista de estados válidos.
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
    'en_bordado', 'bordado',
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

-- ---------------------------------------------------------------------
-- 2) "Orden de reparación" en Pendientes
-- ---------------------------------------------------------------------
alter table public.pending_items
  add column if not exists garment text,
  add column if not exists talla text,
  add column if not exists cantidad integer,
  add column if not exists foto_url text,
  add column if not exists foto_path text;

-- create_pending_item gana 5 parámetros nuevos → cambia la lista de
-- tipos, así que SÍ hace falta tirar la versión vieja primero (ver
-- SALPER_Contexto.md, gotcha de firmas de RPC).
drop function if exists public.create_pending_item(text, text, text);

create or replace function public.create_pending_item(
  p_title text,
  p_description text,
  p_category text,
  p_garment text default null,
  p_talla text default null,
  p_cantidad integer default null,
  p_foto_url text default null,
  p_foto_path text default null
) returns public.pending_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.pending_items;
begin
  insert into public.pending_items (title, description, category, garment, talla, cantidad, foto_url, foto_path)
  values (p_title, p_description, p_category, p_garment, p_talla, p_cantidad, p_foto_url, p_foto_path)
  returning * into v_item;

  return v_item;
end;
$$;

-- Ver SALPER_Contexto.md: revoke de PUBLIC explícito, no solo de anon —
-- una función nueva (por firma distinta) vuelve a nacer con EXECUTE
-- abierto a PUBLIC si no se revoca aquí.
revoke execute on function public.create_pending_item(text, text, text, text, text, integer, text, text) from public;
grant execute on function public.create_pending_item(text, text, text, text, text, integer, text, text) to authenticated;
