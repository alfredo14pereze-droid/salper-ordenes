---
clave: pedidos
titulo: Pedidos
---
## Resumen

Un **pedido** junta varias órdenes del mismo cliente con **un solo anticipo, abonos y factura**. Sirve cuando el trabajo de un cliente va en varias órdenes (ej. playeras de sublimación y chamarras bordadas) pero se cobra como una sola cuenta. Cada pedido lleva un folio **PED-0001**, **PED-0002**…

## ¿Quién lo usa?

- **Ventas tienda**, **Admin tienda** y **Administración general**: crean pedidos, agregan órdenes y registran abonos.
- **Contabilidad**, **Admin fábrica** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- El nombre del cliente.
- Si deja anticipo: el monto, el método de pago y quién lo recibió.
- Si pide factura: su razón social, régimen fiscal, uso de CFDI y código postal.

## Procesos paso a paso

### Cómo crear un pedido desde Nueva orden (lo normal)

1. En **Nueva orden**, en **Pedido**, elige **Nuevo pedido**.
2. Captura la orden como siempre.
3. Abajo, en **Pedido nuevo**, pon el **Anticipo del pedido**, el **Método de pago** y **Quién recibió el anticipo**.
4. Contesta **¿Requiere factura?**. Si sí, llena **Razón social**, **Régimen fiscal**, **Uso de CFDI**, **Código postal** y, si quieres, **Dirección**.
5. Dale **Crear orden**. Se crean juntos la orden y el pedido.

### Cómo crear un pedido vacío

1. En el menú, entra a **Pedidos**.
2. Dale **+ Pedido vacío**.
3. Llena **Cliente del pedido** y, si aplica, el anticipo y la factura.
4. Dale **Crear pedido**.
5. Después agrégale órdenes (siguiente proceso).

### Cómo agregar órdenes a un pedido

1. Abre el pedido desde **Pedidos** (búscalo por folio o cliente).
2. Para una orden nueva, dale **+ Nueva orden**: se abre Nueva orden ya ligada a este pedido.
3. Para una orden que ya existe, dale **+ Orden existente**, elige la orden de la lista (solo salen las que no están en otro pedido) y dale **Agregar**.

> También se puede hacer desde el detalle de la orden, en la tarjeta **Pedido**: **Agregar a un pedido** o **Nuevo pedido con esta orden**.

### Cómo revisar la cuenta del pedido

1. Abre el pedido.
2. En **Cuenta del pedido** ves el **Total (suma de las órdenes)**, el **Anticipo**, los **Abonos** y el **Saldo**.
3. Abajo están sus órdenes. Dale clic a una para abrirla.

### Cómo registrar un abono

1. Abre el pedido.
2. Dale **+ Registrar abono**.
3. Pon el **Monto**, el **Método de pago** y **Quién lo recibió**. **Notas** es opcional.
4. Dale **Guardar abono**. El saldo se actualiza solo.
5. Si te equivocaste, en la lista de abonos dale **Borrar** a ese abono.

### Cómo cambiar los datos del pedido o la factura

1. Abre el pedido y baja a **Datos del pedido**.
2. Cambia el cliente, el anticipo o los datos de factura.
3. Dale **Guardar datos del pedido**.

### Cómo sacar una orden de un pedido

1. Abre el pedido.
2. En la orden, dale **Quitar**.
3. Confirma. La orden queda como orden suelta.

### Cómo eliminar un pedido

1. Solo se puede si el pedido ya no tiene órdenes: quítalas primero.
2. Dale **Eliminar pedido** y confirma.

> El folio de un pedido eliminado no se vuelve a usar.

### Pedido de venta de mostrador

1. Si todo el pedido es de mostrador, prende **Venta de mostrador** al crear el pedido vacío o en **Datos del pedido**.
2. Todas sus órdenes quedan sin precio, anticipo ni factura.

> Si cambias a mostrador un pedido que ya tiene órdenes, se borran sus precios y su factura. El sistema te pide confirmarlo.

## Qué significa cada estado o color

- **Mostrador**: el pedido es de venta de mostrador.
- **Cancelada** / **Eliminado**: junto a una orden del pedido, quiere decir que esa orden ya no sigue.
- "Hay órdenes con tallas sin precio: el total todavía no las incluye": a alguna orden le falta precio; el total del pedido sale más bajo de lo real.

## Si eres de…

- **Ventas tienda / Admin tienda / Administración general**: puedes crear, editar y registrar abonos.
- **Contabilidad / Admin fábrica / Consulta fábrica**: ves los pedidos y su cuenta, sin cambiar nada.

## Problemas comunes

- **El total del pedido no cuadra** → Revisa si sale el aviso de tallas sin precio: pon los precios en cada orden.
- **No me deja eliminar el pedido** → Todavía tiene órdenes. Quítalas primero con **Quitar**.
- **Quiero registrar el anticipo en la orden y no me deja** → Si la orden está en un pedido, el anticipo y los abonos se registran en el pedido.
- **"Falta indicar quién recibió el abono"** → Escribe el nombre de quien cobró en **Quién lo recibió**.

## Se conecta con

- [Crear una orden](manual:nueva-orden): de ahí nace casi siempre el pedido.
- [Seguimiento de una orden](manual:detalle-orden): la tarjeta **Pedido** de cada orden.
