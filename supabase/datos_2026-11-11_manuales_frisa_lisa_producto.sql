-- Manuales (página): playera lisa con totales y separada con / sin reflejante. Correr una sola vez.
update public.manuales m
   set contenido = replace(replace(contenido,
    $q$- **Hay**: lo que está en el anaquel.
- **Necesitan**: lo que piden las órdenes de taller que hay que crear.$q$,
    $q$- **Hay**: lo que está en el anaquel.
- **Necesitan**: lo que piden las órdenes de taller que hay que crear (abajo dice cuántas son con reflejante y cuántas sin reflejante).$q$),
    $q$## Pasos

1. Revisa el desglose y las cantidades a pedir.$q$,
    $q$Arriba de la tabla de playera lisa salen los totales: **Hay en anaquel**, **En proceso** (ya en órdenes de taller), **Faltan por hacer** (lo que piden las órdenes sugeridas), **A comprar** y el **Total** (en proceso + faltan por hacer). Cada talla se separa por producto: **Con reflejante** y **Sin reflejante**, aunque sea la misma lisa, para ver a cuál va cada una. "Piden" ya descuenta lo que está en proceso.

## Pasos

1. Revisa el desglose y las cantidades a pedir.$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (lisa por producto)'
 where m.eliminado_en is null
   and contenido not like '%Faltan por hacer%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Faltan por hacer%') as ya_lo_explica
from public.manuales where eliminado_en is null;
