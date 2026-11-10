-- Manuales (página): confirmar entregas sin remisión y entrega parcial (V204).
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(replace(replace(replace(contenido,
    $q$Se hace **una remisión por cada OC**, así que cuando Leo regresa se confirman todas juntas:

1. En **Órdenes de surtido** toca **Surtidas**. Arriba sale **"Confirmar entregas de Leo (varias a la vez)"** con todas las órdenes surtidas.
2. Escribe el **folio de remisión de Microsip** de cada orden que **sí entregó**. Las que dejes en blanco se quedan en Surtidas.
3. Revisa la **Fecha de entrega** y toca **Confirmar … entregas**. Cada una se descuenta de la bodega y se suma a su planta.

> Escribe cada folio **igual que en Microsip**. Si pones el mismo folio en dos órdenes, la página no te deja confirmar.$q$,
    $q$Cuando Leo regresa se confirman todas juntas. **No hace falta escribir remisiones**: se ligan después con un resumen.

1. En **Órdenes de surtido** toca **Surtidas**. Arriba sale **"Confirmar entregas de Leo"** con todas las órdenes surtidas, ya marcadas **Entregada**.
2. Solo cambia las que **no** se entregaron bien: **Parcial** si se entregó una parte (escribe cuánto se entregó de cada producto) o **No se entregó** si no se entregó nada.
3. Revisa la **Fecha de entrega** y toca **Confirmar … entregas**. Cada una se descuenta de la bodega y se suma a su planta.

> **Parcial:** lo que faltó se queda en **Surtidas** (sigue apartado) y se entrega en el siguiente viaje. Si ya no se va a entregar, abre la orden y toca **Cerrar con lo entregado**: lo que faltó regresa a disponible. Lo ideal es que no pase.$q$),
    $q$4. Escribe el **Folio de remisión** de Microsip y la **Fecha de entrega**.
5. Toca **Confirmar entrega**. La orden pasa a **Entregadas**, sus piezas se descuentan del inventario de la fábrica y **se suman a la planta** de esa orden. Escribe el folio **igual que en Microsip**.$q$,
    $q$4. Deja **Se entregó todo**, o toca **Entrega parcial** y escribe cuánto se entregó de cada producto. Revisa la **Fecha de entrega** (la remisión es opcional).
5. Toca **Confirmar entrega**. Lo entregado se descuenta del inventario de la fábrica y **se suma a la planta** de esa orden. Si fue completa, pasa a **Entregadas**.$q$),
    $q$> **¿Se marcó surtida por error?** Ábrela en Surtidas y toca **Regresar a pendiente**.$q$,
    $q$> **¿Se marcó surtida por error?** Ábrela en Surtidas y toca **Regresar a pendiente** (solo si no se ha entregado nada).$q$),
    $q$| Surtidas → la orden → **Ya entregó el chofer** → remisión |$q$,
    $q$| Surtidas → **Confirmar entregas de Leo** (o la orden → Ya entregó el chofer) |$q$),
    $q$- **Remisiones:** cada entrega confirmada en la página ("Ya entregó el chofer") se suma **sola** a su planta, con su folio de remisión.$q$,
    $q$- **Entregas:** cada entrega confirmada en la página se suma **sola** a su planta (las parciales, con lo que sí se entregó).$q$),
    $q$- Si el Excel trae una remisión que ya se sumó con la entrega, se **salta sola** (no se cuenta doble).$q$,
    $q$- Del Excel de Microsip **solo cuentan las facturas**: si trae remisiones, no se suman (lo entregado ya entró al confirmar).$q$),
    $q$(revisa las remisiones de ese periodo).$q$,
    $q$(revisa las entregas de ese periodo).$q$),
    $q$| Leo regresó de entregar (Gis) | Órdenes de surtido → Surtidas → un folio de remisión por orden → Confirmar entregas |$q$,
    $q$| Leo regresó de entregar (Gis) | Órdenes de surtido → Surtidas → marcar solo las que no se entregaron bien → Confirmar entregas |$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (entregas sin remisión)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%No hace falta escribir remisiones%') as ya_lo_explica,
       count(*) filter (where contenido like '%un folio de remisión por orden%' or contenido like '%una remisión por cada OC%') as siguen_viejos
from public.manuales where eliminado_en is null;
