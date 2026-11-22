---
clave: produccion-revision
titulo: Revisión y estadísticas de producción
---
## Resumen

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
