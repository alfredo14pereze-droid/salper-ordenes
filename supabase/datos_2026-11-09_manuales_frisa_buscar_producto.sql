-- Manuales (página): buscar un producto en Órdenes de surtido. Se puede correr dos veces.
update public.manuales m
   set contenido = replace(replace(contenido,
    $q$Sirve para surtir todas las de una planta al mismo tiempo.$q$,
    $q$Sirve para surtir todas las de una planta al mismo tiempo.

**Buscar un producto:** en el buscador escribe el producto (por ejemplo **"pantalon talla 34"** o **"roja manga corta talla M"**), la clave o el número de artículo. Solo quedan las órdenes que lo traen; cada una dice **"Trae: …"** con sus piezas y arriba sale el total. Busca en la pestaña que tengas elegida (Pendientes, Surtidas o Entregadas).$q$),
    $q$4. Para ver todas otra vez toca **Todas las plantas**.$q$,
    $q$4. Para ver todas otra vez toca **Todas las plantas**.

**Buscar un producto:** en el buscador escribe el producto (por ejemplo **"pantalon talla 34"** o **"roja manga corta talla M"**), la clave o el número de artículo. Solo quedan las órdenes que lo traen; cada una dice **"Trae: …"** con sus piezas y arriba sale el total. Busca en la pestaña que tengas elegida (Pendientes, Surtidas o Entregadas).$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (buscar producto)'
 where m.eliminado_en is null
   and contenido not like '%**Buscar un producto:**%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%**Buscar un producto:**%') as ya_lo_explica
from public.manuales where eliminado_en is null;
