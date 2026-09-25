-- =====================================================================
-- V66b — Producción: el rol `captura_produccion` tampoco debe poder usar
-- 4 funciones que NUNCA tuvieron candado de rol (abiertas a cualquier cuenta
-- con sesión). Las encontró la simulación de V66 (se probaron las 60
-- funciones de escritura del sistema como `captura_produccion`):
--   create_order_type, create_order_template, delete_order_template,
--   recompute_order_status.
-- Se les inserta, justo después del `begin` de su cuerpo (definición VIVA),
-- un bloqueo solo para el rol nuevo. A los demás roles no les cambia nada.
-- NOTA (fuera de alcance, sin tocar): 'lectura' y 'tienda' siguen pudiendo
-- llamarlas — mismo hueco anterior a V66.
-- =====================================================================
begin;
do $$
declare
  r record;
  d text;
  nuevo text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('create_order_type', 'create_order_template', 'delete_order_template', 'recompute_order_status') loop
    d := pg_get_functiondef(r.oid);
    nuevo := regexp_replace(
      d, '\mbegin\M',
      'begin if coalesce(public.current_user_role(), '''') = ''captura_produccion'' then raise exception ''No tienes permiso para esta acción.''; end if;'
    );
    if nuevo = d or position('captura_produccion' in nuevo) = 0 then
      raise exception 'No pude parchear % (no encontré su begin). No se aplicó nada.', r.proname;
    end if;
    execute nuevo;
  end loop;
end $$;
commit;
