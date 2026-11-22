-- =====================================================================
-- Datos 2026-11-21 — Manuales: sección "Tienda" (8 manuales)
-- =====================================================================
-- Generado con: node scripts/manuales-sql.mjs tienda 2026-11-21
-- Fuente: supabase/manuales/tienda/*.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: pedidos-colegio, talleros, pendientes, notas-tienda, tareas, anuncios, cotizaciones-web, inventario
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
   where eliminado_en is null and lower(btrim(nombre)) = lower($s$Tienda$s$);
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ($s$Tienda$s$, $s$Pedidos de colegio, talleros, pendientes, notas, tareas, anuncios, cotizaciones web e inventario de tienda.$s$, $s$🏬$s$,
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $c$pedidos-colegio$c$, $t$Pedidos Colegio$t$,
$man$## Resumen

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
$man$),
      (2, $c$talleros$c$, $t$Talleros$t$,
$man$## Resumen

Un **tallero** es un muestrario con las tallas de una prenda que se presta a colegios y clientes para que se midan. En **Talleros** sabes dónde está cada uno, quién lo tiene, qué tallas se llevó y cuánto dinero dejó. Cada tallero tiene un código como **TAL-001**.

## ¿Quién lo usa?

- **Ventas tienda**, **Admin tienda** y **Administración general**: prestan y reciben talleros.
- **Admin tienda** y **Administración general**: dan de alta, editan y dan de baja talleros, y manejan el catálogo de prendas.
- **Contabilidad**, **Consulta tienda**, **Solo consulta**, **Admin fábrica** y **Consulta fábrica**: solo consultan.
- No lo ven **Tienda (mostrador)** ni **Captura de costura**.

## Antes de empezar

- El nombre del colegio o cliente que se lleva el tallero y su teléfono.
- Si deja dinero en garantía, cuánto.
- Si solo se lleva algunas tallas, cuáles.

## Procesos paso a paso

### Cómo encontrar un tallero

1. En el menú, entra a **Talleros**.
2. Arriba ves cuántos hay **disponibles**, **prestados** y **en reparación**.
3. Escribe en **Buscar código o quién lo tiene…**, o filtra por prenda, color o estado.
4. Dale **Historial** en la tarjeta para ver su detalle.

### Cómo prestar un tallero

1. Dale **Prestar** en la tarjeta del tallero (o arriba, y eliges el **Tallero**).
2. **Lo presta** ya trae tu nombre. Llena **Se lo lleva (colegio o cliente)** y el **Teléfono del cliente**.
3. Si deja dinero, ponlo en **Dinero que deja ($)**.
4. Si el préstamo es para una orden, marca **Vincular a una orden** y elígela.
5. Dale **Registrar préstamo**. El tallero pasa a **Prestado**.

### Cómo prestar solo algunas tallas (parcial)

1. Dale **Prestar parcial** en la tarjeta del tallero.
2. Llena los mismos datos que en un préstamo normal.
3. En **Tallas que se prestan** escribe cuáles se lleva (ej. CH, M, G).
4. Dale **Registrar préstamo**.

### Cómo recibir un tallero de regreso

1. Dale **Devolver** en la tarjeta del tallero (o arriba, y eliges cuál).
2. **Lo devuelve** ya trae a quien se lo llevó y **Lo recibe** trae tu nombre; corrígelos si hace falta.
3. En **¿Regresó completo?** elige **Completo** o **Incompleto**. Si falta algo, escribe las **Tallas faltantes** (ej. 2XL, 3XL).
4. Si dejó dinero, en **Dinero que se le devuelve ($)** ya sale lo que dejó; cámbialo si le regresas otra cantidad.
5. Dale **Registrar devolución**. El tallero vuelve a **Disponible**.

### Cómo ver el historial de un tallero

1. Abre el tallero (**Historial**).
2. Arriba ves su color, tallas, contenido, tela, ubicación y caja; si está prestado, quién lo tiene.
3. En **Historial de préstamos** ves cada **Préstamo**, **Devolución** y **Ajuste**: quién lo prestó o recibió, el cliente, su teléfono y el dinero.

### Cómo dar de alta o editar un tallero (Admin tienda)

1. Arriba dale **+ Nuevo tallero**, o **Editar** en uno que ya existe.
2. Elige la **Prenda** y el **Color**. Llena **Tallas que trae** (ej. XS-XL), **Tela**, **Contenido**, **Ubicación** (Tienda o Fábrica) y **Caja**.
3. Si quieres, agrega **Observaciones** y una **Foto**.
4. Dale **Guardar**. El código (TAL-…) se pone solo.

> Para mandarlo a reparar, edítalo y cambia el **Estado** a **En reparación**.

### Cómo dar de baja un tallero (Admin tienda)

1. Dale **Dar de baja** en su tarjeta y confirma.
2. Su historial se conserva.

> Un tallero prestado no se puede dar de baja: primero registra la devolución.

### Cómo manejar el catálogo de prendas (Admin tienda)

1. Arriba dale **Catálogo de prendas**.
2. Escribe una **Nueva prenda…** y dale **Agregar**.
3. Usa **Renombrar** para corregir un nombre o **Desactivar** para que ya no salga.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Disponible** | Está en su lugar y se puede prestar. |
| **Prestado** | Lo tiene un colegio o cliente. Abajo dice quién, desde cuándo y cuánto dejó. |
| **En reparación** | No se presta hasta que lo arreglen. |
| **Incompleto — faltan …** | Le faltan esas tallas. |
| **Parcial: …** | Solo se prestaron esas tallas. |

## Si eres de…

- **Ventas tienda**: prestas y recibes. Pide siempre el teléfono del cliente.
- **Admin tienda**: además das de alta, editas y das de baja.
- **Fábrica y consulta**: ves dónde está cada tallero, sin cambiar nada.

## Problemas comunes

- **No me deja registrar el préstamo** → Faltan **Lo presta** o **Se lo lleva**. En parcial, también **Tallas que se prestan**.
- **No me sale el tallero para prestar** → Ya está **Prestado** o **En reparación**. Revisa su estado.
- **No me deja dar de baja** → El tallero está prestado. Registra primero la devolución.
- **Regresó incompleto** → Márcalo **Incompleto** con las tallas faltantes al devolverlo. Queda en el historial con el nombre de quien se lo llevó.

## Se conecta con

- [Pedidos Colegio](manual:pedidos-colegio): los colegios se miden con el tallero antes de pedir.
- [Crear una orden](manual:nueva-orden): un préstamo se puede vincular a una orden.
$man$),
      (3, $c$pendientes$c$, $t$Pendientes tienda ↔ fábrica$t$,
$man$## Resumen

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
$man$),
      (4, $c$notas-tienda$c$, $t$Notas de tienda$t$,
$man$## Resumen

**Notas de tienda** es un tablero de avisos con dos pestañas. En **Del personal**, el personal de tienda anota faltantes, notas del día y errores para que la administración los atienda. En **Para el personal**, la administración le deja avisos al personal y ve quién ya los leyó.

## ¿Quién lo usa?

- **Ventas tienda**, **Contabilidad** y **Tienda (mostrador)**: escriben notas en **Del personal** y marcan **✓ Enterado** en **Para el personal**.
- **Admin tienda** y **Administración general**: resuelven las notas del personal y escriben notas para el personal.
- **Consulta tienda** y **Solo consulta**: solo leen.

## Antes de empezar

- Si la nota es de un producto o de un error, ten a la mano el dato exacto (talla, color, número de orden).

## Procesos paso a paso

### Cómo dejar una nota (personal de tienda)

1. En el menú, entra a **Notas de tienda**, pestaña **Del personal**.
2. En **Tipo de nota** elige **Producto faltante**, **Nota del día**, **Error** u **Otro**.
3. Escribe la **Nota**. Ej. "Faltan playeras polo azul talla CH (quedan 2)."
4. Si ayuda, dale **+ Agregar foto o PDF (opcional)**.
5. Dale **Guardar nota**. Sale con tu nombre y la hora.

### Cómo buscar notas

1. Arriba elige **Pendientes** o **Resueltas**.
2. Filtra por tipo con **Todas**, **Producto faltante**, **Nota del día**, **Error** u **Otro**. Cada uno dice cuántas hay.

### Cómo resolver una nota (administración)

1. En **Del personal**, pestaña **Pendientes**, lee la nota.
2. Cuando ya se atendió, dale **✓ Marcar resuelta**. Pasa a **Resueltas** con tu nombre y la hora.
3. Si se resolvió por error, búscala en **Resueltas** y dale **Volver a abrir**.

### Cómo dejarle una nota al personal (administración)

1. Entra a la pestaña **Para el personal**.
2. En **Para** elige **Todo el personal** o una persona.
3. Escribe la **Nota**. Ej. "Mañana se abre a las 10. Por favor acomoden el aparador de playeras."
4. Si quieres, agrega una foto o PDF.
5. Dale **Enviar nota**.
6. En la nota ves quién ya dio **✓ Enterado** y a quién le falta.
7. Si ya no aplica, dale **Quitar nota**.

### Cómo leer las notas para ti (personal de tienda)

1. Si tienes notas sin leer, la pestaña **Para el personal** muestra un número.
2. Lee la nota y dale **✓ Enterado**. Así la administración sabe que ya la viste.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Producto faltante** / **Nota del día** / **Error** / **Otro** | El tipo de nota; cada uno tiene su color. |
| **✓ Resuelta por …** | La administración ya la atendió. |
| **Para ti** | Nota solo para ti. |
| **Para todo el personal** | Nota para todos. |
| Nota resaltada en **Para el personal** | Todavía no le das **✓ Enterado**. |
| **Faltan: …** | Personas que todavía no leen la nota. |

## Si eres de…

- **Ventas / Contabilidad / Tienda (mostrador)**: escribes notas y das **✓ Enterado**. No puedes resolverlas.
- **Admin tienda / Administración general**: resuelves, vuelves a abrir y escribes notas para el personal.
- **Consulta tienda / Solo consulta**: solo lees.

## Problemas comunes

- **"Escribe la nota"** → La nota está vacía.
- **No me sale ✓ Marcar resuelta** → Solo Admin tienda y Administración general resuelven notas.
- **No encuentro una nota** → Revisa si está en **Resueltas** o si tienes un filtro de tipo puesto (dale **Todas**).

## Se conecta con

- [Tareas](manual:tareas): cuando el aviso es algo que alguien tiene que hacer y marcar como hecho.
- [Anuncios internos](manual:anuncios): para avisos a toda la empresa, no solo a tienda.
- [Pendientes tienda ↔ fábrica](manual:pendientes): para trabajos que van a la fábrica.
$man$),
      (5, $c$tareas$c$, $t$Tareas$t$,
$man$## Resumen

**Tareas** es la lista de lo que te toca hacer: las tareas que te asigna la administración y las que tú te anotas. Cuando terminas una, la marcas como hecha y la administración ve el avance de cada persona.

## ¿Quién lo usa?

- **Ventas tienda**, **Contabilidad**, **Tienda (mostrador)** y **Chofer**: ven sus tareas, las marcan como hechas y se anotan las suyas.
- **Admin tienda** y **Administración general**: además asignan tareas y ven el avance de todos.
- **Consulta tienda** y **Solo consulta**: solo ven.

## Antes de empezar

- Nada en especial. Si vas a asignar, ten claro qué hay que hacer y para cuándo.

## Procesos paso a paso

### Cómo ver tus tareas

1. En el menú, entra a **Tareas**.
2. Arriba dice cuántas tareas pendientes tienes, o "✓ No tienes tareas pendientes".
3. Usa **Pendientes** y **Hechas** para cambiar de lista. Las vencidas salen primero.
4. Cada tarea dice para quién es y su fecha límite ("Para el 25 nov." o "Venció el 20 nov.").

### Cómo marcar una tarea como hecha

1. Cuando la termines, dale **✓ Marcar como hecha**.
2. Si te equivocaste, dale **Deshacer**.

### Cómo anotarte una tarea

1. Dale **+ Anotarme una tarea**.
2. Escribe la **Tarea** (ej. "Llamar al proveedor de hilos"). Si quieres, agrega **Detalles (opcional)** y **Fecha límite (opcional)**.
3. Dale **Agregar tarea**.

> Las tareas que te anotas solo las ven tú y el administrador.

### Cómo asignar una tarea (administración)

1. Entra a la pestaña **Asignadas**.
2. Escribe la **Tarea** (ej. "Acomodar el aparador de playeras") y, si ayuda, los **Detalles (opcional)**.
3. En **Para** elige **Todo el personal**, un rol (en **Por rol**) o una persona (en **Una persona**).
4. Si quieres, pon la **Fecha límite (opcional)**.
5. En **¿Cómo se completa?** elige:
   - **Cada quien la hace**: cada persona la tiene que marcar.
   - **Basta con que uno la haga**: cuando uno la marca, se cierra para todos.
6. Dale **Asignar tarea**.

### Cómo revisar el avance (administración)

1. En **Asignadas** ves cada tarea con quién ya la hizo y **Faltan: …** con quién no.
2. En la tabla de personas ves, por cada uno, sus tareas **Hechas**, **Pendientes** y **Vencidas**. Dale clic a una persona para ver solo sus tareas.
3. Para regresar a todas, en **Persona** elige **Todas las personas**.
4. Si una tarea ya no aplica, dale **Quitar tarea**.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Tarea en **rojo** / **Venció el …** | Pasó su fecha límite y no está hecha. |
| **Cada quien la hace** | Cada persona tiene que marcarla. |
| **Basta con que uno la haga** | Con que uno la marque, queda hecha para todos. |
| **✓ La hizo …** | Quién la cerró y cuándo. |
| **Faltan: …** | Quién todavía no la hace. |
| **Anotada por ti** | Te la anotaste tú; solo la ven tú y el administrador. |

## Si eres de…

- **Personal de tienda y chofer**: revisas tus tareas, las marcas como hechas y te anotas las tuyas.
- **Admin tienda / Administración general**: asignas, revisas el avance de cada persona y quitas tareas.
- **Consulta**: solo ves.

## Problemas comunes

- **"Escribe la tarea"** → Falta el texto de la tarea.
- **Marqué una tarea por error** → Dale **Deshacer**.
- **"Esa persona ya no recibe tareas"** → La persona ya no está activa. Dale **Ver todas**.
- **No me sale la pestaña Asignadas** → Solo Admin tienda y Administración general asignan tareas.

## Se conecta con

- [Notas de tienda](manual:notas-tienda): para avisos que solo hay que leer.
- [Anuncios internos](manual:anuncios): para avisos generales.
$man$),
      (6, $c$anuncios$c$, $t$Anuncios internos$t$,
$man$## Resumen

**Anuncios** son los avisos generales para toda la empresa: cambios de horario, fechas importantes, días festivos, etc. Un anuncio también sale arriba del **Dashboard**, para que todos lo vean al entrar.

## ¿Quién lo usa?

- **Ventas tienda**, **Contabilidad**, **Admin tienda**, **Admin fábrica** y **Administración general**: leen y publican anuncios.
- **Estaciones de fábrica**, **Consulta fábrica**, **Solo consulta** y **Captura de costura**: solo los leen.
- **Tienda (mostrador)** y **Consulta tienda** no ven este módulo.

## Antes de empezar

- Ten claro el aviso: qué cambia, desde cuándo y a quién le toca.

## Procesos paso a paso

### Cómo leer los anuncios

1. En el **Dashboard**, arriba sale "📣 Anuncio" con el fijado más reciente (o, si no hay fijados, el más nuevo). Dale clic para ver todos.
2. O en el menú, entra a **Anuncios**.
3. Los anuncios **Fijado** salen hasta arriba; después, los más nuevos.

### Cómo publicar un anuncio

1. En **Anuncios** dale **+ Nuevo anuncio**.
2. Escribe el **Título** (ej. "Cambio de horario de entregas") y el **Mensaje**.
3. Si es importante, palomea **Fijar arriba de los demás**.
4. Dale **Publicar anuncio**.

### Cómo quitar un anuncio

1. En el anuncio, dale **Eliminar**.
2. Confirma. Ya nadie lo vuelve a ver.

## Qué significa cada estado o color

- **Fijado**: el anuncio se queda hasta arriba aunque haya otros más nuevos.
- **📣 Anuncio** en el Dashboard: el fijado más reciente o, si no hay, el más nuevo.

## Si eres de…

- **Tienda, oficina y Admin fábrica**: puedes publicar y eliminar.
- **Estaciones de fábrica y consulta**: solo lees.

## Problemas comunes

- **"Escribe un título y un mensaje"** → Los dos son obligatorios.
- **No me sale + Nuevo anuncio** → Tu rol solo lee anuncios.
- **El anuncio viejo sigue saliendo en el Dashboard** → Si está **Fijado**, gana sobre los nuevos. Elimínalo cuando ya no aplique.

## Se conecta con

- [Buscar y consultar órdenes](manual:dashboard): el anuncio sale arriba del Dashboard.
- [Notas de tienda](manual:notas-tienda): para avisos solo para el personal de tienda, con confirmación de lectura.
$man$),
      (7, $c$cotizaciones-web$c$, $t$Cotizaciones web$t$,
$man$## Resumen

**Cotizaciones web** junta las solicitudes que mandan los clientes desde el formulario de cotización de salperdeportes.com. Aquí ves qué pidió cada uno, sus datos de contacto y en qué va: si ya lo contactaste, si ya le cotizaste y si se ganó o se perdió.

## ¿Quién lo usa?

- **Admin tienda** y **Administración general**: son los únicos que ven este módulo.

## Antes de empezar

- Nada en especial. Las solicitudes llegan solas desde la página.

## Procesos paso a paso

### Cómo ver las solicitudes nuevas

1. Si hay solicitudes nuevas, en el menú, junto a **Cotizaciones web**, sale un número.
2. Entra a **Cotizaciones web**. Las nuevas salen resaltadas.
3. La tabla muestra **Fecha**, **Nombre**, **Empresa**, **Productos** y **Estado**.
4. Dale **Actualizar** para ver las que acaban de llegar.

### Cómo ver el detalle de una solicitud

1. Dale clic al renglón.
2. Se abre abajo con todo: **Teléfono**, **Correo**, **Sector**, **Cantidad aproximada**, **Personalización**, **Fecha deseada** y **Mensaje**.
3. Dale clic al teléfono para llamar o al correo para escribirle.
4. Dale clic otra vez al renglón para cerrarlo.

### Cómo dar seguimiento a una solicitud

1. Contacta al cliente.
2. En la columna **Estado**, cambia el estado: **Contactado**, **Cotizado**, **Ganado** o **Perdido**.
3. Se guarda solo.

### Cómo filtrar por estado

1. Arriba elige **Todas**, **Nueva**, **Contactado**, **Cotizado**, **Ganado** o **Perdido**.
2. Cada botón dice cuántas solicitudes hay en ese estado.

## Qué significa cada estado o color

| Estado | Qué quiere decir |
|---|---|
| **Nueva** (renglón resaltado) | Nadie la ha atendido. |
| **Contactado** | Ya se habló con el cliente. |
| **Cotizado** | Ya se le mandó precio. |
| **Ganado** | El cliente aceptó. |
| **Perdido** | El cliente ya no siguió. |

El número del menú cuenta solo las solicitudes en **Nueva**.

## Si eres de…

- **Admin tienda / Administración general**: atiendes cada solicitud y le cambias el estado.
- **Otros roles**: no ven este módulo. Si un cliente dice que llenó el formulario, pásale el aviso a Admin tienda.

## Problemas comunes

- **"Todavía no llegan cotizaciones de la página"** → Nadie ha llenado el formulario todavía.
- **"No hay cotizaciones con este estado"** → Cambia el filtro a **Todas**.
- **Acaba de llegar una y no la veo** → Dale **Actualizar**.

## Se conecta con

- [Qué es el CRM y quién lo usa](manual:crm): para dar seguimiento al prospecto.
- [Crear una orden](manual:nueva-orden): cuando el cliente acepta, se captura la orden.
$man$),
      (8, $c$inventario$c$, $t$Inventario de tienda$t$,
$man$## Resumen

**Inventario** lleva la existencia de prendas de la tienda por sección (cliente o línea), modelo, talla y ubicación. Aquí registras lo que entra y sale, pasas mercancía de un lugar a otro (**Traspasos**), haces conteos físicos y revisas quién movió qué (**Movimientos**).

## ¿Quién lo usa?

- **Tienda (mostrador)**, **Admin tienda** y **Administración general**: registran entradas, salidas, traspasos y conteos.
- **Admin tienda** y **Administración general**: además dan de alta modelos y manejan la **Administración** del inventario.
- **Ventas tienda**, **Admin fábrica** y **Consulta tienda**: solo consultan existencias y movimientos.

## Antes de empezar

- Para una entrada: el modelo, la ubicación donde se guarda y cuántas piezas llegaron por talla.
- Para un conteo: tiempo para contar sin que se mueva mercancía.

## Procesos paso a paso

### Cómo buscar una prenda

1. En el menú, entra a **Inventario**.
2. Escribe en **Buscar en todo el inventario…** aunque sea abreviado (ej. "po tri 12" encuentra la polo de Tricio talla 12).
3. O elige la sección (cliente o línea) en las pestañas. Puedes filtrar por clasificación.
4. Arriba elige **Total** o una ubicación para ver la existencia de ese lugar.
5. Dale clic a una prenda para ver sus tallas. Con **Ver todo con tallas** abres todas.

### Cómo dar entrada a mercancía que llegó

1. Dale **Dar entrada**.
2. Busca el modelo (ej. "po tri") y elígelo.
3. Elige la **Ubicación** y el **Motivo**.
4. En **Cantidad que llegó por talla** escribe solo las tallas que llegaron; deja vacías las demás.
5. Abajo dice cuántas piezas van a entrar. Dale **Guardar entrada**.

### Cómo registrar una entrada o salida de una sola talla

1. En la talla, dale **+** (entrada) o **−** (salida).
2. Elige la **Ubicación**, pon la **Cantidad** y el **Motivo**. **Nota (opcional)**.
3. Dale **Registrar entrada** o **Registrar salida**.

> El sistema no deja sacar más piezas de las que hay en esa ubicación; si no alcanzan, te avisa "no alcanza para esta salida".

### Cómo ver el historial de una talla

1. Toca la talla.
2. Ves cada movimiento: entradas en verde y salidas en rojo, con fecha y quién lo hizo.

### Cómo sacar el reporte de existencias

1. Dale **Reporte**.
2. En **Alcance** elige **Consolidado (total)** o **Consolidado detallando almacenes**.
3. Deja **Todas las prendas** o elige solo algunas.
4. Dale **Generar reporte**. Sale el PDF.

### Cómo pasar mercancía de una ubicación a otra (Traspasos)

1. Dale **Traspasos** y luego **+ Nuevo traspaso**.
2. Elige **Origen** y **Destino** (tienen que ser distintos).
3. En **Agregar prenda** busca cada prenda y pon la cantidad.
4. Si quieres, escribe una **Nota (opcional)**.
5. Dale **Crear traspaso**. Se genera un folio (ej. **T-0001**) y su PDF.
6. Para volver a ver un traspaso, búscalo por folio y dale **Ver PDF**.

> Si junto a una prenda sale **— no alcanza**, en el origen no hay tantas piezas. Baja la cantidad: el sistema no deja traspasar más de lo que hay.

### Cómo hacer un conteo físico

1. Dale **Conteo físico** y luego **+ Nuevo conteo**.
2. Elige la **Sección** y la **Ubicación**, y dale **Crear e imprimir**. Se toma la existencia de ese momento y se abre el PDF.
3. Imprímelo y cuenta las prendas.
4. Regresa a **Conteo físico** y, en ese conteo, dale **Capturar**.
5. En la columna **Conteo** escribe lo que contaste. Las diferencias contra **Sistema** salen en rojo.
6. Dale **Confirmar conteo**. Las diferencias se ajustan solas.

> No muevas mercancía de esa sección y ubicación mientras cuentas.

### Cómo revisar los movimientos

1. Dale **Movimientos**.
2. Elige el **Rango** de fechas.
3. Filtra por **Tipo** (**Entrada**, **Salida**, **Ajuste**, **Conteo**), **Sección** o **Ubicación**.
4. Cada renglón dice la prenda, la cantidad, el motivo, la nota y el **Usuario**. Arriba ves el total de entradas y salidas.

### Cómo dar de alta un modelo nuevo (Admin tienda)

1. Dale **+ Nuevo modelo**.
2. Elige o crea la sección (cliente o línea), el tipo de prenda, la variante (opcional) y el **Juego de tallas**.
3. Revisa la vista previa y dale **Confirmar y crear**. Se crea un artículo por talla.

> Para agregar una talla o un nombre corto a un modelo que ya existe, usa **+ Talla / alias** en esa prenda.

### Cómo manejar los catálogos (Admin tienda)

1. Dale **Administración**.
2. Elige la pestaña: **Secciones**, **Clasificaciones**, **Tipos de prenda**, **Tallas y juegos**, **Ubicaciones**, **Motivos** o **Artículos**.
3. Agrega o corrige lo que haga falta.
4. Si arriba de Inventario sale un aviso de artículos sin clasificar, dale **Clasificarlos →** y asígnales su tipo de prenda.

> Cambiar un juego de tallas no cambia los modelos que ya se crearon con él.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Talla resaltada con **mín. 5** | Hay menos piezas que ese mínimo: hay que resurtir. |
| Talla en gris / en 0 | No hay piezas. |
| **sin clasificar** | Artículo viejo que todavía no está en un modelo. |
| Número en verde / rojo en el historial | Entrada / salida. |
| **Confirmado** / **Pendiente de capturar** | Estado de un conteo físico. |

## Si eres de…

- **Tienda (mostrador)**: das entradas y salidas, haces traspasos y conteos.
- **Admin tienda / Administración general**: todo lo anterior, más modelos y catálogos.
- **Ventas / Admin fábrica / Consulta tienda**: consultas existencias y movimientos; no ves los botones para mover.

## Problemas comunes

- **"No hay suficiente existencia en esa ubicación"** → Revisa la ubicación elegida o la cantidad. Quizá la mercancía está en otro lugar: haz primero un traspaso.
- **No encuentro un modelo al dar entrada** → No está dado de alta. Pídele a Admin tienda que lo cree con **+ Nuevo modelo**.
- **"Elige un origen y un destino distintos"** → El traspaso es del mismo lugar al mismo lugar.
- **El conteo no cuadra con lo que veo hoy** → El conteo usa la existencia del momento en que se creó. Si se movió mercancía después, haz un conteo nuevo.

## Se conecta con

- [Pendientes tienda ↔ fábrica](manual:pendientes): las prendas que se dan de baja o se inventarían al mandarlas a fábrica.
- [Catálogos](manual:catalogos): los clientes de Órdenes que se usan como secciones.
$man$)
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar 8 filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in ('pedidos-colegio', 'talleros', 'pendientes', 'notas-tienda', 'tareas', 'anuncios', 'cotizaciones-web', 'inventario') and eliminado_en is null order by orden;
