-- ============================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V25: bordado condicional POR PRENDA (Fase 2, Parte 3)
--
-- El usuario aclaró explícitamente cómo debe funcionar esto (después de
-- que en la Parte 2 bordado había quedado como etapa fija de la plantilla
-- de escolar/industrial): "el bordado va a ser un botón en cada prenda
-- para indicar si lleva bordado o no cada prenda, y si no lleva, que no
-- tenga que pasar por ese paso de la producción". Esto reemplaza el
-- diseño de V23 para bordado — ya NO es "todo escolar/industrial lleva
-- bordado siempre": ahora es condicional por prenda, para CUALQUIER tipo
-- de orden (incluida sublimación, que en V23 no tenía bordado en su
-- plantilla en absoluto).
--
-- `items` (JSONB en orders.items) gana una clave más por prenda:
-- `lleva_bordado` (boolean). Sin migración de datos: los items existentes
-- simplemente no la traen (se lee con coalesce(..., false)).
--
-- La fila orden_etapas con etapa='bordado' ahora se genera/retira según
-- si AL MENOS UNA prenda de la orden pide bordado — no según el tipo de
-- orden. Esto se resuelve en create_order (al crear) y en set_order_items
-- (si tienda edita las prendas después, mientras la orden sigue en
-- confirmación). Solo se retira automáticamente si sigue en 'pendiente'
-- (nadie ha empezado a trabajarla) — si ya está en_proceso/completado, se
-- deja intacta aunque después se desmarquen todas las prendas, para no
-- perder trabajo ya hecho.
--
-- Nota sobre las 11 órdenes de prueba existentes: las que ya tenían una
-- fila de bordado por venir de la plantilla vieja de escolar/industrial
-- (V23) se quedan como están — no hay forma de saber retroactivamente qué
-- prenda "debía" llevar bordado, y son datos de prueba de todos modos.
--
-- orden_bordados: un registro por ubicación+foto, ligado a la orden Y a
-- la prenda específica (`item_id`, el id que ahora cada prenda trae en el
-- JSONB — ver OrderItemsEditor.jsx). No es una FK real hacia items (vive
-- en JSONB, no en una tabla), es un texto que se compara en el frontend.
-- Lectura pública (todos ven todo, igual que el resto del sistema);
-- escritura exclusiva de bordado/admin_fabrica/admin_general.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) orden_bordados
-- --------------------------------------------------------------------------
create table if not exists public.orden_bordados (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id text not null,
  ubicacion text not null,
  foto_url text,
  foto_path text,
  creado_por uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists orden_bordados_order_idx on public.orden_bordados (order_id);
alter table public.orden_bordados enable row level security;
create policy "Lectura pública orden_bordados" on public.orden_bordados
  for select to anon, authenticated using (true);
grant select on public.orden_bordados to anon, authenticated;

-- --------------------------------------------------------------------------
-- 2) create_orden_bordado / delete_orden_bordado — exclusivo bordado/
--    admin_fabrica/admin_general, y solo si la orden realmente tiene la
--    etapa 'bordado' activa en su flujo (no se puede registrar bordado en
--    una orden donde ninguna prenda lo pidió).
-- --------------------------------------------------------------------------
create or replace function public.create_orden_bordado(
  p_order_id uuid, p_item_id text, p_ubicacion text, p_foto_url text default null, p_foto_path text default null
) returns public.orden_bordados
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_row public.orden_bordados;
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('bordado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo bordado o administrador de fábrica pueden registrar bordado.';
  end if;
  if trim(coalesce(p_ubicacion, '')) = '' then
    raise exception 'Falta indicar la ubicación del bordado.';
  end if;
  select eliminada_en into v_eliminada_en from public.orders where id = p_order_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  if not exists (select 1 from public.orden_etapas where order_id = p_order_id and etapa = 'bordado') then
    raise exception 'Esta orden no tiene la etapa de bordado en su flujo.';
  end if;
  insert into public.orden_bordados (order_id, item_id, ubicacion, foto_url, foto_path, creado_por)
  values (p_order_id, p_item_id, trim(p_ubicacion), p_foto_url, p_foto_path, auth.uid())
  returning * into v_row;
  return v_row;
end;
$function$;
revoke execute on function public.create_orden_bordado(uuid, text, text, text, text) from public;
grant execute on function public.create_orden_bordado(uuid, text, text, text, text) to authenticated;

create or replace function public.delete_orden_bordado(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := public.current_user_role();
  v_eliminada_en timestamptz;
begin
  if coalesce(v_role, '') not in ('bordado', 'admin_fabrica', 'admin_general') then
    raise exception 'Solo bordado o administrador de fábrica pueden borrar un registro de bordado.';
  end if;
  select o.eliminada_en into v_eliminada_en
  from public.orden_bordados b join public.orders o on o.id = b.order_id
  where b.id = p_id;
  if v_eliminada_en is not null then
    raise exception 'Esta orden fue eliminada y ya no admite cambios.';
  end if;
  delete from public.orden_bordados where id = p_id;
end;
$function$;
revoke execute on function public.delete_orden_bordado(uuid) from public;
grant execute on function public.delete_orden_bordado(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 3) create_order: bordado ya NO viene de plantillas_etapas — se decide
--    por prenda (items[].lleva_bordado). Mismo cuerpo de V23, se excluye
--    'bordado' del insert masivo y se agrega el bloque condicional.
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
  where pe.order_type_key = v_order.order_type_key and pe.etapa <> 'bordado';

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where coalesce((it->>'lleva_bordado')::boolean, false)
  ) then
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    values (
      v_order.id, 'bordado', 'pendiente',
      coalesce((select orden_secuencia from public.plantillas_etapas where order_type_key = v_order.order_type_key and etapa = 'bordado'), 3)
    )
    on conflict (order_id, etapa) do nothing;
  end if;

  return v_order;
end;
$function$;

-- --------------------------------------------------------------------------
-- 4) set_order_items: si tienda edita las prendas mientras la orden sigue
--    en confirmación, reconcilia la etapa 'bordado' — la agrega si ahora
--    hace falta y no existía, la quita si ya no hace falta y sigue
--    'pendiente' (si ya está en_proceso/completado, se deja intacta).
--    Mismo cuerpo de V24, se agrega el bloque de reconciliación al final.
-- --------------------------------------------------------------------------
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
  v_needs_bordado boolean;
  v_bordado_estado text;
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

  select exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    where coalesce((it->>'lleva_bordado')::boolean, false)
  ) into v_needs_bordado;

  select estado into v_bordado_estado from public.orden_etapas where order_id = p_order_id and etapa = 'bordado';

  if v_needs_bordado and v_bordado_estado is null then
    insert into public.orden_etapas (order_id, etapa, estado, orden_secuencia)
    values (
      p_order_id, 'bordado', 'pendiente',
      coalesce((select orden_secuencia from public.plantillas_etapas where order_type_key = v_order.order_type_key and etapa = 'bordado'), 3)
    );
  elsif not v_needs_bordado and v_bordado_estado = 'pendiente' then
    delete from public.orden_etapas where order_id = p_order_id and etapa = 'bordado';
  end if;

  return v_order;
end;
$function$;
