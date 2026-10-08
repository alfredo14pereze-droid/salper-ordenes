-- =====================================================================
-- V141 — Ventas puede editar órdenes ya confirmadas
-- =====================================================================
-- Hasta hoy el rol `ventas` solo podía editar una orden mientras seguía
-- "en_confirmacion"; después, solo admin_tienda / admin_general. Ahora
-- ventas edita en cualquier estado, igual que esos administradores.
--
-- Son tres funciones con la misma línea de candado:
--   update_order_details  (cliente, tipo, descripción, fecha, contacto, folios)
--   set_order_items       (prendas y tallas)
--   set_order_total       (total acordado)
-- Se parchea SOLO esa línea en la función viva (misma técnica con guarda de
-- V131/V134): no se pega ningún cuerpo viejo encima. Todo lo demás queda
-- igual, incluido que un cambio de datos o prendas en una orden ya
-- confirmada le pide a fábrica reconfirmar (V38).
--
-- No cambia: cancelar (admin_tienda/admin_general), borrar (admin_general),
-- factura (contabilidad/administradores).
--
-- Rollback: volver a correr este archivo cambiando el orden de v_viejo y
-- v_nuevo (la línea vuelve a ser la original).
-- =====================================================================
do $$
declare
  v_viejo constant text := $q$if v_role = 'ventas' and v_current_status <> 'en_confirmacion' then$q$;
  v_nuevo constant text := $q$if false then -- V141: ventas edita en cualquier estado (antes: v_role = 'ventas' y la orden ya confirmada)$q$;
  v_funciones constant text[] := array['update_order_details', 'set_order_items', 'set_order_total'];
  v_nombre text;
  r record;
  d text;
  nuevo text;
  n int;
begin
  -- Guarda: una sola copia de cada función, y cada una con el candado
  -- esperado (o ya parcheada). Si algo no cuadra, no se aplica nada.
  foreach v_nombre in array v_funciones loop
    select count(*) into n from pg_proc
    where proname = v_nombre and pronamespace = 'public'::regnamespace;
    if n <> 1 then
      raise exception 'V141: se esperaba una sola copia de %, hay %. No se aplicó nada.', v_nombre, n;
    end if;
    select count(*) into n from pg_proc
    where proname = v_nombre and pronamespace = 'public'::regnamespace
      and (position(v_viejo in prosrc) > 0 or position(v_nuevo in prosrc) > 0);
    if n <> 1 then
      raise exception 'V141: % viva no tiene el candado de ventas esperado. No se aplicó nada.', v_nombre;
    end if;
  end loop;

  for r in
    select p.oid, p.proname, p.prosrc from pg_proc p
    where p.proname = any(v_funciones) and p.pronamespace = 'public'::regnamespace
  loop
    continue when position(v_nuevo in r.prosrc) > 0;  -- ya parcheada
    d := pg_get_functiondef(r.oid);
    nuevo := replace(d, v_viejo, v_nuevo);
    if nuevo = d or position(v_viejo in nuevo) > 0 then
      raise exception 'V141: no pude parchear %.', r.proname;
    end if;
    execute nuevo;
  end loop;
end $$;

-- =====================================================================
-- Verificación (solo lectura), después de aplicar:
--   select proname,
--          position('V141' in prosrc) > 0 as parcheada,
--          position($q$v_current_status <> 'en_confirmacion' then$q$ in prosrc) > 0 as candado_viejo,
--          has_function_privilege('anon', oid, 'execute') as anon_puede,
--          has_function_privilege('authenticated', oid, 'execute') as sesion_puede
--   from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('update_order_details', 'set_order_items', 'set_order_total');
--   -- 3 filas: true, false, false, true
-- =====================================================================
