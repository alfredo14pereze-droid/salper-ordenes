-- ============================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V23: etapas paralelas por orden (Fase 2, Parte 2)
--
-- Reemplaza la idea de "una orden solo puede estar en UN estado a la vez"
-- por un modelo donde cada etapa de piso (corte, sublimado, producción,
-- bordado, terminado) vive en su PROPIA fila con su propio estado
-- (pendiente/en_proceso/completado), así que producción y terminado (o
-- corte y bordado, etc.) pueden estar activos al mismo tiempo en la misma
-- orden — que es justo lo que pidió el usuario, confirmado antes de
-- aplicar esta migración a la base compartida.
--
-- Plantillas por tipo de orden (confirmadas con el usuario):
--   sublimacion: sublimado -> corte -> produccion -> terminado
--   escolar:     corte -> produccion -> bordado -> terminado
--   industrial:  corte -> produccion -> bordado -> terminado
--   basquetbol:  misma plantilla que escolar/industrial (el usuario no lo
--                mencionó explícitamente — inferido por similitud; ajustable
--                después con un simple INSERT/DELETE en plantillas_etapas,
--                no requiere otra migración).
-- `bordado` es válido en el enum de etapas pero NO se genera para
-- `sublimacion` — llega como opcional por orden individual en la Parte 3
-- (toggle "¿Incluye bordado?").
--
-- Lo que SIGUE viviendo en orders.status (sin tocar, ya probado en la
-- Parte 1): el arranque de todo el pedido (en_confirmacion -> confirmado)
-- y el cierre (completado) — son decisiones de "todo el pedido", no de
-- una etapa específica.
--
-- orders.status dentro de ese rango deja de escribirse directo por rol de
-- etapa — pasa a ser CALCULADO por recompute_order_status() a partir de
-- orden_etapas (la etapa de mayor secuencia que ya arrancó), para que el
-- Dashboard/calendario/tarjetas/PDF sigan funcionando sin reescribirlos.
-- Esto es un resumen de un vistazo, no la verdad completa — cuando dos
-- etapas están en_proceso a la vez, orders.status solo puede mostrar una
-- (gana la de secuencia más alta); la verdad completa vive en
-- orden_etapas y se muestra en el detalle de la orden.
--
-- Esto TAMBIÉN resuelve el límite estructural documentado en V21: antes
-- los 5 roles de etapa compartían permiso de escritura sobre TODO
-- orders.status porque no había granularidad; ahora cada rol solo puede
-- tocar su propia fila en orden_etapas vía update_orden_etapa (mismo
-- nombre de rol que de etapa, comparación 1:1). update_order_status se
-- angosta a los dos "bookends" (confirmar/completar).
--
-- Aditivo en el sentido de "no rompe tablas ni datos": 2 tablas nuevas,
-- 2 valores nuevos en el CHECK de orders.status (en_produccion/produccion,
-- pedidos por el usuario), y las 10 órdenes reales existentes al momento
-- de escribir esto (verificadas antes de aplicar) se migran a
-- orden_etapas infiriendo su estado por etapa desde su status actual —
-- sin tocar orders.status de ninguna orden existente.
--
-- ---------------------------------------------------------------------
-- PLAN DE ROLLBACK (mostrado al usuario antes de aplicar esta migración):
--   1. drop table if exists public.orden_etapas;
--      drop table if exists public.plantillas_etapas;
--   2. drop function if exists public.update_orden_etapa(uuid, text, text);
--      drop function if exists public.recompute_order_status(uuid);
--   3. Revertir create_order y update_order_status a la versión de V22
--      (sin auto-insert de orden_etapas, sin la restricción de rol
--      angostada) — el archivo schema_v22_fixes_roles.sql + schema_v21
--      ya tienen esas versiones completas si hace falta volver a pegarlas.
--   4. Revertir orders_status_check a los 11 valores de antes — SOLO
--      seguro si ninguna orden quedó con status en_produccion/produccion
--      entre que se aplica y se revierte (si eso pasa, reclasificar esas
--      órdenes a mano primero).
--   Nada de esto toca profiles, anticipos, pedidos_tienda, ni ningún otro
--   módulo — el radio de esta migración es orders + las 2 tablas nuevas.
-- ---------------------------------------------------------------------
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) orders.status: agrega los 2 valores nuevos que pidió el usuario para
--    reflejar la etapa de producción en el resumen de una sola columna.
-- --------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'en_confirmacion', 'confirmado',
  'en_corte', 'cortado',
  'en_sublimado', 'sublimado',
  'en_produccion', 'produccion',
  'en_bordado', 'bordado',
  'en_terminado', 'terminado',
  'completado'
));

