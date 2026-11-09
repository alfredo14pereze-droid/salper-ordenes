-- =====================================================================
-- V197 — Frisa: quién recibe cada pedido de compra (2026-11-09)
-- =====================================================================
-- Pedido de Alfredo: los pedidos de PANTALÓN (y bata, bolsa) los recibe Gis
-- (ventas); los de PLAYERA LISA se reciben en fábrica (admin_fabrica).
--   fr.recibir_pantalon → ventas, admin_general
--   fr.recibir_lisa     → admin_fabrica, admin_general
-- fr.bodega sigue para "Subir a bodega" lo del taller y el conteo de lisas.
-- frisa_compra_recibir: se cambia SOLO su chequeo de permiso sobre la
-- versión que está en la base (V187). Se puede correr dos veces.
-- =====================================================================
insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fr.recibir_pantalon', 'Frisa restock', 'Recibir pedidos de pantalón', 'Recibir los pedidos de compra de pantalón, bata y bolsa (suma a la bodega).', 'editar', 99),
  ('fr.recibir_lisa',     'Frisa restock', 'Recibir pedidos de playera lisa', 'Recibir los pedidos de compra de playera lisa (suma al anaquel).', 'editar', 99)
on conflict (clave) do nothing;
insert into public.rol_permisos (rol, clave) values
  ('ventas', 'fr.recibir_pantalon'), ('admin_general', 'fr.recibir_pantalon'),
  ('admin_fabrica', 'fr.recibir_lisa'), ('admin_general', 'fr.recibir_lisa')
on conflict do nothing;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.proname = 'frisa_compra_recibir' and p.pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'V197: no existe frisa_compra_recibir.'; end if;
  if position('fr.recibir_lisa' in v_def) > 0 then
    raise notice 'V197: frisa_compra_recibir ya tiene el chequeo nuevo.';
    return;
  end if;
  if position('if not public.tiene_permiso(''fr.bodega'') then' in v_def) = 0 then
    raise exception 'V197: frisa_compra_recibir no tiene el chequeo esperado; no se cambió nada.';
  end if;
  v_def := replace(v_def, 'if not public.tiene_permiso(''fr.bodega'') then',
    'if not (case when exists (select 1 from public.frisa_compra_lineas_lisa x where x.compra_id = p_id)
                 then public.tiene_permiso(''fr.recibir_lisa'') else public.tiene_permiso(''fr.recibir_pantalon'') end) then');
  execute v_def;
end $$;

-- Comprobación: 1 = la función ya revisa los permisos nuevos; y quién tiene cada uno.
select (select count(*) from pg_proc where proname = 'frisa_compra_recibir' and pg_get_functiondef(oid) like '%fr.recibir_lisa%') as funcion_lista,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fr.recibir_pantalon') as reciben_pantalon,
       (select string_agg(rol, ', ' order by rol) from public.rol_permisos where clave = 'fr.recibir_lisa') as reciben_lisa;
