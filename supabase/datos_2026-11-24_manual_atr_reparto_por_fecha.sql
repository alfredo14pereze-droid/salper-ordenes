-- Manual de Inventario ATR: reparto estrictamente por fecha (2026-11-24).
update public.manuales
   set contenido = replace(contenido,
         $a$> El inventario se reparte de la OC que vence primero a la última, igual que en Frisa.$a$,
         $b$> El inventario se reparte **estrictamente por fecha de entrega**: la OC que vence primero toma lo que haya (aunque no se complete) y la siguiente se queda con lo que sobra. Si dos vencen el mismo día, va primero la orden más vieja.$b$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null and actualizado_por_nombre = 'Carga inicial';

-- Comprobación (debe dar: true)
select bool_and(position('estrictamente por fecha de entrega' in contenido) > 0) as manual_ok
from public.manuales where clave = 'atr' and eliminado_en is null;
