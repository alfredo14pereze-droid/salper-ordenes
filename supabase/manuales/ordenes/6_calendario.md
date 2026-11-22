---
clave: calendario
titulo: Calendario y estadísticas de entrega
---
## Resumen

El **Calendario** muestra, mes por mes, qué órdenes están en producción cada día y avisa los días con demasiado trabajo. **Estadísticas** dice qué tan a tiempo entregamos, cuánto tarda la producción y qué órdenes ya están atrasadas. Las dos pantallas solo muestran información: no cambian nada.

## ¿Quién lo usa?

- **Calendario**: casi todos. No lo ven las estaciones de fábrica (**Corte**, **Bordado**, **Sublimado**, **Costura**, **Terminado**), **Tienda (mostrador)** ni **Consulta tienda**.
- **Estadísticas**: **Administración general**, **Admin tienda**, **Admin fábrica** y **Consulta fábrica**.

## Antes de empezar

- Para que una orden salga bien en el calendario, necesita su **fecha de entrega** y, de preferencia, el **Tiempo estimado de producción** que pone fábrica al confirmarla.

## Procesos paso a paso

### Cómo leer el Calendario

1. En el menú, entra a **Calendario**.
2. Cada cuadro es un día. Dentro salen las órdenes que están en producción ese día, con su número y cliente.
3. El color de cada orden es su estado actual (abajo está la leyenda de colores).
4. Pasa el mouse sobre una orden para ver su tipo, su fecha de entrega y su estado.
5. Dale clic a una orden para abrir su detalle.

### Cómo cambiar de mes

1. Usa **← Mes anterior** y **Mes siguiente →**.
2. Para regresar al mes actual, dale **Hoy**.

### Cómo ver también las órdenes ya entregadas

1. Arriba a la derecha prende **Incluir completadas**.
2. Para ver solo las activas, apágalo.

### Cómo detectar días saturados

1. Si un día tiene mucho trabajo, sale en la esquina un aviso **⚠** con las piezas (ej. "⚠ 1,200 pz") o las órdenes de ese día.
2. Pasa el mouse sobre el aviso para ver cuántas órdenes y prendas hay ese día y cuál es el límite.
3. Úsalo para negociar fechas antes de prometer una entrega. En **Nueva orden** sale el mismo aviso como **⚠ Fecha muy cargada**.

### Cómo revisar las Estadísticas

1. En el menú, entra a **Estadísticas**.
2. Arriba ves los cuadros: **Órdenes entregadas**, **Entregadas a tiempo**, **Tiempo promedio de producción**, **Estimado vs. real** y **Atrasadas ahora mismo**.
3. Baja a **Tiempo promedio por etapa** para ver qué etapa tarda más.
4. En **Desglose por tipo de orden** ves, por tipo, cuántas se entregaron, el **% a tiempo** y el **Promedio días**.
5. **Tendencia mensual (entregadas)** muestra los últimos meses.
6. Hasta abajo, **Órdenes atrasadas ahora mismo** lista las que ya pasaron su fecha y siguen sin entregarse.
7. Dale **Actualizar** para recalcular con lo más reciente.

## Qué significa cada estado o color

En el Calendario:

| Lo que ves | Qué quiere decir |
|---|---|
| Orden de color | El color es su estado actual (Por Confirmar, En corte, Lista para entregar…). |
| Cuadro de hoy resaltado | Es el día de hoy. |
| Días en gris | Son del mes anterior o del siguiente. |
| **⚠** en un día | Día saturado: hay más órdenes o prendas de lo normal para el taller. |

Cuántos días ocupa cada orden: desde su inicio calculado hasta su fecha de entrega. El inicio se calcula con el **Tiempo estimado de producción** más **3 días hábiles** de margen, para que la fecha siempre quede holgada.

En Estadísticas:

| Lo que ves | Qué quiere decir |
|---|---|
| **% a tiempo** en verde | 80% o más de las órdenes se entregaron a tiempo. |
| **% a tiempo** en rojo | Menos de 60% a tiempo. |
| **Estimado vs. real** en verde | En promedio terminamos dentro del tiempo estimado. |
| **Estimado vs. real** en rojo (ej. "+3 días") | En promedio nos pasamos esos días. |

"A tiempo" quiere decir que la orden se entregó el mismo día de su fecha de entrega o antes. Las canceladas no cuentan.

## Si eres de…

- **Tienda (ventas, admin tienda)**: usa el Calendario antes de prometerle una fecha al cliente.
- **Admin fábrica**: el Calendario te dice qué días se junta el trabajo; Estadísticas, qué etapa se atrasa.
- **Estaciones de fábrica**: no ven estas pantallas; su trabajo sale en **Órdenes de tu estación**.

## Problemas comunes

- **Una orden no sale en el Calendario** → No tiene fecha de entrega, ya se entregó (prende **Incluir completadas**) o está cancelada.
- **Una orden sale muchos días antes de lo que pensaba** → Su **Tiempo estimado de producción** es largo, o no tiene uno y solo cuenta el margen. Fábrica lo puede corregir en el detalle de la orden.
- **"Ningún pedido tiene producción programada este mes"** → No hay órdenes en producción ese mes. Cambia de mes.
- **Estadísticas sale con guiones (—)** → Todavía no hay suficientes órdenes entregadas o historial para calcular.

## Se conecta con

- [Crear una orden](manual:nueva-orden): el aviso **⚠ Fecha muy cargada** usa la misma cuenta que el Calendario.
- [Seguimiento de una orden](manual:detalle-orden): donde fábrica pone el **Tiempo estimado de producción**.
- [Buscar y consultar órdenes](manual:dashboard).
