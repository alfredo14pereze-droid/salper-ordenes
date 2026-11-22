-- =====================================================================
-- Datos 2026-11-21 — Manuales: sección "Fábrica" (8 manuales)
-- =====================================================================
-- Generado con: node scripts/manuales-sql.mjs fabrica 2026-11-21
-- Fuente: supabase/manuales/fabrica/*.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: estacion, sublimado, inventario-tela, atr, produccion-captura, produccion-revision, produccion-admin, chofer
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
   where eliminado_en is null and lower(btrim(nombre)) = lower($s$Fábrica$s$);
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ($s$Fábrica$s$, $s$Trabajo de cada estación, sublimado, inventario de tela, ATR, captura y revisión de producción, y chofer.$s$, $s$🏭$s$,
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $c$estacion$c$, $t$Órdenes de tu estación$t$,
$man$## Resumen

Si trabajas en una estación de fábrica (**Corte**, **Bordado**, **Costura** o **Terminado**), al entrar ves **Siguientes órdenes**: la lista de lo que te toca hacer en tu etapa. Abres cada orden, ves sus prendas, tallas y fotos, y avisas cuándo empiezas (**Iniciar**) y cuándo terminas tu parte. Con eso todos saben en qué va cada orden.

## ¿Quién lo usa?

- **Corte**, **Bordado**, **Costura** y **Terminado**.
- **Sublimado** tiene su propia pantalla: ver el manual [Órdenes de sublimado](manual:sublimado).

## Antes de empezar

- Entra con tu usuario de estación.
- **Corte**: ten a la mano cuánta tela usaste (largo del trazo, piezas por trazo y número de hojas).
- **Terminado**: cuenta las piezas reales por talla antes de cerrar la orden.

## Procesos paso a paso

### Cómo ver qué te toca

1. Al entrar ves **Siguientes órdenes**, en el orden en que hay que hacerlas.
2. Si tu estación hace varias etapas (ej. Costura también hace reflejante), cada etapa sale en su propia lista.
3. Las que ya empezaste dicen **En proceso** o **⏸ En pausa**.
4. Abajo dice cuántas órdenes más esperan el paso anterior. Te van a aparecer cuando estén listas.

### Cómo buscar cualquier orden

1. Escribe en **Buscar folio, folio anterior o cliente (cualquier orden)**.
2. Salen todas las que coinciden, aunque todavía no te toquen.

### Cómo trabajar una orden

1. Dale clic a la orden para abrirla.
2. Revisa las prendas, las tallas, los nombres y números, y las fotos de referencia. **Bordado** ve también las **Fotos de bordado**.
3. Al empezar, dale **Iniciar**. Empieza a correr el tiempo.
4. Al acabar tu parte, dale **Terminar**.
5. Sale "✓ Ya terminaste tu parte de esta orden".

> Si dice "Todavía no le toca: falta terminar …", espera a que la estación anterior acabe.

### Cómo pausar una orden (Bordado y Terminado)

1. Si te cambias a otra orden, dale **⏸ Pausar**. El tiempo se detiene.
2. Al regresar, dale **▶ Reanudar**.

### Cómo registrar el corte (Corte)

1. Dale **Iniciar** al empezar.
2. Al terminar, llena por cada tela: **Largo del trazo**, **Piezas por trazo** y **Número de hojas**. Si la prenda no tiene tela asignada, elige la **Tela** que usaste.
3. Si usaste otra tela (ej. vivos), dale **+ Agregar otro corte** y escribe **¿Qué corte es?**.
4. Dale **Cortado**.

> Si no puedes registrar la tela en ese momento, usa **Marcar cortada sin registrar la tela** y confirma. Después, en la orden, dale **Registrar el corte**.

### Cómo cerrar una orden en Terminado

1. Dale **Iniciar** al empezar.
2. En cada talla marca **Correcta** si salieron las piezas pedidas, o **Parcial** y escribe la **Cantidad real** y un **Comentario** si hace falta.
3. Dale **Confirmar y generar reporte**. Se genera el reporte de la orden.
4. Si la orden lleva impresión en prenda, dale **Impresa** cuando esté.

### Cómo confirmar una orden nueva

1. Si abres una orden que está **Por Confirmar**, en lugar de **Iniciar** sale **Confirmar**.
2. Revísala y dale **Confirmar** para aceptarla en fábrica.

### Cómo aceptar cambios de tienda

1. Si tienda cambió algo después de confirmar, arriba de la orden sale el aviso de cambios.
2. Revisa qué cambió y dale **✓ Aceptar cambios**.

### Cómo copiar los nombres y números

1. En una prenda con nombres y números, usa **Copiar lista**, **Copiar nombres** o **Copiar números**.
2. Pégalos donde los necesites (ej. el programa de bordado).

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **En proceso** | Ya le diste **Iniciar**. |
| **⏸ En pausa** | La pausaste; el tiempo no corre. |
| **✓ Terminada** | Ya terminaste esa etapa; sale el tiempo real que tardó. |
| **Todavía no le toca** | La etapa anterior no ha terminado. |
| **Comprada** | Esa prenda se compra hecha: no se corta. |
| **Reporte generado** | Terminado ya cerró la orden. |

## Si eres de…

- **Corte**: no ves las prendas compradas. Registra siempre la tela al dar **Cortado**.
- **Bordado**: tienes **Fotos de bordado** y puedes pausar. También ves tus **Pendientes de bordado**.
- **Costura**: también haces reflejante y ves tus **Pendientes de arreglo**.
- **Terminado**: cierras la orden con las cantidades reales, puedes pausar y ves todos los pendientes de fábrica.

## Problemas comunes

- **No veo una orden en mi lista** → Todavía espera el paso anterior, o ya terminaste tu parte. Búscala con el buscador.
- **Le di Terminar por error** → Pídele a Admin fábrica que la regrese desde el detalle de la orden (**Regresar a "en proceso"**).
- **Se me olvidó darle Iniciar** → Dale **Iniciar** y luego **Terminar**. Admin fábrica puede corregir las horas.
- **Marqué cortada sin registrar la tela** → Abre la orden y dale **Registrar el corte**.

## Se conecta con

- [Seguimiento de una orden](manual:detalle-orden): el detalle completo de la orden.
- [Pendientes tienda ↔ fábrica](manual:pendientes): los trabajos chicos de Bordado y Costura.
- [Órdenes de sublimado](manual:sublimado).
$man$),
      (2, $c$sublimado$c$, $t$Órdenes de sublimado$t$,
$man$## Resumen

**Órdenes de sublimado** es la pantalla de la estación de sublimado. Cada orden pasa por tres pasos: **diseño** (se sube el diseño final y Ventas lo autoriza), **impresión** (se imprime en lote con otras órdenes) y **sublimado** (se planchan las prendas). En **Lotes** queda el reporte de cada lote, con los metros y la tinta.

## ¿Quién lo usa?

- **Sublimado**: sube diseños, imprime y sublima.
- **Ventas tienda**, **Admin fábrica** y **Administración general**: autorizan el diseño.

## Antes de empezar

- El diseño final de la orden (imagen o PDF).
- Al imprimir: el largo total del trazo en metros y la tinta usada de cada color en mL.

## Procesos paso a paso

### Cómo ver qué te toca

1. Al entrar ves las pestañas **Pendientes de diseño**, **Pendientes de impresión**, **Pendientes de sublimado**, **Todas** y **Lotes**.
2. Para encontrar cualquier orden, escribe en **Buscar folio, folio anterior o cliente (cualquier orden)**.

### Cómo subir el diseño

1. En **Pendientes de diseño**, abre la orden.
2. En **Diseños** elige **Propuesta** o **Diseño final** y súbelo.
3. Cuando el diseño final esté, Ventas lo autoriza. Mientras no tenga diseño final, la tarjeta dice "Sin diseño final subido".
4. Al autorizarse, la orden pasa a **Pendientes de impresión**.

> Si ves "Todavía no le toca: falta autorizar el diseño", pídele a Ventas que lo autorice.

### Cómo autorizar el diseño (Ventas, Admin fábrica)

1. Abre la orden desde el **Dashboard** y revisa el **Diseño final** en **Diseños**.
2. Dale **Diseño autorizado**. Sale **✓ Diseño autorizado** con quién y cuándo.
3. Si te equivocaste, dale **Quitar autorización** (solo mientras no se haya impreso). La orden regresa a **Pendientes de diseño**.

### Cómo imprimir un lote

1. En **Pendientes de impresión**, palomea las órdenes que vas a imprimir juntas (o **Elegir todas**). Cada tarjeta dice su tela.
2. Dale **Marcar 3 impresas** (el número cambia según cuántas elijas).
3. Captura el **Largo total del trazo (metros)** y el **Consumo de tinta del lote (mL)** de cada color: **Azul**, **Magenta**, **Amarillo** y **Negro**. **Notas (opcional)**.
4. Dale **Marcar 3 impresas**. Sale el reporte del lote.

> También puedes marcar una sola orden desde su detalle con **Impresa**, capturando su trazo y tinta.

### Cómo sublimar

1. En **Pendientes de sublimado**, abre la orden.
2. Dale **Iniciar** al empezar.
3. Al terminar, dale **Sublimada**.

### Cómo revisar o corregir un lote

1. Entra a la pestaña **Lotes**. Cada lote dice sus órdenes, la fecha y quién imprimió.
2. Dale **Imprimir reporte** para sacarlo en papel.
3. Si un número quedó mal, dale **Corregir números**, corrige y dale **Guardar corrección**.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Pendientes de diseño** | Falta el diseño final o su autorización. |
| **Pendientes de impresión** | El diseño está autorizado; falta imprimir. |
| **Pendientes de sublimado** | Ya se imprimió; falta planchar. |
| **Diseño final** (etiqueta de color) | Es el diseño que vale; **Propuesta** es solo de muestra. |
| "Sin diseño final subido" | No se puede autorizar todavía. |
| **✓** en un paso | Ese paso ya está terminado. |

## Si eres de…

- **Sublimado**: subes diseños, imprimes por lote y sublimas.
- **Ventas tienda**: revisas el diseño final con el cliente y lo autorizas.
- **Admin fábrica**: también autorizas y puedes corregir lotes.

## Problemas comunes

- **La orden no pasa a impresión** → Falta autorizar el diseño. Revisa que haya un **Diseño final** subido.
- **"Todavía no le toca: falta imprimir"** → La orden no se ha marcado impresa.
- **Capturé mal la tinta o los metros** → En **Lotes**, dale **Corregir números**.
- **No encuentro una orden** → Búscala con el buscador o en la pestaña **Todas**.

## Se conecta con

- [Órdenes de tu estación](manual:estacion): cómo trabajan las demás estaciones.
- [Seguimiento de una orden](manual:detalle-orden): el detalle completo de la orden.
$man$),
      (3, $c$inventario-tela$c$, $t$Inventario de tela y consumos por prenda$t$,
$man$## Resumen

**Inventario de tela** lleva cuánta tela hay de cada tipo, cuánta ya está **Comprometida** en órdenes abiertas y cuánta queda **Disponible**. El inventario es la suma de sus movimientos (entradas, consumos de corte y ajustes): nunca se escribe el número a mano. **Consumos por prenda** dice cuánta tela usa cada prenda; con eso se calcula lo comprometido de cada orden.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: registran entradas y ajustes, y manejan los consumos por prenda.
- **Captura de costura**: solo registra entradas de tela.

## Antes de empezar

- Que la tela esté en **Catálogos** con su unidad (metro o kilo).
- Para una entrada: cuánta tela llegó y, de preferencia, la factura del proveedor.
- Para un ajuste: el resultado del conteo físico.

## Procesos paso a paso

### Cómo registrar tela que llegó

1. En el menú, entra a **Inventario de tela**.
2. En **Entrada de tela**, elige la **Tela** y pon la **Cantidad recibida** (en su unidad: metros o kilos).
3. En **Nota (opcional)** pon de dónde viene (ej. "factura del proveedor").
4. Dale **Registrar entrada**. Sale "Entrada registrada.".

### Cómo revisar cuánta tela hay

1. Baja a **Inventario actual**.
2. Por cada tela ves la **Unidad**, el **Inventario actual**, lo **Comprometido** y lo **Disponible**.
3. Si **Disponible** sale en rojo (negativo), las órdenes abiertas necesitan más tela de la que hay: hay que comprar.

### Cómo corregir después de un conteo físico

1. En **Ajuste de inventario**, elige la **Tela**.
2. Pon la diferencia: en positivo si sobró, en negativo si faltó (ej. -3.5).
3. Escribe el **Motivo del ajuste** (ej. "conteo físico del 29/09").
4. Dale **Registrar ajuste**.

### Cómo dar de alta el consumo de una prenda

1. En el menú, entra a **Consumos por prenda** y dale **+ Nuevo consumo**.
2. Escribe la **Prenda** (ej. Playera).
3. En **Tallas** escribe las tallas separadas por coma (ej. 4, 6, 8). Si las dejas vacías, cuenta como promedio general de la prenda.
4. Pon el **Consumo** y la **Unidad** (**Metro** o **Kilo**).
5. Dale **Guardar**.
6. Para corregir o borrar, usa **Editar** o **Eliminar** en la lista.

### Cómo cargar muchos consumos con un archivo

1. En **Importar desde CSV**, sube un archivo con las columnas: prenda, tallas, consumo, unidad. La primera fila es el encabezado.
2. Si una prenda tiene varias tallas, sepáralas con " | " dentro de la columna de tallas.
3. Revisa la vista previa: cada fila dice si está bien o qué le falta.
4. Dale **Confirmar importación**. Solo se cargan las filas válidas.

### Cómo revisar si los consumos están bien

1. En **Consumos por prenda**, baja a **Precisión de consumos**.
2. Por cada prenda ves cuántos renglones se compararon y la **Diferencia promedio** entre lo estimado y lo que reportó corte.
3. Si dice "— revisar", corrige el consumo de esa prenda.

> Cuando una tela se reparte entre varias prendas de la misma orden, el real se reparte en proporción: es una aproximación.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Inventario actual** | Tela que hay en la fábrica. |
| **Comprometido** | Tela que van a necesitar las órdenes abiertas. |
| **Disponible** | Lo que queda libre: Inventario actual menos Comprometido. |
| **Disponible** en rojo | Falta tela para las órdenes abiertas. |
| **Diferencia promedio** en rojo, "— revisar" | El consumo de esa prenda está muy lejos de lo real. |

## Si eres de…

- **Admin fábrica / Administración general**: registras entradas y ajustes, y mantienes los consumos al día.
- **Captura de costura**: solo registras entradas; no ves **Ajuste de inventario**.

## Problemas comunes

- **La tela no sale en la lista** → No está en **Catálogos** o le falta la unidad. Dala de alta ahí primero.
- **Lo comprometido sale en 0** → Esa prenda no tiene consumo registrado. Dalo de alta en **Consumos por prenda**.
- **El inventario no cuadra con lo que hay** → Haz un conteo y registra la diferencia con **Ajuste de inventario**.
- **Una fila del CSV sale con error** → Revisa que tenga las 4 columnas y que la unidad sea metro o kilo.

## Se conecta con

- [Órdenes de tu estación](manual:estacion): Corte registra la tela que usó al dar **Cortado**.
- [Catálogos](manual:catalogos): donde se dan de alta las telas y su unidad.
$man$),
      (4, $c$atr$c$, $t$Inventario ATR$t$,
$man$## Resumen

**Inventario ATR** lleva las batas que se producen para ATR, por producto, talla y color. Lo que surte Terminado en las órdenes de ATR **se suma solo** al inventario; lo que se le entrega a ATR se registra como salida. Así siempre sabes cuántas batas hay listas.

## ¿Quién lo usa?

- **Terminado**, **Admin fábrica** y **Administración general**: registran entregas a ATR.
- **Admin fábrica** y **Administración general**: además hacen ajustes y la carga inicial.
- **Admin tienda** y **Consulta fábrica**: solo consultan.

## Antes de empezar

- Para una entrega: qué batas se van (producto, talla y cantidad) y, si hay, el número de remisión.
- Para un ajuste: el resultado del conteo físico.

## Procesos paso a paso

### Cómo ver cuántas batas hay

1. En el menú, entra a **Inventario ATR**.
2. Busca en **Buscar color, talla…** o filtra por producto.
3. Cada línea dice **Producto**, **Talla**, **Color** y **Existencia**. Arriba ves el total de batas.

### Cómo registrar una entrega a ATR

1. Dale **Registrar entrega a ATR**.
2. En **Agregar producto** elige una bata y escribe la cantidad por talla. Agrega todas las que se van.
3. Si quieres, pon una **Nota (opcional)** (ej. "Remisión 123, entregó Leo").
4. Dale **Registrar entrega (40)** (el número es el total).

> Si alguna talla quedaría en negativo, sale "Quedaría en negativo". Dale **Corregir** para revisar la cantidad, o **Registrar de todos modos** si de verdad se entregaron.

### Cómo ver el historial de una línea

1. Toca la línea.
2. Ves cada movimiento: **Carga inicial**, **Entrada de producción**, **Entrega a ATR**, **Ajuste** y **Reversa (se reabrió Terminado)**, con fecha, cantidad, orden, quién y nota.
3. Dale clic a la orden para abrirla.

### Cómo hacer un ajuste (administradores)

1. Dale **Ajuste** (o, desde el historial, **Hacer un ajuste de esta línea**).
2. Elige el **Producto** y la **Talla**.
3. Elige **+ Entran** o **− Salen** y escribe la cantidad. Abajo ves cuánto hay y cuánto quedaría.
4. Escribe la **Nota (obligatoria)** (ej. "Conteo físico del 20-nov").
5. Dale **Guardar ajuste**.

### Cómo hacer la carga inicial (administradores)

1. Dale **Carga inicial**.
2. Sube un archivo Excel (.xlsx) o CSV con columnas de producto, talla y cantidad (color opcional). Ej.: "Bata con bolsa · Blanca · CH · 10".
3. Elige qué columna es cada dato y la **Fecha de corte**.
4. Revisa cada renglón: en **Bata en catálogo** liga los que salen en rojo ("Sin ligar"), dales **Dar de alta** u **Omitir este renglón**.
5. Dale **Guardar carga inicial**.

> Si ya hay una carga inicial, otra carga **se suma** a la anterior. Para hacerla, marca "Sí, quiero hacer otra carga".

### Cómo se suma lo que produce Terminado

1. En una orden de ATR, Terminado cierra la orden con sus cantidades reales.
2. Al completar Terminado, lo surtido se suma solo al inventario. En la orden sale "Sumado al inventario ATR ✓".
3. Si se reabre Terminado, se resta solo (sale como **Reversa**).

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Existencia** en rojo | Hay menos de cero: se entregó más de lo registrado. Revisa con un conteo. |
| **Sumado al inventario ATR ✓** | Lo surtido de esa orden ya entró al inventario. |
| "1 prenda no viene del catálogo de ATR" | Esa prenda de la orden no se suma; hay que ligarla en el catálogo. |
| Movimiento tachado / "revertida" | Ese movimiento se deshizo. |

## Si eres de…

- **Terminado**: registras las entregas a ATR y ves lo que hay.
- **Admin fábrica / Administración general**: además haces ajustes y la carga inicial.
- **Admin tienda / Consulta fábrica**: solo consultas.

## Problemas comunes

- **"Escribe al menos una cantidad"** → Agrega una bata y su cantidad antes de registrar.
- **"Escribe por qué se hace el ajuste"** → La nota es obligatoria en los ajustes.
- **No se sumó lo de una orden** → Revisa que Terminado esté completado y que sus prendas vengan del catálogo de ATR.
- **Sale negativo** → Hubo una entrega sin la producción registrada. Haz un conteo y un ajuste.

## Se conecta con

- [Órdenes de tu estación](manual:estacion): Terminado cierra la orden con sus cantidades reales.
- [Catálogos](manual:catalogos): el catálogo de batas de ATR.
$man$),
      (5, $c$produccion-captura$c$, $t$Captura de producción$t$,
$man$## Resumen

En **Captura de producción** se registra lo que hizo cada operadora: el **folio** de la operación y las **piezas**. Con eso se calcula su valor generado y sus premios de la semana. La semana de producción va de **miércoles a martes**. Aquí también se consulta el catálogo de **Operaciones** y se imprimen las **hojas de operaciones**.

## ¿Quién lo usa?

- **Captura de costura**: captura lo de cada operadora, consulta operaciones e imprime hojas.
- **Admin fábrica** y **Administración general**: también capturan y corrigen.
- **Costura**: solo consulta las **Hojas impresas**.

## Antes de empezar

- Las hojas de trabajo de cada operadora con sus folios y piezas.
- El número o nombre de cada operadora.

## Procesos paso a paso

### Cómo capturar

1. En el menú, entra a **Producción**.
2. En **Operadora** escribe su número o nombre y presiona **Enter** para elegirla.
3. Escribe el **Folio** de la operación y presiona **Enter**. Abajo sale qué operación es; revísala.
4. Escribe las **Piezas** y presiona **Enter** para guardar. Sale "✓ Folio 123 · 20 piezas".
5. Sigue con el siguiente folio de la misma operadora.
6. Para cambiar de operadora, presiona **F2** o dale **Cambiar (F2)**.

> Si sale un aviso (⚠), por ejemplo piezas fuera de lo normal, revísalo. Presiona **Enter** otra vez para guardar de todos modos o **Esc** para corregir.

### Cómo revisar o corregir lo capturado

1. Abajo, en **Capturado esta semana**, ves los registros de la operadora con **Fecha**, **Folio**, **Operación** y **Piezas**.
2. Dale **Editar** para cambiar un registro y **Guardar**, o **Borrar** para quitarlo.

### Cómo saber a quién le falta captura

1. Dale **Ver a quién le falta** para ver las operadoras sin registros.
2. Dale **Ocultar** para cerrarlo.

### Cómo capturar en otra semana

1. Usa **← Semana anterior** y **Semana siguiente →**.
2. Para regresar, dale **Volver a la semana actual**.

> La captura de una semana abre el **jueves a la 1 pm** y se cierra el **jueves siguiente a su fin a las 11 am**. Mientras abre la nueva, sigue capturando la anterior.

### Cómo consultar las operaciones

1. En el menú, entra a **Operaciones** (los administradores las tienen en **Admin producción**).
2. Elige la **Prenda** o busca por **Folio u operación…**.
3. Por cada operación ves **Folio**, **Prenda**, **Parte**, **Operación**, **Seg.** (tiempo en segundos) y si está **Activa**.

### Cómo imprimir una hoja de operaciones

1. En **Operaciones**, marca las operaciones que lleva la hoja (pueden ser de varias prendas).
2. Dale **Imprimir operaciones**. Al ver el PDF, la hoja se guarda en **Hojas impresas**.

### Cómo volver a imprimir una hoja

1. Dale **Hojas impresas** y busca por título o prenda.
2. Ábrela para ver sus operaciones y tiempos.
3. Dale **Volver a imprimir**.
4. Si ya no sirve, dale **Quitar de la lista**.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Semana **abierta** | Se puede capturar. |
| Semana **en revisión** | Captura de costura ya no captura; los administradores revisan. |
| Semana **aprobada** | Los premios quedaron fijos; nadie la puede cambiar. |
| "Todavía no se abre la captura de esta semana" | Abre el jueves a la 1 pm; mientras, captura la anterior. |
| Operación **(inactivo)** | Ese folio ya no se usa; revisa la hoja. |
| ⚠ | Algo raro en la captura; revísalo antes de guardar. |

## Si eres de…

- **Captura de costura**: capturas, consultas operaciones e imprimes hojas. No cambias operaciones: avisa a un administrador.
- **Admin fábrica / Administración general**: además corriges semanas en revisión.
- **Costura**: consultas y vuelves a imprimir hojas.

## Problemas comunes

- **"El folio … no existe"** → Revisa el número en la hoja o búscalo en **Operaciones**.
- **"Elige primero la operadora"** → Elige la operadora antes del folio.
- **"Las piezas deben ser un número mayor a cero"** → Escribe solo números.
- **"Esta semana ya está aprobada y no se puede modificar"** → Para corregirla, Administración general la reabre en **Revisión producción**.
- **"Ya no se puede capturar en esta semana"** → Se cerró la captura. Pide a un administrador que corrija.

## Se conecta con

- [Revisión de producción](manual:produccion-revision): donde se aprueba la semana y se ven los premios.
- [Administración de producción](manual:produccion-admin): operadoras, operaciones y reglas de premios.
$man$),
      (6, $c$produccion-revision$c$, $t$Revisión y estadísticas de producción$t$,
$man$## Resumen

Cada semana (miércoles a martes) se revisa lo que produjo cada operadora y se aprueba para que sus premios queden fijos. En **Revisión producción** se aprueba la semana; en **Dashboard producción** se ve el ranking de cada operadora; y en **Estadísticas de producción** se ven las tendencias de varias semanas.

> **Valor generado** es lo que produjo cada operadora, no su sueldo. Con él se calculan los premios.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: revisan y aprueban la semana.
- **Administración general**: es el único que reabre una semana aprobada.
- **Consulta fábrica**: solo consulta.
- **Captura de costura**: solo ve el **Dashboard producción** (ranking).

## Antes de empezar

- Que la captura de la semana esté completa (en **Producción**, revisa **Ver a quién le falta**).

## Procesos paso a paso

### Cómo revisar una semana

1. En el menú, entra a **Revisión producción** y elige la **Semana**.
2. Arriba ves el **Total de premios**, las **Personas evaluadas** y el **Valor generado (total)** contra la semana anterior (▲ sube, ▼ baja).
3. En la tabla ves por operadora: **Lugar**, **Valor generado**, la base contra la que se compara (**Semana anterior** o **Base (promedio)**), **Mejora**, **Bono meta**, **Bono lugar**, **Bono mejora** y **Total**.
4. Busca a una operadora en **Buscar operador**.
5. Dale clic a una operadora para ver su detalle por folio: **Fecha**, **Folio**, **Operación**, **Piezas** y **Valor**.

### Cómo aprobar la semana

1. Cuando la semana esté **abierta**, dale **Pasar a revisión** y confirma. Con esto Captura de costura ya no puede capturar esa semana.
2. Revisa los números. Si hay errores, los administradores los corrigen en **Producción**.
3. Dale **Aprobar semana** y confirma. Los premios quedan congelados.

> Si nadie la pasa a revisión, la semana se cierra sola el jueves siguiente a su fin a las 11 am.

### Cómo reabrir una semana aprobada (Administración general)

1. Elige la semana y dale **Reabrir…**.
2. Escribe el motivo (se guarda en las notas).
3. La semana regresa a **en revisión**: corrige y vuelve a aprobarla.

### Cómo ver el ranking de operadoras

1. En el menú, entra a **Dashboard producción** y elige la **Semana**.
2. Por operadora ves **Semana actual**, **Semana anterior**, **Promedio 4 sem.**, **Cambio**, **Mejor semana**, **Sem. con datos** y **Clasificación**.
3. Dale **Imprimir ranking** para pegarlo en la fábrica, o **Imprimir hojas por operadora** para darle a cada una su hoja (también con **Hoja** en su renglón).

### Cómo ver las estadísticas de varias semanas

1. En el menú, entra a **Estadísticas de producción**.
2. Elige **Desde** y **Hasta**, o dale **Últimas 12 semanas**. Si quieres, filtra por **Operadora**.
3. Revisa los cuadros: **Valor generado total**, premios y **Premios / valor generado**.
4. Baja a las secciones: **Tendencia semanal**, **Premios como % del valor generado**, **Distribución por nivel de bono meta**, **Destacados** (Top 5 por valor y por % de mejora), **Valor generado por prenda**, **Top 10 operaciones** y **Producción por día de la semana**.
5. Al final, **Tiempos reales por etapa** muestra cuánto tardan las estaciones; puedes imprimirlo o descargarlo en CSV.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Semana **abierta** | Se sigue capturando. La revisión es solo una vista previa. |
| Semana **en revisión** | La captura está bloqueada; falta aprobar. |
| Semana **aprobada** | Premios congelados. |
| **(Excel)** / "Semana importada del Excel" | Semana vieja que se subió de Excel; no tiene detalle por operación. |
| **Arriba de su promedio** / **Abajo de su promedio** | La operadora subió o bajó más de 10% contra sus 4 semanas anteriores. |
| **En su promedio** | Cambió menos de 10%. |
| **Sin base** | No tiene semanas anteriores para comparar. |
| **(sin bonos)** | Esa operadora no participa en premios. |
| **Preliminar** | Los premios todavía no están aprobados. |

## Si eres de…

- **Admin fábrica**: pasas a revisión y apruebas.
- **Administración general**: además reabres semanas aprobadas.
- **Consulta fábrica**: ves todo, sin botones.
- **Captura de costura**: ves el ranking e imprimes el ranking; las hojas por operadora (con premios) no.

## Problemas comunes

- **No me deja aprobar** → La semana no tiene datos, o todavía no está en revisión: dale primero **Pasar a revisión**.
- **No veo Reabrir…** → Solo Administración general reabre, y no se pueden reabrir las semanas importadas del Excel.
- **Las cifras cambian** → La semana no está aprobada: son provisionales.
- **Una operadora salió sin registros** → Revisa en **Producción** si le falta captura.

## Se conecta con

- [Captura de producción](manual:produccion-captura): de donde salen los números.
- [Administración de producción](manual:produccion-admin): las reglas de cada bono.
$man$),
      (7, $c$produccion-admin$c$, $t$Administración de producción$t$,
$man$## Resumen

**Admin producción** guarda los catálogos con los que se calcula la producción de cada operadora: las **Operaciones** (folio, parte y tiempo en segundos), las **Operadoras**, las **Reglas de premios** y la **Configuración** (precio por segundo y jornada).

> Cambiar un tiempo o un precio **no modifica semanas ya capturadas**: cada registro guarda el tiempo y el precio con que se capturó.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**: cambian operaciones, operadoras, reglas y configuración.
- **Consulta fábrica**: solo consulta.

## Antes de empezar

- Para una operación nueva: la prenda, la parte, el nombre de la operación y su tiempo en segundos.
- Para una operadora nueva: su nombre y su puesto.

## Procesos paso a paso

### Cómo agregar una operación

1. En el menú, entra a **Admin producción**, pestaña **Operaciones**.
2. Dale **+ Nueva operación**.
3. Elige la **Prenda** (o escribe el **Nombre de la prenda nueva**). El folio se sugiere solo.
4. Llena **Parte**, **Operación** y el tiempo en segundos.
5. Dale **Guardar**.

> Cada prenda usa sus propias centenas de folios. Con **Folios libres por centena** ves cuántos quedan libres en cada una.

### Cómo cambiar o desactivar una operación

1. Busca la operación por **Prenda** o en **Buscar** (folio u operación).
2. Dale **Editar** para cambiar **Parte**, **Operación** o **Tiempo en segundos**, y **Guardar**.
3. Si ya no se usa, dale **Desactivar**.

> Las operaciones no se borran, se desactivan. Un folio nunca se vuelve a usar.

### Cómo imprimir una hoja de operaciones

1. Marca las operaciones que lleva la hoja (pueden ser de varias prendas).
2. Dale **Imprimir operaciones**. La hoja queda guardada en **Hojas impresas**.

### Cómo dar de alta una operadora

1. Entra a la pestaña **Operadoras** y dale **+ Nueva operadora**.
2. Escribe el **Nombre** y, si quieres, el **Puesto**.
3. Marca **Participa en bonos** si le tocan premios, y **Activa**.
4. Dale **Guardar**. El folio de empleado y el número de operadora se ponen solos (siguiente consecutivo).
5. Para corregir o dar de baja a alguien, dale **Editar** y quítale **Activa**.

### Cómo ajustar las reglas de premios

1. Entra a la pestaña **Reglas de premios**. Hay tres tablas:
   - **Bono por meta**: desde cuánto **Valor generado** se paga cada bono. Se toma la fila más alta que alcance la operadora.
   - **Bono por lugar**: cuánto se paga por lugar. El lugar 1 es el mejor; los empates comparten lugar.
   - **Bono por mejora**: desde qué **% de mejora** se paga. Va en porcentaje: 21 quiere decir 21%.
2. Cambia el **desde** o el **Bono ($)** directamente en la fila; se guarda al salir de la casilla.
3. Para una fila nueva, llena **desde** y **bono** abajo y dale **+ Agregar**.
4. Quítale **Activa** a una fila para que ya no cuente.

> Los cambios aplican a las semanas que se calculen o aprueben de ahora en adelante. Las semanas aprobadas no cambian.

### Cómo cambiar el precio por segundo o la jornada

1. Entra a la pestaña **Configuración**.
2. Cambia el **Precio por segundo ($)** o los **Segundos trabajados por jornada** (sirven para el aviso de piezas esperadas por día en la captura).
3. Dale **Guardar**.

### Cómo dejar que Captura corrija una semana ya cerrada

1. En **Configuración**, prende **Juanis puede capturar y editar en semanas cerradas**.
2. Así, en **Producción**, puede ir a semanas anteriores y agregar, editar o borrar.
3. **Apágalo cuando terminen de corregir.**

> Una semana aprobada sigue bloqueada para todos, aunque esto esté prendido.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Operación u operadora en gris | Está desactivada. |
| Centena resaltada en **Folios libres por centena** | Le quedan pocos folios libres. |
| **Participa en bonos** | Le tocan premios. Si no, sale "(sin bonos)" en el ranking. |

## Si eres de…

- **Admin fábrica / Administración general**: cambias todo.
- **Consulta fábrica**: ves todo, con las casillas bloqueadas.
- **Captura de costura**: no entra aquí; consulta las operaciones en **Operaciones**.

## Problemas comunes

- **Cambié un tiempo y no se movió la semana pasada** → Es lo normal: los registros ya capturados guardan su tiempo y precio.
- **No puedo borrar una operación** → No se borran; usa **Desactivar**.
- **Una operadora no sale en la captura** → Revisa que esté **Activa**.

## Se conecta con

- [Captura de producción](manual:produccion-captura): donde se usan los folios.
- [Revisión y estadísticas de producción](manual:produccion-revision): donde se ven los premios que salen de estas reglas.
- [Cotizador](manual:cotizador): usa los mismos tiempos y el precio por segundo.
$man$),
      (8, $c$chofer$c$, $t$Inicio del chofer$t$,
$man$## Resumen

Si eres **Chofer**, al entrar ves tu pantalla de trabajo con tres partes: **Mis tareas** (lo que te asignaron y lo que tú te anotas), **Listas para entregar** (las órdenes que ya puedes llevar) y **Pendientes tienda ↔ fábrica** (lo que va y viene entre tienda y fábrica). Tu menú tiene **Inicio**, **Tareas**, **Pendientes** y **Manuales** (y **Surtido Frisa** si tienes permiso de Frisa).

## ¿Quién lo usa?

- **Chofer**.

## Antes de empezar

- Entra con tu usuario de chofer, de preferencia desde el celular.

## Procesos paso a paso

### Cómo ver tus tareas

1. En **Mis tareas** ves lo que te toca, con su fecha ("Para el 25 nov." o "Venció el 20 nov.").
2. Las vencidas salen marcadas.
3. Para ver todas, dale **Ver todas**.

### Cómo marcar una tarea como hecha

1. Cuando la termines, dale **✓ Hecha**.

### Cómo anotarte una tarea

1. Dale **+ Agregar**.
2. Escribe la **Tarea** (ej. "Cargar gasolina"). Si quieres, agrega una **Nota (opcional)** y **Para cuándo (opcional)**.
3. Dale **Agregar**.
4. Si ya no aplica, dale **Quitar**.

> Las tareas que te anotas solo las ven tú y el administrador.

### Cómo ver qué órdenes puedes llevar

1. En **Listas para entregar** ves las órdenes terminadas, con su cliente y su fecha de entrega ("hoy", "mañana", "atrasada 2 d").
2. Toca las piezas para ver el detalle de lo que lleva.

### Cómo ver lo que va y viene entre tienda y fábrica

1. En **Pendientes tienda ↔ fábrica** ves lo que hay que llevar o traer.
2. Para ver todo, dale **Ver todos**.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| Tarjeta resaltada / **Venció el …** | La tarea ya pasó su fecha. |
| **atrasada 2 d** en una orden | Ya pasó su fecha de entrega. |
| **Anotada por ti** | Te la anotaste tú. |
| "✓ No tienes tareas pendientes." | Ya terminaste todo. |

## Si eres de…

- **Chofer**: solo ves estas tres partes. No ves precios ni pagos.
- Si tu usuario tiene permiso de Frisa, en el menú te sale **Surtido Frisa** para surtir sus órdenes. Ver el manual [Cómo surtir una orden](manual:frisa-surtido).

## Problemas comunes

- **Me equivoqué al marcar una tarea** → Entra a **Tareas** y dale **Deshacer**.
- **"Escribe la tarea"** → Falta el texto de la tarea.
- **No me sale una orden que tengo que llevar** → Todavía no está **Lista para entregar**. Pregunta en la tienda.

## Se conecta con

- [Tareas](manual:tareas).
- [Pendientes tienda ↔ fábrica](manual:pendientes).
$man$)
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar 8 filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in ('estacion', 'sublimado', 'inventario-tela', 'atr', 'produccion-captura', 'produccion-revision', 'produccion-admin', 'chofer') and eliminado_en is null order by orden;
