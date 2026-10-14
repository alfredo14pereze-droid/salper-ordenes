-- =====================================================================
-- V152 — Protección de las prendas de las órdenes (después de V151)
-- =====================================================================
-- V151 encontró que guardar lo surtido borraba tallas en silencio (16
-- órdenes, 65 tallas) y no hubo forma de recuperarlas: no había copia de
-- cómo estaban las prendas antes. Dos protecciones en la base:
--
-- 1. HISTORIAL: cada vez que cambian las prendas de una orden (orders.items)
--    se guarda una copia de cómo estaban ANTES, con quién y cuándo, en
--    orden_items_historial. También si la orden se borra. Sin llave hacia
--    orders a propósito: el historial sobrevive aunque la orden se borre.
--    Lo leen los administradores; nadie lo escribe a mano.
--
-- 2. CANDADO: se rechaza cualquier guardado que deje MÁS tallas o prendas
--    vacías (null) de las que ya había. Un error como el de V151 ya no
--    borra datos: falla con un mensaje en pantalla. Las órdenes que ya
--    tienen tallas dañadas se pueden seguir editando (el candado solo mira
--    que no aumenten), y al volver a capturar sus prendas quedan limpias.
--
-- Aditivo: una tabla, dos funciones de trigger, tres triggers. No toca
-- ninguna función existente ni filas existentes.
--
-- Rollback: drop trigger orders_items_candado_trg, orders_items_historial_upd_trg,
--   orders_items_historial_del_trg on public.orders; drop function
--   public.orders_items_candado(), public.orders_items_historial();
--   (la tabla del historial puede quedarse).
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Historial
-- ---------------------------------------------------------------------
create table if not exists public.orden_items_historial (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  order_number text,
  items_antes jsonb,
  items_despues jsonb,
  accion text not null check (accion in ('cambio', 'orden_borrada')),
  cambiado_por uuid,
  cambiado_por_nombre text,
  cambiado_en timestamptz not null default now()
);
create index if not exists orden_items_historial_orden_idx on public.orden_items_historial (order_id, cambiado_en desc);

alter table public.orden_items_historial enable row level security;
drop policy if exists "Lectura admin orden_items_historial" on public.orden_items_historial;
create policy "Lectura admin orden_items_historial" on public.orden_items_historial
  for select to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin_general', 'admin_fabrica', 'admin_tienda'));
revoke all on public.orden_items_historial from public, anon, authenticated;
grant select on public.orden_items_historial to authenticated;

create or replace function public.orders_items_historial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  select full_name into v_nombre from public.profiles where id = auth.uid();
  if tg_op = 'DELETE' then
    insert into public.orden_items_historial (order_id, order_number, items_antes, items_despues, accion, cambiado_por, cambiado_por_nombre)
    values (old.id, old.order_number, old.items, null, 'orden_borrada', auth.uid(), v_nombre);
    return old;
  end if;
  if old.items is distinct from new.items then
    insert into public.orden_items_historial (order_id, order_number, items_antes, items_despues, accion, cambiado_por, cambiado_por_nombre)
    values (new.id, new.order_number, old.items, new.items, 'cambio', auth.uid(), v_nombre);
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_items_historial() from public, anon, authenticated;

drop trigger if exists orders_items_historial_upd_trg on public.orders;
create trigger orders_items_historial_upd_trg
  after update of items on public.orders
  for each row execute function public.orders_items_historial();

drop trigger if exists orders_items_historial_del_trg on public.orders;
create trigger orders_items_historial_del_trg
  after delete on public.orders
  for each row execute function public.orders_items_historial();

-- ---------------------------------------------------------------------
-- 2) Candado: no se pueden agregar tallas ni prendas vacías
-- ---------------------------------------------------------------------
create or replace function public.orders_items_vacios(p_items jsonb)
returns integer
language sql
immutable
as $$
  select
    coalesce((select count(*) from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it
              where jsonb_typeof(it) <> 'object'), 0)::int
    + coalesce((select count(*) from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) it,
                     jsonb_array_elements(case when jsonb_typeof(it->'sizes') = 'array' then it->'sizes' else '[]'::jsonb end) sz
              where jsonb_typeof(it) = 'object' and jsonb_typeof(sz) <> 'object'), 0)::int
$$;
revoke execute on function public.orders_items_vacios(jsonb) from public, anon;
grant execute on function public.orders_items_vacios(jsonb) to authenticated;

create or replace function public.orders_items_candado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_antes int := case when tg_op = 'UPDATE' then public.orders_items_vacios(old.items) else 0 end;
  v_despues int := public.orders_items_vacios(new.items);
begin
  if v_despues > v_antes then
    raise exception 'No se guardó: el cambio dejaba % talla(s) o prenda(s) vacía(s) en la orden %. Es un error del sistema; avisa a quien administra la app.',
      v_despues - v_antes, coalesce(new.order_number, '(nueva)');
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_items_candado() from public, anon, authenticated;

drop trigger if exists orders_items_candado_trg on public.orders;
create trigger orders_items_candado_trg
  before insert or update of items on public.orders
  for each row execute function public.orders_items_candado();

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and tgname like 'orders_items_%';   -- 3 filas
--   select count(*) from public.orden_items_historial;   -- 0 al aplicar; crece con cada cambio de prendas
--   select order_number, public.orders_items_vacios(items) from public.orders where public.orders_items_vacios(items) > 0;
--   -- las órdenes que todavía tienen tallas dañadas (bajan a medida que se recapturan)
-- =====================================================================
