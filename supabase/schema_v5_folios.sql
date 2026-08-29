-- =====================================================================
-- SALPER · Sistema de gestión de órdenes de producción
-- Esquema V5: numeración automática de folios (SUB-001, ESC-001, IND-001…)
--
-- Requiere haber corrido los esquemas anteriores (schema.sql...v4b).
-- Cómo aplicarlo: pega este archivo completo en el SQL Editor de tu
-- proyecto de Supabase y ejecútalo una sola vez.
--
-- De aquí en adelante, orders.order_number YA NO se manda desde el
-- frontend: lo asigna un trigger BEFORE INSERT usando una secuencia de
-- Postgres independiente por tipo de orden. Las órdenes que ya existen
-- conservan su número tal cual (el trigger solo aplica a inserts nuevos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Prefijo de folio por tipo de orden
-- ---------------------------------------------------------------------
alter table public.order_types add column if not exists folio_prefix text;

update public.order_types set folio_prefix = 'SUB' where key = 'sublimacion' and folio_prefix is null;
update public.order_types set folio_prefix = 'ESC' where key = 'escolar' and folio_prefix is null;
update public.order_types set folio_prefix = 'IND' where key = 'industrial' and folio_prefix is null;

-- Cualquier otro tipo que ya se haya creado (ej. desde "+ Nuevo tipo…" en
-- el formulario) recibe un prefijo derivado de su key, para que no se
-- quede sin secuencia.
update public.order_types
set folio_prefix = upper(left(regexp_replace(key, '[^a-zA-Z]', '', 'g'), 3))
where folio_prefix is null;

alter table public.order_types alter column folio_prefix set not null;

-- ---------------------------------------------------------------------
-- 2) Una secuencia de Postgres por tipo de orden (todas empiezan en 1).
--    El nombre de la secuencia es determinístico: folio_seq_<key>.
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select key from public.order_types loop
    execute format('create sequence if not exists public.folio_seq_%I start 1', t.key);
  end loop;
end $$;

-- create_order_type ahora también crea la secuencia del tipo nuevo y
-- acepta (opcionalmente) el prefijo de folio; si no se manda, se deriva
-- de la key igual que arriba.
drop function if exists public.create_order_type(text, text, text);

create or replace function public.create_order_type(
  p_key text,
  p_label text,
  p_color text default '#64748b',
  p_folio_prefix text default null
) returns public.order_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.order_types;
  v_prefix text;
begin
  v_prefix := coalesce(nullif(upper(trim(p_folio_prefix)), ''), upper(left(regexp_replace(p_key, '[^a-zA-Z]', '', 'g'), 3)));

  insert into public.order_types (key, label, color, sort_order, folio_prefix)
  values (p_key, p_label, p_color, (select coalesce(max(sort_order), 0) + 1 from public.order_types), v_prefix)
  on conflict (key) do update set active = true, label = excluded.label
  returning * into v_type;

  execute format('create sequence if not exists public.folio_seq_%I start 1', p_key);

  return v_type;
end;
$$;

grant execute on function public.create_order_type(text, text, text, text) to authenticated;
revoke execute on function public.create_order_type(text, text, text, text) from anon;

-- ---------------------------------------------------------------------
-- 3) Trigger: asigna el folio automáticamente al insertar una orden.
--    Formato: <PREFIJO>-<número con 3 dígitos mínimo> (ej. SUB-001,
--    SUB-099, SUB-100...). No editable desde el frontend porque
--    create_order ya no acepta el número como parámetro (ver abajo).
-- ---------------------------------------------------------------------
create or replace function public.assign_order_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number bigint;
begin
  select folio_prefix into v_prefix from public.order_types where key = NEW.order_type_key;
  if v_prefix is null then
    raise exception 'El tipo de orden "%" no tiene un prefijo de folio configurado.', NEW.order_type_key;
  end if;

  execute format('select nextval(%L)', 'public.folio_seq_' || NEW.order_type_key) into v_number;

  NEW.order_number := v_prefix || '-' || lpad(v_number::text, 3, '0');
  return NEW;
end;
$$;

drop trigger if exists trg_assign_order_folio on public.orders;
create trigger trg_assign_order_folio
  before insert on public.orders
  for each row execute function public.assign_order_folio();

-- ---------------------------------------------------------------------
-- 4) create_order: ya no recibe el número de orden (lo pone el trigger).
--    Hay que tirar la versión vieja primero (firma distinta = función
--    nueva para Postgres, no un reemplazo).
-- ---------------------------------------------------------------------
drop function if exists public.create_order(text, text, text, text, date, integer, jsonb);

create or replace function public.create_order(
  p_client_name text,
  p_order_type_key text,
  p_description text,
  p_requested_delivery_date date,
  p_estimated_production_days integer,
  p_items jsonb default '[]'::jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if public.current_user_role() not in ('tienda', 'admin') then
    raise exception 'Solo tienda o administrador pueden crear órdenes.';
  end if;

  -- order_number lo asigna trg_assign_order_folio (BEFORE INSERT) — no
  -- se manda aquí ni se puede forzar desde el cliente.
  insert into public.orders (
    client_name, order_type_key, description,
    requested_delivery_date, estimated_production_days, items, created_by
  ) values (
    p_client_name, p_order_type_key, p_description,
    p_requested_delivery_date, p_estimated_production_days, coalesce(p_items, '[]'::jsonb), auth.uid()
  )
  returning * into v_order;

  insert into public.order_status_history (order_id, status, notes, changed_by)
  values (v_order.id, v_order.status, 'Orden creada', auth.uid());

  return v_order;
end;
$$;

grant execute on function public.create_order(text, text, text, date, integer, jsonb) to authenticated;
revoke execute on function public.create_order(text, text, text, date, integer, jsonb) from anon;
