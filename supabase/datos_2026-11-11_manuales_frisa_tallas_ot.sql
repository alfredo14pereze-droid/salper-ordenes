-- Manuales (página): agregar tallas a la orden de taller. Correr una sola vez.
update public.manuales m
   set contenido = replace(replace(contenido,
    $q$1. Revisa las cantidades por talla. Puedes cambiarlas (por ejemplo, redondear).$q$,
    $q$1. Revisa las cantidades por talla. Salen **todas las tallas** de la prenda: las que hay que pedir ya traen cantidad (dice **"sugerido"**) y las demás están en blanco. Puedes cambiar cualquiera o **agregar** tallas (por ejemplo, redondear o pedir XL).$q$),
    $q$> Cada orden de taller gasta un folio FR real. **No crees órdenes de prueba.**$q$,
    $q$> ¿Quieres una orden de taller de una prenda que no salió? Abajo de las tarjetas, en **"Orden de taller de otro producto"**, elige la prenda: sale su tarjeta con todas las tallas en blanco.

> Cada orden de taller gasta un folio FR real. **No crees órdenes de prueba.**$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (tallas en orden de taller)'
 where m.eliminado_en is null
   and contenido not like '%Orden de taller de otro producto%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Orden de taller de otro producto%') as ya_lo_explica
from public.manuales where eliminado_en is null;
