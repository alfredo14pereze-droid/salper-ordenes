---
clave: inventario
titulo: Inventario de tienda
---
## Resumen

**Inventario** lleva la existencia de prendas de la tienda por sección (cliente o línea), modelo, talla y ubicación. Aquí registras lo que entra y sale, pasas mercancía de un lugar a otro (**Traspasos**), haces conteos físicos y revisas quién movió qué (**Movimientos**).

## ¿Quién lo usa?

- **Tienda (mostrador)**, **Admin tienda** y **Administración general**: registran entradas, salidas, traspasos y conteos.
- **Admin tienda** y **Administración general**: además dan de alta modelos y manejan la **Administración** del inventario.
- **Ventas tienda**, **Admin fábrica** y **Consulta tienda**: solo consultan existencias y movimientos.

## Antes de empezar

- Para una entrada: el modelo, la ubicación donde se guarda y cuántas piezas llegaron por talla.
- Para un conteo: tiempo para contar sin que se mueva mercancía.

## Procesos paso a paso

### Cómo buscar una prenda

1. En el menú, entra a **Inventario**.
2. Escribe en **Buscar en todo el inventario…** aunque sea abreviado (ej. "po tri 12" encuentra la polo de Tricio talla 12).
3. O elige la sección (cliente o línea) en las pestañas. Puedes filtrar por clasificación.
4. Arriba elige **Total** o una ubicación para ver la existencia de ese lugar.
5. Dale clic a una prenda para ver sus tallas. Con **Ver todo con tallas** abres todas.

### Cómo dar entrada a mercancía que llegó

1. Dale **Dar entrada**.
2. Busca el modelo (ej. "po tri") y elígelo.
3. Elige la **Ubicación** y el **Motivo**.
4. En **Cantidad que llegó por talla** escribe solo las tallas que llegaron; deja vacías las demás.
5. Abajo dice cuántas piezas van a entrar. Dale **Guardar entrada**.

### Cómo registrar una entrada o salida de una sola talla

1. En la talla, dale **+** (entrada) o **−** (salida).
2. Elige la **Ubicación**, pon la **Cantidad** y el **Motivo**. **Nota (opcional)**.
3. Dale **Registrar entrada** o **Registrar salida**.

> El sistema no deja sacar más piezas de las que hay en esa ubicación; si no alcanzan, te avisa "no alcanza para esta salida".

### Cómo ver el historial de una talla

1. Toca la talla.
2. Ves cada movimiento: entradas en verde y salidas en rojo, con fecha y quién lo hizo.

### Cómo sacar el reporte de existencias

1. Dale **Reporte**.
2. En **Alcance** elige **Consolidado (total)** o **Consolidado detallando almacenes**.
3. Deja **Todas las prendas** o elige solo algunas.
4. Dale **Generar reporte**. Sale el PDF.

### Cómo pasar mercancía de una ubicación a otra (Traspasos)

1. Dale **Traspasos** y luego **+ Nuevo traspaso**.
2. Elige **Origen** y **Destino** (tienen que ser distintos).
3. En **Agregar prenda** busca cada prenda y pon la cantidad.
4. Si quieres, escribe una **Nota (opcional)**.
5. Dale **Crear traspaso**. Se genera un folio (ej. **T-0001**) y su PDF.
6. Para volver a ver un traspaso, búscalo por folio y dale **Ver PDF**.

> Si junto a una prenda sale **— no alcanza**, en el origen no hay tantas piezas. El botón **Crear traspaso** no se activa hasta que bajes la cantidad o quites esa prenda.

### Cómo hacer un conteo físico

1. Dale **Conteo físico** y luego **+ Nuevo conteo**.
2. Elige la **Sección** y la **Ubicación**, y dale **Crear e imprimir**. Se toma la existencia de ese momento y se abre el PDF.
3. Imprímelo y cuenta las prendas.
4. Regresa a **Conteo físico** y, en ese conteo, dale **Capturar**.
5. En la columna **Conteo** escribe lo que contaste. Las diferencias contra **Sistema** salen en rojo.
6. Dale **Confirmar conteo**. Las diferencias se ajustan solas.

> No muevas mercancía de esa sección y ubicación mientras cuentas.

### Cómo revisar los movimientos

1. Dale **Movimientos**.
2. Elige el **Rango** de fechas.
3. Filtra por **Tipo** (**Entrada**, **Salida**, **Ajuste**, **Conteo**), **Sección** o **Ubicación**.
4. Cada renglón dice la prenda, la cantidad, el motivo, la nota y el **Usuario**. Arriba ves el total de entradas y salidas.

### Cómo dar de alta un modelo nuevo (Admin tienda)

1. Dale **+ Nuevo modelo**.
2. Elige o crea la sección (cliente o línea), el tipo de prenda, la variante (opcional) y el **Juego de tallas**.
3. Revisa la vista previa y dale **Confirmar y crear**. Se crea un artículo por talla.

> Para agregar una talla o un nombre corto a un modelo que ya existe, usa **+ Talla / alias** en esa prenda.

### Cómo manejar los catálogos (Admin tienda)

1. Dale **Administración**.
2. Elige la pestaña: **Secciones**, **Clasificaciones**, **Tipos de prenda**, **Tallas y juegos**, **Ubicaciones**, **Motivos** o **Artículos**.
3. Agrega o corrige lo que haga falta.
4. Si arriba de Inventario sale un aviso de artículos sin clasificar, dale **Clasificarlos →** y asígnales su tipo de prenda.

> Cambiar un juego de tallas no cambia los modelos que ya se crearon con él.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Talla resaltada con **mín. 5** | Hay menos piezas que ese mínimo: hay que resurtir. |
| Talla en gris / en 0 | No hay piezas. |
| **sin clasificar** | Artículo viejo que todavía no está en un modelo. |
| Número en verde / rojo en el historial | Entrada / salida. |
| **Confirmado** / **Pendiente de capturar** | Estado de un conteo físico. |

## Si eres de…

- **Tienda (mostrador)**: das entradas y salidas, haces traspasos y conteos.
- **Admin tienda / Administración general**: todo lo anterior, más modelos y catálogos.
- **Ventas / Admin fábrica / Consulta tienda**: consultas existencias y movimientos; no ves los botones para mover.

## Problemas comunes

- **"No hay suficiente existencia en esa ubicación"** → Revisa la ubicación elegida o la cantidad. Quizá la mercancía está en otro lugar: haz primero un traspaso.
- **No encuentro un modelo al dar entrada** → No está dado de alta. Pídele a Admin tienda que lo cree con **+ Nuevo modelo**.
- **"Elige un origen y un destino distintos"** → El traspaso es del mismo lugar al mismo lugar.
- **El conteo no cuadra con lo que veo hoy** → El conteo usa la existencia del momento en que se creó. Si se movió mercancía después, haz un conteo nuevo.

## Se conecta con

- [Pendientes tienda ↔ fábrica](manual:pendientes): las prendas que se dan de baja o se inventarían al mandarlas a fábrica.
- [Catálogos](manual:catalogos): los clientes de Órdenes que se usan como secciones.
