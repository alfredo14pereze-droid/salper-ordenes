---
clave: dashboard
titulo: Buscar y consultar órdenes
---
## Resumen

Hay cuatro pantallas para encontrar y revisar órdenes. El **Dashboard** muestra las que siguen abiertas, **Resumen** las agrupa por cliente, **Órdenes pasadas** guarda las ya entregadas y **Control rápido** es una tabla con todas, incluso las eliminadas.

## ¿Quién lo usa?

- **Dashboard**: casi todos (tienda, oficina, fábrica y captura de costura).
- **Resumen**: todos menos **Tienda (mostrador)**.
- **Control rápido**: todos (también está en el menú de la izquierda).
- **Órdenes pasadas**: oficina y tienda. Las estaciones de fábrica no lo ven.

## Antes de empezar

- Ten a la mano el número de orden, el folio externo o el nombre del cliente.

## Procesos paso a paso

### Cómo usar el Dashboard

1. Es la pantalla de inicio: toca **Dashboard** en el menú.
2. Arriba sale un anuncio (el fijado más reciente o, si no hay, el más nuevo). Dale clic para ver todos.
3. **Próximas a surtir** muestra las órdenes abiertas ordenadas por fecha de entrega: la primera es la más urgente.
4. Baja a **Todas las órdenes** para ver la lista completa. Junto al título ves cuántas hay ("12 de 40").
5. Dale clic a una tarjeta para abrir el detalle de la orden.

### Cómo buscar y filtrar órdenes

1. En **Todas las órdenes**, escribe en **Buscar** el número de orden, el folio externo o el cliente. Funciona con espacios o guiones ("ORD 0007").
2. En **Tipo** elige uno o varios tipos de orden.
3. En **Estado** elige en qué va (ej. Cortado incluye "En corte" y "Cortado").
4. Para quitar todo, dale **Limpiar filtros**.
5. Si lo que buscas ya se entregó, sale aparte abajo: **También en Órdenes pasadas**.

### Cómo ver solo las órdenes listas para entregar

1. Si hay órdenes terminadas, arriba de la lista sale "✓ **3** órdenes listas para entregar".
2. Dale **Ver solo esas**. Para regresar, **Ver todas**.

### Cómo revisar las órdenes por confirmar (Admin fábrica)

1. Si eres Admin fábrica, lo primero que ves en el Dashboard es **Por confirmar**: las órdenes nuevas que fábrica todavía no acepta.
2. Abre cada una y dale **Confirmar pedido** en su detalle.
3. Cuando ya no hay, sale "✓ No hay órdenes por confirmar".

### Cómo usar el Resumen por cliente

1. En el Dashboard dale el botón **Resumen**.
2. Cada bloque es un cliente con sus órdenes abiertas, sus prendas y totales.
3. Dale clic a una orden para abrir su detalle.
4. Para imprimir, usa **PDF: pendientes de entrega** o **PDF: sin empezar**.

### Cómo buscar una orden ya entregada

1. En el Dashboard dale el botón **Órdenes pasadas**.
2. Filtra por **Tipo** si quieres.
3. Escribe en **Buscar** el número de orden, el folio externo o el cliente.
4. Dale clic a la orden para ver su detalle.

> Las órdenes entregadas nunca se borran: siempre las encuentras aquí.

### Cómo usar Control rápido de órdenes

1. En el Dashboard dale el botón **Control rápido**, o entra desde el menú.
2. Es una tabla con **Folio**, **Cliente** y **Estado** de todas las órdenes, incluidas las eliminadas.
3. Para encontrar un folio rápido, usa **Ctrl + F** (en el celular, "Buscar en la página").
4. Dale clic al folio para abrir el detalle.

## Qué significa cada estado o color

En cada tarjeta del Dashboard:

| Lo que ves | Qué quiere decir |
|---|---|
| Tarjeta en **rojo** | La entrega ya pasó, es hoy o faltan 3 días o menos. |
| Tarjeta en **ámbar** | Faltan de 4 a 7 días para la entrega. |
| Sin color | Faltan más de 7 días. |
| **Atrasada 2 días** | Ya pasó la fecha de entrega. |
| **Entrega hoy** | La fecha de entrega es hoy. |
| **✎ Se modificó después de confirmarse** (tarjeta azul) | Tienda cambió algo y fábrica tiene que revisarlo. Este aviso gana sobre el rojo y el ámbar. |
| **✎ Nota: …** | La orden tiene una nota interna sin resolver; sale el texto de la nota. |
| **Cancelada** | La orden ya no sigue. |
| **Mostrador** | Es venta de mostrador. |

El color de la etiqueta de estado (Por Confirmar, En corte, Lista para entregar…) se explica en el manual [Seguimiento de una orden](manual:detalle-orden).

## Si eres de…

- **Tienda (mostrador)**: en el Dashboard no te salen los botones Resumen, Órdenes pasadas ni Control rápido.
- **Estaciones de fábrica**: ves Dashboard, Resumen y Control rápido, pero no Órdenes pasadas.
- **Admin fábrica**: ves además **Por confirmar** hasta arriba.

## Problemas comunes

- **No encuentro una orden** → Si ya se entregó, no está en el Dashboard: búscala en **Órdenes pasadas** o en **Control rápido**. Revisa también que no tengas filtros puestos (**Limpiar filtros**).
- **Una orden desapareció** → Puede estar eliminada. En **Control rápido** sale con la marca **Eliminada**.
- **"No hay órdenes que coincidan con estos filtros"** → Quita filtros o revisa cómo escribiste el folio.
- **La tarjeta sale en rojo pero va bien** → El rojo solo avisa que la fecha está cerca o ya pasó: revisa si hay que hablar con el cliente.

## Se conecta con

- [Seguimiento de una orden](manual:detalle-orden): lo que haces al abrir una orden.
- [Crear una orden](manual:nueva-orden).
- [Calendario y estadísticas de entrega](manual:calendario): para ver la carga por día.
- [Entrega masiva](manual:entrega-masiva): para entregar varias órdenes juntas.
