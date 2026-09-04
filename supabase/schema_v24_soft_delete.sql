-- ============================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V24: soft-delete de órdenes + hard-delete de catálogos (Fase 2,
-- extensión de la Parte 1 pedida después de revisar V21-V23 en producción)
--
-- Contexto: el pedido ampliado de "Roles y permisos" agrega, sobre lo que
-- ya se aplicó en V21/V22, dos capacidades nuevas exclusivas de
-- admin_general (el rol que el pedido llama "super_admin" — se mantiene
-- admin_general, ya usado en 15+ funciones en producción; ver
-- SALPER_Contexto.md):
--
--   1) Soft-delete de ÓRDENES: nunca se borran físicamente. Se marcan con
--      `eliminada_en` (timestamptz nullable). Una orden con eliminada_en
--      no nulo: desaparece de Dashboard/Resumen/Calendario/Órdenes
--      pasadas (fetchOrders ahora filtra `eliminada_en is null`), sigue
--      visible en la nueva pantalla "Control rápido de órdenes" con
--      estado "Eliminada", y NINGÚN rol (incluido admin_general) puede
--      volver a editarla ni cambiarle el estado — se agregó el guard
--      correspondiente a las 8 funciones que mutan una orden existente.
--      Se agrega también restore_order() por si se decide reabrir esa
--      puerta más adelante (no hay botón de "restaurar" en el frontend
--      todavía — el pedido lo deja explícitamente como algo a decidir
--      después).
--
--   2) Hard-delete de CATÁLOGOS (proveedores, clientes, telas, productos):
--      exclusivo admin_general, sin más restricción que esa. Antes de
--      borrar un cliente o proveedor, el frontend puede consultar
--      get_cliente_delete_impact/get_proveedor_delete_impact/
--      get_tela_delete_impact para avisar cuántas filas dependientes se
--      van a ver afectadas (algunas en CASCADE de verdad, otras solo
--      pierden la referencia vía ON DELETE SET NULL — ver detalle abajo).
--
-- Verificado antes de escribir esto (FKs reales de la base):
--   productos.cliente_id  -> clientes(id)   ON DELETE CASCADE  (¡borra productos!)
--   productos.tela_id     -> telas(id)      ON DELETE SET NULL (no rompe nada)
--   orders.client_id      -> clientes(id)   ON DELETE SET NULL (no rompe nada)
--   pedidos_tienda.proveedor_id -> proveedores(id) ON DELETE SET NULL (no rompe nada)
--
-- Aditivo: 1 columna nueva (orders.eliminada_en), funciones nuevas, y
-- guards agregados a 8 funciones YA existentes (mismo cuerpo, solo se
-- inserta el chequeo de eliminada_en) — ningún cambio de firma, no hace
-- falta DROP FUNCTION en ninguna.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) orders.eliminada_en
-- --------------------------------------------------------------------------
alter table public.orders add column if not exists eliminada_en timestamptz;

-- --------------------------------------------------------------------------
-- 2) get_order_delete_impact: cuenta registros relacionados antes de
--    soft-delete (anticipos, historial de estado, etapas, documentos).
--    orden_bordados/remisión se agregan aquí cuando existan (Partes 3/4).
-- --------------------------------------------------------------------------
create or replace function public.get_order_delete_impact(p_order_id uuid)
returns table (
  anticipos_count bigint,
  historial_count bigint,
  etapas_count bigint,
  tiene_cotizacion boolean,
  tiene_orden_compra boolean,
  tiene_factura boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede consultar esto.';
  end if;

  return query
  select
    (select count(*) from public.anticipos where order_id = p_order_id),
    (select count(*) from public.order_status_history where order_id = p_order_id),
    (select count(*) from public.orden_etapas where order_id = p_order_id),
    (select cotizacion_pdf_path is not null from public.orders where id = p_order_id),
    (select orden_compra_pdf_path is not null from public.orders where id = p_order_id),
    (select factura_pdf_path is not null from public.orders where id = p_order_id);
end;
$function$;
revoke execute on function public.get_order_delete_impact(uuid) from public;
grant execute on function public.get_order_delete_impact(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 3) soft_delete_order / restore_order — exclusivo admin_general.
-- --------------------------------------------------------------------------
create or replace function public.soft_delete_order(p_order_id uuid, p_notes text default null)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_order public.orders;
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar una orden.';
  end if;

  update public.orders set eliminada_en = now(), updated_at = now()
  where id = p_order_id and eliminada_en is null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada o ya estaba eliminada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, v_order.status, coalesce('Orden eliminada. ' || nullif(trim(p_notes), ''), 'Orden eliminada.'), auth.uid());

  return v_order;
end;
$function$;
revoke execute on function public.soft_delete_order(uuid, text) from public;
grant execute on function public.soft_delete_order(uuid, text) to authenticated;

