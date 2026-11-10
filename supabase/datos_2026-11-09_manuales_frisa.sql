-- =====================================================================
-- Datos 2026-11-09 — Manuales: sección "Frisa" con 14 manuales (uno por proceso)
-- =====================================================================
-- Requiere V196 (schema_v196_manuales.sql). Contenido tomado de los manuales PDF
-- de Frisa (General, Gis, Quien surte, Quien confirma, Inventario), pasado a
-- markdown y separado por proceso. Sin capturas de pantalla.
-- Se puede correr dos veces: no duplica la sección ni los manuales (por título).
-- =====================================================================
do $$
declare v_sec uuid;
begin
  if to_regclass('public.manuales') is null then
    raise exception 'Falta aplicar V196 (schema_v196_manuales.sql). No se cargó nada.';
  end if;

  select id into v_sec from public.manual_secciones
   where eliminado_en is null and lower(btrim(nombre)) = 'frisa';
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ('Frisa', 'Órdenes de surtido, restock e inventario de Frisa.', '📦',
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $t$Cómo funciona Frisa$t$, $man$La sección **Frisa** lleva todo lo de Frisa en un solo lugar: lo que pide Frisa, el inventario de la bodega, lo que hay que producir o comprar y lo que hay en cada planta.

Para entrar: en la página de SALPER, en el menú de la izquierda toca **Frisa** (en el celular del chofer dice **Surtido Frisa**). Arriba vas a ver solo las pestañas que te tocan.

## El recorrido de una orden

1. Gis sube la OC de Frisa.
2. Queda la orden de surtido.
3. Leo la surte y la marca.
4. Leo entrega y Gis confirma "Ya entregó el chofer".
5. Baja el inventario.
6. Gis pide restock (órdenes de taller y compras).
7. Jackie o Adriana suben a bodega lo del taller y reciben la playera lisa · Gis recibe el pantalón.
8. Sube el inventario.

## Quién hace qué

| Persona | Qué hace | Qué pestañas ve |
|---|---|---|
| **Gis** (ventas) | Sube las órdenes de compra de Frisa. Crea las órdenes de taller y los pedidos de playera lisa y pantalón. **Recibe el pantalón** cuando llega y **confirma las entregas** de Leo. | Órdenes de surtido, Restock, Reportes |
| **Quien surte** (Leo) | Embolsa y marca las órdenes como surtidas. | Órdenes de surtido |
| **Jackie o Adriana** (bodega) | Suben a bodega lo que termina el taller, reciben la playera lisa y cuentan el anaquel. Lo demás lo pueden **ver**, pero no cambiar. | Todas (solo de vista, salvo lo suyo) |

Cada persona solo ve las pestañas que le tocan, para que no se confunda.

## Reglas importantes

- **Frisa no acepta parciales**: una orden se surte solo si está completa.
- **Una OC no se sube dos veces**: la página no lo permite.
- Las claves se encuentran por el **número de artículo** (el MATERIAL de la OC, que es el mismo de Microsip).
- El inventario solo cambia con movimientos que quedan en el historial: **Ya entregó el chofer**, **Subir a bodega**, **Recibir** compras y ajustes.
- **No hagas órdenes de taller de prueba**: gastan folios FR reales.
- Cada **10 días** se compara contra Microsip (Revisión Microsip).

## Las pestañas

| Pestaña | Para qué sirve | Quién |
|---|---|---|
| Niveles de inventario | Inventario de la bodega por clave, con mínimo, reorden y máximo. | Admins (vista) |
| Órdenes de surtido | Subir OC, surtir, confirmar entregas. | Gis, Leo, admins |
| Restock | Órdenes de taller, pedidos de compra, playera lisa, subir a bodega. | Gis, admins |
| Revisión Microsip | Comparar el inventario con Microsip y ajustar. | Admins (vista) |
| Plantas Frisa | Lo que hay en cada planta (remitido − facturado). | Admins (vista) |
| Reportes | PDF o CSV en cualquier momento. | Gis, admins |

## Niveles de inventario

El inventario de la **bodega de la fábrica** (no el de las plantas). Para cada clave:

- **Real** = lo que hay · **Apartado** = surtido que todavía no sale · **Disponible** = real − apartado.
- **Mínimo / Reorden / Máximo** salen del consumo de 2026 (mínimo 20 días, reorden 28, máximo 42).
- Estado: **CRÍTICO** disponible ≤ mínimo · **PEDIR** ≤ reorden · **OK**.

Puedes filtrar por estado, tipo y color, y buscar por clave, número de artículo o nombre. Tocando la clave ves su historial; tocando el número real capturas un conteo. "Exportar A PEDIR" da el PDF de lo que hay que pedir.
$man$),
      (2, $t$Cómo subir una orden de compra de Frisa$t$, $man$**Lo hace:** Gis (ventas).

Cada vez que llegue una OC de Frisa por correo, descarga el PDF y súbelo. La página lee el PDF sola y así se crea su **orden de surtido**.

## Pasos

1. En la pestaña **Órdenes de surtido** toca **+ Subir orden de compra**.
2. En **PDF de la orden de compra** elige el PDF. Espera unos segundos: la página llena el número de OC, la planta, las fechas y los renglones.
3. Revisa cada renglón. Debajo de cada uno dice cómo encontró la clave:
   **✓ por el número de artículo** = la encontró por el número MATERIAL de la OC (es lo más seguro).
   **Sugerida por parecido: revísala** = la adivinó por el nombre: **confírmala** y si está mal, escoge la correcta en la lista.
4. Revisa que las **cantidades** sean las del PDF.
5. Toca **Crear orden de surtido**. Listo: ya aparece en la lista de pendientes.

> **¿El PDF no se leyó o le falta algo?** Puedes llenar los datos a mano y agregar renglones con **+ Agregar renglón**. Si un renglón trae algo que no es de Frisa, quítalo con la ×.

## Una OC no se puede subir dos veces

Si el número de OC ya está en la página, sale en rojo **"Esta OC ya está subida"** y el botón se bloquea. No es un error: quiere decir que ya estaba.

## Si te equivocaste en una OC

Ábrela tocándola en la lista y usa **Corregir** (cambiar claves, cantidades o fechas) o **Cancelar OC** (si Frisa la canceló o se subió por error). Solo se puede mientras no se haya entregado.
$man$),
      (3, $t$Cómo ver qué se puede surtir y qué falta$t$, $man$En **Órdenes de surtido**, arriba salen los totales:

- **Pendientes**: cuántas órdenes faltan por surtir y cuántas piezas son.
- **Sí se pueden surtir**: cuántas alcanzan con lo que hay en la bodega, **todas juntas**.
- **No se pueden surtir**: a cuántas les falta algo y cuántas piezas faltan en total.

El inventario se reparte **de la orden que vence primero a la última**. Cada orden dice:

| Etiqueta | Qué quiere decir |
|---|---|
| **Se puede surtir** | Alcanza. |
| **Alcanza, pero la ocupa OC …** | Sola sí alcanza, pero otra OC que vence antes usa esas piezas. |
| **Falta inventario** | No alcanza. |

> Frisa **no acepta parciales**: una orden solo se surte si está completa.

## Filtrar por planta

Debajo de Pendientes / Surtidas hay un botón por cada planta (Aerospace, Santa Catarina…). Al tocar una, solo salen sus órdenes y arriba aparece **"Para surtir juntas"**: lo que piden todas sus órdenes sumado por clave, con lo que hay. Sirve para surtir todas las de una planta al mismo tiempo.

## Lo que falta

Arriba de la lista sale la tabla **"Lo que falta por clave"**: lo que piden todas las órdenes pendientes, lo que hay disponible y lo que **falta**. Úsala para saber qué hay que producir o comprar primero.

Y cada orden a la que le falta inventario dice exactamente qué le falta, por ejemplo `Falta: PLAFR-000M-01MCVE2I (6)`.
$man$),
      (4, $t$Cómo surtir una orden$t$, $man$**Lo hace:** quien surte (Leo). Se puede hacer desde el celular.

Tú embolsas las órdenes de Frisa y las marcas en la página. Tú **no** subes órdenes, **no** confirmas las entregas y **no** mueves el inventario. Solo surtes.

## Antes de empezar

Entra a **Frisa** (en el celular del chofer dice **Surtido Frisa**). Vas a ver la lista de órdenes **pendientes**. Arriba van las que vencen primero. Cada orden dice:

| Etiqueta | Qué quiere decir |
|---|---|
| **Se puede surtir** | Hay todo, ya se puede embolsar. |
| **Falta inventario** | Todavía no: falta mercancía. |
| **Alcanza, pero la ocupa OC …** | Alcanza, pero otra orden que vence antes usa esas piezas: pregunta cuál va primero. |

> Frisa **no acepta parciales**: solo se surte una orden si está completa. Empieza por las verdes, de arriba hacia abajo.

## Pasos

1. Toca la orden en la lista. Se abre con sus renglones: **clave**, número de artículo, nombre (en el color de la playera) y cuántas piden.
2. Conforme metes cada renglón a la bolsa, **palomea** su cuadrito ✓. Se guarda solo, así puedes seguir después o desde otro celular. Abajo dice cuántos llevas: **"Embolsados 1 de 3 renglones"**.
3. Cuando esté toda la orden embolsada, toca **Surtida toda**.
4. En **¿Quién la surtió?** elige tu nombre (o "Otra persona" y escribe el nombre).
5. Toca **Confirmar: surtida completa**. La orden pasa a **Surtidas** y las piezas quedan apartadas para Frisa.

Si la orden es de un solo renglón, puedes tocar directo **Surtida toda** sin palomear.

> **¿Te equivocaste?** Si marcaste surtida una orden que no era, avísale a Gis: ella la puede regresar a pendiente.

> **¿No te deja?** Si sale "No alcanza el inventario", la orden no está completa en la bodega. No la surtas a medias: avísale a Gis.

## Surtir todas las órdenes de una planta

1. Debajo de Pendientes toca el botón de la **planta** (por ejemplo **Santa Catarina**). Solo quedan sus órdenes.
2. Arriba sale **"Para surtir juntas"**: cuánto piden **todas** esas órdenes de cada clave y cuánto hay. Junta todo de una vez.
3. Luego abre **cada orden** y márcala como siempre (palomea y Surtida toda).
4. Para ver todas otra vez toca **Todas las plantas**.
$man$),
      (5, $t$Cómo confirmar "Ya entregó el chofer"$t$, $man$**Lo hace:** Gis (ventas), cuando Leo regresa de entregar.

Se confirma cuando el chofer **ya entregó** la orden en la planta y regresó, **no cuando sale**. Así el inventario solo baja con lo que de verdad se entregó.

## Pasos

1. En **Órdenes de surtido** toca el botón **Surtidas**. Ahí están las órdenes embolsadas que todavía no se confirman como entregadas.
2. Toca la orden que el chofer ya entregó.
3. Toca **Ya entregó el chofer**.
4. Escribe el **Folio de remisión** de Microsip y la **Fecha de entrega**.
5. Toca **Confirmar entrega**. La orden pasa a **Entregadas**, sus piezas se descuentan del inventario de la fábrica y **se suman a la planta** de esa orden. Escribe el folio **igual que en Microsip**.

Antes de confirmar dice cuántas piezas se van a descontar.

> **¿El chofer no pudo entregar algo?** No la confirmes: déjala en Surtidas hasta que se entregue.

> **¿Se marcó surtida por error?** Ábrela en Surtidas y toca **Regresar a pendiente**.
$man$),
      (6, $t$Cómo hacer el restock: crear una orden de taller FR$t$, $man$**Lo hace:** Gis (ventas).

## Qué es el restock

Restock calcula qué hay que reponer: **disponible + en proceso + por entrar = proyectado**. Si el proyectado llega al reorden, propone lo que falta para el máximo.

Tiene **3 pestañas**: **Órdenes de taller** (lo que se produce en la fábrica), **Pantalón** (lo que se compra hecho: pantalón, bata y bolsa) y **Playera lisa**. El número junto a cada una dice cuántas cosas tiene pendientes.

## La tabla "Por pedir al taller"

En la pestaña **Órdenes de taller**: cada clave que se fabrica, con su estado (**CRÍTICO**, **PEDIR** u **OK**) y cuánto pedir. En la pestaña **Pantalón** está la misma tabla con lo que se compra hecho.

## Pasos para crear la orden de taller

En **Restock → Órdenes de taller**, debajo de "Por pedir al taller" aparece una tarjeta por cada producto que hay que fabricar, ya con las cantidades por talla.

1. Revisa las cantidades por talla. Puedes cambiarlas (por ejemplo, redondear).
2. Revisa la fecha de **Entrega**.
3. Toca **Crear orden de taller FR**. Se crea la orden en Producción con su folio FR y se apartan las playeras lisas que lleva.

> Cada orden de taller gasta un folio FR real. **No crees órdenes de prueba.**

La orden pasa a **"Órdenes de taller en proceso"**. Cuando el taller la termina, Jackie o Adriana la suben a la bodega y ahí entra al inventario.

Si una orden FR se creó por fuera de Restock, puedes ligarla en esa misma sección para que cuente.
$man$),
      (7, $t$Cómo hacer un pedido de compra de pantalón$t$, $man$**Lo hace:** Gis (ventas).

El pantalón (y la bata y la bolsa) no se fabrica: se compra hecho. Todo está en **Restock → Pantalón**. La tarjeta **"Pedido de compra (lo que se compra hecho)"** funciona igual que la de playera lisa:

- **Arriba**: lo que hay que pedir (CRÍTICO o PEDIR), ya con la cantidad para llegar al máximo.
- **Abajo**: **todos** los demás productos que se compran (OK), en 0, por si quieres agregar alguno.
- Cada renglón dice cuánto **Hay**, cuánto viene **En camino** (pedidos que no han llegado), el reorden y el máximo.

## Pasos

1. Revisa las cantidades de arriba y, si quieres, agrega de los de abajo. Puedes cambiar cualquier cantidad.
2. Escribe el **Proveedor** y, si sabes, la fecha en que se espera.
3. Toca **Crear pedido de compra**.

El pedido queda **hasta arriba** de la pestaña, en **"Por recibir"**, como **Pedida**. Mientras llega, cuenta para que no se pida dos veces. Cuando llega, **Gis** le da **Recibir** (ver "Cómo recibir un pedido de compra"). Si el proveedor no lo va a surtir, puedes cancelarlo.
$man$),
      (8, $t$Cómo hacer un pedido de playera lisa$t$, $man$**Lo hace:** Gis (ventas).

La playera lisa es la playera sin procesos con la que el taller hace las de Frisa. Todo está en **Restock → Playera lisa**. En la tarjeta **"Pedido de playera lisa"** salen **todas las tallas** de cada color y manga, para que veas el desglose completo:

- **Hay**: lo que está en el anaquel.
- **Necesitan**: lo que piden las órdenes de taller que hay que crear.
- **Estado**: **OK** alcanza · **PEDIR** hay que pedir.
- **A pedir**: las de PEDIR ya traen la cantidad que falta. Las de OK vienen en 0. Puedes cambiar cualquiera.

## Pasos

1. Revisa el desglose y las cantidades a pedir.
2. Escribe el **Proveedor** y la fecha esperada (opcional).
3. Toca **Crear pedido de playera lisa**.

El pedido queda hasta arriba de la pestaña, en **"Por recibir"**. Cuando llega, **Jackie o Adriana** le dan **Recibir** y se suma al anaquel. Al crear una orden de taller, las lisas que usa se descuentan solas.
$man$),
      (9, $t$Cómo subir a bodega lo que terminó el taller$t$, $man$**Lo hace:** Jackie o Adriana.

Cuando en Producción se termina una orden de taller FR, aparece sola en **Restock → pestaña Órdenes de taller → "Por entrar: terminadas, falta subirlas a bodega"**. **No entra sola al inventario**: tú confirmas cuántas piezas llegaron.

## Pasos

1. En **Restock → Órdenes de taller**, en "Por entrar", toca **Subir a bodega** en la orden.
2. Revisa las piezas por talla. Si llegaron menos (merma, defectos), **corrige el número**.
3. Si quieres, escribe una nota (por ejemplo "2 con defecto").
4. Toca **Confirmar: subir … pzas**. Se suman al inventario y la orden sale de "Por entrar".

> Todo lo que confirmas cambia el inventario. Escribe siempre lo que **llegó de verdad**.
$man$),
      (10, $t$Cómo recibir un pedido de compra$t$, $man$**Lo hace:** el **pantalón** (y bata, bolsa) lo recibe **Gis**; la **playera lisa**, **Jackie o Adriana**.

Los pedidos que hace Gis aparecen como **Pedida**: los de pantalón en **Restock → Pantalón** y los de playera lisa en **Restock → Playera lisa**. Salen **hasta arriba** de cada pestaña, en **"Por recibir"**. El inventario **solo sube cuando le das Recibir**.

## Pasos

1. Cuando llegue la mercancía, toca **Recibir** en ese pedido.
2. Escribe lo que **llegó de verdad** de cada clave o talla.
3. Toca **Recibir … pzas**. El pantalón se suma al inventario de la bodega; la playera lisa, al anaquel de lisas.

## Contar la playera lisa

En **Restock → Playera lisa** toca el número de **Stock (anaquel)** de una talla, escribe lo que contaste y toca ✓.
$man$),
      (11, $t$Cómo se mantiene el inventario$t$, $man$En la página hay tres inventarios **separados**. Cada uno sube y baja con cosas distintas:

| Inventario | Qué es | Dónde se ve |
|---|---|---|
| **Bodega de la fábrica** | Las prendas terminadas listas para Frisa (playeras, camisas, pantalón…), por clave. | Niveles de inventario |
| **Playera lisa** | La playera sin procesos que está en el anaquel, por color, manga y talla. | Restock → Playera lisa |
| **Plantas de Frisa** | Lo que Frisa tiene en cada planta: lo remitido menos lo facturado. | Plantas Frisa |

> Ningún movimiento se borra: todo queda en el historial con quién y cuándo. Si algo se capturó mal, se corrige con un **ajuste** o un **conteo**, nunca borrando.

## Bodega de la fábrica

Para cada clave la página lleva tres números:

- **Real**: lo que hay físicamente en la bodega.
- **Apartado**: lo que ya se surtió (está embolsado) pero el chofer todavía no entrega.
- **Disponible** = real − apartado. Con este se calcula si se puede surtir y qué hay que pedir.

### Qué lo mueve

| Pasa esto | En la página | Efecto | Quién |
|---|---|---|---|
| Leo embolsa una orden completa | Órdenes de surtido → la orden → **Surtida toda** | Se **aparta** (el real no cambia) | Quien surte |
| El chofer **ya entregó** en la planta | Surtidas → la orden → **Ya entregó el chofer** → remisión | **Baja** el real | Gis |
| Llega a bodega lo que terminó el taller | Restock → Órdenes de taller → Por entrar → **Subir a bodega** | **Sube** el real | Jackie o Adriana |
| Llega un pedido de pantalón (o bata, bolsa) | Restock → Pantalón → **Recibir** | **Sube** el real | Gis |
| Se cuenta la bodega o se revisa contra Microsip | Niveles (conteo) o Revisión Microsip | **Ajusta** el real | El encargado del inventario |

### El historial de cada clave

En Niveles toca la **clave** para ver su detalle: real, apartado, disponible, niveles y el historial de conteos. El reporte **Movimientos del inventario** (Reportes) trae cada entrada y salida con fecha, quién y por qué.

## Las reglas para que cuadre

- **Confirmar las entregas el mismo día** que el chofer regresa. Si no, el inventario dice que hay piezas que ya no están.
- **Subir a bodega en cuanto llega** lo del taller, con las piezas que **llegaron de verdad** (corrige merma o defectos).
- **Recibir los pedidos de compra** con lo que llegó, no con lo que se pidió.
- **No sacar mercancía de la bodega sin que pase por la página** (sin orden de surtido, sin entrega confirmada).
- **Cada 10 días, revisión contra Microsip** (ver su manual).
- Si algo no cuadra: primero **revisar el historial** y las órdenes surtidas sin entregar; solo después **ajustar**, y siempre con un conteo real.

## Playera lisa (anaquel)

| Pasa esto | Efecto en el anaquel |
|---|---|
| Llega un pedido de playera lisa → **Recibir** (Restock → Playera lisa, lo hacen Jackie o Adriana) | **Sube** |
| Se crea una orden de taller FR de playera | **Baja** sola lo que lleva esa orden |
| Se quita una orden del restock o se borra | **Regresa** lo que había apartado |
| Se cuenta el anaquel → tocar el número de **Stock (anaquel)** | **Ajusta** al conteo |

Cuenta el anaquel **al empezar** y después cada semana o cada que se haga un pedido. Si el stock sale en negativo dice **"faltó registrar"**: se usaron lisas que no se habían capturado (cuenta y corrige).

## La rutina

| Cuándo | Qué |
|---|---|
| Cada día | Confirmar entregas del chofer · subir a bodega lo que llega del taller · recibir pedidos que lleguen |
| Cada semana | Contar la playera lisa · subir remisiones y facturas a Plantas Frisa |
| Cada 10 días | Revisión contra Microsip |
| Cuando no cuadre algo | Historial de la clave y reporte de Movimientos → conteo real → ajuste |
$man$),
      (12, $t$Revisión contra Microsip (cada 10 días)$t$, $man$Cada 10 días se compara el inventario de la bodega contra Microsip. Las claves se ligan por número de artículo.

## Pasos

1. En Microsip saca el reporte **"Existencia y valor del inventario"**, línea **FRISA**, y guárdalo en Excel.
2. En la página entra a **Revisión Microsip** y sube el Excel tal cual.
3. La página liga cada artículo por su **número de artículo** y muestra las **diferencias** contra su inventario.
4. Antes de ajustar revisa: ¿hay órdenes **surtidas sin entregar**?, ¿algo que se subió a bodega o se entregó **después** de sacar el reporte? Eso puede salir como diferencia y **no** se ajusta.
5. Marca las que sí hay que ajustar y guarda la revisión. Queda en el historial con la fecha del reporte.

Arriba dice cuándo fue la última revisión. A los 10 días avisa **"Ya toca revisar"**.
$man$),
      (13, $t$Plantas Frisa: subir remisiones y facturas$t$, $man$Lo que hay en cada planta = **remitido − facturado**.

- **Remisiones:** cada entrega confirmada en la página ("Ya entregó el chofer") se suma **sola** a su planta, con su folio de remisión.
- **Facturas:** se suben con los Diarios de Microsip y **restan**.
- Si el Excel trae una remisión que ya se sumó con la entrega, se **salta sola** (no se cuenta doble).

- Cada folio se cuenta una sola vez: si subes un archivo repetido, salta lo que ya estaba.
- Arranca con lo acumulado al 15/10/2026.

## Pasos

1. En Microsip saca **"Diarios del inventario"**, línea FRISA, del periodo que falte: **Concepto: Venta** (lo facturado) y, si quieres revisar, también **Concepto: Remisión**. Pueden ir en un mismo Excel en dos hojas o en dos archivos.
2. En **Plantas Frisa** súbelo tal cual. La página muestra cuántos documentos son **nuevos** y cuántos **ya estaban** (los salta solos).
3. Revisa que no haya **plantas desconocidas** ni artículos **sin clave**, y toca **Subir**.

Hazlo cada semana (o cada 10 días junto con la revisión de Microsip). Si una planta sale con una clave en **negativo**, se facturó más de lo remitido: revisa las remisiones de ese periodo.
$man$),
      (14, $t$Reportes de Frisa$t$, $man$En **Reportes** puedes sacar en cualquier momento, en PDF (con vista previa) o CSV para Excel:

- **Por surtir contra inventario**: lo que piden las órdenes pendientes, lo que hay y lo que falta producir, con totales.
- Inventario de la fábrica, Movimientos, Órdenes de surtido, Restock, Playera lisa y Pedidos de compra.

## Resumen rápido

| Cuando… | Haz esto |
|---|---|
| Llega una OC de Frisa | Órdenes de surtido → + Subir orden de compra → revisa → Crear orden de surtido |
| Quieres saber qué falta | Órdenes de surtido (arriba, "Lo que falta por clave"), o Reportes → Por surtir contra inventario |
| Hay que producir | Restock → Órdenes de taller → tarjeta del producto → Crear orden de taller FR |
| Hay que comprar pantalón | Restock → Pantalón → Pedido de compra → Proveedor → Crear |
| Hay que comprar playera lisa | Restock → Playera lisa → Pedido de playera lisa → revisa OK/PEDIR → Crear |
| Quieres ver las de una planta | Órdenes de surtido → botón de la planta |
| Leo ya entregó una orden (Gis) | Órdenes de surtido → Surtidas → la orden → Ya entregó el chofer → remisión → Confirmar entrega |
| Llega lo que terminó el taller (Jackie o Adriana) | Restock → Órdenes de taller → Por entrar → Subir a bodega → corrige piezas → Confirmar |
| Llega un pedido de playera lisa (Jackie o Adriana) | Restock → Playera lisa → Por recibir → Recibir → lo que llegó → Recibir |
$man$)
    ) as x(orden, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.seccion_id = v_sec and m.eliminado_en is null and m.titulo = x.titulo);
end $$;

select s.nombre as seccion, count(m.id) as manuales
  from public.manual_secciones s
  left join public.manuales m on m.seccion_id = s.id and m.eliminado_en is null
 where s.eliminado_en is null
 group by s.nombre, s.orden order by s.orden;
