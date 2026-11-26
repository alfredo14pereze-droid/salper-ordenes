---
clave: atr
titulo: Inventario ATR
---
## Resumen

**Inventario ATR** lleva todo lo de ATR, cliente al que solo le hacemos batas: el **inventario** por bata y talla, las **órdenes de compra (OC)** que nos manda, el **surtido** de cada OC y **qué nos falta** producir. Lo que se surte se descuenta del inventario; lo que se produce en las órdenes de taller de ATR **entra solo** al completar Terminado.

El flujo es: llega la OC → se sube → se revisa qué falta → **Terminado surte** lo que hay (las batas quedan **apartadas**) → **contabilidad confirma la entrega con la factura** (ahí se descuentan del inventario) → se hace la orden de taller por lo que falta → al terminarla entra al inventario → se surte el resto. Con **Revisión Microsip** se compara el inventario contra Microsip.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: suben y cancelan OC, surten, hacen órdenes de taller, ajustes, carga inicial y deshacen surtidos.
- **Terminado**: surte las OC (aparta las batas) y registra entregas.
- **Contabilidad**: confirma las entregas con la factura (pestaña **Por facturar**), consulta y hace órdenes de taller de ATR (solo de ATR).
- **Admin tienda** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- Para subir una OC: el PDF que mandó ATR.
- Para surtir: tener las batas físicamente listas.
- Para una orden de taller: la fecha de entrega y la tela de cada bata.

## Procesos paso a paso

### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR** (pestaña **Inventario**).
2. Cada renglón es una bata: su **color** (la etiqueta viene del mismo color) y si es **● Con bolsa** (negra) u **○ Sin bolsa** (punteada). Salen todas las batas del catálogo, aunque estén en 0.
3. Las **tallas son columnas** (S, M, L, XL, 2XL, 3XL; XS, 4XL y 5XL salen si tienen algo) y al final el **Total**. Abajo, el total por talla.
4. Filtra con **Todas / ● Con bolsa / ○ Sin bolsa** y eligiendo el **color** en la lista (**Todos los colores**); también puedes buscar o marcar **Solo con existencia**.
5. Toca un número para ver el historial de esa bata y talla (con la orden o la OC de cada movimiento).

### Cómo subir una orden de compra

1. Entra a la pestaña **Órdenes de compra** y dale **+ Nueva OC**.
2. En **PDF de la orden de compra** elige el archivo. El sistema lo lee y llena el **Número de OC**, las fechas y los renglones. El PDF se ve a un lado.
3. Revisa cada renglón contra el PDF: **bata**, **talla** y **cantidad**. Los que salen en rojo no ligaron con el catálogo: elige la bata en **Elige la bata…** o dale **Dar de alta bata nueva** (con o sin bolsa + color).
4. Marca **Revisé cada renglón contra el PDF (bata, talla y cantidad)**.
5. Dale **Guardar OC**.

> Si el número de OC ya existe, sale "Esta OC ya está subida" con la liga para verla.

### Cómo ver las órdenes de compra

1. En **Órdenes de compra** salen primero las **abiertas y parciales**, por fecha de entrega.
2. Arriba ves el resumen: cuántas OC están **pendientes**, cuántas **sí se pueden surtir** y cuántas **no se pueden surtir** (con las batas que faltan en total), y la tabla **Lo que falta por bata y talla**.
3. Cada OC dice en **verde "Se puede surtir"**, en **naranja "Alcanza, pero la ocupa OC…"** (otra que vence antes se lleva esas batas) o en **rojo "Faltan piezas"** con lo que falta y cuántas hay para surtir parcial.
4. Filtra por estado o busca el folio.
5. Toca una OC para ver su detalle: por bata y talla, **Pedido**, **Surtido**, **Pendiente** y **Existencia**. Dale **Ver PDF** para verla junto.

