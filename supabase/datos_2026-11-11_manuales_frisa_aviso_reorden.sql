-- Manuales (página): aviso de reorden con Hoy / Después. Sirve aunque no se haya corrido el SQL anterior.
update public.manuales m
   set contenido = case when contenido like '%Aviso de reorden:%'
                        then replace(contenido, $q$> **Aviso de reorden:** arriba de las pestañas **Pantalón** y **Playera lisa** sale una tabla, igual que en Niveles, con lo que está en **CRÍTICO**, **PEDIR** o **CERCA** del punto de reorden: real, disponible, mínimo, punto de reorden, máximo y lo que ya viene en camino. En Playera lisa muestra las playeras terminadas (con y sin reflejante), que son las que piden lisa.$q$, $q$> **Aviso de reorden:** arriba de las pestañas **Pantalón** y **Playera lisa** sale una tabla con el inventario actual, el punto de reorden y el máximo, y dos estados: **Hoy** (con lo que hay, igual que en Niveles) y **Después** (sumando lo que viene en órdenes de taller o pedidos). **CERCA** = a menos de 20% arriba del punto de reorden: para el siguiente pedido ya va a hacer falta. **CUBIERTA** = con lo que viene ya alcanza. En Playera lisa muestra las playeras terminadas (con y sin reflejante), que son las que piden lisa.$q$)
                        else replace(contenido, $q$El pantalón (y la bata y la bolsa) no se fabrica: se compra hecho.$q$, $q$> **Aviso de reorden:** arriba de las pestañas **Pantalón** y **Playera lisa** sale una tabla con el inventario actual, el punto de reorden y el máximo, y dos estados: **Hoy** (con lo que hay, igual que en Niveles) y **Después** (sumando lo que viene en órdenes de taller o pedidos). **CERCA** = a menos de 20% arriba del punto de reorden: para el siguiente pedido ya va a hacer falta. **CUBIERTA** = con lo que viene ya alcanza. En Playera lisa muestra las playeras terminadas (con y sin reflejante), que son las que piden lisa.

El pantalón (y la bata y la bolsa) no se fabrica: se compra hecho.$q$) end,
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (aviso de reorden)'
 where m.eliminado_en is null
   and contenido not like '%CUBIERTA** = con lo que viene%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%CUBIERTA** = con lo que viene%') as ya_lo_explica
from public.manuales where eliminado_en is null;
