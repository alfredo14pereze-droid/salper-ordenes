-- Manuales (página): PDF del pedido para el proveedor. Correr una sola vez.
update public.manuales m
   set contenido = replace(contenido, $q$En la lista de pedidos cada uno dice su costo.$q$, $q$En la lista de pedidos cada uno dice su costo.
- **PDF para el proveedor**: cada pedido tiene ese botón. Arma un PDF con el número de pedido, proveedor, fecha, piezas por talla, precio, subtotal, IVA y total; tócalo, revisa la vista previa, **Descargar** y mándaselo por WhatsApp o correo.$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (PDF para el proveedor)'
 where m.eliminado_en is null
   and contenido not like '%PDF para el proveedor%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%PDF para el proveedor%') as ya_lo_explica
from public.manuales where eliminado_en is null;
