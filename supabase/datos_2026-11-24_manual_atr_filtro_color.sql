-- Manual de Inventario ATR: el filtro de color ahora es una lista (2026-11-24).
update public.manuales
   set contenido = replace(contenido,
         'y tocando un **color**;',
         'y eligiendo el **color** en la lista (**Todos los colores**);'),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null and actualizado_por_nombre = 'Carga inicial';

-- Comprobación (debe dar: true)
select bool_and(position('eligiendo el **color**' in contenido) > 0) as manual_ok
from public.manuales where clave = 'atr' and eliminado_en is null;
