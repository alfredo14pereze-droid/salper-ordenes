-- =====================================================================
-- V201 — Frisa: contabilidad sube las facturas a Plantas Frisa (2026-11-09)
-- =====================================================================
-- Pedido de Alfredo: "se saca el reporte de todas las facturas de la quincena,
-- separado por planta, y eso lo va a subir contabilidad".
--   · Contabilidad puede ver la pestaña Plantas Frisa (fx.plantas, fp.ver) y
--     subir los Diarios de Microsip (fp.importar). Lo demás de Frisa lo sigue
--     viendo solo de vista.
-- Requiere V189 y V192. Aditivo; se puede correr dos veces.
-- =====================================================================

insert into public.rol_permisos (rol, clave)
select 'contabilidad', c from unnest(array['fx.plantas', 'fp.ver', 'fp.importar']) c
on conflict do nothing;

-- Comprobación: quiénes pueden subir remisiones y facturas.
select string_agg(rol, ', ' order by rol) as suben_facturas
from public.rol_permisos where clave = 'fp.importar';
