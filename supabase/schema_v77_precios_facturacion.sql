-- =====================================================================
-- V77 — Precios y facturación por orden  (aplicado 2026-09-26)
-- =====================================================================
-- Solo cambios ADITIVOS (tablas/funciones nuevas). Lo único que toca algo
-- existente es la Parte E (candado de entrega en update_order_status, parche
-- sobre la definición VIVA, mismo método que V66b) y la Parte F (opcional).
--
-- Reglas de diseño:
--  * Los precios NO van dentro de orders.items (esa columna la puede leer
--    cualquier rol con sesión, incluida producción). Van en tablas nuevas con
--    RLS solo para los roles de dinero (fin_puede_ver()).
--  * Anticipos/abonos: se REUSA la tabla `anticipos` (V16). No se duplica.
--    orders.total_orden (V42, total manual) se queda como respaldo para
--    órdenes viejas; el total nuevo sale de los precios.
--  * Todo el cálculo (subtotal, IVA, total, saldo, faltantes) vive aquí, en
--    orden_totales(); el frontend solo lo muestra.
--  * IVA: cada orden lleva "precios_incluyen_iva" (default true = con IVA).
--      - Sin factura: total = lo capturado (no se cobra IVA aparte).
--      - Con factura y precios CON IVA: total = lo capturado; se desglosa
--        subtotal = total/1.16 e IVA = total - subtotal.
--      - Con factura y precios SIN IVA ("más IVA"): IVA = 16% del subtotal;
--        total = subtotal + IVA.
--  * Permisos: ver = admin_general, admin_tienda, admin_fabrica, ventas,
--    contabilidad. Editar precios/facturación = admin_general, admin_tienda,
--    ventas. Razones sociales: alta/edición = ventas, contabilidad,
--    admin_tienda, admin_general (mismos que la constancia fiscal, V42).
--    Producción/corte/bordado/etc. y captura_produccion: nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Helpers de permiso (funciones nuevas)
-- ---------------------------------------------------------------------
create or replace function public.fin_puede_ver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in
    ('admin_general', 'admin_tienda', 'admin_fabrica', 'ventas', 'contabilidad');
$$;

create or replace function public.fin_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_general', 'admin_tienda', 'ventas');
$$;

create or replace function public.fin_puede_editar_razones() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role(), '') in ('admin_general', 'admin_tienda', 'ventas', 'contabilidad');
$$;

revoke execute on function public.fin_puede_ver() from public;
revoke execute on function public.fin_puede_editar() from public;
revoke execute on function public.fin_puede_editar_razones() from public;
grant execute on function public.fin_puede_ver() to authenticated;
grant execute on function public.fin_puede_editar() to authenticated;
grant execute on function public.fin_puede_editar_razones() to authenticated;

-- ---------------------------------------------------------------------
-- B) Tablas nuevas
-- ---------------------------------------------------------------------
-- B1) Razones sociales del cliente (un cliente puede tener varias)
create table if not exists public.cliente_razones_sociales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  razon_social text not null,
  rfc text not null,
  regimen_fiscal text not null,
  cp_fiscal text not null,
  uso_cfdi text not null,
  correo_factura text,
  predeterminada boolean not null default false,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cliente_razones_cliente_idx on public.cliente_razones_sociales (cliente_id);
-- Solo una predeterminada por cliente
create unique index if not exists cliente_razones_una_predeterminada
  on public.cliente_razones_sociales (cliente_id) where predeterminada and activa;

-- B2) Precio por renglón (prenda) de la orden. item_index = posición en
--     orders.items; `prenda` = snapshot del nombre para detectar que las
--     prendas cambiaron después de fijar precios.
create table if not exists public.orden_precios (
  order_id uuid not null references public.orders(id) on delete cascade,
  item_index integer not null check (item_index >= 0),
  prenda text not null,
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  extras jsonb not null default '[]'::jsonb,   -- [{"concepto":"Bordado espalda","monto":25}, ...] (monto por pieza)
  updated_at timestamptz not null default now(),
  primary key (order_id, item_index)
);

-- B3) Facturación de la orden (+ snapshot fiscal al elegir la razón social)
create table if not exists public.orden_facturacion (
  order_id uuid primary key references public.orders(id) on delete cascade,
  requiere_factura boolean not null default false,
  precios_incluyen_iva boolean not null default true,
  razon_social_id uuid references public.cliente_razones_sociales(id) on delete set null,
  fiscal_snapshot jsonb,                        -- copia de los datos fiscales al momento de elegir
  updated_at timestamptz not null default now()
);

