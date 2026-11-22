---
clave: talleros
titulo: Talleros
---
## Resumen

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