-- --------------------------------------------------------------------------
-- 2) plantillas_etapas: qué etapas le tocan a cada tipo de orden y en qué
--    secuencia (para mostrarlas ordenadas — no implica que deban
--    completarse en ese orden, pueden estar activas varias a la vez).
-- --------------------------------------------------------------------------
create table if not exists public.plantillas_etapas (
  id uuid primary key default gen_random_uuid(),
  order_type_key text not null references public.order_types(key) on delete cascade,
  etapa text not null check (etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')),
  orden_secuencia integer not null,
  created_at timestamptz not null default now(),
  unique (order_type_key, etapa)
);
alter table public.plantillas_etapas enable row level security;
create policy "Lectura pública plantillas_etapas" on public.plantillas_etapas
  for select to anon, authenticated using (true);
grant select on public.plantillas_etapas to anon, authenticated;

insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia) values
  ('sublimacion', 'sublimado', 1),
  ('sublimacion', 'corte', 2),
  ('sublimacion', 'produccion', 3),
  ('sublimacion', 'terminado', 4),
  ('escolar', 'corte', 1),
  ('escolar', 'produccion', 2),
  ('escolar', 'bordado', 3),
  ('escolar', 'terminado', 4),
  ('industrial', 'corte', 1),
  ('industrial', 'produccion', 2),
  ('industrial', 'bordado', 3),
  ('industrial', 'terminado', 4),
  ('basquetbol', 'corte', 1),
  ('basquetbol', 'produccion', 2),
  ('basquetbol', 'bordado', 3),
  ('basquetbol', 'terminado', 4)
on conflict (order_type_key, etapa) do nothing;

-- --------------------------------------------------------------------------
-- 3) orden_etapas: una fila por etapa por orden — aquí es donde dos
--    etapas pueden estar en_proceso al mismo tiempo, porque son filas
--    independientes.
-- --------------------------------------------------------------------------
create table if not exists public.orden_etapas (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  etapa text not null check (etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'completado')),
  responsable_id uuid references auth.users(id) on delete set null,
  iniciado_en timestamptz,
  completado_en timestamptz,
  orden_secuencia integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, etapa)
);
create index if not exists orden_etapas_order_idx on public.orden_etapas (order_id);
alter table public.orden_etapas enable row level security;
create policy "Lectura pública orden_etapas" on public.orden_etapas
  for select to anon, authenticated using (true);
grant select on public.orden_etapas to anon, authenticated;

-- --------------------------------------------------------------------------
-- 4) recompute_order_status: recalcula orders.status (el resumen de una
--    sola columna) a partir de orden_etapas — la etapa de mayor secuencia
--    que ya arrancó (en_proceso o completado) gana. No toca órdenes
--    canceladas, en_confirmacion, ni ya completadas (esos 3 son
--    decisiones de todo el pedido, no derivadas de las etapas).
-- --------------------------------------------------------------------------
create or replace function public.recompute_order_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current_status text;
  v_cancelled_at timestamptz;
  v_best_etapa text;
  v_best_estado text;
  v_new_status text;
  r record;
begin
  select status, cancelled_at into v_current_status, v_cancelled_at
  from public.orders where id = p_order_id;

  if v_current_status is null then
    return;
  end if;
  if v_cancelled_at is not null or v_current_status in ('en_confirmacion', 'completado') then
    return;
  end if;

  v_best_etapa := null;
  for r in
    select etapa, estado
    from public.orden_etapas
    where order_id = p_order_id and estado in ('en_proceso', 'completado')
    order by orden_secuencia desc
    limit 1
  loop
    v_best_etapa := r.etapa;
    v_best_estado := r.estado;
  end loop;

  if v_best_etapa is null then
    v_new_status := 'confirmado';
  else
    v_new_status := case v_best_etapa
      when 'corte' then case when v_best_estado = 'completado' then 'cortado' else 'en_corte' end
      when 'sublimado' then case when v_best_estado = 'completado' then 'sublimado' else 'en_sublimado' end
      when 'produccion' then case when v_best_estado = 'completado' then 'produccion' else 'en_produccion' end
      when 'bordado' then case when v_best_estado = 'completado' then 'bordado' else 'en_bordado' end
      when 'terminado' then case when v_best_estado = 'completado' then 'terminado' else 'en_terminado' end
      else v_current_status
    end;
  end if;

  if v_new_status is distinct from v_current_status then
    update public.orders set status = v_new_status, updated_at = now() where id = p_order_id;
  end if;
end;
$function$;
revoke execute on function public.recompute_order_status(uuid) from public;
grant execute on function public.recompute_order_status(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 5) update_orden_etapa: único punto de escritura para avanzar la etapa
--    de UNA orden. El nombre del rol dueño coincide 1:1 con el nombre de
--    la etapa (rol 'corte' -> etapa 'corte', etc.) — admin_fabrica y
--    admin_general pueden todas.
-- --------------------------------------------------------------------------
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
revoke execute on function public.update_orden_etapa(uuid, text, text) from public;
grant execute on function public.update_orden_etapa(uuid, text, text) to authenticated;

