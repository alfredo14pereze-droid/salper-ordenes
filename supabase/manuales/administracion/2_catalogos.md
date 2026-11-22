---
clave: catalogos
titulo: Catálogos
---
## Resumen

**Catálogos** guarda las listas base del sistema: **Clientes** (con sus razones sociales y su catálogo de prendas), **Telas**, **Tipos de orden** (con las etapas que lleva cada uno) y los **productos de Frisa**. Si esto está al día, al crear una orden ya salen el cliente, sus prendas y las telas listos para elegir.

## ¿Quién lo usa?

- **Ventas tienda** y **Administración general**: dan de alta clientes y sus productos.
- **Ventas tienda**, **Admin fábrica** y **Administración general**: dan de alta telas.
- **Admin tienda**, **Admin fábrica** y **Administración general**: manejan los tipos de orden.
- **Ventas tienda**, **Admin tienda**, **Admin fábrica** y **Administración general**: manejan los productos de Frisa.
- **Administración general**: es el único que elimina.
- **Consulta fábrica** y **Consulta tienda**: solo consultan.

## Antes de empezar

- Para un cliente: su nombre y, si lo tienes, teléfono, correo y su categoría (tipo de orden).
- Para un producto de maquila: fotos, la tela y los bordados (dónde va y la foto del logo).

## Procesos paso a paso

### Cómo buscar en un catálogo

1. En el menú, entra a **Catálogos**.
2. Abre el catálogo que necesites (**Clientes**, **Telas**, **Tipos de orden**…).
3. Escribe en el buscador por nombre.

### Cómo dar de alta un cliente

1. En **Clientes** dale **+ Cliente nuevo**.
2. Escribe el **Nombre del cliente** y, si quieres, **Teléfono** y **Correo**.
3. Marca la **Categoría del cliente** (puede ser más de una): es el tipo de orden en el que aparecerá.
4. Dale **Guardar cliente**.
5. Para cambiar su categoría después, dale **Editar categoría**.

> En **Nueva orden**, la lista de clientes solo muestra los de la categoría del tipo de orden elegido.

### Cómo agregar las razones sociales de un cliente

1. En el cliente, dale **Razones sociales (facturación)**.
2. Agrega la razón social con su RFC, régimen, código postal y uso de CFDI.

### Cómo armar el catálogo de prendas de un cliente

1. En el cliente, dale **Ver catálogo de prendas**.
2. Dale **+ Producto nuevo**.
3. Llena sus datos, elige la **Tela** y sube **Fotos del producto** con **+ Foto o PDF**.
4. En **Bordados**, dale **+ Agregar bordado**: escribe dónde va (ej. "Pecho izquierdo"), qué es (ej. "Logo del colegio") y sube la foto del logo.
5. Si es cliente de maquila, marca los **Procesos que se le hacen**: sus órdenes nacen con esas etapas.
6. Marca **Datos validados** cuando todo esté revisado.
7. Dale **Guardar producto**.

> Un producto con **⚠️ Datos por validar** necesita revisión: dale **Completar datos**.

### Cómo dar de alta una tela

1. En **Telas** dale **+ Tela nueva**.
2. Escribe el **Nombre de la tela** y dale **Guardar tela**.
3. Dale **Editar unidad** y elige **Metro** o **Kilo**. Sin unidad, la tela no se puede usar en **Inventario de tela**.
4. Con **Ver historial** ves sus entradas, consumos y ajustes.

### Cómo manejar los tipos de orden

1. Abre **Tipos de orden**.
2. Para uno nuevo, dale **+ Agregar tipo de orden**, escribe el **Nombre del tipo**, elige sus **Etapas** y dale **Crear tipo**.
3. Para cambiar las etapas de uno que existe, dale **Editar etapas** y **Guardar etapas**.
4. Usa **Desactivar** para que ya no salga en **Nueva orden**.

> Los cambios de etapas aplican a las órdenes nuevas; las que ya existen no cambian. Un tipo sin etapas no le aparece a fábrica.

### Cómo dar de alta un producto de Frisa

1. Abre el catálogo de productos de Frisa y agrega uno.
2. Llena **Código** (ej. FR-CAM-BAS), **Nombre**, **Origen**, **Tallas**, **Color**, **Tela**, **Proveedor** y **Descripción**.
3. En **Procesos, en orden**, agrega cada proceso con **+ Agregar proceso…**, ordénalos con ↑ y ↓, y pon las **Impresiones** donde aplique.
4. Guarda.

### Cómo eliminar (Administración general)

1. Dale **Eliminar** y luego **¿Seguro? Confirmar**.

> Eliminar es definitivo. El sistema te avisa si el registro se usa en órdenes.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **⚠️ Datos por validar** | El producto se dio de alta rápido y falta revisarlo. |
| **⚠️ 3 por validar** junto al cliente | Ese cliente tiene productos sin revisar. |
| **Activo** / **Desactivado** | Si el tipo de orden sale o no en **Nueva orden**. |
| "Sin etapas — sus órdenes no le aparecerían a fábrica" | Hay que asignarle etapas al tipo. |

## Si eres de…

- **Ventas tienda**: das de alta clientes, sus productos y telas.
- **Admin fábrica**: das de alta telas y manejas tipos de orden y productos de Frisa.
- **Administración general**: todo, y eres el único que elimina.
- **Consulta**: solo ves.

## Problemas comunes

- **El cliente no sale en Nueva orden** → Revisa su **Categoría del cliente**: tiene que coincidir con el tipo de orden.
- **La tela no sale en Inventario de tela** → Le falta la unidad: dale **Editar unidad**.
- **"Elige al menos una etapa para el tipo de orden"** → Todo tipo necesita etapas.
- **Cambié las etapas y una orden vieja no cambió** → Es lo normal: solo aplica a órdenes nuevas.

## Se conecta con

- [Crear una orden](manual:nueva-orden): usa clientes, productos y tipos de orden.
- [Inventario de tela y consumos por prenda](manual:inventario-tela).
- [Usuarios y permisos](manual:usuarios).