-- B4) Config del candado (fecha desde la cual aplica)
create table if not exists public.fin_config (
  clave text primary key,
  valor text not null
);
insert into public.fin_config (clave, valor)
values ('candado_desde', now()::text)
on conflict (clave) do nothing;

-- Acceso: RLS, lectura solo roles de dinero, nadie escribe directo, anon nada.
alter table public.cliente_razones_sociales enable row level security;
alter table public.orden_precios enable row level security;
alter table public.orden_facturacion enable row level security;
alter table public.fin_config enable row level security;

drop policy if exists "fin lee razones" on public.cliente_razones_sociales;
create policy "fin lee razones" on public.cliente_razones_sociales for select to authenticated using (public.fin_puede_ver());
drop policy if exists "fin lee precios" on public.orden_precios;
create policy "fin lee precios" on public.orden_precios for select to authenticated using (public.fin_puede_ver());
drop policy if exists "fin lee facturacion" on public.orden_facturacion;
create policy "fin lee facturacion" on public.orden_facturacion for select to authenticated using (public.fin_puede_ver());

revoke all on public.cliente_razones_sociales, public.orden_precios, public.orden_facturacion, public.fin_config
  from public, anon, authenticated;
grant select on public.cliente_razones_sociales, public.orden_precios, public.orden_facturacion to authenticated;

-- ---------------------------------------------------------------------
-- C) RPCs de escritura (SECURITY DEFINER, anon sin acceso)
-- ---------------------------------------------------------------------
create or replace function public.guardar_razon_social(
  p_id uuid, p_cliente_id uuid, p_razon_social text, p_rfc text, p_regimen text,
  p_cp text, p_uso_cfdi text, p_correo text, p_predeterminada boolean, p_activa boolean default true
) returns public.cliente_razones_sociales
language plpgsql security definer set search_path = public as $$
declare v_row public.cliente_razones_sociales; v_pred boolean := coalesce(p_predeterminada, false);
begin
  if not public.fin_puede_editar_razones() then
    raise exception 'No tienes permiso para editar razones sociales.';
  end if;
  if btrim(coalesce(p_razon_social,'')) = '' or btrim(coalesce(p_rfc,'')) = ''
     or btrim(coalesce(p_regimen,'')) = '' or btrim(coalesce(p_cp,'')) = '' or btrim(coalesce(p_uso_cfdi,'')) = '' then
    raise exception 'Razón social, RFC, régimen fiscal, código postal y uso de CFDI son obligatorios.';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception 'El cliente no existe.';
  end if;
  -- la primera razón social de un cliente queda como predeterminada
  if not exists (select 1 from public.cliente_razones_sociales r
                 where r.cliente_id = p_cliente_id and r.activa and r.id is distinct from p_id) then
    v_pred := true;
  end if;
  if v_pred then
    update public.cliente_razones_sociales set predeterminada = false
     where cliente_id = p_cliente_id and predeterminada and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.cliente_razones_sociales
      (cliente_id, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi, correo_factura, predeterminada, activa)
    values (p_cliente_id, btrim(p_razon_social), upper(btrim(p_rfc)), btrim(p_regimen), btrim(p_cp),
            btrim(p_uso_cfdi), nullif(btrim(coalesce(p_correo,'')), ''), v_pred, coalesce(p_activa, true))
    returning * into v_row;
  else
    update public.cliente_razones_sociales
       set razon_social = btrim(p_razon_social), rfc = upper(btrim(p_rfc)), regimen_fiscal = btrim(p_regimen),
           cp_fiscal = btrim(p_cp), uso_cfdi = btrim(p_uso_cfdi),
           correo_factura = nullif(btrim(coalesce(p_correo,'')), ''),
           predeterminada = v_pred and coalesce(p_activa, activa), activa = coalesce(p_activa, activa),
           updated_at = now()
     where id = p_id and cliente_id = p_cliente_id
    returning * into v_row;
    if v_row.id is null then raise exception 'La razón social no existe.'; end if;
  end if;
  return v_row;
end; $$;

