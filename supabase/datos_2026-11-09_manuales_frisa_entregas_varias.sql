-- Manuales (página): confirmar varias entregas a la vez. Se puede correr dos veces.
update public.manuales m
   set contenido = replace(replace(contenido,
    '## Pasos

1. En **Órdenes de surtido** toca el botón **Surtidas**. Ahí están las órdenes embolsadas que todavía no se confirman como entregadas.
2. Toca la orden que el chofer ya entregó.',
    '## Varias a la vez (lo normal)

Se hace **una remisión por cada OC**, así que cuando Leo regresa se confirman todas juntas:

1. En **Órdenes de surtido** toca **Surtidas**. Arriba sale **"Confirmar entregas de Leo (varias a la vez)"** con todas las órdenes surtidas.
2. Escribe el **folio de remisión de Microsip** de cada orden que **sí entregó**. Las que dejes en blanco se quedan en Surtidas.
3. Revisa la **Fecha de entrega** y toca **Confirmar … entregas**. Cada una se descuenta de la bodega y se suma a su planta.

> Escribe cada folio **igual que en Microsip**. Si pones el mismo folio en dos órdenes, la página no te deja confirmar.

## Una sola orden

1. En **Órdenes de surtido** toca el botón **Surtidas**. Ahí están las órdenes embolsadas que todavía no se confirman como entregadas.
2. Toca la orden que el chofer ya entregó.'),
    '| Leo ya entregó una orden (Gis) | Órdenes de surtido → Surtidas → la orden → Ya entregó el chofer → remisión → Confirmar entrega |',
    '| Leo regresó de entregar (Gis) | Órdenes de surtido → Surtidas → un folio de remisión por orden → Confirmar entregas |'),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (entregas varias a la vez)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Varias a la vez (lo normal)%') as ya_lo_explica
from public.manuales where eliminado_en is null;
