-- =====================================================================
-- V143 — Órdenes de tipo "Maquila" (servicio a clientes externos)
-- =====================================================================
-- Un cliente de maquila manda sus cortes y SALPER les hace solo algunos
-- procesos (costura, bordado, terminado…). Cada producto del cliente
-- define qué procesos lleva, y cada orden se identifica con el NÚMERO DE
-- CORTE del cliente.
--
-- Todo es aditivo y reusa lo que ya existe:
--   * Cliente de maquila = categoría 'maquila' en clientes.tipo_orden (V45).
--   * Procesos del producto = columna nueva productos.procesos, con las
--     mismas etapas de siempre ('produccion' es Costura).
--   * Copia de los procesos en la orden = sus filas de orden_etapas (V23):
--     se generan al crear la orden y ya no dependen del catálogo.
--   * Bordado por orden = items[].lleva_bordado, como en los demás tipos
--     (set_order_items ya agrega/quita la etapa al editar).
--   * Folio MQ-001… = order_types.folio_prefix + secuencia propia
--     (folio_seq_maquila); una secuencia nunca repite número.
--
-- Columnas nuevas en orders: numero_corte y producto_id (solo maquila).
--
-- NO se redefine create_order ni ninguna función existente salvo dos
-- parches de una línea (categorías válidas de cliente), con guarda.
--
-- Rollback (solo si no hay órdenes de maquila):
--   drop function public.create_order_maquila(uuid, uuid, text, date, jsonb, text, text[], numeric);
--   drop function public.set_orden_numero_corte(uuid, text);
--   drop function public.set_producto_procesos(uuid, text[]);
--   drop trigger orders_maquila_ins on public.orders;
--   drop trigger orders_maquila_upd on public.orders;
--   drop function public.orders_maquila_guard();
--   drop index public.orders_maquila_numero_corte_uq;
--   update public.order_types set active = false where key = 'maquila';
--   (las columnas nuevas pueden quedarse: no estorban.)
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas
-- ---------------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n from pg_proc
  where proname = 'create_order' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V143: se esperaba una sola copia de create_order, hay %. No se aplicó nada.', n;
  end if;
  if exists (select 1 from public.order_types where key <> 'maquila' and upper(folio_prefix) = 'MQ') then
    raise exception 'V143: ya hay otro tipo de orden con el prefijo MQ. No se aplicó nada.';
  end if;
  if exists (select 1 from public.order_types where key = 'maquila' and upper(coalesce(folio_prefix, '')) <> 'MQ') then
    raise exception 'V143: ya existe un tipo "maquila" con otro prefijo de folio. Revisar antes de aplicar.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Categoría 'maquila' para clientes (parche de una línea en las dos
--    funciones que validan la lista, misma técnica de V131/V141)
-- ---------------------------------------------------------------------
do $$
declare
  v_viejo constant text := $q$t not in ('escolar', 'industrial', 'sublimacion')$q$;
  v_nuevo constant text := $q$t not in ('escolar', 'industrial', 'sublimacion', 'maquila')$q$;
  v_funciones constant text[] := array['create_cliente', 'set_cliente_tipo_orden'];
  v_nombre text;
  r record;
  d text;
  nuevo text;
  n int;
begin
  foreach v_nombre in array v_funciones loop
    select count(*) into n from pg_proc
    where proname = v_nombre and pronamespace = 'public'::regnamespace;
    if n <> 1 then
      raise exception 'V143: se esperaba una sola copia de %, hay %. No se aplicó nada.', v_nombre, n;
    end if;
    select count(*) into n from pg_proc
    where proname = v_nombre and pronamespace = 'public'::regnamespace
      and (position(v_viejo in prosrc) > 0 or position(v_nuevo in prosrc) > 0);
    if n <> 1 then
      raise exception 'V143: % viva no tiene la lista de categorías esperada. No se aplicó nada.', v_nombre;
    end if;
  end loop;

  for r in
    select p.oid, p.proname, p.prosrc from pg_proc p
    where p.proname = any(v_funciones) and p.pronamespace = 'public'::regnamespace
  loop
    continue when position(v_nuevo in r.prosrc) > 0;  -- ya parcheada
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, v_viejo, v_nuevo);
    if nuevo = d then
      raise exception 'V143: no pude parchear %.', r.proname;
    end if;
    execute nuevo;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Procesos de cada producto