-- Precios de una orden: reemplaza TODOS los renglones de la orden.
-- p_renglones = [{"item_index":0,"prenda":"Playera","precio_unitario":180,"extras":[{"concepto":"Bordado espalda","monto":25}]}, ...]
create or replace function public.set_orden_precios(p_order_id uuid, p_renglones jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; r jsonb; e jsonb;
begin
  if not public.fin_puede_editar() then
    raise exception 'No tienes permiso para capturar precios.';
  end if;
  select * into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;
  if v_o.status = 'completado' then raise exception 'La orden ya fue entregada; sus precios ya no se pueden cambiar.'; end if;
  if jsonb_typeof(coalesce(p_renglones, '[]'::jsonb)) <> 'array' then raise exception 'Formato de renglones inválido.'; end if;

  delete from public.orden_precios where order_id = p_order_id;
  for r in select * from jsonb_array_elements(coalesce(p_renglones, '[]'::jsonb)) loop
    if (r->>'precio_unitario') is null or (r->>'precio_unitario')::numeric < 0 then
      raise exception 'Cada prenda necesita un precio unitario (0 o más).';
    end if;
    for e in select * from jsonb_array_elements(coalesce(r->'extras', '[]'::jsonb)) loop
      if btrim(coalesce(e->>'concepto','')) = '' or (e->>'monto') is null or (e->>'monto')::numeric < 0 then
        raise exception 'Cada extra necesita concepto y monto (0 o más).';
      end if;
    end loop;
    insert into public.orden_precios (order_id, item_index, prenda, precio_unitario, extras)
    values (p_order_id, (r->>'item_index')::int, coalesce(r->>'prenda',''), round((r->>'precio_unitario')::numeric, 2),
            coalesce(r->'extras', '[]'::jsonb));
  end loop;
  return public.orden_totales(p_order_id);
end; $$;

-- Facturación de la orden. Al pedir factura exige razón social del MISMO cliente y guarda snapshot.
create or replace function public.set_orden_facturacion(
  p_order_id uuid, p_requiere boolean, p_incluye_iva boolean, p_razon_social_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_rs public.cliente_razones_sociales; v_snap jsonb := null;
begin
  if not public.fin_puede_editar() then
    raise exception 'No tienes permiso para editar la facturación.';
  end if;
  select * into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  if v_o.eliminada_en is not null then raise exception 'Esta orden fue eliminada y ya no admite cambios.'; end if;
  if v_o.status = 'completado' then raise exception 'La orden ya fue entregada; su facturación ya no se puede cambiar.'; end if;

  if coalesce(p_requiere, false) then
    if p_razon_social_id is null then raise exception 'Elige la razón social para la factura.'; end if;
    select * into v_rs from public.cliente_razones_sociales r where r.id = p_razon_social_id and r.activa;
    if v_rs.id is null then raise exception 'La razón social no existe o está inactiva.'; end if;
    if v_o.client_id is distinct from v_rs.cliente_id then
      raise exception 'Esa razón social no pertenece al cliente de esta orden.';
    end if;
    v_snap := jsonb_build_object(
      'razon_social_id', v_rs.id, 'razon_social', v_rs.razon_social, 'rfc', v_rs.rfc,
      'regimen_fiscal', v_rs.regimen_fiscal, 'cp_fiscal', v_rs.cp_fiscal, 'uso_cfdi', v_rs.uso_cfdi,
      'correo_factura', v_rs.correo_factura, 'capturado_en', now());
  end if;

  insert into public.orden_facturacion (order_id, requiere_factura, precios_incluyen_iva, razon_social_id, fiscal_snapshot)
  values (p_order_id, coalesce(p_requiere, false), coalesce(p_incluye_iva, true),
          case when coalesce(p_requiere, false) then p_razon_social_id end, v_snap)
  on conflict (order_id) do update
    set requiere_factura = excluded.requiere_factura, precios_incluyen_iva = excluded.precios_incluyen_iva,
        razon_social_id = excluded.razon_social_id, fiscal_snapshot = excluded.fiscal_snapshot, updated_at = now();
  return public.orden_totales(p_order_id);
end; $$;

-- ---------------------------------------------------------------------
-- D) Cálculo y consultas (una sola fuente de verdad; solo roles de dinero)
-- ---------------------------------------------------------------------
-- Renglones (prendas con cantidad > 0) sin precio válido + faltante fiscal.
create or replace function public.orden_faltantes(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sin jsonb; v_fact public.orden_facturacion;
begin
  select coalesce(jsonb_agg(jsonb_build_object('item_index', t.idx, 'prenda', t.garment) order by t.idx), '[]'::jsonb)
    into v_sin
  from (
    select (x.ord - 1)::int as idx, x.item->>'garment' as garment,
           coalesce((select sum(case when (s->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' then (s->>'cantidad')::numeric else 0 end)
                       from jsonb_array_elements(coalesce(x.item->'sizes', '[]'::jsonb)) s), 0) as cant
    from public.orders o, jsonb_array_elements(o.items) with ordinality as x(item, ord)
    where o.id = p_order_id
  ) t
  where t.cant > 0
    and not exists (select 1 from public.orden_precios p
                    where p.order_id = p_order_id and p.item_index = t.idx and p.prenda = coalesce(t.garment, ''));
  select * into v_fact from public.orden_facturacion f where f.order_id = p_order_id;
  return jsonb_build_object(
    'renglones_sin_precio', v_sin,
    'falta_razon_social', coalesce(v_fact.requiere_factura, false) and v_fact.razon_social_id is null);
end; $$;

create or replace function public.orden_totales(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fact public.orden_facturacion; v_req boolean; v_inc boolean;
  v_sub numeric := 0; v_base numeric; v_iva numeric := 0; v_total numeric; v_ant numeric; v_falt jsonb;
  v_renglones jsonb;
begin
  if not public.fin_puede_ver() then
    raise exception 'No tienes permiso para ver precios ni facturación.';
  end if;
  select * into v_fact from public.orden_facturacion f where f.order_id = p_order_id;
  v_req := coalesce(v_fact.requiere_factura, false);
  v_inc := coalesce(v_fact.precios_incluyen_iva, true);

  with it as (
    select (x.ord - 1)::int as idx, x.item->>'garment' as garment,
           coalesce((select sum(case when (s->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' then (s->>'cantidad')::numeric else 0 end)
                       from jsonb_array_elements(coalesce(x.item->'sizes', '[]'::jsonb)) s), 0) as cant
    from public.orders o, jsonb_array_elements(o.items) with ordinality as x(item, ord)
    where o.id = p_order_id
  ), r as (
    select it.idx, it.garment, it.cant, p.precio_unitario, p.extras,
           coalesce((select sum((e->>'monto')::numeric) from jsonb_array_elements(p.extras) e), 0) as extras_pieza
    from it join public.orden_precios p
      on p.order_id = p_order_id and p.item_index = it.idx and p.prenda = coalesce(it.garment, '')
  )
  select coalesce(sum(cant * (precio_unitario + extras_pieza)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'item_index', idx, 'prenda', garment, 'cantidad', cant, 'precio_unitario', precio_unitario,
           'extras', extras, 'extras_por_pieza', extras_pieza,
           'subtotal_renglon', round(cant * (precio_unitario + extras_pieza), 2)) order by idx), '[]'::jsonb)
    into v_sub, v_renglones
  from r;

  if v_req and v_inc then
    v_total := v_sub; v_base := round(v_sub / 1.16, 2); v_iva := v_total - v_base;
  elsif v_req then
    v_base := v_sub; v_iva := round(v_sub * 0.16, 2); v_total := v_base + v_iva;
  else
    v_base := v_sub; v_iva := 0; v_total := v_sub;
  end if;
  v_total := round(v_total, 2);

  select coalesce(sum(a.monto), 0) into v_ant from public.anticipos a where a.order_id = p_order_id;
  v_falt := public.orden_faltantes(p_order_id);

  return jsonb_build_object(
    'requiere_factura', v_req, 'precios_incluyen_iva', v_inc,
    'renglones', v_renglones,
    'subtotal', v_base, 'iva', v_iva, 'total', v_total,
    'anticipos', v_ant, 'saldo', round(v_total - v_ant, 2),
    'faltantes', v_falt,
    'lista_para_entregar',
      jsonb_array_length(v_falt->'renglones_sin_precio') = 0 and not (v_falt->>'falta_razon_social')::boolean);
end; $$;

-- Último precio unitario (y extras) cobrado a un cliente por una prenda.
create or replace function public.ultimo_precio_cliente_prenda(p_cliente_id uuid, p_prenda text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.fin_puede_ver() then raise exception 'No tienes permiso para ver precios.'; end if;
  select jsonb_build_object('precio_unitario', p.precio_unitario, 'extras', p.extras, 'order_number', o.order_number)
    into v
  from public.orden_precios p join public.orders o on o.id = p.order_id
  where o.client_id = p_cliente_id and lower(p.prenda) = lower(btrim(p_prenda)) and o.eliminada_en is null
  order by o.created_at desc limit 1;
  return v;
end; $$;

-- Resumen de entrega: todo en un solo lugar (vista previa + PDF).
create or replace function public.orden_resumen_entrega(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_o public.orders; v_c public.clientes; v_fact public.orden_facturacion; v_ant jsonb;
begin
  if not public.fin_puede_ver() then raise exception 'No tienes permiso para ver precios ni facturación.'; end if;
  select * into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null then raise exception 'Orden no encontrada.'; end if;
  select * into v_c from public.clientes c where c.id = v_o.client_id;
  select * into v_fact from public.orden_facturacion f where f.order_id = p_order_id;
  select coalesce(jsonb_agg(jsonb_build_object('fecha', a.created_at, 'monto', a.monto, 'metodo_pago', a.metodo_pago,
                                               'recibido_por', a.recibido_por) order by a.created_at), '[]'::jsonb)
    into v_ant from public.anticipos a where a.order_id = p_order_id;
  return jsonb_build_object(
    'orden', jsonb_build_object('id', v_o.id, 'order_number', v_o.order_number, 'client_name', v_o.client_name,
             'description', v_o.description, 'requested_delivery_date', v_o.requested_delivery_date,
             'status', v_o.status, 'items', v_o.items),
    'cliente', case when v_c.id is null then null else
             jsonb_build_object('id', v_c.id, 'nombre', v_c.nombre, 'telefono', v_c.telefono, 'correo', v_c.correo) end,
    'facturacion', jsonb_build_object('requiere_factura', coalesce(v_fact.requiere_factura, false),
             'precios_incluyen_iva', coalesce(v_fact.precios_incluyen_iva, true), 'fiscal', v_fact.fiscal_snapshot),
    'totales', public.orden_totales(p_order_id),
    'anticipos', v_ant);
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'guardar_razon_social(uuid, uuid, text, text, text, text, text, text, boolean, boolean)',
    'set_orden_precios(uuid, jsonb)', 'set_orden_facturacion(uuid, boolean, boolean, uuid)',
    'orden_faltantes(uuid)', 'orden_totales(uuid)', 'ultimo_precio_cliente_prenda(uuid, text)',
    'orden_resumen_entrega(uuid)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- E) Candado de entrega — parche a update_order_status (definición VIVA)
--    Al pasar a 'completado': si la orden es NUEVA (creada desde
--    fin_config.candado_desde) exige precio en todas las prendas y, si pide
--    factura, razón social. Las órdenes anteriores NO se bloquean.
--    El chequeo va justo antes del UPDATE, o sea DESPUÉS de las validaciones de
--    rol/eliminada/cancelada que ya tiene la función.
-- ---------------------------------------------------------------------
do $$
declare d text; nuevo text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_order_status';
  d := pg_get_functiondef(v_oid);
  nuevo := regexp_replace(d, '(update public\.orders set status)',
    'if p_new_status = ''completado'' then perform public.fin_validar_entrega(p_order_id); end if;
  \1', 'i');
  if nuevo = d then raise exception 'No pude parchear update_order_status. No se aplicó nada.'; end if;
  execute nuevo;
end $$;

create or replace function public.fin_validar_entrega(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_desde timestamptz; v_falt jsonb; v_msg text := '';
begin
  select * into v_o from public.orders o where o.id = p_order_id;
  select valor::timestamptz into v_desde from public.fin_config where clave = 'candado_desde';
  if v_o.id is null or v_o.created_at < v_desde then return; end if;   -- órdenes anteriores: sin candado
  v_falt := public.orden_faltantes(p_order_id);
  if jsonb_array_length(v_falt->'renglones_sin_precio') > 0 then
    v_msg := 'Falta precio en: ' || (select string_agg(coalesce(e->>'prenda', 'prenda ' || ((e->>'item_index')::int + 1)), ', ')
                                     from jsonb_array_elements(v_falt->'renglones_sin_precio') e) || '. ';
  end if;
  if (v_falt->>'falta_razon_social')::boolean then
    v_msg := v_msg || 'La orden requiere factura y no tiene razón social. ';
  end if;
  if v_msg <> '' then
    raise exception 'No se puede marcar como entregada. %', btrim(v_msg);
  end if;
end; $$;
revoke execute on function public.fin_validar_entrega(uuid) from public;
-- (sin grant a authenticated: solo la llama update_order_status, que es security definer)

-- ---------------------------------------------------------------------
-- F) Anticipos: lectura solo para roles de dinero (antes: cualquier rol con sesión)
-- ---------------------------------------------------------------------
drop policy if exists "Lectura autenticada de anticipos" on public.anticipos;
drop policy if exists "fin lee anticipos" on public.anticipos;
create policy "fin lee anticipos" on public.anticipos for select to authenticated using (public.fin_puede_ver());
