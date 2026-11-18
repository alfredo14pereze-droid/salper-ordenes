-- =====================================================================
-- V212 — Precio unitario OBLIGATORIO al crear una orden (definitivo)
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo una
-- vez. Todo va en una sola transacción: si algo falla, no se aplica nada.
-- Se puede volver a correr sin daño.
-- =====================================================================
-- Quita la pausa temporal de V161 (interruptor fin_config.alta_requiere_precio
-- + función fin_alta_requiere_precio) y deja SIEMPRE activas las dos reglas de
-- V159:
--   * orden_lineas_validar()       → valida antes de pedir folio (no lo gasta).
--   * orders_lineas_precio_guard() → constraint trigger diferido
--     orders_lineas_precio_chk (AFTER INSERT on orders): una orden NUEVA no se
--     guarda si alguna línea (prenda + talla con cantidad > 0) no tiene
--     precio > 0 ni es de venta de mostrador. Cubre también un INSERT directo.
--
-- Dónde vive el precio: orden_lineas.precio_unitario (una fila por prenda +
-- talla). NO se le pone NOT NULL: las líneas de venta de mostrador guardan
-- precio NULL a propósito. La regla de la columna ya existía (V159) y aquí
-- solo se renombra:
--   orden_lineas_precio_ck → chk_precio_unitario_positivo
--   check (venta_mostrador or (precio_unitario is not null and precio_unitario > 0))
-- Una línea "sin precio" es una fila que NO existe, por eso el candado real es
-- el trigger (un CHECK no puede revisar filas que faltan).
--
-- Órdenes existentes: NO se tocan (decisión de Alfredo, 17-nov-2026: la regla
-- solo aplica a órdenes nuevas). El trigger solo corre en INSERT, así que no
-- hace falta NOT VALID ni un VALIDATE CONSTRAINT pendiente. Las órdenes viejas
-- sin precio siguen marcadas "falta precio" y para entregarlas sigue haciendo
-- falta el precio o "Entregar de todos modos" (V160).
--
-- Errores: se lanzan con SQLSTATE 23514 (check_violation) y el texto empieza
-- con "Falta el precio unitario", para que la pantalla los traduzca.
-- Rollback: al final del archivo (comentado).
-- =====================================================================

do $$
begin
  if to_regprocedure('public.orden_lineas_validar(text, jsonb, jsonb)') is null
     or to_regprocedure('public.orders_lineas_precio_guard()') is null
     or to_regprocedure('public.orden_lineas_calc(uuid)') is null
     or to_regprocedure('public.orden_tipo_lleva_precio(text)') is null then
    raise exception 'V212: falta V159. No se aplicó nada.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_lineas_precio_chk'
                 and tgrelid = 'public.orders'::regclass and tgenabled <> 'D') then
    raise exception 'V212: el trigger orders_lineas_precio_chk no existe o está deshabilitado. No se aplicó nada.';
  end if;
end $$;

-- 1) Validación del alta, sin el interruptor de V161
create or replace function public.orden_lineas_validar(p_tipo text, p_items jsonb, p_lineas jsonb)
returns void language plpgsql stable set search_path = public as $$
declare v_falta text;
begin
  -- V212: precio obligatorio siempre (se quitó el interruptor de V161).
  if not public.orden_tipo_lleva_precio(p_tipo) then return; end if;
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' then raise exception 'Formato de líneas inválido.'; end if;
  select string_agg(coalesce(x.item->>'garment', 'prenda') || ' ' || coalesce(s.sz->>'talla', ''), ', ')
    into v_falta
  from jsonb_array_elements(
         case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) with ordinality x(item, ord)
  cross join lateral jsonb_array_elements(
         case when jsonb_typeof(x.item->'sizes') = 'array' then x.item->'sizes' else '[]'::jsonb end) with ordinality s(sz, ord)
  where (s.sz->>'cantidad') ~ '^[0-9]+(\.[0-9]+)?$' and (s.sz->>'cantidad')::numeric > 0
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
      where (l->>'item_index')::int = x.ord - 1 and (l->>'size_index')::int = s.ord - 1
        and (coalesce((l->>'venta_mostrador')::boolean, false)
             or coalesce((l->>'precio_unitario')::numeric, 0) > 0));
  if v_falta is not null then
    raise exception using errcode = 'check_violation',
      message = format('Falta el precio unitario en: %s. Captúralo o márcala como venta de mostrador.', v_falta);
  end if;