> El inventario se reparte **estrictamente por fecha de entrega**: la OC que vence primero toma lo que haya (aunque no se complete) y la siguiente se queda con lo que sobra. Si dos vencen el mismo día, va primero la orden más vieja.

### Cómo saber qué nos falta

1. Entra a la pestaña **Qué nos falta**.
2. Por bata y talla ves: **Pendiente** (lo que falta surtir de las OC abiertas), **Existencia**, **En taller** (órdenes de ATR que todavía no terminan, con su folio) y **Faltante**.
3. Marca **Solo con faltante** para ver solo lo que hay que producir.
4. Dale **CSV** o **PDF** para bajar la lista.

### Cómo surtir una OC

1. En **Órdenes de compra** salen todas las OC activas con su aviso (**Se puede surtir** / **Faltan piezas**). Abre la que vas a surtir.
2. En la tabla **Surtir**, por cada bata y talla escribe en **Apartar** cuántas batas estás juntando (o palomea ✓ para apartar todo lo pendiente). Se guarda al salir del campo. Abajo de cada renglón dice cuántas **hay** o cuántas **faltan**.
3. **Apartar lo que hay** llena todos los renglones con lo disponible.
4. Cuando termines, dale **Surtir lo apartado (N batas)**, elige **¿Quién surtió?** y confirma. Se abre la **hoja de surtido** en PDF: dale **Descargar** para imprimirla.
5. Ese surtido queda "Apartado · por facturar": siguen en la existencia, pero ya no están **disponibles** para otra OC. Se descuentan cuando contabilidad confirma la entrega con la factura.

> Se puede surtir **parcial**: la OC queda **Parcial** y cuando salgan más batas se abre otra vez, se aparta lo nuevo y se hace otro surtido, las veces que haga falta. No deja apartar más de lo pendiente ni más de lo disponible.

### Cómo confirmar una entrega con la factura (contabilidad)

1. Entra a la pestaña **Por facturar**. Salen los surtidos apartados de todas las OC, con sus batas y quién surtió.
2. Cuando ya se hizo la factura, escribe el **Número de factura** y dale **Confirmar entrega**.
3. Ahí esas batas **salen del inventario** y el surtido queda "Entregado · Factura …". También se puede confirmar desde el detalle de la OC.

### Cómo revisar el inventario contra Microsip

1. En Microsip saca el reporte **Existencia y valor del inventario** (línea ATR) en Excel.
2. Entra a la pestaña **Revisión Microsip** y súbelo.
3. Ves por bata y talla **Microsip**, **Página** y **Diferencia** (página − Microsip). Arriba: cuántas cuadran y cuántas tienen diferencia. Marca o quita **Solo con diferencia**.
4. Si el Excel trae varias hojas, se toma la de "Existencia y valor"; puedes cambiarla en **Hoja**.

> Solo revisa: no cambia nada. Lo apartado por facturar cuenta en la existencia (igual que en Microsip, que lo descuenta al facturar).

### Cómo hacer la orden de taller de lo que falta

1. En **Qué nos falta**, ya vienen marcadas las líneas con faltante. Marca o desmarca las que quieras (puedes marcar otras para producir de más).
2. Dale **Crear orden de taller (N batas)**.
3. Se abre **Nueva orden** ya llena: tipo **Industrial**, cliente **ATR**, cada bata con cantidad = faltante. Cambia cantidades si hace falta (redondear o producir de más).
4. Pon la **Fecha de entrega** y la **Tela** de cada bata.
5. Dale **Crear orden**.

> Va **sin precio**: es para inventario, lo que se cobra es la OC. No se liga a una OC; mientras no termine, cuenta en **En taller** para no pedir doble. Sigue las etapas normales.

### Cómo entra al inventario lo que se produce

1. Terminado cierra la orden de ATR con sus cantidades reales.
2. Al completar Terminado, lo surtido se suma solo. En la orden sale **Sumado al inventario ATR ✓**.
3. Si se reabre Terminado o se elimina la orden, se resta solo (sale como **Reversa**).