-- ---------------------------------------------------------------------
alter table public.productos
  add column if not exists procesos text[] not null default '{}'::text[];

alter table public.productos drop constraint if exists productos_procesos_validos;
alter table public.productos add constraint productos_procesos_validos
  check (procesos <@ array['sublimado', 'corte', 'produccion', 'bordado', 'terminado']::text[]);

-- Aparte de guardar_producto a propósito: agregarle un parámetro cambiaría
-- su firma (14 parámetros) y el frontend que hoy está en producción.
create or replace function public.set_producto_procesos(p_id uuid, p_procesos text[])
returns public.productos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos;
  v_procesos text[];
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_general') then
    raise exception 'Solo ventas o administrador general pueden guardar productos.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_procesos, '{}'::text[])) e
    where e not in ('sublimado', 'corte', 'produccion', 'bordado', 'terminado')
  ) then
    raise exception 'Proceso inválido: solo corte, sublimado, bordado, costura o terminado.';
  end if;
  -- Sin repetidos y siempre en el orden del flujo.
  select coalesce(array_agg(e order by array_position(array['sublimado', 'corte', 'produccion', 'bordado', 'terminado'], e)), '{}'::text[])
    into v_procesos
  from (select distinct e from unnest(coalesce(p_procesos, '{}'::text[])) e) s;

  update public.productos set procesos = v_procesos where id = p_id returning * into v_producto;
  if v_producto.id is null then
    raise exception 'Producto no encontrado.';
  end if;
  return v_producto;
end;
$$;
revoke execute on function public.set_producto_procesos(uuid, text[]) from public, anon;
grant execute on function public.set_producto_procesos(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Columnas de la orden + número de corte único por cliente
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists numero_corte text;
alter table public.orders add column if not exists producto_id uuid references public.productos(id) on delete set null;

-- Sin distinguir mayúsculas ni espacios sobrantes. Las órdenes eliminadas
-- no cuentan (para poder volver a capturar una que se creó por error).
create unique index if not exists orders_maquila_numero_corte_uq
  on public.orders (client_id, upper(btrim(numero_corte)))
  where order_type_key = 'maquila' and numero_corte is not null and eliminada_en is null;

-- ---------------------------------------------------------------------
-- 4) Tipo de orden "Maquila", folio MQ-001…
-- ---------------------------------------------------------------------
-- La plantilla (corte, costura, terminado) existe porque un tipo activo
-- debe tener etapas (V136); las órdenes de maquila NO la usan: sus etapas
-- salen de los procesos del producto (ver create_order_maquila).
do $$
begin
  if not exists (select 1 from public.order_types where key = 'maquila') then
    insert into public.order_types (key, label, color, sort_order, folio_prefix, active)
    values ('maquila', 'Maquila', '#111111', (select coalesce(max(sort_order), 0) + 1 from public.order_types), 'MQ', false);
  end if;
  insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values
    ('maquila', 'corte', 1), ('maquila', 'produccion', 2), ('maquila', 'terminado', 4)
  on conflict (order_type_key, etapa) do nothing;
  update public.order_types set active = true where key = 'maquila' and not active;
end $$;

create sequence if not exists public.folio_seq_maquila start 1;

-- ---------------------------------------------------------------------
-- 5) Candado de las órdenes de maquila
-- ---------------------------------------------------------------------
-- BEFORE INSERT: corre antes de trg_assign_order_folio (orden alfabético),
-- así un rechazo no gasta folio. create_order_maquila le pasa el número de
-- corte y el producto por variables de la transacción; una orden de
-- maquila creada por cualquier otro camino (create_order directo) no las
-- trae y se rechaza.
create or replace function public.orders_maquila_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_corte text;
  v_producto uuid;
