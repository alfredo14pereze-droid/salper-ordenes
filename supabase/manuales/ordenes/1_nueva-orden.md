---
clave: nueva-orden
titulo: Crear una orden
---
## Resumen

**Nueva orden** es el formulario para dar de alta una orden de producción. Aquí capturas el cliente, las prendas con sus tallas, la fecha de entrega, los precios y el anticipo. Al crearla, fábrica la recibe en **Por Confirmar**.

## ¿Quién lo usa?

- **Ventas tienda**, **Admin tienda** y **Administración general**: son los únicos que pueden crear órdenes.
- Fábrica no crea órdenes: las recibe y las confirma.

## Antes de empezar

- Que el cliente ya esté dado de alta en **Catálogos** (si no, puedes usar **Otro cliente (no registrado)**).
- La cotización o la orden de compra del cliente, si la tienes (PDF o foto).
- Las fotos de referencia del diseño, si hay.
- Si dejan anticipo: el monto y quién lo recibió.

## Procesos paso a paso

### Cómo crear una orden

1. En el menú, entra a **Nueva orden**.
2. Si toda la orden es de mostrador, prende **Venta de mostrador** (ver "Cómo hacer una orden de venta de mostrador").
3. Elige el **Tipo de orden**.
4. Elige el **Cliente**. La lista solo muestra los clientes de ese tipo de orden.
5. Pon la **Fecha de entrega**.
6. Captura las **Prendas** (ver "Cómo capturar las prendas y sus tallas").
7. Abre **Notas y fotos (opcional)** si quieres agregar **Notas de la orden** o **Fotos de referencia**.
8. En **Precios y pago** pon el precio de cada prenda y, si dejaron anticipo, captúralo.
9. Dale clic en **Crear orden**.
10. Se abre la orden nueva con la vista previa de su PDF. Si lo necesitas, descárgalo desde ahí.

> Si cierras la pantalla antes de terminar, al volver sale "Se recuperó un borrador sin terminar". Los datos se guardan, pero **las fotos y los PDFs no**: vuelve a subirlos. Si quieres empezar limpio, dale **Empezar de cero**.

### Cómo prellenar la orden con una foto o PDF

Sirve cuando el cliente te manda su pedido en papel, foto o PDF.

1. Primero elige el **Tipo de orden** (así también se prellena el cliente).
2. Arriba a la derecha dale **Prellenar con foto o PDF**, o arrastra el archivo encima del botón.
3. Espera a que diga que terminó de leer.
4. Revisa lo que se llenó:
   - **Cliente**: si el nombre coincide con uno del catálogo, se elige solo; si no, queda como **Otro cliente (no registrado)** con el nombre que leyó.
   - **Fecha de entrega**: solo si el documento la trae clara y el campo estaba vacío.
   - **Prendas y tallas**: se agregan después de lo que ya hayas escrito; no borra nada.
5. Corrige lo que haga falta. **Siempre revisa todo antes de crear la orden**: el sistema solo prellena.

### Cómo capturar las prendas y sus tallas

1. En **Prenda 1**, elige o escribe la **Prenda** (ej. Playera, Short, Chamarra).
2. Si la prenda se compra hecha, marca **Comprada**: no usa tela ni pasa por corte. Si se hace aquí, déjala en **Fabricada**.
3. Llena los detalles que apliquen: **Tela**, **Color**, **Manga**, **Vivos**, **Cuello**, **Puños**, **Logotipos**, **¿Lleva bordado?**, **¿Lleva impresión?**, **Observaciones**.
4. En **Tallas y cantidades** escribe la **Talla** y la **Cantidad**. Al completar un renglón aparece otro vacío solo; también puedes darle **+ Agregar talla**.
5. Si lleva nombres o números (uniformes de equipo), llena la tabla **Nombres y números**.
6. Si la orden lleva otra prenda, dale **+ Agregar otra prenda a esta orden** y repite.
7. Abajo ves el **Total de piezas en la orden**.

> Tip: escribe y presiona **Enter** para pasar al siguiente campo.

### Cómo poner precios y anticipo

