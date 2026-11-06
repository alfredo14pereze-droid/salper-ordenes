-- =====================================================================
-- Datos 2026-11-06 — Frisa: la ven solo admin_general, admin_fabrica y admin_tienda.
-- =====================================================================
-- Pedido de Alfredo: "que puedan ver los admin tienda y admin fábrica, y solo
-- yo poder moverle". Quita los permisos de VER Frisa (fn.ver, fs.ver) a todos
-- los demás roles: dejan de ver "Frisa" en el menú y la base no les regresa
-- nada (la RLS de las tablas frisa_* usa esos permisos). Los de EDITAR ya solo
-- los tiene admin_general (datos_2026-11-06_frisa_solo_admin_general_edita.sql).
-- Queda en rol_permisos_log; se revierte en Roles y permisos. Se puede correr dos veces.
-- =====================================================================

with quitados as (
  delete from public.rol_permisos
  where clave in ('fn.ver', 'fs.ver') and rol not in ('admin_general', 'admin_fabrica', 'admin_tienda')
  returning rol, clave
)
insert into public.rol_permisos_log (cambiado_por, cambiado_por_nombre, rol, clave, permitido)
select null, 'Frisa: la ven solo los administradores (2026-11-06)', rol, clave, false from quitados;

insert into public.rol_permisos (rol, clave)
select r, c from unnest(array['admin_general', 'admin_fabrica', 'admin_tienda']) r cross join unnest(array['fn.ver', 'fs.ver']) c
on conflict do nothing;

-- Comprobación: quién ve y quién edita Frisa.
select rol,
       count(*) filter (where clave in ('fn.ver', 'fs.ver')) as permisos_de_ver,
       count(*) filter (where clave in ('fn.capturar','fn.supuestos','fs.oc','fs.surtir','fs.entregar','fr.ordenes','fr.bodega','fr.compras','fm.revisar')) as permisos_de_editar
from public.rol_permisos
where clave in ('fn.ver','fs.ver','fn.capturar','fn.supuestos','fs.oc','fs.surtir','fs.entregar','fr.ordenes','fr.bodega','fr.compras','fm.revisar')
group by rol
order by rol;
