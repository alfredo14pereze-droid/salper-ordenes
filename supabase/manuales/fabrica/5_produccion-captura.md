---
clave: produccion-captura
titulo: Captura de producción
---
## Resumen

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
