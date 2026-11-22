-- =====================================================================
-- Datos 2026-11-21 — Manuales: sección "Órdenes" (6 manuales)
-- =====================================================================
-- Generado con: node scripts/manuales-sql.mjs ordenes 2026-11-21
-- Fuente: supabase/manuales/ordenes/*.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: nueva-orden, detalle-orden, dashboard, pedidos, entrega-masiva, calendario
-- =====================================================================
do $$
declare v_sec uuid;
begin
  if to_regclass('public.manuales') is null then
    raise exception 'Falta aplicar V196 (schema_v196_manuales.sql). No se cargó nada.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'manuales' and column_name = 'clave') then
    raise exception 'Falta aplicar V214 (schema_v214_manuales_clave.sql). No se cargó nada.';
  end if;

  select id into v_sec from public.manual_secciones
   where eliminado_en is null and lower(btrim(nombre)) = lower($s$Órdenes$s$);
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ($s$Órdenes$s$, $s$Crear, seguir, buscar y entregar órdenes de producción, y juntarlas en pedidos.$s$, $s$🧾$s$,
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $c$nueva-orden$c$, $t$Crear una orden$t$,
$man$## Resumen

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
$man$),
      (2, $c$detalle-orden$c$, $t$Seguimiento de una orden$t$,
$man$## Resumen

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
$man$),
      (3, $c$dashboard$c$, $t$Buscar y consultar órdenes$t$,
$man$## Resumen

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
$man$),
      (4, $c$pedidos$c$, $t$Pedidos$t$,
$man$## Resumen

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
$man$),
      (5, $c$entrega-masiva$c$, $t$Entrega masiva$t$,
$man$## Resumen

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
$man$),
      (6, $c$calendario$c$, $t$Calendario y estadísticas de entrega$t$,
$man$## Resumen

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
$man$)
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar 6 filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in ('nueva-orden', 'detalle-orden', 'dashboard', 'pedidos', 'entrega-masiva', 'calendario') and eliminado_en is null order by orden;
