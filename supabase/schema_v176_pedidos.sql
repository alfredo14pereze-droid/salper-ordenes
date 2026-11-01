-- =====================================================================
-- V176 — Pedidos: agrupar varias órdenes de un cliente (2026-11-01)
-- =====================================================================
-- Pedido de Alfredo (Fase 2): un pedido junta varias órdenes con UN anticipo,
-- abonos, datos de factura y, si es de mostrador, sin precio/anticipo/factura.
--
-- Qué agrega (todo aditivo; V1 sigue igual):
--   · Tabla `pedidos` (folio PED-0001, cliente, es_mostrador, anticipo,
--     datos de factura, soft-delete con deleted_at).
--   · Secuencia `pedido_folio_seq`: el folio nunca se reutiliza (ni con
--     soft-delete; la fila borrada conserva su folio y es único).
--   · Tabla `pedido_abonos` (mismas columnas y reglas que `anticipos`, V16).
--   · Columna `orders.pedido_id` (NULLABLE). Órdenes sueltas y existentes:
--     null, siguen igual con su anticipo de siempre. No se migra nada.
--   · Funciones: pedido_crear, pedido_actualizar, pedido_agregar_orden,
--     pedido_quitar_orden, pedido_eliminar, create_pedido_abono,
--     delete_pedido_abono, pedido_totales, pedidos_lista.
--
-- Reglas:
--   · Total = suma calculada de sus órdenes: cantidad × (precio + extras de
--     V77) de cada línea con precio que no es de mostrador (orden_lineas_calc,
--     V159). Nunca se captura. Órdenes eliminadas o canceladas no cuentan.
--   · Saldo = total − anticipo − abonos − anticipos que ya traían sus órdenes
--     (anticipos de V16 registrados en cada orden; se suman para no cobrar dos
--     veces).
--   · Pedido de mostrador: anticipo 0, sin factura (check en la tabla) y TODAS
--     las líneas de sus órdenes quedan de mostrador (al agregarlas o al
--     marcar el pedido), con `orden_facturacion.requiere_factura = false`.
--   · Factura: con requiere_factura, la razón social es obligatoria (check);
--     RFC, régimen, CP y uso de CFDI son opcionales (pedido_totales avisa
--     "Datos fiscales incompletos", no bloquea).
--   · Ver: fin_puede_ver() (los mismos que ven precios). Crear/editar:
--     fin_puede_editar(). Abonos: los mismos roles que create_anticipo;
--     borrar abono: admin_tienda/admin_general (como delete_anticipo).
--   · Eliminar pedido: solo si ya no tiene órdenes, abonos ni anticipo.
--
-- No toca: create_order*, orden_totales, fin_validar_entrega, anticipos,
-- update_order_status. La entrega de cada orden sigue con sus reglas.
--
-- Rollback (si no se ha usado):
--   alter table public.orders drop column if exists pedido_id;
--   drop table if exists public.pedido_abonos; drop table if exists public.pedidos;
--   drop sequence if exists public.pedido_folio_seq;
--   (y drop function de las funciones de abajo)
--
-- Cómo aplicarlo: pegar completo en el SQL Editor y correrlo una vez.
-- Se puede volver a correr sin daño.
-- =====================================================================
do $$
begin
  if to_regprocedure('public.fin_puede_ver()') is null
     or to_regprocedure('public.fin_puede_editar()') is null
     or to_regprocedure('public.orden_lineas_calc(uuid)') is null
     or to_regprocedure('public.orden_lineas_guardar(uuid, jsonb)') is null
     or to_regclass('public.orden_facturacion') is null
     or to_regclass('public.clientes') is null then
    raise exception 'V176: falta V77/V159 (fin_puede_ver, orden_lineas_calc...). No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------
