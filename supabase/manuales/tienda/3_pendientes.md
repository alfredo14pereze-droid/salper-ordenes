---
clave: pendientes
titulo: Pendientes tienda ↔ fábrica
---
## Resumen

**Pendientes** son los trabajos chicos que la tienda le manda a la fábrica y la fábrica regresa: arreglos, bordados, planchado, envíos de mercancía, etc. Cada pendiente lleva un folio, y en cada paso alguien confirma (tienda envía, fábrica recibe, fábrica regresa, tienda recibe), así nada se pierde en el camino.

## ¿Quién lo usa?

- **Ventas tienda**, **Contabilidad**, **Tienda (mostrador)**, **Admin tienda** y **Administración general**: crean pendientes, reciben lo que regresa y entregan al cliente.
- **Admin fábrica**: recibe, trabaja y regresa los pendientes. También los crea si tiene el permiso.
- **Bordado** y **Costura**: solo ven los pendientes de su tipo de trabajo (bordado o arreglo) que están por hacer.
- **Terminado**: ve todos los pendientes del lado de fábrica.
- **Corte**, **Sublimado** y **Captura de costura** no ven este módulo.

## Antes de empezar

- Qué hay que hacer, en palabras claras (ej. "Cambiar el broche de la chamarra azul").
- Las prendas con su talla y cantidad.
- Si es de un cliente: su nombre, su teléfono y si ya pagó.
- Si puedes, una foto de la prenda.

## Procesos paso a paso

### Cómo mandar un pendiente a fábrica (tienda)

1. En el menú, entra a **Pendientes** y dale **+ Nuevo pendiente**.
2. Escribe **¿Qué hay que hacer?**.
3. Elige el **Tipo de trabajo** (ej. Arreglo, Bordado, Planchado).
4. En **Prendas** llena **Tipo de prenda**, **Talla** y **Cant.**. Puedes agregar varias prendas.
5. En **¿Es para un cliente?** elige:
   - **No, se queda en la tienda**: contesta **¿Ya quedó inventariado?** (**Inventariado** o **No inventariado**).
   - **Sí, es de un cliente**: llena **Nombre del cliente** y **Teléfono**, contesta **¿Ya está pagado?** (**Pagado**, **No pagado** o **Anticipo**) y **¿Ya se dio de baja en el inventario?** (**Dado de baja** o **Pendiente de baja**). Si elegiste **Anticipo**, pon el **Total del trabajo ($)** y el **Anticipo ($)**; abajo ves cuánto **Resta**.
6. Si ayuda, agrega fotos.
7. Dale **Enviar a fábrica**. Sale el folio del pendiente.
8. Abre el pendiente y dale **Imprimir etiqueta** para pegarla en la bolsa.

### Cómo recibir y trabajar un pendiente (fábrica)

1. En **Pendientes**, pestaña **Por recibir**, ves lo que mandó la tienda.
2. Cuando llegue la bolsa, dale **Confirmar recibido**. Pasa a **Por hacer**.
3. Cuando el trabajo esté hecho, dale **Marcar listo**. Pasa a **Listo para regresar**.
4. Cuando lo mandes a la tienda, dale **Confirmar envío a tienda**. Pasa a **Enviados a tienda**.

> Si llegan varios juntos, palomea los que quieras (o **Seleccionar todos**) y usa el botón de abajo, ej. **Confirmar recibido (4)**.

### Cómo marcar tu parte si eres de Bordado o Costura

1. Entra a **Pendientes**: solo ves los de tu tipo de trabajo que están por hacer ("Pendientes de bordado" o "Pendientes de arreglo").
2. Cuando termines uno, dale **Marcar listo**.

> Algunos trabajos llevan dos partes (ej. bordado y arreglo). En la tarjeta dice "Falta: Bordado y Arreglo" y cada estación marca la suya. Cuando las dos están, dice "Todo listo".

### Cómo recibir en tienda lo que regresó

