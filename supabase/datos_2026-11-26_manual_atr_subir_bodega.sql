-- =====================================================================
-- Datos 2026-11-26 — Manual "Inventario ATR": subir a bodega (V224).
-- Fuente: supabase/manuales/fabrica/4_atr.md. Requiere V224.
-- Solo reemplaza textos exactos; si alguien los cambió en la app, ese
-- reemplazo no hace nada y la comprobación sale false.
-- =====================================================================
update public.manuales
   set contenido = replace(replace(replace(replace(replace(replace(contenido,
         $a$lo que se produce en las órdenes de taller de ATR **entra solo** al completar Terminado.$a$,
         $b$lo que se produce en las órdenes de taller de ATR entra al inventario cuando Terminado la **sube a bodega** (pestaña **Por subir**).$b$),
         $a$→ se hace la orden de taller por lo que falta → al terminarla entra al inventario → se surte el resto.$a$,
         $b$→ se hace la orden de taller por lo que falta → al terminarla, Terminado la **sube a bodega** y entra al inventario → se surte el resto.$b$),
         $a$- **Terminado**: surte las OC (aparta las batas) y registra entregas.$a$,
         $b$- **Terminado**: surte las OC (aparta las batas), registra entregas y **sube a bodega** las órdenes de ATR terminadas.$b$),
         $a$también cuenta en **En taller** y entra al inventario al terminar. Si en Terminado salió de más, entra todo lo surtido.$a$,
         $b$también cuenta en **En taller** y entra al inventario cuando se sube a bodega. Si en Terminado salió de más, se sube todo lo surtido.$b$),
         $a$1. Terminado cierra la orden de ATR con sus cantidades reales.
2. Al completar Terminado, lo surtido se suma solo. En la orden sale **Sumado al inventario ATR ✓**.
3. Si se reabre Terminado o se elimina la orden, se resta solo (sale como **Reversa**).$a$,
         $b$Igual que en Frisa: terminar la orden no basta, hay que **subirla a bodega**.

1. Terminado cierra la orden de ATR con sus cantidades reales (**Confirmar y generar reporte**).
2. La orden queda en **Inventario ATR → Por subir** y, en la orden, sale **Falta subir a bodega**.
3. Cuando las batas ya están en bodega, toca **Subir a bodega** (en la pestaña **Por subir** o en la misma orden).
4. Vienen las piezas surtidas; corrige si subieron menos y dale **Confirmar: subir N batas**.
5. Ahí entran al inventario. En la orden sale **Subido a bodega ✓** y en **Por subir** queda en "Subidas en los últimos 15 días".

> Mientras no se sube, la orden sigue contando en **En taller** de Qué nos falta (marcada "por subir"). Si se reabre Terminado o se elimina la orden, lo subido se resta solo (sale como **Reversa**) y la orden vuelve a **Por subir** al terminarse otra vez.
> Pueden subir a bodega: **Terminado**, **Admin fábrica** y **Administración general**.$b$),
         $a$- **No se sumó lo de una orden** → Revisa que Terminado esté completado y que sus batas vengan del catálogo de ATR.$a$,
         $b$- **No se sumó lo de una orden** → Revisa que Terminado esté completado, que ya se haya **subido a bodega** (pestaña Por subir) y que sus batas vengan del catálogo de ATR.$b$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null
   and position('Igual que en Frisa: terminar la orden no basta' in contenido) = 0;

-- Comprobación (debe dar: true · true)
select
  (select bool_and(position('Igual que en Frisa: terminar la orden no basta' in contenido) > 0) from public.manuales where clave = 'atr' and eliminado_en is null) as manual_subir,
  (select bool_and(position('**entra solo** al completar Terminado' in contenido) = 0) from public.manuales where clave = 'atr' and eliminado_en is null) as sin_texto_viejo;
