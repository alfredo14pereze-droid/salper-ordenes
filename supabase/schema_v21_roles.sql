-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V21: rediseño de roles y permisos (Fase 2, Parte 1)
--
-- Reemplaza el modelo plano de 3 roles (admin/tienda/fabrica) por 10
-- roles granulares:
--   Tienda:  ventas, contabilidad, admin_tienda
--   Fábrica: corte, bordado, sublimado, produccion, terminado, admin_fabrica
--   General: admin_general (acceso total a los dos dominios + gestión de
--            usuarios — no existía un "super-admin" explícito en el pedido
--            original, se agregó para no degradar al admin actual del
--            sistema; decisión confirmada con el usuario antes de aplicar
--            esta migración).
--
-- Mapeo de migración de los 3 usuarios existentes (confirmado con el
-- usuario antes de aplicar):
--   admin   -> admin_general  (preserva acceso total, incluida gestión de
--              usuarios — no hay forma de saber a cuál de los dos dominios
--              "degradarlo" sin quitarle acceso a la mitad del sistema)
--   tienda  -> ventas         (coincide con lo que ya hacía: crear/editar
--              pedidos)
--   fabrica -> admin_fabrica  (el rol 'fabrica' de hoy puede tocar TODAS
--              las etapas de producción; bajarlo a una sola etapa le
--              quitaría acceso a lo que ya hacía. El admin reasigna a cada
--              quien su etapa específica después, desde Usuarios)
--
-- LÍMITE ESTRUCTURAL, documentado a propósito (ver SALPER_Contexto.md):
-- el pedido original dice "corte solo puede modificar el estado de SU
-- etapa" — eso hoy NO se puede aplicar de verdad, porque el estado de una
-- orden vive en una sola columna (orders.status, 11 valores lineales), no
-- hay una fila por etapa todavía. Los 5 roles de etapa + admin_fabrica
-- comparten el mismo permiso de escritura sobre update_order_status por
-- ahora (igual que compartía 'fabrica' antes) — la granularidad fina por
-- etapa individual llega en la Parte 2, con la tabla orden_etapas. Lo que
-- SÍ se puede aplicar hoy y se aplica en esta migración: ningún rol de
-- fábrica puede tocar datos generales del pedido (cliente, fechas, tipo,
-- prendas) — eso sigue siendo exclusivo de tienda.
--
-- "Órdenes de compra" (pedidos_tienda) se asignó a contabilidad (no a
-- ventas) — es un juicio del autor de esta migración, no algo que el
-- pedido original especificara: es fundamentalmente un flujo de compra a
-- proveedor, y "contabilidad... puede subir/editar facturas y órdenes de
-- compra" ya menciona "órdenes de compra" explícitamente como su dominio.
-- Documentos de la orden (cotización/orden de compra/factura) también se
-- asignaron completos a contabilidad — "ventas... NO puede subir/editar
-- facturas" se generalizó a toda la familia de documentos financieros.
--
-- Aditivo en el sentido de "no rompe tablas ni datos": ninguna tabla se
-- borra, solo se migra el CONTENIDO de profiles.role (3 usuarios reales
-- al momento de escribir esto) y se reescribe la lógica interna de 15
-- funciones RPC ya existentes — ninguna cambia de firma (mismos
-- parámetros/tipos que ya tenían), así que CREATE OR REPLACE alcanza sin
-- DROP FUNCTION (ver gotcha de firmas de RPC en SALPER_Contexto.md) y
-- conserva el ACL ya otorgado (revoke de PUBLIC + grant a authenticated)
-- sin tener que repetirlo.
--
-- Enforcement de escritura: este proyecto nunca usó políticas RLS de
-- INSERT/UPDATE/DELETE del lado del cliente — toda escritura pasa por
-- estas funciones SECURITY DEFINER (ver "Patrón de escritura" en
-- SALPER_Contexto.md). Es funcionalmente equivalente a RLS por fila para
-- estos fines: el chequeo de rol vive en el único punto de entrada de
-- cada escritura, no se puede saltar desde el cliente. La lectura (quién
-- ve qué) no cambia — sigue siendo pública para todas las órdenes, como
-- ya pedía la regla "todos los roles pueden VER todo".
--
-- Antes de aplicar: 1 admin, 1 tienda, 1 fabrica en profiles (base real,
-- verificado antes de escribir este archivo).
--
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) profiles.role: migrar datos ANTES de ampliar el constraint (mismo
--    orden obligatorio de siempre: drop constraint -> update -> add
--    constraint con la lista nueva).
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = case role
  when 'admin' then 'admin_general'
  when 'tienda' then 'ventas'
  when 'fabrica' then 'admin_fabrica'
  else role
end;

alter table public.profiles add constraint profiles_role_check check (role in (
  'ventas', 'contabilidad', 'admin_tienda',
  'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
  'admin_general'
));

alter table public.profiles alter column role set default 'ventas';

-- ---------------------------------------------------------------------
-- 2) handle_new_user: default de rol para un perfil auto-creado sin rol
--    explícito en los metadatos (hoy no aplica en la práctica —
--    admin-create-user siempre manda role— pero se actualiza por
--    consistencia).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, ''),
    coalesce(new.raw_user_meta_data->>'role', 'ventas')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3) admin_update_user_role: solo admin_general puede cambiar roles;
