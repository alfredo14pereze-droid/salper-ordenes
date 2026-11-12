-- Manuales (página): pestaña Movimientos de Frisa. Correr una sola vez.
update public.manuales m
   set contenido = replace(replace(contenido,
    $q$El reporte **Movimientos del inventario** (Reportes) trae cada entrada y salida con fecha, quién y por qué.$q$,
    $q$El reporte **Movimientos del inventario** (Reportes) trae cada entrada y salida con fecha, quién y por qué.

## Pestaña Movimientos

En **Frisa → Movimientos** sale cada entrada y salida del inventario, la más reciente arriba, con su **motivo**: **Entrega a Frisa** (con la OC y la planta), **Orden de taller subida a bodega** (con su folio FR), **Compra recibida** (con el número de compra y proveedor), **Ajuste por conteo** (con el motivo que se escribió) o **Ajuste por revisión Microsip**. Arriba dice cuántas entradas y salidas hay. Se filtra por fechas, por tipo (salidas, entradas, ajustes) y se puede buscar un producto, una OC, una orden de taller o quién lo hizo. También tiene la **playera lisa** (compras, salidas al taller y regresos).

> Cuando captures un conteo en Niveles, escribe el **motivo** (por ejemplo "conteo físico: 3 dañadas"): es lo que va a decir Movimientos.$q$),
    $q$| Revisión Microsip | Comparar el inventario con Microsip y ajustar. | Admins (vista) |$q$,
    $q$| Movimientos | Cada entrada y salida del inventario con su motivo. | Admins (vista) |
| Revisión Microsip | Comparar el inventario con Microsip y ajustar. | Admins (vista) |$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (pestaña Movimientos)'
 where m.eliminado_en is null
   and contenido not like '%Pestaña Movimientos%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Pestaña Movimientos%' or contenido like '%| Movimientos | Cada entrada%') as ya_lo_explica
from public.manuales where eliminado_en is null;
