---
clave: inventario-tela
titulo: Inventario de tela y consumos por prenda
---
## Resumen

**Inventario de tela** lleva cuánta tela hay de cada tipo, cuánta ya está **Comprometida** en órdenes abiertas y cuánta queda **Disponible**. El inventario es la suma de sus movimientos (entradas, consumos de corte y ajustes): nunca se escribe el número a mano. **Consumos por prenda** dice cuánta tela usa cada prenda; con eso se calcula lo comprometido de cada orden.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: registran entradas y ajustes, y manejan los consumos por prenda.
- **Captura de costura**: solo registra entradas de tela.

## Antes de empezar

- Que la tela esté en **Catálogos** con su unidad (metro o kilo).
- Para una entrada: cuánta tela llegó y, de preferencia, la factura del proveedor.
- Para un ajuste: el resultado del conteo físico.

## Procesos paso a paso

### Cómo registrar tela que llegó

1. En el menú, entra a **Inventario de tela**.
2. En **Entrada de tela**, elige la **Tela** y pon la **Cantidad recibida** (en su unidad: metros o kilos).
3. En **Nota (opcional)** pon de dónde viene (ej. "factura del proveedor").
4. Dale **Registrar entrada**. Sale "Entrada registrada.".

### Cómo revisar cuánta tela hay

1. Baja a **Inventario actual**.
2. Por cada tela ves la **Unidad**, el **Inventario actual**, lo **Comprometido** y lo **Disponible**.
3. Si **Disponible** sale en rojo (negativo), las órdenes abiertas necesitan más tela de la que hay: hay que comprar.

### Cómo corregir después de un conteo físico

1. En **Ajuste de inventario**, elige la **Tela**.
2. Pon la diferencia: en positivo si sobró, en negativo si faltó (ej. -3.5).
3. Escribe el **Motivo del ajuste** (ej. "conteo físico del 29/09").
4. Dale **Registrar ajuste**.

### Cómo dar de alta el consumo de una prenda

1. En el menú, entra a **Consumos por prenda** y dale **+ Nuevo consumo**.
2. Escribe la **Prenda** (ej. Playera).
3. En **Tallas** escribe las tallas separadas por coma (ej. 4, 6, 8). Si las dejas vacías, cuenta como promedio general de la prenda.
4. Pon el **Consumo** y la **Unidad** (**Metro** o **Kilo**).
5. Dale **Guardar**.
6. Para corregir o borrar, usa **Editar** o **Eliminar** en la lista.

### Cómo cargar muchos consumos con un archivo

1. En **Importar desde CSV**, sube un archivo con las columnas: prenda, tallas, consumo, unidad. La primera fila es el encabezado.
2. Si una prenda tiene varias tallas, sepáralas con " | " dentro de la columna de tallas.
3. Revisa la vista previa: cada fila dice si está bien o qué le falta.
4. Dale **Confirmar importación**. Solo se cargan las filas válidas.

### Cómo revisar si los consumos están bien

1. En **Consumos por prenda**, baja a **Precisión de consumos**.
2. Por cada prenda ves cuántos renglones se compararon y la **Diferencia promedio** entre lo estimado y lo que reportó corte.
3. Si dice "— revisar", corrige el consumo de esa prenda.

> Cuando una tela se reparte entre varias prendas de la misma orden, el real se reparte en proporción: es una aproximación.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Inventario actual** | Tela que hay en la fábrica. |
| **Comprometido** | Tela que van a necesitar las órdenes abiertas. |
| **Disponible** | Lo que queda libre: Inventario actual menos Comprometido. |
| **Disponible** en rojo | Falta tela para las órdenes abiertas. |
| **Diferencia promedio** en rojo, "— revisar" | El consumo de esa prenda está muy lejos de lo real. |

## Si eres de…

- **Admin fábrica / Administración general**: registras entradas y ajustes, y mantienes los consumos al día.
- **Captura de costura**: solo registras entradas; no ves **Ajuste de inventario**.

## Problemas comunes

- **La tela no sale en la lista** → No está en **Catálogos** o le falta la unidad. Dala de alta ahí primero.
- **Lo comprometido sale en 0** → Esa prenda no tiene consumo registrado. Dalo de alta en **Consumos por prenda**.
- **El inventario no cuadra con lo que hay** → Haz un conteo y registra la diferencia con **Ajuste de inventario**.
- **Una fila del CSV sale con error** → Revisa que tenga las 4 columnas y que la unidad sea metro o kilo.

## Se conecta con

- [Órdenes de tu estación](manual:estacion): Corte registra la tela que usó al dar **Cortado**.
- [Catálogos](manual:catalogos): donde se dan de alta las telas y su unidad.
