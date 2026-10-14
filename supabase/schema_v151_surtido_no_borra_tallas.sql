-- =====================================================================
-- V151 — URGENTE: "Confirmar y generar reporte" (terminado) borraba tallas
-- =====================================================================
-- set_item_surtido (V26) guarda la cantidad surtida y el comentario de una
-- talla con jsonb_set(...). jsonb_set es estricta: si el valor nuevo es SQL
-- NULL, regresa NULL. El comentario vacío (lo normal al marcar "Correcta")
-- se convertía en NULL, así que la talla COMPLETA quedaba en null dentro de
-- orders.items: se perdía la talla y su cantidad. La siguiente talla igual
-- ya no se encontraba y salía "No se encontró la talla indicada en esa
-- prenda" (así lo vio terminado en SUB-026 el 2026-10-14). Al 2026-10-14:
-- 16 órdenes con 65 tallas borradas.
--
-- Además, la pantalla de terminado manda todas las tallas al mismo tiempo,
-- y cada llamada leía y reescribía la lista completa de prendas: unas
-- pisaban a otras. Ahora la fila de la orden se bloquea mientras se
-- guarda (FOR UPDATE), y el frontend las manda una por una.
--
-- Parche sobre la función viva (con guarda), sin cambiar su firma:
--   * los dos jsonb_set usan coalesce(..., 'null'::jsonb): un valor vacío
--     queda como null DENTRO de la talla, sin borrarla;
--   * el select inicial toma la fila con FOR UPDATE.
-- NO recupera las tallas ya borradas: eso es aparte (ver SALPER_Contexto.md).
--
-- Rollback: no tiene sentido volver a la versión que borra datos.
--
-- Cómo aplicarlo: pegar completo en el SQL Editor de Supabase y correrlo
-- una sola vez. Se puede volver a correr sin daño.
-- =====================================================================
do $$
declare
  v_viejo_1 constant text := $q$jsonb_set(sz, '{cantidad_surtida}', to_jsonb(p_cantidad_surtida))$q$;
  v_nuevo_1 constant text := $q$jsonb_set(sz, '{cantidad_surtida}', coalesce(to_jsonb(p_cantidad_surtida), 'null'::jsonb))$q$;
  v_viejo_2 constant text := $q$'{comentario_surtido}', to_jsonb(nullif(trim(coalesce(p_comentario_surtido, '')), ''))$q$;
  v_nuevo_2 constant text := $q$'{comentario_surtido}', coalesce(to_jsonb(nullif(trim(coalesce(p_comentario_surtido, '')), '')), 'null'::jsonb) -- V151: sin coalesce, jsonb_set con NULL borraba la talla$q$;
  v_viejo_3 constant text := $q$select eliminada_en, items into v_eliminada_en, v_items from public.orders where id = p_order_id;$q$;
  v_nuevo_3 constant text := $q$select eliminada_en, items into v_eliminada_en, v_items from public.orders where id = p_order_id for update; -- V151$q$;
  r record;
  d text;
  nuevo text;
  n int;
begin
  select count(*) into n from pg_proc where proname = 'set_item_surtido' and pronamespace = 'public'::regnamespace;
  if n <> 1 then
    raise exception 'V151: se esperaba una sola copia de set_item_surtido, hay %. No se aplicó nada.', n;
  end if;
  select p.oid, p.prosrc into r from pg_proc p where p.proname = 'set_item_surtido' and p.pronamespace = 'public'::regnamespace;
  if position('V151' in r.prosrc) > 0 then
    return;  -- ya parcheada
  end if;
  if position(v_viejo_1 in r.prosrc) = 0 or position(v_viejo_2 in r.prosrc) = 0 or position(v_viejo_3 in r.prosrc) = 0 then
    raise exception 'V151: set_item_surtido viva no tiene el texto esperado (md5 %). No se aplicó nada.', md5(r.prosrc);
  end if;
  d := pg_get_functiondef(r.oid);
  nuevo := replace(replace(replace(d, v_viejo_1, v_nuevo_1), v_viejo_2, v_nuevo_2), v_viejo_3, v_nuevo_3);
  if position(v_nuevo_1 in nuevo) = 0 or position(v_nuevo_2 in nuevo) = 0 or position(v_nuevo_3 in nuevo) = 0 then
    raise exception 'V151: no pude parchear set_item_surtido. No se aplicó nada.';
  end if;
  execute nuevo;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select position('V151' in prosrc) > 0, position('for update' in prosrc) > 0
--   from pg_proc where proname = 'set_item_surtido' and pronamespace = 'public'::regnamespace;   -- true, true
-- =====================================================================
