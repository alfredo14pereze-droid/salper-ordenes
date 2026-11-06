-- =====================================================================
-- Datos 2026-11-06 — Frisa: solo admin_general puede mover; los demás solo ven.
-- =====================================================================
-- Pedido de Alfredo: "quiero que yo sea el único que le puede mover, los
-- demás solo vista". Quita a todos los roles (menos admin_general) los
-- permisos de EDICIÓN de Frisa; los de VER (fn.ver, fs.ver) no se tocan.
-- Queda en el historial de Roles y permisos (rol_permisos_log). Se revierte
-- desde la pantalla Roles y permisos (o volviendo a dar los permisos).
-- Se puede correr dos veces.
-- =====================================================================

with editar (clave) as (
  values ('fn.capturar'), ('fn.supuestos'),                              -- niveles: capturar stock, supuestos/importar
         ('fs.oc'), ('fs.surtir'), ('fs.entregar'),                       -- surtido: subir OC, surtir, salió el chofer
         ('fr.ordenes'), ('fr.bodega'), ('fr.compras'),                   -- restock: órdenes de taller, bodega, compras
         ('fm.revisar')                                                   -- revisión Microsip
), quitados as (
  delete from public.rol_permisos rp
  using editar e
  where rp.clave = e.clave and rp.rol <> 'admin_general'
  returning rp.rol, rp.clave
)
insert into public.rol_permisos_log (cambiado_por, cambiado_por_nombre, rol, clave, permitido)
select null, 'Frisa: solo admin_general edita (2026-11-06)', rol, clave, false from quitados;

-- admin_general conserva (o recibe) todos.
insert into public.rol_permisos (rol, clave)
select 'admin_general', c from unnest(array['fn.capturar','fn.supuestos','fs.oc','fs.surtir','fs.entregar','fr.ordenes','fr.bodega','fr.compras','fm.revisar']) c
on conflict do nothing;

-- Comprobación: quién puede editar algo de Frisa (debe salir solo admin_general con 9) y cuántos roles ven.
select rol, count(*) as permisos_de_edicion
from public.rol_permisos
where clave in ('fn.capturar','fn.supuestos','fs.oc','fs.surtir','fs.entregar','fr.ordenes','fr.bodega','fr.compras','fm.revisar')
group by rol
union all
select 'roles que ven Frisa', count(distinct rol) from public.rol_permisos where clave in ('fn.ver', 'fs.ver');