begin
  if tg_op = 'INSERT' then
    if new.order_type_key <> 'maquila' then
      return new;
    end if;
    v_corte := nullif(btrim(coalesce(current_setting('salper.maquila_numero_corte', true), '')), '');
    v_producto := nullif(coalesce(current_setting('salper.maquila_producto_id', true), ''), '')::uuid;
    if v_corte is null or v_producto is null or new.client_id is null then
      raise exception 'Una orden de maquila necesita cliente, producto y número de corte.';
    end if;
    new.numero_corte := v_corte;
    new.producto_id := v_producto;
  else
    if (old.order_type_key = 'maquila') <> (new.order_type_key = 'maquila') then
      raise exception 'El tipo Maquila no se puede cambiar en una orden ya creada: cancélala y captúrala de nuevo.';
    end if;
    if new.order_type_key <> 'maquila' then
      return new;
    end if;
    if new.client_id is null then
      raise exception 'Una orden de maquila necesita un cliente del catálogo.';
    end if;
    new.numero_corte := nullif(btrim(coalesce(new.numero_corte, '')), '');
    if new.numero_corte is null then
      raise exception 'Una orden de maquila necesita su número de corte.';
    end if;
  end if;

  if new.eliminada_en is null and exists (
    select 1 from public.orders o
    where o.order_type_key = 'maquila' and o.client_id = new.client_id
      and o.eliminada_en is null and o.id <> new.id
      and upper(btrim(o.numero_corte)) = upper(new.numero_corte)
  ) then
    raise exception 'Este cliente ya tiene una orden con el número de corte "%".', new.numero_corte;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_maquila_ins on public.orders;
create trigger orders_maquila_ins
  before insert on public.orders
  for each row execute function public.orders_maquila_guard();

drop trigger if exists orders_maquila_upd on public.orders;
create trigger orders_maquila_upd
  before update of order_type_key, client_id, numero_corte, eliminada_en on public.orders
  for each row execute function public.orders_maquila_guard();

-- ---------------------------------------------------------------------
-- 6) Crear una orden de maquila
-- ---------------------------------------------------------------------
-- Envuelve a create_order (mismos permisos, historial, folio y triggers) y
-- después cambia las etapas de la plantilla por los procesos del producto.
-- Secuencias: sublimado 0, corte 1, costura 2, bordado 3, terminado 4 (las
-- mismas de escolar/industrial; bordado 3 es también lo que usa
-- set_order_items al editar las prendas).
create or replace function public.create_order_maquila(
  p_client_id uuid,
  p_producto_id uuid,
  p_numero_corte text,
  p_requested_delivery_date date,
  p_items jsonb default '[]'::jsonb,
  p_description text default null,
  p_folios_externos text[] default '{}'::text[],
  p_total_orden numeric default null
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_cliente public.clientes;
  v_producto public.productos;
  v_corte text := nullif(btrim(coalesce(p_numero_corte, '')), '');
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_bordado boolean;
  v_etapas text[];
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;

  select * into v_cliente from public.clientes where id = p_client_id;
  if v_cliente.id is null then
    raise exception 'Elige un cliente de maquila.';
  end if;
  if not ('maquila' = any(coalesce(v_cliente.tipo_orden, '{}'::text[]))) then
    raise exception 'El cliente "%" no está marcado como cliente de maquila (Catálogos → Clientes).', v_cliente.nombre;
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if v_producto.id is null or v_producto.cliente_id <> p_client_id then
    raise exception 'Elige un producto del catálogo de este cliente.';
  end if;

  if v_corte is null then
    raise exception 'Falta el número de corte.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_items) it
    where coalesce((it->>'lleva_bordado')::boolean, false)
  ) into v_bordado;

  v_etapas := coalesce(v_producto.procesos, '{}'::text[]);
  if v_bordado and not ('bordado' = any(v_etapas)) then
    v_etapas := v_etapas || 'bordado'::text;
  end if;
  if coalesce(array_length(v_etapas, 1), 0) = 0 then
    raise exception 'El producto "%" no tiene procesos. Márcalos en el catálogo del cliente antes de crear la orden.', v_producto.nombre;
  end if;

  -- El producto borda siempre: la prenda lo dice también, para que editar
  -- las prendas después (set_order_items) no quite la etapa.
  if 'bordado' = any(v_etapas) and not v_bordado then
    select coalesce(jsonb_agg(it || jsonb_build_object('lleva_bordado', true)), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) it;
  end if;

  -- Para orders_maquila_guard (solo viven en esta transacción).
  perform set_config('salper.maquila_numero_corte', v_corte, true);
  perform set_config('salper.maquila_producto_id', p_producto_id::text, true);

  v_order := public.create_order(
    p_client_name => v_cliente.nombre,
    p_order_type_key => 'maquila',
    p_description => p_description,
    p_requested_delivery_date => p_requested_delivery_date,
    p_items => v_items,
    p_client_id => p_client_id,
    p_folios_externos => p_folios_externos,
    p_total_orden => p_total_orden
  );

  perform set_config('salper.maquila_numero_corte', '', true);
  perform set_config('salper.maquila_producto_id', '', true);

  -- Etapas = procesos del producto (copia: el catálogo puede cambiar después
  -- sin afectar a esta orden).
  delete from public.orden_etapas where order_id = v_order.id;
  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select v_order.id, e, 'pendiente',
    case e when 'sublimado' then 0 when 'corte' then 1 when 'produccion' then 2 when 'bordado' then 3 when 'terminado' then 4 end
  from unnest(v_etapas) e;

  select * into v_order from public.orders where id = v_order.id;
  return v_order;