create sequence if not exists public.pedido_folio_seq;

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  client_id uuid references public.clientes(id) on delete set null,
  cliente text not null check (btrim(cliente) <> ''),
  es_mostrador boolean not null default false,
  anticipo numeric(12,2) not null default 0 check (anticipo >= 0),
  anticipo_metodo_pago text check (anticipo_metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  anticipo_recibido_por text,
  requiere_factura boolean not null default false,
  razon_social text,
  rfc text,
  regimen_fiscal text,
  uso_cfdi text,
  codigo_postal text,
  direccion text,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_nombre text,
  deleted_at timestamptz,
  constraint pedidos_mostrador_sin_cobro check (not es_mostrador or (anticipo = 0 and not requiere_factura)),
  constraint pedidos_factura_razon check (not requiere_factura or nullif(btrim(razon_social), '') is not null)
);

create table if not exists public.pedido_abonos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  monto numeric(12,2) not null check (monto > 0),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'tarjeta', 'transferencia')),
  recibido_por text not null,
  notas text,
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists pedido_abonos_pedido_idx on public.pedido_abonos (pedido_id);

alter table public.orders add column if not exists pedido_id uuid references public.pedidos(id);
create index if not exists orders_pedido_id_idx on public.orders (pedido_id) where pedido_id is not null;

-- Folio: lo pone la base al insertar y no se puede cambiar.
create or replace function public.pedidos_folio_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.folio := 'PED-' || lpad(nextval('public.pedido_folio_seq')::text, 4, '0');
  elsif new.folio is distinct from old.folio then
    raise exception 'El folio de un pedido no se puede cambiar.';
  end if;
  return new;
end; $$;
drop trigger if exists pedidos_folio on public.pedidos;
create trigger pedidos_folio before insert or update of folio on public.pedidos
  for each row execute function public.pedidos_folio_trg();

-- Lectura: solo quien ve dinero. Escritura: solo por las funciones de abajo.
alter table public.pedidos enable row level security;
alter table public.pedido_abonos enable row level security;
drop policy if exists "fin lee pedidos" on public.pedidos;
create policy "fin lee pedidos" on public.pedidos for select to authenticated using (public.fin_puede_ver());
drop policy if exists "fin lee pedido_abonos" on public.pedido_abonos;
create policy "fin lee pedido_abonos" on public.pedido_abonos for select to authenticated using (public.fin_puede_ver());
revoke all on public.pedidos, public.pedido_abonos from anon, public;
grant select on public.pedidos, public.pedido_abonos to authenticated;
revoke all on sequence public.pedido_folio_seq from anon, public, authenticated;

-- ---------------------------------------------------------------------
-- 2) Internas (sin grant)
-- ---------------------------------------------------------------------
-- Valida los datos de un pedido ANTES de insertar (no gasta folio).
create or replace function public.pedido_validar_datos(p jsonb)
returns void language plpgsql stable set search_path = public as $$
declare v_most boolean := coalesce((p->>'es_mostrador')::boolean, false);
        v_ant numeric := coalesce(nullif(p->>'anticipo', '')::numeric, 0);
        v_fact boolean := coalesce((p->>'requiere_factura')::boolean, false);
begin
  if nullif(btrim(coalesce(p->>'cliente', '')), '') is null then raise exception 'Falta el cliente del pedido.'; end if;
  if v_ant < 0 then raise exception 'El anticipo no puede ser negativo.'; end if;
  if v_most and (v_ant > 0 or v_fact) then
    raise exception 'Un pedido de venta de mostrador no lleva anticipo ni factura.';
  end if;
  if v_fact and nullif(btrim(coalesce(p->>'razon_social', '')), '') is null then
    raise exception 'Si el pedido requiere factura, la razón social es obligatoria.';
  end if;
  if v_ant > 0 and coalesce(p->>'anticipo_metodo_pago', '') not in ('efectivo', 'tarjeta', 'transferencia') then
    raise exception 'Elige el método de pago del anticipo.';
  end if;
  if v_ant > 0 and nullif(btrim(coalesce(p->>'anticipo_recibido_por', '')), '') is null then
    raise exception 'Falta indicar quién recibió el anticipo.';
  end if;
end; $$;

