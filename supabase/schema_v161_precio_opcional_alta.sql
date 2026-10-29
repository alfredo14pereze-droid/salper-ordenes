-- =====================================================================
-- V161 — Precio OPCIONAL al crear una orden (temporal, mientras se acostumbran)
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo una
-- vez. Todo va en una sola transacción. Se puede volver a correr sin daño.
-- =====================================================================
-- Interruptor en UNA fila: fin_config.alta_requiere_precio
--   'no' → se pueden crear órdenes sin precio (las líneas sin precio quedan
--          "falta precio" y se capturan después en el detalle).
--   'si' → vuelve la regla de V159 (no se guarda sin precio).
-- Para volver a exigirlo, correr:
--   update public.fin_config set valor = 'si' where clave = 'alta_requiere_precio';
-- (la pantalla lo lee sola; no hace falta subir código).
--
-- NO cambia la entrega: para marcar "Entregada" siguen haciendo falta los
-- precios (o "Entregar de todos modos" con motivo, V160).
--
-- Además: quita la excepción temporal de V159 (venció el 28-oct-2026 23:59).
-- =====================================================================

do $$
begin
  if to_regprocedure('public.orden_lineas_validar(text, jsonb, jsonb)') is null
     or to_regprocedure('public.orders_lineas_precio_guard()') is null then
    raise exception 'V161: falta V159. No se aplicó nada.';
  end if;
end $$;

-- 1) El interruptor (empieza en 'no': precio opcional al crear)
insert into public.fin_config (clave, valor) values ('alta_requiere_precio', 'no')
on conflict (clave) do update set valor = excluded.valor;

-- Lo puede consultar la pantalla (solo dice sí/no).
create or replace function public.fin_alta_requiere_precio() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor from public.fin_config where clave = 'alta_requiere_precio'), 'si') <> 'no';
$$;
revoke execute on function public.fin_alta_requiere_precio() from public, anon;
grant execute on function public.fin_alta_requiere_precio() to authenticated;

-- 2) Validación del alta (V159) respetando el interruptor
create or replace function public.orden_lineas_validar(p_tipo text, p_items jsonb, p_lineas jsonb)
returns void language plpgsql stable set search_path = public as $$
declare v_falta text;
begin
  if not public.orden_tipo_lleva_precio(p_tipo) then return; end if;
  if jsonb_typeof(coalesce(p_lineas, '[]'::jsonb)) <> 'array' then raise exception 'Formato de líneas inválido.'; end if;
  if not public.fin_alta_requiere_precio() then return; end if;   -- V161: precio opcional al crear
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
    raise exception 'Falta precio unitario en: %. Captúralo o márcala como venta de mostrador.', v_falta;
  end if;
end; $$;
revoke execute on function public.orden_lineas_validar(text, jsonb, jsonb) from public;

-- 3) Candado al insertar (V159) respetando el interruptor
create or replace function public.orders_lineas_precio_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  if not public.fin_alta_requiere_precio() then return null; end if;   -- V161: precio opcional al crear
  select string_agg(c.prenda || ' ' || c.talla, ', ') into v_falta
  from public.orden_lineas_calc(new.id) c where not c.con_precio;
  if v_falta is not null then
    raise exception 'La orden no se puede guardar: falta precio unitario en %.', v_falta;
  end if;
  return null;
end; $$;

-- 4) Excepción de entrega de V159: ya venció; se quita.
delete from public.fin_config where clave = 'entrega_sin_precio_hasta';

-- =====================================================================
-- Verificación (solo lectura) después de aplicar:
--   select clave, valor from fin_config where clave in ('alta_requiere_precio', 'entrega_sin_precio_hasta');
--   -- 1 fila: alta_requiere_precio = no
-- =====================================================================