end;
$$;
revoke execute on function public.create_order_maquila(uuid, uuid, text, date, jsonb, text, text[], numeric) from public, anon;
grant execute on function public.create_order_maquila(uuid, uuid, text, date, jsonb, text, text[], numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Corregir el número de corte de una orden ya creada
-- ---------------------------------------------------------------------
create or replace function public.set_orden_numero_corte(p_order_id uuid, p_numero_corte text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if coalesce(public.current_user_role(), '') not in ('ventas', 'admin_tienda', 'admin_general') then
    raise exception 'No tienes permiso para editar esta orden.';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    raise exception 'Orden no encontrada.';
  end if;
  if v_order.order_type_key <> 'maquila' then
    raise exception 'Solo las órdenes de maquila llevan número de corte.';
  end if;
  if v_order.eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  -- orders_maquila_upd valida que no esté vacío ni repetido para el cliente.
  update public.orders set numero_corte = p_numero_corte, updated_at = now()
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;
revoke execute on function public.set_orden_numero_corte(uuid, text) from public, anon;
grant execute on function public.set_orden_numero_corte(uuid, text) to authenticated;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--
--   select key, label, folio_prefix, active from public.order_types where key = 'maquila';
--   -- maquila | Maquila | MQ | true
--   select etapa, orden_secuencia from public.plantillas_etapas where order_type_key = 'maquila' order by 2;
--   -- corte 1, produccion 2, terminado 4
--   select last_value, is_called from public.folio_seq_maquila;
--   -- 1 | false  (el primer folio será MQ-001)
--   select column_name from information_schema.columns
--   where table_schema = 'public' and (table_name, column_name) in
--     (('orders','numero_corte'), ('orders','producto_id'), ('productos','procesos'));
--   -- 3 filas
--   select proname, pg_get_function_identity_arguments(oid),
--          has_function_privilege('anon', oid, 'execute') as anon_puede,
--          has_function_privilege('authenticated', oid, 'execute') as sesion_puede
--   from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('create_order_maquila', 'set_orden_numero_corte', 'set_producto_procesos');
--   -- 3 filas: anon false, sesión true
--   select proname, position($q$'sublimacion', 'maquila')$q$ in prosrc) > 0 as acepta_maquila
--   from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('create_cliente', 'set_cliente_tipo_orden');
--   -- 2 filas: true
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and not tgisinternal order by tgname;
--   -- orders_maquila_ins y orders_maquila_upd van antes de trg_assign_order_folio
--
-- NO probar create_order_maquila "a ver si funciona": gasta folios MQ.
-- =====================================================================