-- Pone todas las líneas de una orden como venta de mostrador y sin factura.
create or replace function public.pedido_orden_a_mostrador(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.orden_lineas_guardar(p_order_id, coalesce((
    select jsonb_agg(jsonb_build_object('item_index', c.item_index, 'size_index', c.size_index, 'venta_mostrador', true))
      from public.orden_lineas_calc(p_order_id) c), '[]'::jsonb));
  update public.orden_facturacion set requiere_factura = false, updated_at = now()
   where order_id = p_order_id and requiere_factura;
end; $$;

-- ¿Puede entrar esta orden al pedido? (p_pedido_id null = pedido nuevo).
-- Se llama ANTES de crear el pedido para no gastar folio en un rechazo.
create or replace function public.pedido_revisar_orden(p_order_id uuid, p_pedido_id uuid, p_mostrador boolean)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null or v_o.cancelled_at is not null then
    raise exception 'La orden % está eliminada o cancelada.', v_o.order_number;
  end if;
  if v_o.pedido_id is not null and v_o.pedido_id is distinct from p_pedido_id then
    raise exception 'La orden % ya está en otro pedido. Quítala de ese pedido primero.', v_o.order_number;
  end if;
  if p_mostrador and v_o.status = 'completado' then
    raise exception 'La orden % ya fue entregada: no se puede volver venta de mostrador.', v_o.order_number;
  end if;
end; $$;

-- Liga una orden a un pedido (revisa que se pueda).
create or replace function public.pedido_vincular_orden(p_pedido public.pedidos, p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.orders where id = p_order_id for update;
  perform public.pedido_revisar_orden(p_order_id, p_pedido.id, p_pedido.es_mostrador);
  update public.orders set pedido_id = p_pedido.id where id = p_order_id;
  if p_pedido.es_mostrador then
    perform public.pedido_orden_a_mostrador(p_order_id);
  end if;
end; $$;

revoke execute on function public.pedido_validar_datos(jsonb) from public;
revoke execute on function public.pedido_orden_a_mostrador(uuid) from public;
revoke execute on function public.pedido_revisar_orden(uuid, uuid, boolean) from public;
revoke execute on function public.pedido_vincular_orden(public.pedidos, uuid) from public;

-- ---------------------------------------------------------------------
-- 3) Crear / editar / eliminar
-- ---------------------------------------------------------------------
-- p_datos = {"cliente":"…","client_id":"…","es_mostrador":false,"anticipo":500,
--            "anticipo_metodo_pago":"efectivo","anticipo_recibido_por":"…",
--            "requiere_factura":true,"razon_social":"…","rfc":"…","regimen_fiscal":"…",
--            "uso_cfdi":"…","codigo_postal":"…","direccion":"…","notas":"…"}
-- p_order_ids: órdenes que entran al pedido desde que nace (p. ej. la que se
-- acaba de crear con "Nuevo pedido").
create or replace function public.pedido_crear(p_datos jsonb, p_order_ids uuid[] default '{}')
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos; v_id uuid;
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para crear pedidos.'; end if;
  perform public.pedido_validar_datos(p_datos);
  foreach v_id in array coalesce(p_order_ids, '{}') loop
    perform public.pedido_revisar_orden(v_id, null, coalesce((p_datos->>'es_mostrador')::boolean, false));
  end loop;
  insert into public.pedidos (folio, client_id, cliente, es_mostrador, anticipo, anticipo_metodo_pago, anticipo_recibido_por,
                              requiere_factura, razon_social, rfc, regimen_fiscal, uso_cfdi, codigo_postal, direccion, notas,
                              created_by, created_by_nombre)
  values ('(nuevo)', nullif(p_datos->>'client_id', '')::uuid, btrim(p_datos->>'cliente'),
          coalesce((p_datos->>'es_mostrador')::boolean, false),
          coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0),
          case when coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0) > 0 then p_datos->>'anticipo_metodo_pago' end,
          case when coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0) > 0 then nullif(btrim(p_datos->>'anticipo_recibido_por'), '') end,
          coalesce((p_datos->>'requiere_factura')::boolean, false),
          nullif(btrim(p_datos->>'razon_social'), ''), nullif(upper(btrim(p_datos->>'rfc')), ''),
          nullif(btrim(p_datos->>'regimen_fiscal'), ''), nullif(btrim(p_datos->>'uso_cfdi'), ''),
          nullif(btrim(p_datos->>'codigo_postal'), ''), nullif(btrim(p_datos->>'direccion'), ''),
          nullif(btrim(p_datos->>'notas'), ''),
          auth.uid(), (select full_name from public.profiles where id = auth.uid()))
  returning * into v;
  foreach v_id in array coalesce(p_order_ids, '{}') loop
    perform public.pedido_vincular_orden(v, v_id);
  end loop;
  return v;
