-- =====================================================================
-- Datos 2026-11-23 — Manual de Inventario ATR: avisos verde/rojo en las OC
-- =====================================================================
-- Fuente: supabase/manuales/fabrica/4_atr.md. Solo cambia la sección "Cómo ver
-- las órdenes de compra" y agrega 3 filas a la tabla de colores, SOLO si el
-- manual sigue como lo dejó la carga (no lo editaron en la app). Se puede
-- correr dos veces (la segunda no cambia nada).
-- =====================================================================
update public.manuales
   set contenido = replace(replace(contenido,
$a$### Cómo ver las órdenes de compra

1. En **Órdenes de compra** salen primero las **abiertas y parciales**, por fecha de entrega.
2. Filtra por estado o busca el folio.
3. Toca una OC para ver su detalle: por bata y talla, **Pedido**, **Surtido**, **Pendiente** y **Existencia**. Dale **Ver PDF** para verla junto.
$a$,
$b$### Cómo ver las órdenes de compra

1. En **Órdenes de compra** salen primero las **abiertas y parciales**, por fecha de entrega.
2. Arriba ves el resumen: cuántas OC están **pendientes**, cuántas **sí se pueden surtir** y cuántas **no se pueden surtir** (con las batas que faltan en total), y la tabla **Lo que falta por bata y talla**.
3. Cada OC dice en **verde "Se puede surtir"**, en **naranja "Alcanza, pero la ocupa OC…"** (otra que vence antes se lleva esas batas) o en **rojo "Faltan piezas"** con lo que falta y cuántas hay para surtir parcial.
4. Filtra por estado o busca el folio.
5. Toca una OC para ver su detalle: por bata y talla, **Pedido**, **Surtido**, **Pendiente** y **Existencia**. Dale **Ver PDF** para verla junto.

> El inventario se reparte de la OC que vence primero a la última, igual que en Frisa.
$b$),
$c$| **Cancelada** (tachada) | Se canceló; ya no cuenta en Qué nos falta. |$c$,
$d$| **Cancelada** (tachada) | Se canceló; ya no cuenta en Qué nos falta. |
| **Se puede surtir** (verde) | Hay batas para surtir todo lo pendiente de esa OC. |
| **Alcanza, pero la ocupa OC…** (naranja) | Sola alcanzaría, pero otra OC que vence antes se lleva esas batas. |
| **Faltan piezas** (rojo) | No alcanza: dice qué falta y cuántas hay para surtir parcial. |$d$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null
   and actualizado_por_nombre = 'Carga inicial'
   and position('Alcanza, pero la ocupa OC' in contenido) = 0;

-- Comprobación (debe dar: 1 · true)
select count(*) as manuales_atr,
       bool_and(position('Se puede surtir** (verde)' in contenido) > 0) as trae_avisos
from public.manuales where clave = 'atr' and eliminado_en is null;
