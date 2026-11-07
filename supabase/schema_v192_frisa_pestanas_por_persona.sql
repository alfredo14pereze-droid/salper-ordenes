-- =====================================================================
-- V192 — Frisa: cada persona ve solo sus pestañas (2026-11-07)
-- =====================================================================
-- Pedido de Alfredo: que cada quien vea solo lo que va a hacer.
--   · fx.* = qué pestañas de Frisa aparecen (solo pantalla; los datos los
--     siguen protegiendo fn.ver / fs.ver / fp.ver).
--   · Quién hace qué:
--       admin_general  → todo.
--       ventas (Gis)   → sube OC, crea órdenes de taller y pedidos de playera
--                        lisa y pantalón. Pestañas: Órdenes de surtido, Urgente,
--                        Restock, Reportes.
--       chofer (Leo)   → surte (palomea / surtida toda). Pestaña: Órdenes de surtido.
--       admin_fabrica,
--       admin_tienda   → confirman "Salió el chofer" (entrega) y "Subir a bodega"
--                        / "Recibir" compras. Pestañas: Órdenes de surtido, Restock.
--   · Se quitan las pestañas que cada rol ya no usa. Se puede correr dos veces.
-- =====================================================================

insert into public.permisos_catalogo (clave, modulo, etiqueta, descripcion, nivel, orden) values
  ('fx.niveles',  'Frisa pestañas', 'Pestaña Niveles de inventario', 'Ver la pestaña Niveles de inventario de Frisa.', 'ver', 110),
  ('fx.surtido',  'Frisa pestañas', 'Pestaña Órdenes de surtido', 'Ver la pestaña Órdenes de surtido de Frisa.', 'ver', 111),
  ('fx.urgente',  'Frisa pestañas', 'Pestaña Urgente', 'Ver la pestaña Urgente de Frisa.', 'ver', 112),
  ('fx.restock',  'Frisa pestañas', 'Pestaña Restock', 'Ver la pestaña Restock de Frisa (órdenes de taller, pedidos, playera lisa, subir a bodega).', 'ver', 113),
  ('fx.microsip', 'Frisa pestañas', 'Pestaña Revisión Microsip', 'Ver la pestaña Revisión Microsip de Frisa.', 'ver', 114),
  ('fx.plantas',  'Frisa pestañas', 'Pestaña Plantas Frisa', 'Ver la pestaña Plantas Frisa.', 'ver', 115),
  ('fx.reportes', 'Frisa pestañas', 'Pestaña Reportes', 'Ver la pestaña Reportes de Frisa.', 'ver', 116)
on conflict (clave) do nothing;

-- Lo que cada rol debe tener en Frisa (pestañas + datos + acciones).
drop table if exists frisa_v192;
create temp table frisa_v192 (rol text, clave text);
insert into frisa_v192 values
  -- admin_general: todo
  ('admin_general', 'fx.niveles'), ('admin_general', 'fx.surtido'), ('admin_general', 'fx.urgente'), ('admin_general', 'fx.restock'),
  ('admin_general', 'fx.microsip'), ('admin_general', 'fx.plantas'), ('admin_general', 'fx.reportes'),
  -- ventas (Gis)
  ('ventas', 'fx.surtido'), ('ventas', 'fx.urgente'), ('ventas', 'fx.restock'), ('ventas', 'fx.reportes'),
  ('ventas', 'fn.ver'), ('ventas', 'fs.ver'), ('ventas', 'fs.oc'), ('ventas', 'fr.ordenes'), ('ventas', 'fr.compras'),
  -- chofer (Leo, surte)
  ('chofer', 'fx.surtido'), ('chofer', 'fn.ver'), ('chofer', 'fs.ver'), ('chofer', 'fs.surtir'),
  -- quienes confirman entrega y subida a bodega
  ('admin_fabrica', 'fx.surtido'), ('admin_fabrica', 'fx.restock'),
  ('admin_fabrica', 'fn.ver'), ('admin_fabrica', 'fs.ver'), ('admin_fabrica', 'fs.entregar'), ('admin_fabrica', 'fr.bodega'),
  ('admin_tienda', 'fx.surtido'), ('admin_tienda', 'fx.restock'),
  ('admin_tienda', 'fn.ver'), ('admin_tienda', 'fs.ver'), ('admin_tienda', 'fs.entregar'), ('admin_tienda', 'fr.bodega');

insert into public.rol_permisos (rol, clave)
select rol, clave from frisa_v192
on conflict do nothing;

-- Quitar a esos roles las pestañas de Frisa que ya no les tocan (las acciones de otros no las tienen).
delete from public.rol_permisos rp
where rp.rol in ('ventas', 'chofer', 'admin_fabrica', 'admin_tienda')
  and rp.clave like 'fx.%'
  and not exists (select 1 from frisa_v192 v where v.rol = rp.rol and v.clave = rp.clave);

-- Comprobación: qué tiene cada rol en Frisa.
select rol, string_agg(clave, ', ' order by clave) as permisos_frisa
from public.rol_permisos
where clave like 'fx.%' or clave like 'fn.%' or clave like 'fs.%' or clave like 'fr.%' or clave like 'fm.%' or clave like 'fp.%'
group by rol
order by rol;
