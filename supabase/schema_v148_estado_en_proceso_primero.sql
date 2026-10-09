-- =====================================================================
-- V148 — Estado de la orden: una etapa EN PROCESO le gana a una terminada
-- =====================================================================
-- Ajuste a V147 (el estado sigue el cambio de etapa más reciente). Con la
-- regla literal, una orden con costura en proceso podía decir "Cortado" si
-- lo último que se tocó fue marcar el corte como completo (pasó con
-- ESC-024). Lo que se quiere ver es en qué se está trabajando:
--
--   1. Si hay alguna etapa en proceso, gana esa (entre varias, la que
--      empezó más recientemente).
--   2. Si no hay ninguna en proceso, gana la que se completó más
--      recientemente.
--   (La secuencia solo desempata.)
--
-- Ejemplo: corte completo y costura empezada → "En costura", sin importar
-- cuál de las dos se marcó al último.
--
-- Parche de una línea sobre la función viva (misma técnica y guardas de
-- V147), y se recalculan las órdenes activas.
--
-- Rollback: volver a correr el bloque cambiando v_viejo por v_nuevo.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_viejo constant text := $q$    order by estado_cambiado_en desc nulls last, orden_secuencia desc$q$;
  v_nuevo constant text := $q$    -- V148: primero lo que está en proceso; después, lo más reciente.
    order by (estado = 'en_proceso') desc, estado_cambiado_en desc nulls last, orden_secuencia desc$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V148: se esperaba una sola copia de recompute_order_status, hay %. No se aplicó nada.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'recompute_order_status' and p.pronamespace = 'public'::regnamespace;
  if position('V148' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position('V147' in r.prosrc) = 0 or position(v_viejo in r.prosrc) = 0 then
    raise exception 'V148: recompute_order_status viva no es la de V147 (md5 %). No se aplicó nada.', md5(r.prosrc);
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(d, v_viejo, v_nuevo);
  if nuevo = d or position(v_nuevo in nuevo) = 0 then
    raise exception 'V148: no pude parchear recompute_order_status. No se aplicó nada.';
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
--   select position('V148' in prosrc) > 0, position('captura_produccion' in prosrc) > 0
--   from pg_proc where proname = 'recompute_order_status' and pronamespace = 'public'::regnamespace;   -- true, true
-- =====================================================================
