-- Manuales (página): las entregas suman a la planta (V199). Se puede correr dos veces.
update public.manuales m
   set contenido = replace(replace(replace(replace(contenido,
    '5. Toca **Confirmar entrega**. La orden pasa a **Entregadas** y sus piezas se descuentan del inventario de la fábrica.',
    '5. Toca **Confirmar entrega**. La orden pasa a **Entregadas**, sus piezas se descuentan del inventario de la fábrica y **se suman a la planta** de esa orden. Escribe el folio **igual que en Microsip**.'),
    'Lo que hay en cada planta = **remitido − facturado**. No tiene que ver con la bodega: lo entregado por el chofer no se suma aquí, para no contarlo dos veces.',
    'Lo que hay en cada planta = **remitido − facturado**.

- **Remisiones:** cada entrega confirmada en la página ("Ya entregó el chofer") se suma **sola** a su planta, con su folio de remisión.
- **Facturas:** se suben con los Diarios de Microsip y **restan**.
- Si el Excel trae una remisión que ya se sumó con la entrega, se **salta sola** (no se cuenta doble).'),
    '- Se alimenta subiendo los **"Diarios del inventario"** de Microsip (Concepto: Remisión y Venta).
',
    ''),
    '1. En Microsip saca **"Diarios del inventario"**, línea FRISA, del periodo que falte: **Concepto: Remisión** (lo entregado) y **Concepto: Venta** (lo facturado).',
    '1. En Microsip saca **"Diarios del inventario"**, línea FRISA, del periodo que falte: **Concepto: Venta** (lo facturado) y, si quieres revisar, también **Concepto: Remisión**.'),
       actualizado_en = now(), actualizado_por_nombre = 'Actualización (entregas suman a la planta)'
 where m.eliminado_en is null
   and m.seccion_id in (select id from public.manual_secciones where lower(btrim(nombre)) = 'frisa' and eliminado_en is null);

select count(*) filter (where contenido like '%lo entregado por el chofer no se suma aquí%') as siguen_viejos,
       count(*) filter (where contenido like '%se suma **sola** a su planta%') as ya_dicen_que_suma
from public.manuales where eliminado_en is null;