end; $$;

-- Edita los datos (no el folio). Si pasa a mostrador, todas sus órdenes se
-- vuelven de mostrador (y no puede tener anticipo ni abonos).
create or replace function public.pedido_actualizar(p_pedido_id uuid, p_datos jsonb)
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos; v_antes boolean; v_o uuid;
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para editar pedidos.'; end if;
  select es_mostrador into v_antes from public.pedidos where id = p_pedido_id and deleted_at is null for update;
  if not found then raise exception 'Pedido no encontrado o eliminado.'; end if;
  perform public.pedido_validar_datos(p_datos);
  if coalesce((p_datos->>'es_mostrador')::boolean, false) and exists (select 1 from public.pedido_abonos where pedido_id = p_pedido_id) then
    raise exception 'El pedido ya tiene abonos: no se puede volver venta de mostrador.';
  end if;
  update public.pedidos set
    client_id = nullif(p_datos->>'client_id', '')::uuid,
    cliente = btrim(p_datos->>'cliente'),
    es_mostrador = coalesce((p_datos->>'es_mostrador')::boolean, false),
    anticipo = coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0),
    anticipo_metodo_pago = case when coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0) > 0 then p_datos->>'anticipo_metodo_pago' end,
    anticipo_recibido_por = case when coalesce(nullif(p_datos->>'anticipo', '')::numeric, 0) > 0 then nullif(btrim(p_datos->>'anticipo_recibido_por'), '') end,
    requiere_factura = coalesce((p_datos->>'requiere_factura')::boolean, false),
    razon_social = nullif(btrim(p_datos->>'razon_social'), ''),
    rfc = nullif(upper(btrim(p_datos->>'rfc')), ''),
    regimen_fiscal = nullif(btrim(p_datos->>'regimen_fiscal'), ''),
    uso_cfdi = nullif(btrim(p_datos->>'uso_cfdi'), ''),
    codigo_postal = nullif(btrim(p_datos->>'codigo_postal'), ''),
    direccion = nullif(btrim(p_datos->>'direccion'), ''),
    notas = nullif(btrim(p_datos->>'notas'), '')
  where id = p_pedido_id
  returning * into v;
  if v.es_mostrador and not v_antes then
    for v_o in select id from public.orders
                where pedido_id = p_pedido_id and eliminada_en is null and cancelled_at is null and status <> 'completado' loop
      perform public.pedido_orden_a_mostrador(v_o);
    end loop;
  end if;
  return v;
end; $$;

create or replace function public.pedido_agregar_orden(p_pedido_id uuid, p_order_id uuid)
returns public.pedidos language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para editar pedidos.'; end if;
  select * into v from public.pedidos where id = p_pedido_id and deleted_at is null;
  if v.id is null then raise exception 'Pedido no encontrado o eliminado.'; end if;
  perform public.pedido_vincular_orden(v, p_order_id);
  return v;
end; $$;

