-- =====================================================================
-- V136 — Tipos de orden: candados para que no vuelva a pasar lo de
--        "Venta Mostrador" (tipo sin etapas → órdenes invisibles en fábrica)
-- =====================================================================
-- Contexto: create_order_type no validaba rol (cualquier cuenta con sesión,
-- salvo captura_produccion) y creaba el tipo activo sin plantilla de etapas.
-- Las órdenes de un tipo así nacían sin filas en orden_etapas (V135 arregló
-- las 4 que había).
--
-- 1) Solo admin_tienda, admin_fabrica y admin_general crean/editan tipos.
--    create_order_type ahora EXIGE las etapas del tipo nuevo (5º parámetro).
--    Funciones nuevas: set_order_type_etapas y set_order_type_active.
-- 2) Un tipo no puede estar activo sin al menos una etapa en su plantilla
--    (trigger en order_types; vale también para cambios hechos por SQL).
-- 3) No se puede crear una orden que no generaría ninguna etapa (trigger
--    BEFORE INSERT en orders: corre antes de asignar el folio, así que un
--    intento rechazado no gasta folio).
-- 4) Órdenes de tipo 'venta_mostrador': el cliente siempre es "Salper"
--    (mismo trigger, al crear y al editar).
--
-- No se redefinen create_order ni update_order_details. La única función que
-- cambia de firma es create_order_type (4 → 5 parámetros; el frontend viejo,
-- que manda solo p_key y p_label, recibe el aviso de que faltan las etapas).
--
-- 'bordado' no se administra desde aquí: se decide por orden (lleva_bordado).
-- Si un tipo ya tiene 'bordado' en su plantilla (escolar, industrial, bordado…)
-- esa fila se conserva tal cual.
--
-- Rollback: drop de los 3 triggers y sus 2 funciones, drop de
-- set_order_type_etapas / set_order_type_active / order_type_guardar_plantilla /
-- order_type_puede_administrar, y volver a crear create_order_type con la
-- versión de schema_v5_folios.sql + el parche de schema_v66b.
-- =====================================================================
begin;

-- Guardas: no aplicar si el estado no es el esperado.
do $$
declare
  v_sin text;
begin
  if to_regprocedure('public.create_order_type(text,text,text,text)') is null then
    raise exception 'V136: no encontré create_order_type(text,text,text,text). No se aplicó nada.';
  end if;
  select string_agg(t.key, ', ') into v_sin
  from public.order_types t
  where t.active and not exists (select 1 from public.plantillas_etapas pe where pe.order_type_key = t.key);
  if v_sin is not null then
    raise exception 'V136: hay tipos activos sin plantilla de etapas (%). Corrígelos antes. No se aplicó nada.', v_sin;
  end if;
  if not exists (select 1 from public.clientes where nombre_normalizado = 'salper') then
    raise exception 'V136: no existe el cliente Salper (aplica V135 primero). No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Quién administra tipos de orden
-- ---------------------------------------------------------------------
create or replace function public.order_type_puede_administrar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin_tienda', 'admin_fabrica', 'admin_general');
$$;
revoke execute on function public.order_type_puede_administrar() from public, anon;
grant execute on function public.order_type_puede_administrar() to authenticated;

