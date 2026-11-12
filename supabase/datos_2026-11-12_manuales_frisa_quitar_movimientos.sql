-- Manuales (página): quitar Movimientos (pestaña y reporte), que solo ve el administrador.
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(contenido,
    $q$

## Pestaña Movimientos

En **Frisa → Movimientos** sale cada entrada y salida del inventario, la más reciente arriba, con su **motivo**: **Entrega a Frisa** (con la OC y la planta), **Orden de taller subida a bodega** (con su folio FR), **Compra recibida** (con el número de compra y proveedor), **Ajuste por conteo** (con el motivo que se escribió) o **Ajuste por revisión Microsip**. Arriba dice cuántas entradas y salidas hay. Se filtra por fechas, por tipo (salidas, entradas, ajustes) y se puede buscar un producto, una OC, una orden de taller o quién lo hizo. También tiene la **playera lisa** (compras, salidas al taller y regresos).

> Cuando captures un conteo en Niveles, escribe el **motivo** (por ejemplo "conteo físico: 3 dañadas"): es lo que va a decir Movimientos.$q$,
    $q$

> Cuando captures un conteo en Niveles, escribe el **motivo** del ajuste (por ejemplo "conteo físico: 3 dañadas").$q$),
    $q$| Movimientos | Cada entrada y salida del inventario con su motivo. | Admins (vista) |
$q$,
    $q$$q$),
    $q$ El reporte **Movimientos del inventario** (Reportes) trae cada entrada y salida con fecha, quién y por qué.$q$,
    $q$$q$),
    $q$Historial de la clave y reporte de Movimientos → conteo real → ajuste$q$,
    $q$Historial de la clave → conteo real → ajuste (con su motivo)$q$),
    $q$Inventario de la fábrica, Movimientos, Órdenes de surtido$q$,
    $q$Inventario de la fábrica, Órdenes de surtido$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (quitar Movimientos)'
 where m.eliminado_en is null
   and contenido like '%Movimientos%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Movimientos%') as siguen_mencionando_movimientos
from public.manuales m
where m.eliminado_en is null
  and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);