--    lista de roles válidos actualizada.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_user_role(
  p_user_id uuid, p_role text, p_full_name text default null
) returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_profile public.profiles;
begin
  if coalesce(public.current_user_role(), '') <> 'admin_general' then
    raise exception 'Solo un administrador puede cambiar roles de usuario.';
  end if;
  if p_role not in (
    'ventas', 'contabilidad', 'admin_tienda',
    'corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica',
    'admin_general'
  ) then
    raise exception 'Rol inválido: %', p_role;
  end if;
  update public.profiles set role = p_role, full_name = coalesce(p_full_name, full_name)
  where id = p_user_id returning * into v_profile;
  if v_profile.id is null then
    raise exception 'Usuario % no encontrado', p_user_id;
  end if;
  return v_profile;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4) cancel_order / uncancel_order: admin -> admin_tienda/admin_general
--    (cancelar una orden es una decisión del lado de tienda).
-- ---------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_notes text default null)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede cancelar una orden.';
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
declare v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede reactivar una orden cancelada.';
  end if;
  update public.orders set cancelled_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  if v_order.id is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  return v_order;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5) create_anticipo / delete_anticipo
-- ---------------------------------------------------------------------
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
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Orden % no encontrada', p_order_id;
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
declare v_role text := public.current_user_role();
begin
  if coalesce(v_role, '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede borrar un anticipo.';
  end if;
  delete from public.anticipos where id = p_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6) create_order / update_order_details / set_order_items: dominio
--    ventas (crear/editar pedidos de cliente).
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_client_name text, p_order_type_key text, p_description text, p_requested_delivery_date date,
  p_estimated_production_days integer default null, p_items jsonb default '[]'::jsonb, p_client_id uuid default null
) returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;
  insert into public.orders (
    client_name, order_type_key, description, requested_delivery_date,
    estimated_production_days, items, client_id, created_by
  ) values (
    p_client_name, p_order_type_key, p_description, p_requested_delivery_date,
    p_estimated_production_days, coalesce(p_items, '[]'::jsonb), p_client_id, auth.uid()
  ) returning * into v_order;
  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());
  return v_order;
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
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
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
begin
  if coalesce(v_role, '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar las prendas de esta orden.';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then
    raise exception 'Esta orden ya fue confirmada por fábrica y ya no se pueden editar sus prendas.';
  end if;
  update public.orders set items = coalesce(p_items, '[]'::jsonb), updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;

-- ---------------------------------------------------------------------
-- 7) set_order_document: dominio contabilidad (cotización/orden de
--    compra/factura) — misma asimetría de siempre (factura sin tope de
--    estado, cotización/orden de compra solo mientras en_confirmacion),
--    ahora aplicada a contabilidad en vez de a tienda.
-- ---------------------------------------------------------------------
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
begin
  if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar los documentos de esta orden.';
  end if;
  if p_kind not in ('cotizacion', 'orden_compra', 'factura') then
    raise exception 'Tipo de documento inválido: %', p_kind;
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_role = 'contabilidad' and p_kind <> 'factura' and v_current_status <> 'en_confirmacion' then
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

-- ---------------------------------------------------------------------
-- 8) create_pedido_tienda / create_proveedor / marcar_pedido_recibido /
--    verificar_pedido_tienda: dominio contabilidad (compra a proveedor).
-- ---------------------------------------------------------------------
create or replace function public.create_pedido_tienda(
  p_proveedor text, p_pedido_por text, p_fecha_pedido date, p_notas text, p_articulos jsonb,
  p_proveedor_id uuid default null
) returns public.pedidos_tienda
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
  v_articulo jsonb;
begin
  if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden registrar pedidos a proveedor.';
  end if;
  if trim(coalesce(p_proveedor, '')) = '' then
    raise exception 'Falta indicar el proveedor.';
  end if;
  if trim(coalesce(p_pedido_por, '')) = '' then
    raise exception 'Falta indicar quién hizo el pedido.';
  end if;
  if p_articulos is null or jsonb_array_length(p_articulos) = 0 then
    raise exception 'El pedido necesita al menos un artículo.';
  end if;
  insert into public.pedidos_tienda (proveedor, proveedor_id, pedido_por, fecha_pedido, notas)
  values (trim(p_proveedor), p_proveedor_id, trim(p_pedido_por), coalesce(p_fecha_pedido, current_date), nullif(trim(coalesce(p_notas, '')), ''))
  returning * into v_pedido;
  for v_articulo in select * from jsonb_array_elements(p_articulos)
  loop
    if trim(coalesce(v_articulo->>'nombre_articulo', '')) = '' then
      raise exception 'Cada artículo necesita un nombre.';
    end if;
    if coalesce((v_articulo->>'cantidad_pedida')::integer, 0) <= 0 then
      raise exception 'La cantidad pedida de "%" debe ser mayor a cero.', v_articulo->>'nombre_articulo';
    end if;
    insert into public.pedidos_tienda_articulos (pedido_id, nombre_articulo, cantidad_pedida, talla)
    values (
      v_pedido.id,
      trim(v_articulo->>'nombre_articulo'),
      (v_articulo->>'cantidad_pedida')::integer,
      nullif(trim(coalesce(v_articulo->>'talla', '')), '')
    );
  end loop;
  return v_pedido;
