---
clave: detalle-orden
titulo: Seguimiento de una orden
---
## Resumen

El **detalle de la orden** es su ficha completa: datos del cliente, prendas, etapas de producción, documentos, precios, pagos y su historial. Aquí cada área hace lo que le toca: tienda corrige datos y cobra, fábrica confirma y avanza etapas, y al final se confirma la entrega.

## ¿Quién lo usa?

Todos los que trabajan con órdenes, pero cada quien ve y cambia solo lo de su área:

- **Ventas tienda**, **Admin tienda** y **Administración general**: editan datos y prendas, precios, factura y pagos.
- **Contabilidad**: ve precios y pagos, y captura razones sociales.
- **Admin fábrica** y roles de etapa (**Corte**, **Bordado**, **Sublimado**, **Costura**, **Terminado**): confirman la orden y avanzan etapas.
- **Admin tienda**, **Admin fábrica** y **Administración general**: confirman la entrega al cliente.
- **Consulta** y **Solo consulta**: solo ven.

## Antes de empezar

- Abre la orden desde el **Dashboard** (dale clic a su tarjeta) o búscala por su número o folio.

## Procesos paso a paso

### Cómo leer la orden

1. Arriba ves **Orden #** con su número, el cliente y, si tiene, sus folios externos, equipo o número de corte.
2. A la derecha sale el tipo de orden y, si aplica, **Cancelada** o **Eliminada**.
3. Abajo está la barra de estados: el punto marcado es donde va la orden.
4. Más abajo están las tarjetas: **Detalles**, **Notas internas**, **Fotos de especificación**, **Etapas de producción**, **Documentos**, **Precios y facturación**, **Pagos**, **Prendas** e **Historial de estados**. Solo ves las que te tocan.

### Cómo corregir los datos o las prendas

Solo **Ventas tienda**, **Admin tienda** y **Administración general**.

1. En **Detalles** dale **Editar**.
2. Corrige lo que necesites: **Cliente**, **Teléfono del cliente**, **Correo del cliente**, **Fecha de entrega solicitada**, **Equipo**, **Número de corte**, **Folios externos (control anterior)** o **Descripción / especificaciones**.
3. Dale **Guardar cambios**.
4. Para las prendas, en **Prendas** dale **Editar**, corrige y dale **Guardar cambios de prendas**.

> Si la orden ya estaba confirmada, fábrica tiene que aceptar los cambios (ver el siguiente proceso).

### Cómo aceptar cambios hechos después de confirmar (fábrica)

1. Si tienda cambió algo después de que fábrica confirmó, arriba sale un aviso: "Fábrica todavía no acepta estos cambios".
2. Revisa qué cambió. Abajo del aviso está el historial con quién cambió qué y cuándo.
3. Si todo está bien, dale **✓ Aceptar cambios**. El aviso se quita.

### Cómo confirmar la orden (fábrica)

1. Una orden nueva llega en **Por Confirmar**.
2. Revisa prendas, tallas, fotos y fecha.
3. En **Estado de la orden** dale **Confirmar pedido**.
4. Si te toca, pon el **Tiempo estimado de producción** en días y dale **Guardar**. Con eso se calcula la ventana de producción del calendario.

### Cómo avanzar las etapas de producción (fábrica)

1. En **Etapas de producción** ves cada etapa con su estado.
2. Dale **Iniciar** cuando empiece una etapa y **Marcar completado** cuando termine.
3. Cada etapa avanza por su cuenta: pueden ir varias en proceso al mismo tiempo.
4. Si te equivocaste, usa **Regresar a "en proceso"** o **Regresar a "pendiente"**.
5. Para corregir la hora de inicio o fin, dale **Corregir horas**, pon el **Motivo de la corrección** y dale **Guardar corrección**.
6. Para agregar o quitar etapas, dale **Editar etapas**. Usa **+ Agregar etapa…** y dale **Guardar etapas**.

> Normalmente cada estación avanza su etapa desde **Órdenes de tu estación**. Ver ese manual.

### Cómo subir documentos

1. En **Documentos** está cada tipo: **Cotización**, **Orden de compra**, **Factura** y **Constancia de situación fiscal (del cliente)**.
2. Dale **Subir PDF o foto (o arrastra aquí)**.
3. Para cambiarlo usa **Reemplazar**, o **Quitar** para borrarlo. Con **+ Agregar otro** subes más de uno.

### Cómo capturar precios y facturación

1. En **Precios y facturación** revisa el precio de cada prenda.
2. Contesta **¿Requiere factura?**. Si sí, elige la **Razón social para la factura** o dale **+ Nueva** para dar de alta una (razón social, RFC, régimen, código postal y uso de CFDI).
3. Dale **Guardar precios y facturación**.
4. Revisa el **Subtotal**, el **IVA 16%**, el **Total** y el **Saldo pendiente**.
5. Si todo está completo, sale "✓ Precios y facturación completos: la orden puede entregarse".

### Cómo registrar un anticipo o pago

1. En **Pagos** dale **+ Registrar anticipo**.
2. Pon el **Monto**, el **Método de pago** y **Quién lo recibió**. **Notas** es opcional.
3. Dale **Guardar anticipo**.
4. Arriba ves el **Total de la orden**, el **Anticipo recibido** y el **Restante**.