### Cómo deshacer un surtido (administradores)

1. Abre la OC. Abajo, en **Surtidos de esta OC**, busca el surtido.
2. Dale **Deshacer**, escribe el motivo y dale **Sí, deshacer surtido**.
3. Si estaba **apartado**, las batas se liberan. Si ya estaba **entregado** (con factura), regresan al inventario. La OC vuelve a **Parcial** o **Abierta** y el surtido queda como deshecho, con quién y por qué.

### Cómo cancelar una OC (administradores)

1. Abre la OC y dale **Cancelar OC**.
2. Escribe el motivo y dale **Sí, cancelar OC**.

> Lo **apartado** se libera solo. Lo ya **entregado** (con factura) **no** regresa al inventario: si debe regresar, deshaz ese surtido antes de cancelar.

### Otros (administradores)

- **Registrar entrega a ATR**: una salida suelta, sin OC.
- **Ajuste**: corrige una línea tras un conteo (nota obligatoria).
- **Carga inicial**: sube un Excel o CSV con lo que había al empezar.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Abierta** (rojo) | No se ha surtido nada de la OC. |
| **Parcial** (amarillo) | Se surtió una parte. |
| **Surtida** (verde) | Ya se surtió todo. |
| **Cancelada** (tachada) | Se canceló; ya no cuenta en Qué nos falta. |
| **Se puede surtir** (verde) | Hay batas para surtir todo lo pendiente de esa OC. |
| **Alcanza, pero la ocupa OC…** (naranja) | Sola alcanzaría, pero otra OC que vence antes se lleva esas batas. |
| **Faltan piezas** (rojo) | No alcanza: dice qué falta y cuántas hay para surtir parcial. |
| "Entrega en N días" en rojo / ámbar | Igual que en las órdenes: vence en 3 días o menos / en 7 días o menos. |
| Fila **roja** en Qué nos falta | Falta producir. |
| Fila **amarilla** en Qué nos falta | Alcanza, pero solo contando lo que está en taller. |
| **Existencia** en rojo | Hay menos de cero. Revisa con un conteo. |
| **Sumado al inventario ATR ✓** | Lo producido en esa orden ya entró al inventario. |
| **Apartado · por facturar** (amarillo) | Terminado ya surtió; falta que contabilidad confirme con la factura. Sigue en existencia, no está disponible. |
| **Entregado · Factura …** (verde) | Contabilidad confirmó: ya salió del inventario. |
| **ap. N** en el inventario | De esa existencia, N batas están apartadas por facturar. |

## Si eres de…

- **Admin fábrica / Administración general**: subes las OC, revisas qué falta, haces las órdenes de taller y surtes.
- **Terminado**: surtes las OC (apartas) y entregas la hoja de surtido.
- **Contabilidad**: confirmas en **Por facturar** cada entrega con su factura, revisas contra Microsip y haces órdenes de taller de ATR.
- **Admin tienda / Consulta fábrica**: solo consultas.

## Problemas comunes

- **"Esta OC ya está subida"** → Ya existe con ese número. Ábrela desde la liga; si la anterior estaba mal, cancélala y súbela otra vez.
- **Renglón en rojo al subir la OC** → La descripción no ligó con el catálogo: asígnale la bata o dala de alta. La próxima vez se liga sola.
- **"No se puede surtir más de lo pendiente"** → Baja la cantidad a lo que falta de esa línea.
- **"Quedarían en negativo"** → Hay menos batas registradas de las que salen. Revisa; si de verdad salen, marca "Sí, sí salen".
- **No se sumó lo de una orden** → Revisa que Terminado esté completado y que sus batas vengan del catálogo de ATR.

## Se conecta con

- [Nueva orden](manual:nueva-orden): la orden de taller se crea con el formulario normal.
- [Órdenes de tu estación](manual:estacion): Terminado cierra la orden con sus cantidades reales.
- [Catálogos](manual:catalogos): el catálogo de batas de ATR.
