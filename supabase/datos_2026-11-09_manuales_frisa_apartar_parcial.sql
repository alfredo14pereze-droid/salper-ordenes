-- Manuales (página): apartar mercancía de una orden incompleta (V202). Correr una sola vez.
update public.manuales m
   set contenido = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(contenido,
    $q$> Frisa **no acepta parciales**: una orden solo se surte si está completa.$q$,
    $q$> Frisa **no acepta parciales**: una orden se entrega completa. Pero sí puedes ir **apartando** lo que haya de una orden incompleta, para que no se use en otras.$q$),
    $q$> Frisa **no acepta parciales**: solo se surte una orden si está completa. Empieza por las verdes, de arriba hacia abajo.$q$,
    $q$> Frisa **no acepta parciales**: la orden se entrega completa. Empieza por las verdes, de arriba hacia abajo. A las rojas les puedes ir **apartando** lo que haya.$q$),
    $q$2. Conforme metes cada renglón a la bolsa, **palomea** su cuadrito ✓. Se guarda solo, así puedes seguir después o desde otro celular. Abajo dice cuántos llevas: **"Embolsados 1 de 3 renglones"**.$q$,
    $q$2. Conforme metes cada renglón a la bolsa, **palomea** su cuadrito ✓ (aparta el renglón completo). Si solo metiste una parte, escribe cuántas en **Apartadas**. Se guarda solo, así puedes seguir después o desde otro celular. Abajo dice cuántas llevas: **"Apartadas 43 de 55 pzas"**.$q$),
    $q$Si la orden es de un solo renglón, puedes tocar directo **Surtida toda** sin palomear.$q$,
    $q$Si la orden es de un solo renglón, puedes tocar directo **Surtida toda** sin palomear.

> **¿La orden no está completa?** Toca **Apartar lo que hay**: se aparta todo lo que haya de cada renglón, o escribe en **Apartadas** cuántas metiste de un renglón. Esas piezas ya no se usan para otras órdenes. En la lista la orden dice **"Apartadas 43 de 55 pzas"**. Cuando llegue lo que falta, complétala y toca **Surtida toda**.$q$),
    $q$- **Frisa no acepta parciales**: una orden se surte solo si está completa.$q$,
    $q$- **Frisa no acepta parciales**: una orden se entrega completa. Mientras llega lo que falta, se puede ir **apartando** lo que hay.$q$),
    $q$**Apartado** = surtido que todavía no sale$q$,
    $q$**Apartado** = surtido o apartado que todavía no sale$q$),
    $q$- **Apartado**: lo que ya se surtió (está embolsado) pero el chofer todavía no entrega.$q$,
    $q$- **Apartado**: lo que ya se surtió o se apartó de una orden incompleta (está embolsado) y el chofer todavía no entrega.$q$),
    $q$| Leo embolsa una orden completa | Órdenes de surtido → la orden → **Surtida toda** | Se **aparta** (el real no cambia) | Quien surte |$q$,
    $q$| Leo embolsa una orden completa | Órdenes de surtido → la orden → **Surtida toda** | Se **aparta** (el real no cambia) | Quien surte |
| Leo aparta parte de una orden incompleta | Órdenes de surtido → la orden → **Apartar lo que hay** (o Apartadas) | Se **aparta** eso (el real no cambia) | Quien surte |$q$),
    $q$3. Toca **Crear orden de taller FR**.$q$,
    $q$3. Toca **Crear orden de taller**.$q$),
    $q$→ Crear orden de taller FR |$q$,
    $q$→ Crear orden de taller |$q$),
    $q$En Niveles toca la **clave** para ver su detalle$q$,
    $q$En Niveles toca el **producto** para ver su detalle$q$),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (apartar parcial)'
 where m.eliminado_en is null
   and contenido not like '%Apartar lo que hay%'
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%Apartar lo que hay%') as ya_lo_explica
from public.manuales where eliminado_en is null;