1. En **Precios y pago**, cada prenda trae su renglón de precio.
2. Elige **Mismo precio** (todas las tallas cuestan igual) o **Precios por talla**, y escribe el **Precio unitario**.
3. Abajo ves el **Total** y el **Saldo**.
4. Si dejaron anticipo, llena **Anticipo recibido**, **Método de pago** y **Quién lo recibió**. **Notas del anticipo** es opcional.

> Todas las prendas (que no sean de mostrador) necesitan precio. Si falta uno, sale "Falta el precio unitario" y el botón **Crear orden** no se activa.

### Cómo hacer una orden de venta de mostrador

1. Hasta arriba prende **Venta de mostrador**.
2. Captura la orden como siempre.
3. No se piden precios, anticipo ni factura.

> Si eliges el tipo de orden **Venta Mostrador**, el cliente siempre es **Salper** y no se puede cambiar.

### Cómo meter la orden en un pedido

Un pedido junta varias órdenes del mismo cliente con un solo anticipo, abonos y factura. Ver el manual **Pedidos**.

1. En **Pedido** elige:
   - **Orden suelta**: la orden va sola (lo normal).
   - **Nuevo pedido**: se crea un pedido con esta orden. Abajo sale **Pedido nuevo**, donde pones el anticipo del pedido y si **¿Requiere factura?**.
   - **Agregar a pedido existente**: elige el pedido de la lista (sale su folio, cliente y saldo).
2. Cuando la orden va en un pedido, el anticipo **no** se pone en la orden: se registra en el pedido.

### Cómo hacer una orden de maquila

1. Elige el tipo de orden **Maquila**.
2. Elige el **Cliente** (solo clientes del catálogo).
3. Elige el **Producto** tocando su tarjeta (sale con foto). Los productos vienen del catálogo del cliente.
4. Escribe el **Número de corte** del cliente (obligatorio).
5. Captura las **Cantidades** por talla.

> Si el cliente no tiene productos, agrégalos en **Catálogos → Clientes → "Ver catálogo de prendas"**.

### Cómo adjuntar la cotización y la orden de compra

1. Abre **Cotización y orden de compra (opcional)**.
2. En **Cotización (PDF o foto)** o en **Orden de compra (PDF o foto)**, dale **Subir PDF o foto (o arrastra aquí)**.
3. Puedes subir varios de cada uno con **+ Agregar otro**.
4. La factura no se sube aquí: se sube después, en el detalle de la orden.

## Qué significa cada estado o color

- **⚠ Fecha muy cargada**: debajo de la fecha de entrega, avisa que esos días ya hay muchas órdenes o prendas. Puedes crearla igual, pero considera otra fecha.
- **Falta el precio unitario**: alguna prenda no tiene precio.
- Una orden nueva siempre empieza en **Por Confirmar** hasta que fábrica la acepta.

## Si eres de…

- **Ventas tienda / Admin tienda / Administración general**: ves también **Pedido** y puedes poner precios y anticipo.
- **Órdenes de Frisa**: ya no se crean aquí. Se crean desde **Frisa → Restock**.

## Problemas comunes

- **No me deja darle Crear orden** → Falta el precio de alguna prenda. Revisa **Precios y pago**: la que falta sale marcada.
- **"Falta indicar quién recibió el anticipo"** → Si pusiste un anticipo, escribe en **Quién lo recibió** el nombre de quien cobró.
- **El cliente no sale en la lista** → La lista depende del **Tipo de orden**. Revisa el tipo o da de alta al cliente en **Catálogos**. Para un cliente de una sola vez, usa **Otro cliente (no registrado)**.
- **Recuperé un borrador y no están las fotos** → Las fotos y PDFs no se guardan en el borrador: vuelve a subirlos.
- **La orden se creó pero salió un aviso rojo** (fotos, documento o anticipo) → La orden sí quedó. Vuelve a subir lo que falló desde el detalle de la orden.

## Se conecta con

- [Seguimiento de una orden](manual:detalle-orden): todo lo que pasa después de crearla.
- [Pedidos](manual:pedidos): para juntar varias órdenes con un solo anticipo.
- [Catálogos](manual:catalogos): clientes, productos de maquila y telas.
- [Órdenes de tu estación](manual:estacion): donde fábrica trabaja la orden.