-- La orden vuelve a ser suelta (sus líneas de mostrador se quedan como están).
create or replace function public.pedido_quitar_orden(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para editar pedidos.'; end if;
  update public.orders set pedido_id = null where id = p_order_id;
end; $$;

-- Solo un pedido vacío (sin órdenes activas, abonos ni anticipo). El folio no se libera.
create or replace function public.pedido_eliminar(p_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pedidos;
begin
  if not public.fin_puede_editar() then raise exception 'No tienes permiso para eliminar pedidos.'; end if;
  select * into v from public.pedidos where id = p_pedido_id and deleted_at is null for update;
  if v.id is null then raise exception 'Pedido no encontrado o ya eliminado.'; end if;
  if exists (select 1 from public.orders where pedido_id = p_pedido_id and eliminada_en is null) then
    raise exception 'El pedido todavía tiene órdenes: quítalas primero.';
  end if;
  if v.anticipo > 0 or exists (select 1 from public.pedido_abonos where pedido_id = p_pedido_id) then
    raise exception 'El pedido tiene anticipo o abonos: no se puede eliminar.';
  end if;
  update public.pedidos set deleted_at = now() where id = p_pedido_id;
end; $$;

-- ---------------------------------------------------------------------
-- 4) Abonos (misma lógica que create_anticipo / delete_anticipo)
-- ---------------------------------------------------------------------
create or replace function public.create_pedido_abono(
  p_pedido_id uuid, p_monto numeric, p_metodo_pago text, p_recibido_por text, p_notas text default null
) returns public.pedido_abonos language plpgsql security definer set search_path = public as $$
declare v_role text := public.current_user_role(); v public.pedido_abonos; v_p public.pedidos;
begin
  if coalesce(v_role, '') not in ('ventas', 'contabilidad', 'admin_tienda', 'admin_general') then
    raise exception 'Solo tienda o administrador pueden registrar abonos.';
  end if;
  if p_metodo_pago not in ('efectivo', 'tarjeta', 'transferencia') then raise exception 'Método de pago inválido: %', p_metodo_pago; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if btrim(coalesce(p_recibido_por, '')) = '' then raise exception 'Falta indicar quién recibió el abono.'; end if;
  select * into v_p from public.pedidos where id = p_pedido_id and deleted_at is null;
  if v_p.id is null then raise exception 'Pedido no encontrado o eliminado.'; end if;
  if v_p.es_mostrador then raise exception 'Un pedido de venta de mostrador no lleva abonos.'; end if;
  insert into public.pedido_abonos (pedido_id, monto, metodo_pago, recibido_por, notas, created_by)
  values (p_pedido_id, p_monto, p_metodo_pago, btrim(p_recibido_por), nullif(btrim(coalesce(p_notas, '')), ''), auth.uid())
  returning * into v;
  return v;
end; $$;

create or replace function public.delete_pedido_abono(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.current_user_role(), '') not in ('admin_tienda', 'admin_general') then
    raise exception 'Solo un administrador puede borrar un abono.';
  end if;
  delete from public.pedido_abonos where id = p_id;
end; $$;

-- ---------------------------------------------------------------------
-- 5) Totales y lista (solo lectura)
-- ---------------------------------------------------------------------
create or replace function public.pedido_totales(p_pedido_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.pedidos; v_ordenes jsonb; v_total numeric; v_ant_ord numeric; v_abonos numeric; v_faltan text[];
begin
  if not public.fin_puede_ver() then raise exception 'No tienes permiso para ver pedidos.'; end if;
  select * into v from public.pedidos where id = p_pedido_id;
  if v.id is null then return null; end if;
  with o as (
    select o.id, o.order_number, o.status, o.client_name, o.order_type_key, o.requested_delivery_date,
           o.eliminada_en is null and o.cancelled_at is null as activa,
           coalesce((select sum(c.cantidad * (c.precio_unitario + c.extras_pieza))
                       from public.orden_lineas_calc(o.id) c
                      where not c.venta_mostrador and c.precio_unitario is not null), 0) as total,
           coalesce((select count(*) from public.orden_lineas_calc(o.id) c where not c.con_precio), 0) as sin_precio,
           coalesce((select sum(a.monto) from public.anticipos a where a.order_id = o.id), 0) as anticipos
      from public.orders o where o.pedido_id = p_pedido_id and o.eliminada_en is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'order_number', order_number, 'status', status, 'client_name', client_name,
           'order_type_key', order_type_key, 'requested_delivery_date', requested_delivery_date,
           'activa', activa, 'total', round(total, 2), 'lineas_sin_precio', sin_precio, 'anticipos', anticipos)
           order by order_number), '[]'::jsonb),
         coalesce(sum(total) filter (where activa), 0),
         coalesce(sum(anticipos) filter (where activa), 0)
    into v_ordenes, v_total, v_ant_ord from o;
  select coalesce(sum(monto), 0) into v_abonos from public.pedido_abonos where pedido_id = p_pedido_id;
  v_faltan := array_remove(array[
    case when v.rfc is null then 'RFC' end,
    case when v.regimen_fiscal is null then 'régimen fiscal' end,
    case when v.codigo_postal is null then 'código postal' end,
    case when v.uso_cfdi is null then 'uso de CFDI' end], null);
  return jsonb_build_object(
    'pedido_id', v.id, 'folio', v.folio, 'es_mostrador', v.es_mostrador,
    'ordenes', v_ordenes,
    'total', round(v_total, 2),
    'anticipo', v.anticipo,
    'abonos', v_abonos,
    'anticipos_ordenes', v_ant_ord,
    'saldo', round(v_total - v.anticipo - v_abonos - v_ant_ord, 2),
    'requiere_factura', v.requiere_factura,
    'datos_fiscales_incompletos', v.requiere_factura and cardinality(v_faltan) > 0,
    'faltan_datos_fiscales', case when v.requiere_factura then to_jsonb(v_faltan) else '[]'::jsonb end);
