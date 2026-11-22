---
clave: produccion-admin
titulo: Administración de producción
---
## Resumen

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
