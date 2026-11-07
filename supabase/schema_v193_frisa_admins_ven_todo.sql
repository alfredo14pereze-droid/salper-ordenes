-- =====================================================================
-- V193 — Frisa: admin_fabrica y admin_tienda ven todas las pestañas (2026-11-07)
-- =====================================================================
-- Pedido de Alfredo: "admin fábrica y admin tienda, que tengan acceso a todo,
-- pero solo de vista". Se les dan todas las pestañas fx.* (y fp.ver para Plantas).
-- No se les da ninguna acción nueva: siguen solo con lo que ya tenían
-- (fs.entregar = Salió el chofer, fr.bodega = Subir a bodega / Recibir).
-- Se puede correr dos veces.
-- =====================================================================
insert into public.rol_permisos (rol, clave)
select r, c
from unnest(array['admin_fabrica', 'admin_tienda']) r,
     unnest(array['fx.niveles', 'fx.surtido', 'fx.urgente', 'fx.restock', 'fx.microsip', 'fx.plantas', 'fx.reportes', 'fn.ver', 'fs.ver', 'fp.ver']) c
on conflict do nothing;

-- Comprobación: debe dar 7 pestañas para cada uno.
select rol, count(*) filter (where clave like 'fx.%') as pestanas,
       string_agg(clave, ', ' order by clave) filter (where clave not like 'fx.%' and (clave like 'f_.%')) as permisos
from public.rol_permisos
where rol in ('admin_fabrica', 'admin_tienda')
group by rol order by rol;