1. En la pestaña **De regreso — por recibir** ves lo que mandó fábrica.
2. Cuando llegue, dale **Confirmar recibido**.
3. Si se queda en la tienda, pasa a **Cerrados**. Si es de un cliente, pasa a **Por entregar**.

### Cómo entregarle al cliente

1. En la pestaña **Por entregar** salen primero los que llevan más tiempo esperando.
2. Cuando el cliente lo recoja, dale **Marcar como entregado**.
3. Si quieres, escribe **¿Quién recogió?** y dale **Confirmar entrega**.

### Cómo corregir un pendiente

1. Abre el pendiente (dale clic a su folio) y dale **Editar**.
2. Corrige y dale **Guardar cambios**.

> Solo se puede editar mientras fábrica no lo ha recibido.

### Cómo ver el historial de un pendiente

1. Abre el pendiente.
2. Abajo, en **Historial**, ves cada paso, quién lo hizo y cuándo.

### Cómo agregar o quitar tipos de trabajo (administradores)

1. En **Pendientes** dale **Tipos de trabajo**.
2. Escribe en **Agregar tipo** (ej. Planchado) y dale **+ Agregar**.
3. Usa **Renombrar** o **Desactivar** en los que ya existen.

## Qué significa cada estado o color

| Estado | Qué quiere decir |
|---|---|
| **Enviado a fábrica** | La tienda lo mandó; fábrica todavía no confirma que llegó. |
| **Recibido en fábrica** | Fábrica lo tiene y está por hacerse. |
| **Listo para regresar** | El trabajo está hecho; falta mandarlo a la tienda. |
| **Enviado a tienda** | Fábrica ya lo mandó; la tienda todavía no confirma. |
| **Recibido en tienda** | Ya está en la tienda. Si es de cliente, falta entregarlo. |
| **Entregado** | El cliente ya se lo llevó. |
| **Mercancía recibida en fábrica** | Era un envío de mercancía: termina cuando fábrica confirma que llegó. |

Otros avisos:

- Tarjeta en **rojo** con "⚠ Enviado a fábrica y sin recibir desde hace más de 1 día": fábrica no ha confirmado que lo recibió.
- **Lleva 9 días esperando** en rojo: el cliente no ha pasado por su trabajo desde hace más de 7 días; llámale.
- **💰 Pagado** / **Anticipo … · Resta …**: cómo va el pago del cliente.
- **Inventario: Pendiente de baja**: falta dar de baja la prenda en el inventario. Se cambia desde el detalle del pendiente.

## Si eres de…

- **Tienda**: ves las pestañas **En camino a fábrica**, **En fábrica**, **De regreso — por recibir**, **Por entregar** y **Cerrados**.
- **Fábrica**: ves **Por recibir**, **Por hacer**, **Listo para regresar**, **Enviados a tienda** y **Mercancía recibida**.
- **Administración general**: cambias entre **Vista tienda** y **Vista fábrica**.
- **Bordado / Costura**: solo tu lista de pendientes por hacer, con **Marcar listo**.

## Problemas comunes

- **"Cada prenda necesita su tipo y su talla"** → Llena **Tipo de prenda** y **Talla** en cada renglón, o quita el renglón vacío.
- **"Indica si el cliente ya pagó, no ha pagado o dejó anticipo"** → Elige una opción en **¿Ya está pagado?**.
- **"El anticipo debe ser menor al total"** → Si ya pagó todo, elige **Pagado**.
- **No me sale el botón Editar** → Fábrica ya lo recibió. Pídele a Administración general que lo corrija o avisa a fábrica.
- **No me sale el botón para confirmar** → Ese paso le toca al otro lado (tienda o fábrica).
- **Soy de Bordado y no veo un pendiente** → Solo te salen los que fábrica ya recibió y que son de bordado.

## Se conecta con

- [Notas de tienda](manual:notas-tienda): para avisos que no son un trabajo para fábrica.
- [Inventario de tienda](manual:inventario): las prendas que se dan de baja o se inventarían.
