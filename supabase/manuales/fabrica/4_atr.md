---
clave: atr
titulo: Inventario ATR
---
## Resumen

**Inventario ATR** lleva las batas que se producen para ATR, por producto, talla y color. Lo que surte Terminado en las órdenes de ATR **se suma solo** al inventario; lo que se le entrega a ATR se registra como salida. Así siempre sabes cuántas batas hay listas.

## ¿Quién lo usa?

- **Terminado**, **Admin fábrica** y **Administración general**: registran entregas a ATR.
- **Admin fábrica** y **Administración general**: además hacen ajustes y la carga inicial.
- **Admin tienda** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- Para una entrega: qué batas se van (producto, talla y cantidad) y, si hay, el número de remisión.
- Para un ajuste: el resultado del conteo físico.

## Procesos paso a paso

### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR**.
2. Busca en **Buscar color, talla…** o filtra por producto.
3. Cada línea dice **Producto**, **Talla**, **Color** y **Existencia**. Arriba ves el total de batas.

### Cómo registrar una entrega a ATR

1. Dale **Registrar entrega a ATR**.
2. En **Agregar producto** elige una bata y escribe la cantidad por talla. Agrega todas las que se van.
3. Si quieres, pon una **Nota (opcional)** (ej. "Remisión 123, entregó Leo").
4. Dale **Registrar entrega (40)** (el número es el total).

> Si alguna talla quedaría en negativo, sale "Quedaría en negativo". Dale **Corregir** para revisar la cantidad, o **Registrar de todos modos** si de verdad se entregaron.

### Cómo ver el historial de una línea

1. Toca la línea.
2. Ves cada movimiento: **Carga inicial**, **Entrada de producción**, **Entrega a ATR**, **Ajuste** y **Reversa (se reabrió Terminado)**, con fecha, cantidad, orden, quién y nota.
3. Dale clic a la orden para abrirla.

### Cómo hacer un ajuste (administradores)

1. Dale **Ajuste** (o, desde el historial, **Hacer un ajuste de esta línea**).
2. Elige el **Producto** y la **Talla**.
3. Elige **+ Entran** o **− Salen** y escribe la cantidad. Abajo ves cuánto hay y cuánto quedaría.
4. Escribe la **Nota (obligatoria)** (ej. "Conteo físico del 20-nov").
5. Dale **Guardar ajuste**.

### Cómo hacer la carga inicial (administradores)

1. Dale **Carga inicial**.
2. Sube un archivo Excel (.xlsx) o CSV con columnas de producto, talla y cantidad (color opcional). Ej.: "Bata con bolsa · Blanca · CH · 10".
3. Elige qué columna es cada dato y la **Fecha de corte**.
4. Revisa cada renglón: en **Bata en catálogo** liga los que salen en rojo ("Sin ligar"), dales **Dar de alta** u **Omitir este renglón**.
5. Dale **Guardar carga inicial**.

> Si ya hay una carga inicial, otra carga **se suma** a la anterior. Para hacerla, marca "Sí, quiero hacer otra carga".

### Cómo se suma lo que produce Terminado

1. En una orden de ATR, Terminado cierra la orden con sus cantidades reales.
2. Al completar Terminado, lo surtido se suma solo al inventario. En la orden sale "Sumado al inventario ATR ✓".
3. Si se reabre Terminado, se resta solo (sale como **Reversa**).

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Existencia** en rojo | Hay menos de cero: se entregó más de lo registrado. Revisa con un conteo. |
| **Sumado al inventario ATR ✓** | Lo surtido de esa orden ya entró al inventario. |
| "1 prenda no viene del catálogo de ATR" | Esa prenda de la orden no se suma; hay que ligarla en el catálogo. |
| Movimiento tachado / "revertida" | Ese movimiento se deshizo. |

## Si eres de…

- **Terminado**: registras las entregas a ATR y ves lo que hay.
- **Admin fábrica / Administración general**: además haces ajustes y la carga inicial.
- **Admin tienda / Consulta fábrica**: solo consultas.

## Problemas comunes

- **"Escribe al menos una cantidad"** → Agrega una bata y su cantidad antes de registrar.
- **"Escribe por qué se hace el ajuste"** → La nota es obligatoria en los ajustes.
- **No se sumó lo de una orden** → Revisa que Terminado esté completado y que sus prendas vengan del catálogo de ATR.
- **Sale negativo** → Hubo una entrega sin la producción registrada. Haz un conteo y un ajuste.

## Se conecta con

- [Órdenes de tu estación](manual:estacion): Terminado cierra la orden con sus cantidades reales.
- [Catálogos](manual:catalogos): el catálogo de batas de ATR.