-- --------------------------------------------------------------------------
-- 6) create_order: auto-genera las filas de orden_etapas según la
--    plantilla del tipo de orden elegido, todas en 'pendiente'. Mismo
--    cuerpo de V21/V22 más este bloque — sin cambio de firma, no hace
--    falta DROP FUNCTION.
-- --------------------------------------------------------------------------
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
  insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
  select v_order.id, pe.etapa, 'pendiente', pe.orden_secuencia
  from public.plantillas_etapas pe
  where pe.order_type_key = v_order.order_type_key;
  return v_order;
end;
$function$;

-- --------------------------------------------------------------------------
-- 7) update_order_status: se angosta a los dos "bookends" de todo el
--    pedido — confirmar (abierto a los 5 roles de etapa + admin_fabrica/
--    admin_general, igual que antes) y completar (ahora exclusivo de
--    admin_fabrica/admin_general — antes cualquier rol de etapa podía,
--    era el límite estructural documentado en V21). Cualquier otro valor
--    (los estados por-etapa, para corrección manual) solo admin_fabrica/
--    admin_general — el avance normal por etapa individual ya vive en
--    update_orden_etapa.
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

-- --------------------------------------------------------------------------
-- 8) Migración de datos: las órdenes existentes (10 al momento de
--    escribir esto, verificadas antes de aplicar) reciben sus filas de
--    orden_etapas infiriendo el estado de cada etapa desde la POSICIÓN de
--    su status actual dentro de la secuencia lineal vieja — nunca se
--    toca orders.status de ninguna orden existente, solo se generan las
--    filas nuevas.
-- --------------------------------------------------------------------------
do $$
declare
  r record;
  v_old_idx integer;
  old_order_list text[] := array[
    'en_confirmacion', 'confirmado', 'en_corte', 'cortado', 'en_sublimado', 'sublimado',
    'en_bordado', 'bordado', 'en_terminado', 'terminado', 'completado'
  ];
  v_corte text;
  v_sublimado text;
  v_produccion text;
  v_bordado text;
  v_terminado text;
begin
  for r in select id, order_type_key, status from public.orders
  loop
    v_old_idx := array_position(old_order_list, r.status);
    if v_old_idx is null then
      continue;
    end if;

    v_corte := case when v_old_idx >= 4 then 'completado' when v_old_idx = 3 then 'en_proceso' else 'pendiente' end;
    v_sublimado := case when v_old_idx >= 6 then 'completado' when v_old_idx = 5 then 'en_proceso' else 'pendiente' end;
    v_produccion := case when v_old_idx >= 7 then 'completado' else 'pendiente' end;
    v_bordado := case when v_old_idx >= 8 then 'completado' when v_old_idx = 7 then 'en_proceso' else 'pendiente' end;
    v_terminado := case when v_old_idx >= 10 then 'completado' when v_old_idx = 9 then 'en_proceso' else 'pendiente' end;

    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
    select r.id, 'corte', v_corte,
      (select orden_secuencia from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'corte'),
      case when v_corte in ('en_proceso', 'completado') then now() else null end,
      case when v_corte = 'completado' then now() else null end
    where exists (select 1 from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'corte')
    on conflict (order_id, etapa) do nothing;

    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
    select r.id, 'sublimado', v_sublimado,
      (select orden_secuencia from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'sublimado'),
      case when v_sublimado in ('en_proceso', 'completado') then now() else null end,
      case when v_sublimado = 'completado' then now() else null end
    where exists (select 1 from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'sublimado')
    on conflict (order_id, etapa) do nothing;

    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
    select r.id, 'produccion', v_produccion,
      (select orden_secuencia from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'produccion'),
      case when v_produccion in ('en_proceso', 'completado') then now() else null end,
      case when v_produccion = 'completado' then now() else null end
    where exists (select 1 from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'produccion')
    on conflict (order_id, etapa) do nothing;

    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
    select r.id, 'bordado', v_bordado,
      (select orden_secuencia from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'bordado'),
      case when v_bordado in ('en_proceso', 'completado') then now() else null end,
      case when v_bordado = 'completado' then now() else null end
    where exists (select 1 from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'bordado')
    on conflict (order_id, etapa) do nothing;

    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia, iniciado_en, completado_en)
    select r.id, 'terminado', v_terminado,
      (select orden_secuencia from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'terminado'),
      case when v_terminado in ('en_proceso', 'completado') then now() else null end,
      case when v_terminado = 'completado' then now() else null end
    where exists (select 1 from public.plantillas_etapas where order_type_key = r.order_type_key and etapa = 'terminado')
    on conflict (order_id, etapa) do nothing;
  end loop;
end $$;
