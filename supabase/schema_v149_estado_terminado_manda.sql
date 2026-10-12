-- =====================================================================
-- V149 — Estado de la orden: si terminado ya está completo, dice "Terminado"
-- =====================================================================
-- Tercer ajuste al resumen de etapas (V147, V148). El estado depende de la
-- hora en que cada estación toca su botón, y no siempre la tocan en el
-- orden real: en VEN-005 (cobijas) terminado se completó a las 16:29 y
-- bordado se cerró a las 17:49, así que la orden decía "Bordado" estando
-- ya terminada. Lo mismo pasa si una etapa anterior se queda "en proceso"
-- sin cerrarse (SUB-022).
--
-- Terminado es el último paso: una vez completo, lo que se marque después
-- es alguien poniéndose al corriente. La regla queda:
--
--   1. Si terminado está COMPLETADO → "Terminado", siempre.
--   2. Si no, y hay alguna etapa en proceso → esa (entre varias, la que
--      empezó más recientemente).
--   3. Si no hay ninguna en proceso → la que se completó más recientemente.
--
-- Si una orden ya terminada regresa a una etapa anterior por un arreglo,
-- seguirá diciendo "Terminado" hasta que un administrador regrese la etapa
-- de terminado (detalle de la orden → Etapas de producción).
--
-- Parche de una línea sobre la función viva (misma técnica y guardas de
-- V147/V148), y se recalculan las órdenes activas.
--
-- Rollback: volver a correr el bloque cambiando v_viejo por v_nuevo.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_viejo constant text := $q$    order by (estado = 'en_proceso') desc, estado_cambiado_en desc nulls last, orden_secuencia desc$q$;
  v_nuevo constant text := $q$    -- V149: y antes que nada, terminado completado (es el último paso).
    order by (etapa = 'terminado' and estado = 'completado') desc, (estado = 'en_proceso') desc, estado_cambiado_en desc nulls last, orden_secuencia desc$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V149: se esperaba una sola copia de recompute_order_status, hay %. No se aplicó nada.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'recompute_order_status' and p.pronamespace = 'public'::regnamespace;
  if position('V149' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position('V148' in r.prosrc) = 0 or position(v_viejo in r.prosrc) = 0 then
    raise exception 'V149: recompute_order_status viva no es la de V148 (md5 %). No se aplicó nada.', md5(r.prosrc);
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(d, v_viejo, v_nuevo);
  if nuevo = d or position(v_nuevo in nuevo) = 0 then
    raise exception 'V149: no pude parchear recompute_order_status. No se aplicó nada.';
  end if;
  execute nuevo;
end $$;

-- Recalcular las órdenes activas con la regla ajustada.
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
--   select position('V149' in prosrc) > 0, position('captura_produccion' in prosrc) > 0
--   from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;   -- true, true
-- =====================================================================