end; $$;

-- Para "Agregar a pedido existente" y la lista de pedidos.
create or replace function public.pedidos_lista(p_incluir_eliminados boolean default false)
returns table (id uuid, folio text, client_id uuid, cliente text, es_mostrador boolean, created_at timestamptz,
               deleted_at timestamptz, ordenes int, total numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.folio, p.client_id, p.cliente, p.es_mostrador, p.created_at, p.deleted_at,
         (select count(*)::int from public.orders o where o.pedido_id = p.id and o.eliminada_en is null),
         (t->>'total')::numeric, (t->>'saldo')::numeric
    from (select * from public.pedidos
           where public.fin_puede_ver() and (p_incluir_eliminados or deleted_at is null)) p
    cross join lateral (select public.pedido_totales(p.id) t) x
   order by p.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- 6) Permisos: nada para anon/public; las públicas, a authenticated.
-- ---------------------------------------------------------------------
revoke execute on function public.pedidos_folio_trg() from public;
revoke execute on function public.pedido_crear(jsonb, uuid[]) from public;
revoke execute on function public.pedido_actualizar(uuid, jsonb) from public;
revoke execute on function public.pedido_agregar_orden(uuid, uuid) from public;
revoke execute on function public.pedido_quitar_orden(uuid) from public;
revoke execute on function public.pedido_eliminar(uuid) from public;
revoke execute on function public.create_pedido_abono(uuid, numeric, text, text, text) from public;
revoke execute on function public.delete_pedido_abono(uuid) from public;
revoke execute on function public.pedido_totales(uuid) from public;
revoke execute on function public.pedidos_lista(boolean) from public;
grant execute on function public.pedido_crear(jsonb, uuid[]) to authenticated;
grant execute on function public.pedido_actualizar(uuid, jsonb) to authenticated;
grant execute on function public.pedido_agregar_orden(uuid, uuid) to authenticated;
grant execute on function public.pedido_quitar_orden(uuid) to authenticated;
grant execute on function public.pedido_eliminar(uuid) to authenticated;
grant execute on function public.create_pedido_abono(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.delete_pedido_abono(uuid) to authenticated;
grant execute on function public.pedido_totales(uuid) to authenticated;
grant execute on function public.pedidos_lista(boolean) to authenticated;

-- =====================================================================
-- Verificación (solo lectura) después de aplicar:
--   select to_regclass('public.pedidos'), to_regclass('public.pedido_abonos');      -- no null
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'orders' and column_name = 'pedido_id';                     -- YES
--   select count(*) from public.orders where pedido_id is not null;                -- 0
--   select has_function_privilege('anon', 'public.pedido_crear(jsonb, uuid[])', 'EXECUTE'); -- false
-- =====================================================================