> Si la orden está en un pedido, los anticipos y abonos se registran en el pedido, no aquí.

### Cómo meter la orden en un pedido o sacarla

1. En la tarjeta **Pedido**, si la orden está suelta dale **Agregar a un pedido** y elige el pedido, o **Nuevo pedido con esta orden**.
2. Para sacarla, dale **Quitar del pedido**. Queda como orden suelta.

### Cómo dejar una nota interna

1. En **Notas internas** dale **+ Agregar nota**.
2. Escribe el aviso (ej. "Cliente pidió que se apure") y dale **Guardar nota**.
3. Cuando ya se atendió, dale **✓ Resolver**. Si hace falta, **Reabrir**.

> El cliente nunca ve estas notas: no salen en ningún PDF.

### Cómo sacar los PDF y la remisión

1. **Descargar PDF**: la hoja interna con todo, para fábrica.
2. **PDF para cliente**: la versión para mandarle al cliente.
3. **Descargar remisión**: solo aparece cuando la orden ya está **Entregada**.
4. Primero se abre la vista previa; desde ahí lo descargas.

### Cómo confirmar la entrega al cliente

1. Cuando la orden está **Lista para entregar**, arriba sale un recuadro verde: "✓ Lista para entregar".
2. Cuando el cliente la reciba, dale **Confirmar entrega al cliente**.
3. La orden pasa a **Entregada** y se va a **Órdenes pasadas**.

> Para entregar, los precios y los datos de factura tienen que estar completos. Si ya se entregó aunque falten, dale **Entregar de todos modos** y escribe el motivo: queda registrado con tu nombre y la orden muestra **Entregada de todos modos**.

### Cómo cancelar, reactivar o eliminar una orden

Está hasta abajo, en **Zona de administrador**.

1. **Cancelar orden** (Admin tienda y Administración general): la orden queda marcada como **Cancelada**. Se puede deshacer con **Reactivar orden**.
2. **Eliminar orden** (solo Administración general): dale **Eliminar orden** y luego **¿Seguro? Confirmar eliminación**. La orden deja de aparecer en Dashboard, Resumen y Calendario, y ya nadie la puede editar. Los documentos que tenga se conservan.

> Una orden eliminada todavía se encuentra en **Control rápido de órdenes**.

## Qué significa cada estado o color

Los estados de la barra, en orden:

| Estado | Qué quiere decir |
|---|---|
| **Por Confirmar** (rojo) | Fábrica todavía no la acepta. |
| **Confirmada** | Fábrica la aceptó; aún no empieza. |
| **En impresión** / **Impresa** | Impresión (sublimación o por prenda). |
| **En corte** / **Cortado** | Corte. |
| **En sublimado** / **Sublimado** | Sublimación. |
| **En costura** / **Costura terminada** | Costura. |
| **En bordado** / **Bordado** | Bordado. |
| **En terminado** | Terminado y empaque. |
| **Lista para entregar** | Todas las etapas listas; falta que el cliente la reciba. |
| **Entregada** (verde) | Ya se entregó. |

Otros avisos:

- **Cancelada** / **Eliminada** (rojo): la orden ya no sigue.
- **✎ Se modificó después de confirmarse**: hay cambios que fábrica debe aceptar.
- **Entregada de todos modos**: se entregó faltando precios o factura; muestra el motivo.

## Si eres de…

- **Tienda (ventas, admin tienda)**: editas datos, prendas, precios, factura y pagos. No avanzas etapas.
- **Fábrica (admin fábrica y estaciones)**: confirmas, aceptas cambios y avanzas etapas. No cambias cliente, fechas ni precios.
- **Tienda (mostrador)**: ves la orden y sus fotos, pero no precios ni pagos.
- **Solo consulta**: ves todo lo de tu área, sin cambiar nada.

## Problemas comunes

- **No me sale el botón Confirmar entrega al cliente** → La orden todavía no está **Lista para entregar**, o tu rol no entrega. Pídeselo a Admin tienda, Admin fábrica o Administración general.
- **Me dice que faltan precios o datos fiscales al entregar** → Completa **Precios y facturación**. Si ya se entregó de todos modos, usa **Entregar de todos modos** con el motivo.
- **No me deja editar** → Solo Ventas tienda, Admin tienda y Administración general editan datos y prendas. Una orden **Eliminada** ya no admite cambios de nadie.
- **No veo la tarjeta de Pagos** → Los pagos solo los ven los roles de finanzas. En las órdenes de Frisa no hay pagos.
- **Marqué una etapa por error** → Usa **Regresar a "en proceso"** o **Regresar a "pendiente"** en **Etapas de producción**.

## Se conecta con

- [Crear una orden](manual:nueva-orden): cómo nace la orden.
- [Órdenes de tu estación](manual:estacion): donde cada estación inicia y termina su parte.
- [Pedidos](manual:pedidos): cuando la orden va junto con otras.
- [Buscar y consultar órdenes](manual:dashboard): para encontrar la orden.
- [Entrega masiva](manual:entrega-masiva): para entregar varias juntas.
