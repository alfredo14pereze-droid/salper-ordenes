---
clave: pedidos-colegio
titulo: Pedidos Colegio
---
## Resumen

**Pedidos Colegio** lleva los pedidos de uniformes que hacen los papás de cada colegio. Cada pedido tiene su folio por colegio (ej. **IT1**, **IT2**…), sus artículos con talla y precio, el anticipo, los abonos y un recibo en PDF. El módulo está en **Beta**.

## ¿Quién lo usa?

- **Administración general**: da de alta colegios, crea pedidos, registra abonos y elimina pedidos.
- **Consulta tienda**: ve los colegios, los pedidos y los recibos, sin cambiar nada.
- Los demás roles no ven este módulo.

## Antes de empezar

- El nombre de quien hace el pedido (normalmente el papá o la mamá).
- El grado o grupo del alumno, si lo tienes.
- Los artículos con su talla, cantidad y precio.
- Cuánto deja de anticipo.

## Procesos paso a paso

### Cómo dar de alta un colegio

1. En el menú, entra a **Pedidos Colegio**.
2. Dale **+ Agregar colegio**.
3. Escribe el **Nombre del colegio** y el **Código de folio** (de 1 a 6 letras, ej. IT).
4. Dale **Guardar colegio**.

> El folio de cada pedido será ese código más un número consecutivo: IT1, IT2, IT3…

### Cómo crear un pedido

1. En la lista, busca el colegio y dale **+ Nuevo pedido**.
2. Revisa que el **Colegio** sea el correcto.
3. Escribe el **Nombre de quien hace el pedido**. Si lo tienes, pon la **Referencia (grado / grupo del alumno)** y el **Teléfono**.
4. En **Artículos**, llena cada renglón: **Artículo**, **Talla**, **Cantidad** y **Precio**. El **Importe** se calcula solo.
5. En **Anticipo** elige **Porcentaje** (ej. 50) o **Monto directo** (ej. 800) y escribe la cantidad.
6. Revisa el **Subtotal**, el **Anticipo** y el **Saldo**.
7. Dale **Crear pedido y generar recibo**. Se abre el pedido con la vista previa del recibo en PDF.

### Cómo consultar los pedidos de un colegio

1. En **Pedidos Colegio**, dale clic al nombre del colegio para abrirlo.
2. Junto al nombre ves cuántos pedidos tiene y cuánto hay por cobrar.
3. La tabla muestra **Folio**, **Cliente**, **Fecha**, **Subtotal** y **Saldo**.
4. Dale clic al folio para abrir el pedido.

### Cómo registrar un abono

1. Abre el pedido.
2. En **Abonos posteriores** dale **+ Registrar abono**.
3. Revisa la **Fecha**, pon el **Monto** y, si quieres, una **Nota** (ej. efectivo, transferencia).
4. Dale **Guardar abono**. El **Saldo pendiente** se actualiza solo.
5. Si te equivocaste, dale **Borrar** a ese abono.

> El botón **+ Registrar abono** solo sale mientras el pedido tenga saldo pendiente.

### Cómo sacar el recibo en PDF

1. Abre el pedido.
2. Dale **Generar recibo PDF**.
3. Se abre la vista previa; desde ahí lo descargas o lo mandas.

> Saca el recibo otra vez después de cada abono para que salga el saldo al día.

### Cómo eliminar un pedido

1. Abre el pedido y, hasta abajo, dale **Eliminar pedido**.
2. Confirma con **Sí, eliminar**.

> El pedido deja de aparecer en la lista y ya no admite abonos. Su folio no se vuelve a usar.

## Qué significa cada estado o color

- **Saldo** en rojo: todavía deben dinero.
- **Saldo** en verde: el pedido está pagado.
- **Eliminado**: el pedido ya no cuenta.
- **Beta**: el módulo todavía se está probando.
- "Modo solo lectura": entraste con un rol que solo consulta.

## Si eres de…

- **Administración general**: haces todo: colegios, pedidos, abonos y recibos.
- **Consulta tienda**: ves pedidos y recibos para contestarle al papá, pero no registras cobros. Pásale el cobro a Administración general.

## Problemas comunes

- **"Agrega al menos un artículo con cantidad y precio"** → Algún renglón no tiene cantidad o precio. Llénalo o quítalo.
- **"Revisa el anticipo: no puede pasar del subtotal"** → El anticipo es mayor que el total. En porcentaje, debe ir de 0 a 100.
- **"El abono no puede pasar del saldo pendiente"** → Estás cobrando de más. Revisa el saldo.
- **El colegio no sale en la lista para elegir** → Primero dalo de alta con **+ Agregar colegio**.
- **No se generó el recibo al crear el pedido** → El pedido sí quedó. Ábrelo y dale **Generar recibo PDF**.

## Se conecta con

- [Talleros](manual:talleros): para prestarle al colegio los muestrarios de tallas antes de que pidan.
