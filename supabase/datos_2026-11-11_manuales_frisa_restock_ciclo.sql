-- Manuales (página): restock por ciclo (playera 7 + 10, pantalón 10 + 10). Correr una sola vez.
update public.manuales m
   set contenido = replace(replace(replace(replace(contenido,
    $q$Restock calcula qué hay que reponer: **disponible + en proceso + por entrar = proyectado**. Si el proyectado llega al reorden, propone lo que falta para el máximo.$q$,
    $q$Restock pide **por ciclo**: la **playera** se pide **cada 7 días** y tarda **10 días** en el taller (lo de hoy tiene que alcanzar **17 días**); el **pantalón** (y bata, bolsa) se pide **cada 10 días** y tarda **10 días** en llegar (tiene que alcanzar **20 días**). Para cada producto calcula cuánto va a quedar cuando llegue el siguiente pedido (hay + viene − lo que se vende en esos días):

- **CRÍTICO**: va a quedar en el mínimo o abajo.
- **PEDIR**: va a quedar en el punto de reorden o abajo.
- **CERCA**: va a quedar apenas arriba del punto de reorden (menos de 20%).
- **OK**: alcanza; no sale en la lista.

A los tres primeros les propone pedir lo que falta para estar en el **máximo** cuando llegue lo que se pide hoy.$q$),
    $q$## La tabla "Por pedir al taller"

En la pestaña **Órdenes de taller**: cada clave que se fabrica, con su estado (**CRÍTICO**, **PEDIR** u **OK**) y cuánto pedir. En la pestaña **Pantalón** está la misma tabla con lo que se compra hecho.$q$,
    $q$## La lista "Lo que no alcanza"

Arriba de cada pestaña sale solo lo que **no alcanza** hasta el siguiente pedido, con **Hay**, **Viene**, **Alcanza para** (días), **Estado** y **Pedir**. En **Órdenes de taller** y **Playera lisa** salen las prendas que se hacen en el taller; en **Pantalón**, lo que se compra hecho. Marca **Ver todas** para ver también las que están OK.$q$),
    $q$debajo de "Por pedir al taller" aparece una tarjeta$q$,
    $q$debajo de la lista "Lo que no alcanza" aparece una tarjeta$q$),
    $q$> **Aviso de reorden:** arriba de las pestañas **Pantalón** y **Playera lisa** sale una tabla con el inventario actual, el punto de reorden y el máximo, y dos estados: **Hoy** (con lo que hay, igual que en Niveles) y **Después** (sumando lo que viene en órdenes de taller o pedidos). **CERCA** = a menos de 20% arriba del punto de reorden: para el siguiente pedido ya va a hacer falta. **CUBIERTA** = con lo que viene ya alcanza. En Playera lisa muestra las playeras terminadas (con y sin reflejante), que son las que piden lisa.

$q$,
    $q$$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (restock por ciclo)'
 where m.eliminado_en is null
   and contenido not like '%Restock pide **por ciclo**%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Restock pide **por ciclo**%') as ya_lo_explica,
       count(*) filter (where contenido like '%Aviso de reorden:%' or contenido like '%La tabla "Por pedir al taller"%') as siguen_viejos
from public.manuales where eliminado_en is null;
