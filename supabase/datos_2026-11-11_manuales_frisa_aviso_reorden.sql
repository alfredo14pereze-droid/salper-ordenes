-- Manuales (página): aviso de reorden en Pantalón y Playera lisa. Correr una sola vez.
update public.manuales m
   set contenido = replace(contenido,
    $q$El pantalón (y la bata y la bolsa) no se fabrica: se compra hecho.$q$,
    $q$> **Aviso de reorden:** arriba de las pestañas **Pantalón** y **Playera lisa** sale una tabla, igual que en Niveles, con lo que está en **CRÍTICO**, **PEDIR** o **CERCA** del punto de reorden: real, disponible, mínimo, punto de reorden, máximo y lo que ya viene en camino. En Playera lisa muestra las playeras terminadas (con y sin reflejante), que son las que piden lisa.

El pantalón (y la bata y la bolsa) no se fabrica: se compra hecho.$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (aviso de reorden)'
 where m.eliminado_en is null
   and contenido not like '%Aviso de reorden:%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Aviso de reorden:%') as ya_lo_explica
from public.manuales where eliminado_en is null;
