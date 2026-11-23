---
clave: atr
titulo: Inventario ATR
---
## Resumen

**Inventario ATR** lleva todo lo de ATR, cliente al que solo le hacemos batas: el **inventario** por bata y talla, las **órdenes de compra (OC)** que nos manda, el **surtido** de cada OC y **qué nos falta** producir. Lo que se surte se descuenta del inventario; lo que se produce en las órdenes de taller de ATR **entra solo** al completar Terminado.

El flujo es: llega la OC → se sube → se revisa qué falta → se surte lo que hay → se hace la orden de taller por lo que falta → al terminarla entra al inventario → se surte el resto.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: suben y cancelan OC, surten, hacen órdenes de taller, ajustes, carga inicial y deshacen surtidos.
- **Terminado**: surte las OC y registra entregas.
- **Contabilidad**: consulta y hace órdenes de taller de ATR (solo de ATR).
- **Admin tienda** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- Para subir una OC: el PDF que mandó ATR.
- Para surtir: tener las batas físicamente listas.
- Para una orden de taller: la fecha de entrega y la tela de cada bata.

## Procesos paso a paso

### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR** (pestaña **Inventario**).
2. Busca en **Buscar color, talla…** o filtra por producto.
3. Cada línea dice **Producto**, **Talla**, **Color** y **Existencia**. Toca una línea para ver su historial (con la orden o la OC de cada movimiento).

### Cómo subir una orden de compra

1. Entra a la pestaña **Órdenes de compra** y dale **+ Nueva OC**.
2. En **PDF de la orden de compra** elige el archivo. El sistema lo lee y llena el **Número de OC**, las fechas y los renglones. El PDF se ve a un lado.
3. Revisa cada renglón contra el PDF: **bata**, **talla** y **cantidad**. Los que salen en rojo no ligaron con el catálogo: elige la bata en **Elige la bata…** o dale **Dar de alta bata nueva** (con o sin bolsa + color).
4. Marca **Revisé cada renglón contra el PDF (bata, talla y cantidad)**.
5. Dale **Guardar OC**.

> Si el número de OC ya existe, sale "Esta OC ya está subida" con la liga para verla.

### Cómo ver las órdenes de compra

1. En **Órdenes de compra** salen primero las **abiertas y parciales**, por fecha de entrega.
2. Filtra por estado o busca el folio.
3. Toca una OC para ver su detalle: por bata y talla, **Pedido**, **Surtido**, **Pendiente** y **Existencia**. Dale **Ver PDF** para verla junto.

### Cómo saber qué nos falta

1. Entra a la pestaña **Qué nos falta**.
2. Por bata y talla ves: **Pendiente** (lo que falta surtir de las OC abiertas), **Existencia**, **En taller** (órdenes de ATR que todavía no terminan, con su folio) y **Faltante**.
3. Marca **Solo con faltante** para ver solo lo que hay que producir.
4. Dale **CSV** o **PDF** para bajar la lista.

### Cómo surtir una OC

1. Abre la OC y dale **Surtir**.
2. En cada línea ya viene lo que alcanza con la existencia. Cámbialo si hace falta, o usa **Lo que alcanza**, **Todo lo pendiente** o **Borrar**.
3. Si quieres, pon una **Nota (opcional)**.
4. Dale **Surtir y ver hoja**. Se abre la **hoja de surtido** en PDF: dale **Descargar** para imprimirla.

> Se puede surtir parcial: la OC queda **Parcial** hasta completar. No deja surtir más de lo pendiente. Si alguna talla quedaría en negativo, pide marcar "Sí, sí salen" antes de guardar.

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
3. Las batas regresan al inventario y la OC vuelve a **Parcial** o **Abierta**. El surtido queda tachado con quién y por qué.

### Cómo cancelar una OC (administradores)

1. Abre la OC y dale **Cancelar OC**.
2. Escribe el motivo y dale **Sí, cancelar OC**.

> Lo que ya se surtió **no** regresa solo al inventario. Si debe regresar, deshaz el surtido antes de cancelar.

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
| "Entrega en N días" en rojo / ámbar | Igual que en las órdenes: vence en 3 días o menos / en 7 días o menos. |
| Fila **roja** en Qué nos falta | Falta producir. |
| Fila **amarilla** en Qué nos falta | Alcanza, pero solo contando lo que está en taller. |
| **Existencia** en rojo | Hay menos de cero. Revisa con un conteo. |
| **Sumado al inventario ATR ✓** | Lo producido en esa orden ya entró al inventario. |

## Si eres de…

- **Admin fábrica / Administración general**: subes las OC, revisas qué falta, haces las órdenes de taller y surtes.
- **Terminado**: surtes las OC y entregas la hoja de surtido.
- **Contabilidad**: consultas y haces órdenes de taller de ATR.
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