end;
$function$;

create or replace function public.create_proveedor(
  p_nombre text, p_contacto text default null, p_tipo_material text default null, p_notas text default null
) returns public.proveedores
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_proveedor public.proveedores;
begin
  if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden registrar proveedores.';
  end if;
  if trim(coalesce(p_nombre, '')) = '' then
    raise exception 'El nombre del proveedor no puede estar vacío.';
  end if;
  insert into public.proveedores (nombre, contacto, tipo_material, notas)
  values (trim(p_nombre), nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_tipo_material, '')), ''), nullif(trim(coalesce(p_notas, '')), ''))
  on conflict (nombre_normalizado) do nothing;
  select * into v_proveedor from public.proveedores where nombre_normalizado = lower(trim(p_nombre));
  return v_proveedor;
end;
$function$;

create or replace function public.marcar_pedido_recibido(p_pedido_id uuid)
returns public.pedidos_tienda
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
begin
  if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden marcar un pedido como recibido.';
  end if;
  select * into v_pedido from public.pedidos_tienda where id = p_pedido_id;
  if v_pedido.id is null then
    raise exception 'Pedido % no encontrado', p_pedido_id;
  end if;
  if v_pedido.estado <> 'pedido' then
    raise exception 'Este pedido ya no está en estado "pedido" (está en "%").', v_pedido.estado;
  end if;
  update public.pedidos_tienda set estado = 'recibido', fecha_recepcion = current_date, updated_at = now()
  where id = p_pedido_id returning * into v_pedido;
  return v_pedido;
end;
$function$;

create or replace function public.verificar_pedido_tienda(
  p_pedido_id uuid, p_verificado_por text, p_articulos jsonb
) returns public.pedidos_tienda
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_pedido public.pedidos_tienda;
  v_articulo jsonb;
  v_hay_problema boolean;
begin
  if coalesce(v_role, '') not in ('contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden verificar un pedido.';
  end if;
  if trim(coalesce(p_verificado_por, '')) = '' then
    raise exception 'Falta indicar quién verificó el pedido.';
  end if;
  select * into v_pedido from public.pedidos_tienda where id = p_pedido_id;
  if v_pedido.id is null then
    raise exception 'Pedido % no encontrado', p_pedido_id;
  end if;
  if v_pedido.estado not in ('pedido', 'recibido') then
    raise exception 'Este pedido ya fue verificado (está en "%").', v_pedido.estado;
  end if;
  for v_articulo in select * from jsonb_array_elements(coalesce(p_articulos, '[]'::jsonb))
  loop
    update public.pedidos_tienda_articulos
    set
      cantidad_recibida = (v_articulo->>'cantidad_recibida')::integer,
      precio_unitario = nullif(v_articulo->>'precio_unitario', '')::numeric,
      nota_problema = nullif(trim(coalesce(v_articulo->>'nota_problema', '')), '')
    where id = (v_articulo->>'id')::uuid and pedido_id = p_pedido_id;
  end loop;
  select exists (
    select 1 from public.pedidos_tienda_articulos
    where pedido_id = p_pedido_id
      and (cantidad_recibida is null or cantidad_recibida <> cantidad_pedida or nota_problema is not null)
  ) into v_hay_problema;
  update public.pedidos_tienda
  set
    estado = case when v_hay_problema then 'con_problema' else 'verificado' end,
    verificado_por = trim(p_verificado_por),
    updated_at = now()
  where id = p_pedido_id returning * into v_pedido;
  return v_pedido;
end;
$function$;

-- ---------------------------------------------------------------------
-- 9) update_order_status / set_estimated_production_days: dominio
--    fábrica — límite estructural documentado arriba: los 5 roles de
--    etapa comparten el permiso de escritura por ahora (no hay
--    orden_etapas todavía para restringir por etapa individual). El
--    override de una orden cancelada se restringe a admin_general (antes
--    era 'admin' a secas) — es la única función con ese matiz extra.
-- ---------------------------------------------------------------------
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
  if coalesce(v_role, '') not in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo fábrica o administrador pueden cambiar el estado de una orden.';
  end if;
  select cancelled_at into v_cancelled_at from public.orders where id = p_order_id;
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
begin
  if coalesce(v_role, '') not in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo fábrica o administrador pueden capturar el tiempo estimado de producción.';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'El tiempo estimado debe ser de al menos 1 día.';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if v_current_status is null then
    raise exception 'Orden % no encontrada', p_order_id;
  end if;
  if v_role in ('corte', 'bordado', 'sublimado', 'produccion', 'terminado') and v_current_status <> 'en_confirmacion' then
    raise exception 'Solo se puede capturar el tiempo estimado mientras la orden está en confirmación.';
  end if;
  update public.orders set estimated_production_days = p_days, updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$function$;
