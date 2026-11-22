---
clave: entrega-masiva
titulo: Entrega masiva
---
## Resumen

**Entrega masiva** sirve para marcar varias órdenes como entregadas al mismo tiempo, en vez de abrirlas una por una. Cada orden se revisa igual que en su detalle: si le faltan precios o datos de factura, no se entrega y te dice por qué.

## ¿Quién lo usa?

- **Admin tienda**, **Admin fábrica** y **Administración general**: son los que pueden confirmar entregas.
- Los demás roles no ven esta pantalla en el menú.

## Antes de empezar

- Que las órdenes ya se hayan entregado de verdad al cliente.
- Que tengan capturados sus precios y, si piden factura, sus datos fiscales.

## Procesos paso a paso

### Cómo entregar varias órdenes juntas

1. En el menú, entra a **Entrega masiva**.
2. Arriba elige **Listas para entregar** (lo normal) o **Todas sin entregar** si también quieres ver las que siguen en producción.
3. Si buscas unas en particular, escribe en **Buscar folio, cliente o equipo…**.
4. Palomea las órdenes que ya se entregaron. Para marcarlas todas, usa **Seleccionar todas**.
5. Dale **Marcar 5 como entregadas** (el número cambia según cuántas elijas).
6. Confirma en el mensaje. Mientras trabaja, el botón dice "Entregando 2 de 5…".
7. Al terminar sale un resumen: cuáles se entregaron y cuáles no.

> Las órdenes entregadas pasan a **Órdenes pasadas**.

### Qué hacer con las que no se pudieron entregar

1. En el resumen salen las órdenes que no se entregaron por falta de precio o de datos de factura, con lo que les falta.
2. Dale clic al folio para abrir esa orden y completar **Precios y facturación**.
3. Regresa a **Entrega masiva** y vuelve a intentarlo.

### Cómo entregar de todos modos (con motivo)

Solo si ya se entregaron aunque falten datos.

1. En el resumen, abajo de las que no se pudieron, escribe el motivo (mínimo 5 letras). Ej. "Órdenes entregadas en septiembre; los precios se capturan después."
2. Dale **Entregar de todos modos** y confirma.
3. El motivo queda registrado en cada orden con tu nombre, y la orden muestra **Entregada de todos modos**.

### Cómo cerrar el resumen

1. Dale **Cerrar resumen** cuando ya lo revisaste.

## Qué significa cada estado o color

- La etiqueta de color de cada orden es su estado actual (ej. **Lista para entregar**). Ver el manual [Seguimiento de una orden](manual:detalle-orden).
- Renglón marcado: esa orden está seleccionada.
- **✓ 5 órdenes entregadas**: las que sí quedaron.
- Texto en rojo: las que no se entregaron y por qué.

## Si eres de…

- **Admin tienda / Admin fábrica / Administración general**: puedes entregar y entregar de todos modos.
- **Otros roles**: no tienen esta pantalla. Pídele la entrega a alguno de los de arriba.

## Problemas comunes

- **No me sale la orden en la lista** → Si estás en **Listas para entregar**, solo salen las que ya terminaron producción: cambia a **Todas sin entregar**. Las canceladas, eliminadas y las de Frisa nunca salen aquí.
- **"No hay órdenes listas para entregar"** → Ninguna orden ha terminado sus etapas. Prueba con **Todas sin entregar**.
- **El botón Entregar de todos modos no se activa** → Escribe un motivo de al menos 5 letras.
- **Alguna salió en "No se pudieron entregar" con otro error** → Ábrela y entrégala desde su detalle; si sigue fallando, avísale a Administración general.

## Se conecta con

- [Seguimiento de una orden](manual:detalle-orden): para entregar una sola orden o completar sus precios.
- [Buscar y consultar órdenes](manual:dashboard): las entregadas se encuentran en **Órdenes pasadas**.