-- Sin botón en el frontend todavía (el pedido lo deja para después) —
-- se deja lista por si se decide abrir esa puerta.
create or replace function public.restore_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_order public.orders;
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede restaurar una orden.';
  end if;

  update public.orders set eliminada_en = null, updated_at = now()
  where id = p_order_id and eliminada_en is not null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'Orden % no encontrada o no estaba eliminada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, v_order.status, 'Orden restaurada.', auth.uid());

  return v_order;
end;
$function$;
revoke execute on function public.restore_order(uuid) from public;
grant execute on function public.restore_order(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 4) Guard "orden eliminada = sin más cambios" en las 8 funciones que
--    mutan una orden existente. Mismo cuerpo de V21/V22/V23, solo se
--    agrega el chequeo. Ningún cambio de firma.
-- --------------------------------------------------------------------------

create or replace function public.update_order_status(
  p_order_id uuid, p_new_status text, p_notes text default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_cancelled_at timestamptz;
  v_eliminada_en timestamptz;
begin
  if p_new_status not in (
    'en_confirmacion', 'confirmado',
    'en_corte', 'cortado',
    'en_sublimado', 'sublimado',
    'en_produccion', 'produccion',
    'en_bordado', 'bordado',
    'en_terminado', 'terminado',
    'completado'
  ) then
    raise exception 'Estado inválido: %', p_new_status;
  end if;

  if p_new_status = 'completado' then
    if coalesce(v_role, '') not in ('admin_fabrica', 'admin_general') then
      raise exception 'Solo un administrador de fábrica puede marcar una orden como completada.';
    end if;
  elsif p_new_status = 'confirmado' then
    if coalesce(v_role, '') not in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general') then
      raise exception 'Solo fábrica o administrador pueden confirmar una orden.';
    end if;
  else
    if coalesce(v_role, '') not in ('admin_fabrica', 'admin_general') then
      raise exception 'No tienes permiso para cambiar el estado a %.', p_new_status;
    end if;
  end if;

  select cancelled_at, eliminada_en into v_cancelled_at, v_eliminada_en from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_cancelled_at is not null and v_role <> 'admin_general' then
    raise exception 'Esta orden está cancelada.';
  end if;

  update public.orders set status = p_new_status, updated_at = now()
  where id = p_order_id returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (p_order_id, p_new_status, p_notes, auth.uid());
  return v_order;
end;
$function$;

create or replace function public.update_orden_etapa(
  p_order_id uuid, p_etapa text, p_nuevo_estado text
) returns public.orden_etapas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_row public.orden_etapas;
  v_eliminada_en timestamptz;
begin
  if p_etapa not in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado') then
    raise exception 'Etapa inválida: %', p_etapa;
  end if;
  if p_nuevo_estado not in ('pendiente', 'en_proceso', 'completado') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;
  if coalesce(v_role, '') not in (p_etapa, 'admin_fabrica', 'admin_general') then
    raise exception 'No tienes permiso para modificar la etapa %.', p_etapa;
  end if;

  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;

  update public.orden_etapas
  set estado = p_nuevo_estado,
      responsable_id = auth.uid(),
      iniciado_en = case
        when p_nuevo_estado = 'en_proceso' and iniciado_en is null then now()
        else iniciado_en
      end,
      completado_en = case
        when p_nuevo_estado = 'completado' then now()
        when p_nuevo_estado <> 'completado' then null
        else completado_en
      end,
      updated_at = now()
  where order_id = p_order_id and etapa = p_etapa
  returning * into v_row;

  if v_row.id is null then
    raise exception 'La orden % no tiene la etapa % en su flujo.', p_order_id, p_etapa;
  end if;

  perform public.recompute_order_status(p_order_id);
  return v_row;
end;
$function$;

create or replace function public.update_order_details(
  p_order_id uuid, p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se puede editar.';
  end if;
  update public.orders set
    client_name = p_client_name,
    order_type_key = p_order_type_key,
    description = p_description,
    requested_delivery_date = p_requested_delivery_date,
    updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;

create or replace function public.set_order_items(p_order_id uuid, p_items jsonb)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar las prendas de esta orden.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus prendas.';
  end if;
  update public.orders set items = coalesce(p_items, '[]'::jsonb), updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;

create or replace function public.set_order_document(p_order_id uuid, p_kind text, p_path text)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;
  if v_role = 'ventas' and p_kind = 'factura' then
    raise exception 'Solo contabilidad o administrador pueden subir la factura.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role in ('ventas', 'contabilidad') and p_kind <> 'factura' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus documentos.';
  end if;
  if p_kind = 'cotizacion' then
    update public.orders set cotizacion_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  elsif p_kind = 'orden_compra' then
    update public.orders set orden_compra_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  else
    update public.orders set factura_pdf_path = p_path, updated_at = now()
    where id = p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$function$;

create or replace function public.set_estimated_production_days(p_order_id uuid, p_days integer)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_role text := public.current_user_role();
  v_current_status text;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo fábrica o administrador pueden capturar el tiempo estimado de producción.';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'El tiempo estimado debe ser de al menos 1 día.';
  end if;
  select status, eliminada_en into v_current_status, v_eliminada_en from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if v_role in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado') and v_current_status <> 'en_confirmacion' then
    raise exception 'Solo se puede capturar el tiempo estimado mientras la orden está en confirmación.';
  end if;
  update public.orders set estimated_production_days = p_days, updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;

create or replace function public.create_anticipo(
  p_order_id uuid, p_monto numeric, p_metodo_pago text, p_recibido_por text, p_notas text default null
) returns public.anticipos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_anticipo public.anticipos;
begin
  if coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden registrar anticipos.';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;
  if trim(coalesce(p_recibido_por, '')) = '' then
    raise exception 'Falta indicar quién recibió el anticipo.';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and eliminada_en is null) then
    raise exception 'Orden % no encontrada o eliminada', p_order_id;
  end if;
  insert into public.anticipos (order_id, monto, metodo_pago, recibido_por, notas, created_by)
  values (p_order_id, p_monto, p_metodo_pago, trim(p_recibido_por), nullif(trim(coalesce(p_notas, '')), ''), auth.uid())
  returning * into v_anticipo;
  return v_anticipo;
end;
$function$;

create or replace function public.delete_anticipo(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede borrar un anticipo.';
  end if;
  select o.eliminada_en into v_eliminada_en
  from public.anticipos a join public.orders o on o.id = a.order_id
  where a.id = p_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  delete from public.anticipos where id = p_id;
end;
$function$;

create or replace function public.cancel_order(p_order_id uuid, p_notes text default null)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_eliminada_en timestamptz;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede cancelar una orden.';
  end if;
  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  update public.orders set cancelled_at = now(), updated_at = now()
  where id = p_order_id returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$function$;

create or replace function public.uncancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_eliminada_en timestamptz;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede reactivar una orden cancelada.';
  end if;
  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  update public.orders set cancelled_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$function$;

-- --------------------------------------------------------------------------
-- 5) Hard-delete de catálogos — exclusivo admin_general. Impact-check
--    antes de cada uno (ver FKs verificadas en el header).
-- --------------------------------------------------------------------------
create or replace function public.get_cliente_delete_impact(p_id uuid)
returns table (productos_count bigint, orders_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede consultar esto.';
  end if;
  return query
  select
    (select count(*) from public.productos where cliente_id = p_id),
    (select count(*) from public.orders where client_id = p_id);
end;
$function$;
revoke execute on function public.get_cliente_delete_impact(uuid) from public;
grant execute on function public.get_cliente_delete_impact(uuid) to authenticated;

create or replace function public.get_proveedor_delete_impact(p_id uuid)
returns table (pedidos_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede consultar esto.';
  end if;
  return query select (select count(*) from public.pedidos_tienda where proveedor_id = p_id);
end;
$function$;
revoke execute on function public.get_proveedor_delete_impact(uuid) from public;
grant execute on function public.get_proveedor_delete_impact(uuid) to authenticated;

create or replace function public.get_tela_delete_impact(p_id uuid)
returns table (productos_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede consultar esto.';
  end if;
  return query select (select count(*) from public.productos where tela_id = p_id);
end;
$function$;
revoke execute on function public.get_tela_delete_impact(uuid) from public;
grant execute on function public.get_tela_delete_impact(uuid) to authenticated;

create or replace function public.delete_cliente(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar un cliente.';
  end if;
  delete from public.clientes where id = p_id;
end;
$function$;
revoke execute on function public.delete_cliente(uuid) from public;
grant execute on function public.delete_cliente(uuid) to authenticated;

create or replace function public.delete_proveedor(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar un proveedor.';
  end if;
  delete from public.proveedores where id = p_id;
end;
$function$;
revoke execute on function public.delete_proveedor(uuid) from public;
grant execute on function public.delete_proveedor(uuid) to authenticated;

create or replace function public.delete_tela(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar una tela.';
  end if;
  delete from public.telas where id = p_id;
end;
$function$;
revoke execute on function public.delete_tela(uuid) from public;
grant execute on function public.delete_tela(uuid) to authenticated;

create or replace function public.delete_producto(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador general puede eliminar un producto.';
  end if;
  delete from public.productos where id = p_id;
end;
$function$;
revoke execute on function public.delete_producto(uuid) from public;
grant execute on function public.delete_producto(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 6) "Control rápido de órdenes" (tarea 9): folio, cliente, estado — de
--    solo lectura, visible para TODOS los roles (misma policy pública que
--    ya tenía orders). No hace falta una vista ni tabla nueva: el
--    frontend consulta orders directo (incluyendo eliminadas) y arma la
--    columna "estado" combinando orders.status + orden_etapas (o
--    "Eliminada" si eliminada_en no es null) — ver fetchAllOrdersForControl
--    en ordersService.js.
-- --------------------------------------------------------------------------
