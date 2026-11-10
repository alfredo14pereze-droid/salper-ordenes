-- Manuales (página): las facturas las sube contabilidad cada quincena. Se puede correr dos veces.
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(contenido,
    $q$| Plantas Frisa | Lo que hay en cada planta (remitido − facturado). | Admins (vista) |$q$,
    $q$| Plantas Frisa | Lo que hay en cada planta (remitido − facturado). Contabilidad sube las facturas. | Contabilidad, admins (vista) |$q$),
    $q$- **Facturas:** se suben con los Diarios de Microsip y **restan**.$q$,
    $q$- **Facturas:** las sube **contabilidad** cada quincena con los Diarios de Microsip y **restan**.$q$),
    $q$1. En Microsip saca **"Diarios del inventario"**, línea FRISA, del periodo que falte: **Concepto: Venta** (lo facturado) y, si quieres revisar, también **Concepto: Remisión**. Pueden ir en un mismo Excel en dos hojas o en dos archivos.$q$,
    $q$1. Cuando se factura la quincena (normalmente una factura por planta), en Microsip saca **"Diarios del inventario"**, línea FRISA, **Concepto: Venta**, de esa quincena. Pueden venir todas las plantas en el mismo Excel: la página manda cada factura a su planta.$q$),
    $q$Hazlo cada semana (o cada 10 días junto con la revisión de Microsip). Si una planta sale con una clave en **negativo**, se facturó más de lo remitido: revisa las remisiones de ese periodo.$q$,
    $q$Hazlo **cada quincena**, después de facturar. Si una planta sale con una clave en **negativo**, se facturó más de lo remitido: casi siempre es una entrega que no se confirmó en la página (revisa las remisiones de ese periodo).$q$),
    $q$| Cada semana | Contar la playera lisa · subir remisiones y facturas a Plantas Frisa |$q$,
    $q$| Cada semana | Contar la playera lisa |
| Cada quincena | Contabilidad sube las facturas a Plantas Frisa |$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (contabilidad sube facturas)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%las sube **contabilidad** cada quincena%') as ya_lo_explica
from public.manuales where eliminado_en is null;
