-- =====================================================================
-- V150 — Estados "En impresión" e "Impresa" en la orden
-- =====================================================================
-- Las etapas 'impresion' (papel de sublimación, Samuel) e
-- 'impresion_prenda' (impresión de una prenda escolar/industrial,
-- terminado) no tenían estado propio en orders.status: mientras eran lo
-- último que cambió, el Dashboard se quedaba en el estado anterior
-- ("Confirmada" mientras se imprime una orden de sublimación; ESC-044 con
-- la impresión en proceso decía "Cortado").
--
-- Ahora las dos etapas cuentan en el resumen, con dos estados nuevos:
--   en_impresion  → "En impresión"
--   impreso       → "Impresa"
-- La regla no cambia (V147–V149): terminado completo manda; si no, la
-- etapa en proceso más reciente; si no, la completada más reciente.
--
-- IMPORTANTE — aplicar DESPUÉS de que el frontend que conoce estos estados
-- lleve al menos un día desplegado: una app instalada con una versión
-- anterior al 2026-10-12 no los conoce y los pinta como "Por Confirmar".
-- (Desde esa versión la app se actualiza sola y un estado desconocido sale
-- en gris con su nombre.)
--
-- Cambios (parches con guarda sobre lo vivo; nada se redefine completo):
--   1. CHECK de orders.status: se agregan los dos valores.
--   2. update_order_status: los acepta en la corrección manual de estado.
--   3. recompute_order_status: las dos etapas entran a la cuenta.
--   4. Se recalculan las órdenes activas.
--
-- Rollback: solo si ninguna orden quedó con esos estados (recalcular antes
-- con la función revertida): volver a correr los bloques 2 y 3 cambiando
-- viejo por nuevo, y restaurar el CHECK con los 13 valores.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Guardas (antes de tocar nada)
-- ---------------------------------------------------------------------
do $$
declare
  n int;
  v_src text;
begin
  select count(*) into n from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then raise exception 'V150: se esperaba una sola copia de recompute_order_status, hay %. No se aplicó nada.', n; end if;
  select count(*) into n from pg_proc where proname = 'update_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then raise exception 'V150: se esperaba una sola copia de update_order_status, hay %. No se aplicó nada.', n; end if;

  select prosrc into v_src from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if position('V150' in v_src) = 0 and (
       position('V149' in v_src) = 0
       or position($q$      and etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')$q$ in v_src) = 0
       or position($q$      when 'corte' then case when v_best_estado = 'completado' then 'cortado' else 'en_corte' end$q$ in v_src) = 0) then
    raise exception 'V150: recompute_order_status viva no es la de V149 (md5 %). No se aplicó nada.', md5(v_src);
  end if;

  select prosrc into v_src from pg_proc where proname = 'update_order_status' and pronamespace = 'public'::regnamespace;
  if position($q$'en_impresion'$q$ in v_src) = 0
     and position($q$    'en_confirmacion', 'confirmado',
    'en_corte', 'cortado',$q$ in v_src) = 0 then
    raise exception 'V150: update_order_status viva no tiene la lista de estados esperada (md5 %). No se aplicó nada.', md5(v_src);
  end if;

  if exists (select 1 from public.orders where status not in (
      'en_confirmacion', 'confirmado', 'en_impresion', 'impreso', 'en_corte', 'cortado', 'en_sublimado', 'sublimado',
      'en_produccion', 'produccion', 'en_bordado', 'bordado', 'en_terminado', 'terminado', 'completado')) then
    raise exception 'V150: hay órdenes con un estado fuera de la lista. No se aplicó nada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) CHECK de orders.status
-- ---------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in (
  'en_confirmacion', 'confirmado',
  'en_impresion', 'impreso',
  'en_corte', 'cortado',
  'en_sublimado', 'sublimado',
  'en_produccion', 'produccion',
  'en_bordado', 'bordado',
  'en_terminado', 'terminado',
  'completado'
));

-- ---------------------------------------------------------------------
-- 2) update_order_status acepta los estados nuevos (corrección manual)
-- ---------------------------------------------------------------------
do $$
declare
  v_viejo constant text := $q$    'en_confirmacion', 'confirmado',
    'en_corte', 'cortado',$q$;
  v_nuevo constant text := $q$    'en_confirmacion', 'confirmado',
    'en_impresion', 'impreso',
    'en_corte', 'cortado',$q$;
  r record;
  d text;
  nuevo text;
begin
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'update_order_status' and p.pronamespace = 'public'::regnamespace;
  if position($q$'en_impresion'$q$ in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(d, v_viejo, v_nuevo);
  if nuevo = d then raise exception 'V150: no pude parchear update_order_status.'; end if;
  execute nuevo;
end $$;

-- ---------------------------------------------------------------------
-- 3) recompute_order_status: impresión cuenta y tiene estado propio
-- ---------------------------------------------------------------------
do $$
declare
  v_viejo_a constant text := $q$      and etapa in ('corte', 'sublimado', 'produccion', 'bordado', 'terminado')$q$;
  v_nuevo_a constant text := $q$      and etapa in ('impresion', 'impresion_prenda', 'corte', 'sublimado', 'produccion', 'bordado', 'terminado') -- V150: impresión cuenta$q$;
  v_viejo_b constant text := $q$      when 'corte' then case when v_best_estado = 'completado' then 'cortado' else 'en_corte' end$q$;
  v_nuevo_b constant text := $q$      when 'impresion' then case when v_best_estado = 'completado' then 'impreso' else 'en_impresion' end
      when 'impresion_prenda' then case when v_best_estado = 'completado' then 'impreso' else 'en_impresion' end
      when 'corte' then case when v_best_estado = 'completado' then 'cortado' else 'en_corte' end$q$;
  r record;
  d text;
  nuevo text;
begin
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'recompute_order_status' and p.pronamespace = 'public'::regnamespace;
  if position('V150' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(replace(d, v_viejo_a, v_nuevo_a), v_viejo_b, v_nuevo_b);
  if position(v_nuevo_a in nuevo) = 0 or position(v_nuevo_b in nuevo) = 0 or position(v_viejo_a || E'\n' in nuevo) > 0 then
    raise exception 'V150: no pude parchear recompute_order_status.';
  end if;
  execute nuevo;
end $$;

-- ---------------------------------------------------------------------
-- 4) Recalcular las órdenes activas
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from public.orders where eliminada_en is null and cancelled_at is null and status not in ('en_confirmacion', 'completado') loop
    perform public.recompute_order_status(r.id);
  end loop;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select proname, position('en_impresion' in prosrc) > 0 from pg_proc
--   where pronamespace = 'public'::regnamespace and proname in ('recompute_order_status','update_order_status');  -- 2 filas: true
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'orders_status_check';   -- incluye en_impresion e impreso
--   select status, count(*) from public.orders where status in ('en_impresion','impreso') group by 1;
-- =====================================================================