end; $$;
revoke execute on function public.orden_lineas_validar(text, jsonb, jsonb) from public;

-- 2) Candado al insertar, sin el interruptor de V161
create or replace function public.orders_lineas_precio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  -- V212: precio obligatorio siempre (se quitó el interruptor de V161).
  select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
  from public.orden_lineas_calc(new.id) c where not c.con_precio;
  if v_falta is not null then
    raise exception using errcode = 'check_violation',
      message = format('Falta el precio unitario en: %s. La orden no se guardó.', v_falta);
  end if;
  return null;
end; $$;

-- 3) Nombre claro para la regla de la columna (misma regla de V159)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'orden_lineas_precio_ck'
             and conrelid = 'public.orden_lineas'::regclass) then
    alter table public.orden_lineas rename constraint orden_lineas_precio_ck to chk_precio_unitario_positivo;
  elsif not exists (select 1 from pg_constraint where conname = 'chk_precio_unitario_positivo'
                    and conrelid = 'public.orden_lineas'::regclass) then
    alter table public.orden_lineas add constraint chk_precio_unitario_positivo
      check (venta_mostrador or (precio_unitario is not null and precio_unitario > 0));
  end if;
end $$;

-- 4) Quitar la pausa temporal de V161
delete from public.fin_config where clave = 'alta_requiere_precio';
drop function if exists public.fin_alta_requiere_precio();

-- =====================================================================
-- Verificación (solo lectura) después de aplicar:
--   select clave from fin_config where clave = 'alta_requiere_precio';            -- 0 filas
--   select to_regprocedure('public.fin_alta_requiere_precio()');                  -- null
--   select conname from pg_constraint where conname = 'chk_precio_unitario_positivo'; -- 1 fila
--   select tgname, tgenabled from pg_trigger where tgname = 'orders_lineas_precio_chk'; -- 1 fila, 'O'
--   select proname, position('alta_requiere' in prosrc) = 0 as sin_pausa
--     from pg_proc where proname in ('orden_lineas_validar', 'orders_lineas_precio_guard'); -- 2 × true
-- =====================================================================

-- =====================================================================
-- ROLLBACK (solo si algo sale mal): deja todo como en V161 (precio opcional).
-- Pegar y correr esto en el SQL Editor:
--
-- begin;
-- alter table public.orden_lineas rename constraint chk_precio_unitario_positivo to orden_lineas_precio_ck;
-- insert into public.fin_config (clave, valor) values ('alta_requiere_precio', 'no')
--   on conflict (clave) do update set valor = excluded.valor;
-- create or replace function public.fin_alta_requiere_precio() returns boolean
-- language sql stable security definer set search_path = public as $f$
--   select coalesce((select valor from public.fin_config where clave = 'alta_requiere_precio'), 'si') <> 'no';
-- $f$;
-- revoke execute on function public.fin_alta_requiere_precio() from public, anon;
-- grant execute on function public.fin_alta_requiere_precio() to authenticated;
-- -- Las dos funciones vuelven a respetar el interruptor (una línea al inicio):
-- create or replace function public.orders_lineas_precio_guard()
-- returns trigger language plpgsql security definer set search_path = public as $f$
-- declare v_falta text;
-- begin
--   if not public.fin_alta_requiere_precio() then return null; end if;
--   select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
--   from public.orden_lineas_calc(new.id) c where not c.con_precio;
--   if v_falta is not null then
--     raise exception 'La orden no se puede guardar: falta precio unitario en %.', v_falta;
--   end if;
--   return null;
-- end; $f$;
-- create or replace function public.orden_lineas_validar(p_tipo text, p_items jsonb, p_lineas jsonb)
-- returns void language plpgsql stable set search_path = public as $f$
-- begin
--   if not public.orden_tipo_lleva_precio(p_tipo) then return; end if;
--   if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' then raise exception 'Formato de líneas inválido.'; end if;
--   if not public.fin_alta_requiere_precio() then return; end if;
--   -- (con el interruptor en 'no' no se valida nada más)
-- end; $f$;
-- revoke execute on function public.orden_lineas_validar(text, jsonb, jsonb) from public;
-- commit;
-- -- Nota: esta orden_lineas_validar abreviada solo sirve con el interruptor en 'no'.
-- -- Para volver a exigir precio después, aplicar V212 otra vez.
-- =====================================================================
