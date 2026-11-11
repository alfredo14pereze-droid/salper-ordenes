-- Manuales (página): precio e importe en los pedidos. Correr una sola vez.
update public.manuales m
   set contenido = replace(contenido, $q$- **A pedir**: las de PEDIR ya traen la cantidad que falta. Las de OK vienen en 0. Puedes cambiar cualquiera.$q$, $q$- **A pedir**: las de PEDIR ya traen la cantidad que falta. Las de OK vienen en 0. Puedes cambiar cualquiera.
- **Precio / Importe**: lo que cuesta cada pieza y cada renglón. Abajo sale el **total del pedido en pesos**, y también en el botón. En la lista de pedidos cada uno dice su costo.$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (precios en pedidos)'
 where m.eliminado_en is null
   and contenido not like '%total del pedido en pesos%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%total del pedido en pesos%') as ya_lo_explica
from public.manuales where eliminado_en is null;
