-- =====================================================================
-- Datos 2026-11-26 — Manuales "Inventario ATR" y "Crear una orden":
-- cantidades libres en la orden de taller y órdenes de ATR desde Nueva orden.
-- Fuente: supabase/manuales/fabrica/4_atr.md y supabase/manuales/ordenes/1_nueva-orden.md.
-- Requiere V223. Solo reemplaza textos exactos: si alguien ya los cambió en la
-- app, ese reemplazo no hace nada y la comprobación sale false.
-- =====================================================================
update public.manuales
   set contenido = replace(replace(contenido,
         $a$3. Se abre **Nueva orden** ya llena: tipo **Industrial**, cliente **ATR**, cada bata con cantidad = faltante. Cambia cantidades si hace falta (redondear o producir de más).$a$,
         $b$3. Se abre **Nueva orden** ya llena: tipo **Industrial**, cliente **ATR**, cada bata con cantidad = faltante (en gris, junto a la cantidad, dice cuántas faltan). Las cantidades son solo una sugerencia: súbelas, bájalas a 0, quita batas o agrega otras batas o tallas del catálogo de ATR. Basta con una talla con cantidad.$b$),
         $a$> Va **sin precio**: es para inventario, lo que se cobra es la OC. No se liga a una OC; mientras no termine, cuenta en **En taller** para no pedir doble. Sigue las etapas normales.$a$,
         $b$> Va **sin precio**: es para inventario, lo que se cobra es la OC. No se liga a una OC; mientras no termine, cuenta en **En taller** para no pedir doble. Sigue las etapas normales.
>
> Una orden cuenta para ATR por su **cliente**, no por dónde se creó: una orden hecha desde **Nueva orden** con cliente **ATR** también cuenta en **En taller** y entra al inventario al terminar. Si en Terminado salió de más, entra todo lo surtido.$b$),
       actualizado_en = now()
 where clave = 'atr' and eliminado_en is null
   and position('por su **cliente**, no por dónde se creó' in contenido) = 0;

update public.manuales
   set contenido = replace(contenido,
         $a$### Cómo adjuntar la cotización y la orden de compra$a$,
         $b$### Cómo hacer una orden de ATR

1. Elige el tipo de orden **Industrial** y el cliente **ATR**.
2. En cada prenda elige la bata del **Catálogo de ATR** (no se puede escribir a mano) y la talla de la lista.
3. Captura las cantidades y la **Tela**, pon la **Fecha de entrega** y dale **Crear orden**.

> Va **sin precio** (lo que se le cobra a ATR es su orden de compra). Cuenta en **Inventario ATR → Qué nos falta** como "En taller" y, al completar Terminado, lo surtido entra solo al inventario de ATR.

### Cómo adjuntar la cotización y la orden de compra$b$),
       actualizado_en = now()
 where clave = 'nueva-orden' and eliminado_en is null
   and position('### Cómo hacer una orden de ATR' in contenido) = 0;

-- Comprobación (debe dar: true · true · true)
select
  (select bool_and(position('Las cantidades son solo una sugerencia' in contenido) > 0) from public.manuales where clave = 'atr' and eliminado_en is null)   as atr_cantidades,
  (select bool_and(position('por su **cliente**, no por dónde se creó' in contenido) > 0) from public.manuales where clave = 'atr' and eliminado_en is null) as atr_por_cliente,
  (select bool_and(position('### Cómo hacer una orden de ATR' in contenido) > 0) from public.manuales where clave = 'nueva-orden' and eliminado_en is null) as nueva_orden_atr;