-- ---------------------------------------------------------------------
-- Interna: reemplaza la plantilla de un tipo (sin tocar su fila 'bordado').
-- Secuencias iguales a las de los tipos de siempre:
--   sin sublimado:  corte 1 → produccion 2 → (bordado 3) → terminado 4
--   con sublimado:  impresion 0 → sublimado 1 → corte 2 → produccion 3 → terminado 4
-- ---------------------------------------------------------------------
create or replace function public.order_type_guardar_plantilla(p_key text, p_etapas text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapas text[];
  v_sub boolean;
begin
  select coalesce(array_agg(distinct e), '{}') into v_etapas from unnest(coalesce(p_etapas, '{}'::text[])) e;

  if exists (select 1 from unnest(v_etapas) e where e not in ('impresion', 'sublimado', 'corte', 'produccion', 'terminado')) then
    raise exception 'Etapa no válida. Las etapas posibles son: impresión, sublimado, corte, costura y terminado.';
  end if;
  if coalesce(array_length(v_etapas, 1), 0) = 0 then
    raise exception 'Elige al menos una etapa para el tipo de orden (por ejemplo corte, costura y terminado). Sin etapas, sus órdenes no le aparecen a fábrica.';
  end if;

  v_sub := v_etapas && array['impresion', 'sublimado'];

  delete from public.plantillas_etapas
  where order_type_key = p_key and etapa <> 'bordado' and etapa <> all (v_etapas);

  insert into public.plantillas_etapas (order_type_key, etapa, orden_secuencia)
  select p_key, e,
    case e
      when 'impresion' then 0
      when 'sublimado' then 1
      when 'corte' then case when v_sub then 2 else 1 end
      when 'produccion' then case when v_sub then 3 else 2 end
      when 'terminado' then 4
    end
  from unnest(v_etapas) e
  on conflict (order_type_key, etapa) do update set orden_secuencia = excluded.orden_secuencia;
end;
$$;
revoke execute on function public.order_type_guardar_plantilla(text, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order_type: solo administradores, y siempre con etapas.
-- ---------------------------------------------------------------------
drop function public.create_order_type(text, text, text, text);

create function public.create_order_type(
  p_key text,
  p_label text,
  p_color text default '#64748b',
  p_folio_prefix text default null,
  p_etapas text[] default null
) returns public.order_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.order_types;
  v_prefix text;
begin
  if not public.order_type_puede_administrar() then
    raise exception 'Solo un administrador (tienda, fábrica o general) puede crear tipos de orden.';
  end if;
  if coalesce(trim(p_key), '') = '' or coalesce(trim(p_label), '') = '' then
    raise exception 'Escribe el nombre del tipo de orden.';
  end if;
  if exists (select 1 from public.order_types where key = p_key) then
    raise exception 'Ya existe un tipo de orden con ese nombre. Si está desactivado, actívalo en Catálogos → Tipos de orden.';
  end if;
  if coalesce(array_length(p_etapas, 1), 0) = 0 then
    raise exception 'Elige al menos una etapa para el tipo de orden (por ejemplo corte, costura y terminado). Sin etapas, sus órdenes no le aparecen a fábrica.';
  end if;

  v_prefix := coalesce(nullif(upper(trim(p_folio_prefix)), ''), upper(left(regexp_replace(p_key, '[^a-zA-Z]', '', 'g'), 3)));

  -- Nace inactivo, recibe su plantilla y entonces se activa (el trigger de
  -- abajo no deja activar un tipo sin etapas).
  insert into public.order_types (key, label, color, sort_order, folio_prefix, active)
  values (p_key, trim(p_label), p_color, (select coalesce(max(sort_order), 0) + 1 from public.order_types), v_prefix, false);

  perform public.order_type_guardar_plantilla(p_key, p_etapas);

  update public.order_types set active = true where key = p_key returning * into v_type;

  execute format('create sequence if not exists public.folio_seq_%I start 1', p_key);

  return v_type;
end;
$$;
revoke execute on function public.create_order_type(text, text, text, text, text[]) from public, anon;
grant execute on function public.create_order_type(text, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Editar las etapas de un tipo (solo afecta a las órdenes que se creen después)
-- ---------------------------------------------------------------------
create or replace function public.set_order_type_etapas(p_key text, p_etapas text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.order_type_puede_administrar() then
    raise exception 'Solo un administrador (tienda, fábrica o general) puede editar tipos de orden.';
  end if;
  if not exists (select 1 from public.order_types where key = p_key) then
    raise exception 'Tipo de orden no encontrado.';
  end if;
  perform public.order_type_guardar_plantilla(p_key, p_etapas);
end;
$$;
revoke execute on function public.set_order_type_etapas(text, text[]) from public, anon;
grant execute on function public.set_order_type_etapas(text, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Activar / desactivar un tipo
-- ---------------------------------------------------------------------
create or replace function public.set_order_type_active(p_key text, p_active boolean)
returns public.order_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.order_types;
begin
  if not public.order_type_puede_administrar() then
    raise exception 'Solo un administrador (tienda, fábrica o general) puede editar tipos de orden.';
  end if;
  update public.order_types set active = coalesce(p_active, false) where key = p_key returning * into v_type;
  if not found then
    raise exception 'Tipo de orden no encontrado.';
  end if;
  return v_type;
end;
$$;
revoke execute on function public.set_order_type_active(text, boolean) from public, anon;
grant execute on function public.set_order_type_active(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Un tipo activo siempre tiene al menos una etapa
-- ---------------------------------------------------------------------
create or replace function public.order_types_exigir_plantilla()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active and not exists (select 1 from public.plantillas_etapas where order_type_key = new.key) then
    raise exception 'El tipo de orden "%" no se puede activar: no tiene ninguna etapa en su plantilla. Asígnale etapas primero.', new.label;
  end if;
  return new;
end;
$$;

drop trigger if exists order_types_exigir_plantilla_trg on public.order_types;
create trigger order_types_exigir_plantilla_trg
  before insert or update of active on public.order_types
  for each row execute function public.order_types_exigir_plantilla();

-- ---------------------------------------------------------------------
-- Órdenes: no crear una orden sin etapas; Venta Mostrador siempre es de Salper
-- ---------------------------------------------------------------------
create or replace function public.orders_validar_tipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  if tg_op = 'INSERT' then
    -- Misma regla que usa create_order para generar orden_etapas: copia la
    -- plantilla menos 'bordado', y agrega 'bordado' si alguna prenda lo lleva.
    if not exists (
         select 1 from public.plantillas_etapas pe
         where pe.order_type_key = new.order_type_key and pe.etapa <> 'bordado')
       and not exists (
         select 1 from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
         where coalesce((it->>'lleva_bordado')::boolean, false))
    then
      raise exception 'No se puede crear la orden: el tipo de orden "%" no tiene etapas de producción configuradas, así que no le aparecería a corte, costura ni terminado. Pide a un administrador que le asigne etapas en Catálogos → Tipos de orden.',
        coalesce((select label from public.order_types where key = new.order_type_key), new.order_type_key);
    end if;
  end if;

  if new.order_type_key = 'venta_mostrador' then
    select id into v_cliente_id from public.clientes where nombre_normalizado = 'salper';
    if v_cliente_id is null then
      raise exception 'Falta el cliente "Salper" en el catálogo de clientes; las órdenes de Venta Mostrador se asignan a ese cliente.';
    end if;
    new.client_id := v_cliente_id;
    new.client_name := 'Salper';
  end if;

  return new;
end;
$$;

-- El nombre empieza con "orders_" a propósito: los triggers BEFORE corren en
-- orden alfabético y este debe ir antes de trg_assign_order_folio.
drop trigger if exists orders_validar_tipo_ins on public.orders;
create trigger orders_validar_tipo_ins
  before insert on public.orders
  for each row execute function public.orders_validar_tipo();

drop trigger if exists orders_validar_tipo_upd on public.orders;
create trigger orders_validar_tipo_upd
  before update of client_name, client_id, order_type_key on public.orders
  for each row execute function public.orders_validar_tipo();

commit;

-- Verificación (después de correr; solo lectura):
--   select proname, pronargs from pg_proc
--    where proname in ('create_order_type','set_order_type_etapas','set_order_type_active');
--   -- esperado: create_order_type 5, set_order_type_etapas 2, set_order_type_active 2 (una fila cada una)
--   select has_function_privilege('anon', 'public.create_order_type(text,text,text,text,text[])', 'EXECUTE'),          -- false
--          has_function_privilege('authenticated', 'public.create_order_type(text,text,text,text,text[])', 'EXECUTE'), -- true
--          has_function_privilege('authenticated', 'public.order_type_guardar_plantilla(text,text[])', 'EXECUTE');    -- false
--   select tgname from pg_trigger where not tgisinternal
--    and tgrelid in ('public.orders'::regclass, 'public.order_types'::regclass) order by 1;
--   -- esperado: incluye order_types_exigir_plantilla_trg, orders_validar_tipo_ins, orders_validar_tipo_upd
