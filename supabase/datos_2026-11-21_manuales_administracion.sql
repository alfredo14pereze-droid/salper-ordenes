-- =====================================================================
-- Datos 2026-11-21 — Manuales: sección "Administración" (4 manuales)
-- =====================================================================
-- Generado con: node scripts/manuales-sql.mjs administracion 2026-11-21
-- Fuente: supabase/manuales/administracion/*.md (no edites este archivo a mano).
-- Requiere V196 (manuales) y V214 (columna clave).
-- Solo agrega: crea la sección si no existe e inserta cada manual si su
-- clave todavía no está. No cambia ni borra ningún manual existente.
-- Se puede correr dos veces sin duplicar.
-- Manuales: usuarios, catalogos, cotizador, manuales
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
   where eliminado_en is null and lower(btrim(nombre)) = lower($s$Administración$s$);
  if v_sec is null then
    insert into public.manual_secciones (nombre, descripcion, icono, orden)
    values ($s$Administración$s$, $s$Usuarios y permisos, catálogos, cotizador de destajo y cómo usar los manuales.$s$, $s$⚙️$s$,
            coalesce((select max(orden) from public.manual_secciones where eliminado_en is null), 0) + 1)
    returning id into v_sec;
  end if;

  insert into public.manuales (seccion_id, clave, titulo, contenido, orden, actualizado_por_nombre)
  select v_sec, x.clave, x.titulo, x.contenido, x.orden, 'Carga inicial'
    from (values
      (1, $c$usuarios$c$, $t$Usuarios y permisos$t$,
$man$## Resumen

En **Usuarios** se dan de alta las cuentas de las personas que usan el sistema, se les cambia el nombre o el rol, y se suspenden o eliminan. El **rol** decide qué ve y qué puede hacer cada quien. En **Roles y permisos** se ajusta lo que puede hacer cada rol, sin pedir un cambio al sistema.

## ¿Quién lo usa?

- **Administración general**: es el único que entra a **Usuarios** y a **Roles y permisos**.

## Antes de empezar

- Para una cuenta nueva: el nombre completo de la persona, su correo y una contraseña inicial (mínimo 6 caracteres).
- Saber qué rol le toca (ej. Ventas tienda, Corte, Admin fábrica).

## Procesos paso a paso

### Cómo dar de alta a alguien

1. En el menú, entra a **Usuarios** y dale **+ Nuevo usuario**.
2. Llena **Nombre completo**, **Correo**, **Contraseña inicial** y **Confirmar contraseña**.
3. Elige el **Rol**.
4. Dale **Crear usuario**.
5. Dale a la persona su correo y su contraseña inicial.

### Cómo cambiar el nombre o el rol

1. Busca a la persona en la lista.
2. Para el nombre, dale clic al nombre, corrígelo y dale **Guardar**.
3. Para el rol, elige el nuevo en la lista de roles de su renglón. Se guarda solo.

> La persona ve el cambio la próxima vez que abra o recargue la app.

### Cómo quitarle el acceso a alguien

1. Si ya no trabaja aquí, dale **Suspender**. Ya no puede entrar y su renglón dice **Suspendido**.
2. Si regresa, dale **Reactivar**.
3. Solo si la cuenta se creó por error, dale **Eliminar** y luego **¿Seguro? Confirmar**.

> Es mejor suspender que eliminar: así se conserva quién hizo qué en el historial.

### Cómo cambiar lo que puede hacer un rol

1. En el menú, entra a **Roles y permisos**.
2. Elige el **Rol**.
3. Palomea o despalomea cada permiso. Cada uno dice si es **Puede modificar** o **Solo ver**.
4. Se guarda al instante. La persona lo ve al abrir o recargar la app.
5. Abajo, en **Últimos cambios**, ves quién permitió o quitó cada permiso.

> Por ahora aquí se controlan Inventario de tienda, Precios y facturación, Pendientes y Producción, entre otros. Los demás módulos se irán agregando.

### Cómo ver el sistema como lo ve otro rol

1. Abajo del menú, en **Ver como**, elige un rol.
2. Arriba sale "Viendo como …". Así revisas qué ve esa persona.
3. Para regresar, elige otra vez tu rol en **Ver como**.

> Solo cambia lo que ves en pantalla; el sistema sigue usando tu rol real para guardar. Admin fábrica también puede usarlo, pero solo con las estaciones de fábrica.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **Suspendido** | La cuenta no puede entrar. |
| **Puede modificar** | El permiso deja cambiar datos. |
| **Solo ver** | El permiso solo deja consultar. |
| "Viendo como …" | Estás viendo el sistema como otro rol. |

## Si eres de…

- **Administración general**: manejas todas las cuentas y permisos. Tu rol siempre tiene todo y no se puede quitar, para que nunca te quedes sin acceso.
- **Otros roles**: no ven estas pantallas. Si necesitas acceso a algo, pídeselo a Administración general.

## Problemas comunes

- **"La contraseña debe tener al menos 6 caracteres"** → Usa una más larga.
- **"Las contraseñas no coinciden"** → Escríbela igual en las dos casillas.
- **Le cambié el rol y sigue viendo lo mismo** → Que cierre y vuelva a abrir la app, o que recargue la página.
- **Alguien olvidó su contraseña** → La app no tiene un botón para restablecerla. [CONFIRMAR: cómo se restablece hoy la contraseña de un usuario (ej. desde Supabase)]

## Se conecta con

- [Catálogos](manual:catalogos): los otros datos base del sistema.
- [Manuales](manual:manuales): cada rol encuentra aquí cómo hacer su trabajo.
$man$),
      (2, $c$catalogos$c$, $t$Catálogos$t$,
$man$## Resumen

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
$man$),
      (3, $c$cotizador$c$, $t$Cotizador de destajo$t$,
$man$## Resumen

El **Cotizador** calcula cuánto cuesta el destajo de una prenda con base en sus operaciones: el costo por pieza, el costo del lote y cuántos días de producción lleva. Usa los tiempos y el precio por segundo de **Admin producción**.

> Solo es costo de destajo: **no incluye** sueldo base, indirectos ni margen.

## ¿Quién lo usa?

- **Admin fábrica** y **Administración general**.

## Antes de empezar

- Saber qué prenda es y qué operaciones lleva, o tener la hoja de operaciones impresa (foto o PDF).
- Cuántas piezas son y cuántas operadoras trabajarían.

## Procesos paso a paso

### Cómo cotizar por prenda

1. En el menú, entra a **Cotizador**, pestaña **Cotizar**, y elige **Por prenda**.
2. En **1. Prenda**, elige la prenda.
3. Marca las operaciones que lleva (o **Seleccionar todas**; **Limpiar** para quitar).
4. En **Lote** pon las **Piezas** y las **Operadoras**.
5. En **Resultado** ves **Segundos por pieza**, **Costo unitario**, **Costo total del lote**, **Minutos por pieza**, **Tiempo total (min)**, **Días de producción** y **Días (redondeado hacia arriba)**.
6. En **Guardar cotización**, ponle un **Nombre** (ej. "Playera Colegio Americano") y, si quieres, una **Nota**. Dale **Guardar cotización**.

### Cómo cotizar desde una hoja de operaciones

1. En **Cotizar**, elige **Subir hoja de operaciones**.
2. Dale **Subir hoja (foto o PDF)**. La página lee los folios y los busca en el catálogo.
3. En **Revisa las operaciones**, compara **Seg. hoja** con **Seg. catálogo**. Corrige el folio donde haga falta, **Quitar** los que sobran o agrega con **+ Agregar folio**.
4. Sigue con **Lote**, **Resultado** y **Guardar cotización** igual que por prenda.

### Cómo ver una cotización guardada

1. Entra a la pestaña **Guardadas** y busca por nombre, prenda o nota.
2. Ábrela para ver sus operaciones, tiempos y precios.
3. Dale **Imprimir hoja de operaciones**, **Volver a cotizar** (para cambiarla) o **Borrar**.

### Cómo empezar otra cotización

1. Dale **Empezar una nueva**.

## Qué significa cada estado o color

| Lo que ves | Qué quiere decir |
|---|---|
| **⚠ sin tiempo** / "tiempo 0 / sin precio" | Esa operación no tiene tiempo en el catálogo: cuenta como 0. |
| "… operaciones ya no están en el catálogo" | Al volver a cotizar, esas operaciones se desactivaron y no se cuentan. |
| Datos resaltados | **Costo total del lote** y **Días de producción**: los más importantes. |

## Si eres de…

- **Admin fábrica / Administración general**: cotizas, guardas e imprimes hojas.

## Problemas comunes

- **El costo sale más bajo de lo esperado** → Revisa si hay operaciones **⚠ sin tiempo**: ponles su tiempo en **Admin producción**.
- **La hoja no se leyó bien** → Corrige los folios a mano en la tabla o sube una foto más clara.
- **"Ponle un nombre para encontrarla después"** → Escribe el nombre antes de guardar.

## Se conecta con

- [Administración de producción](manual:produccion-admin): de ahí salen los tiempos y el precio por segundo.
- [Captura de producción](manual:produccion-captura): usa los mismos folios.
$man$),
      (4, $c$manuales$c$, $t$Cómo usar los manuales$t$,
$man$## Resumen

**Manuales** explica cómo se hace cada proceso del sistema, paso a paso. Están ordenados por sección (Órdenes, Tienda, Fábrica, Frisa, CRM, Administración…). Todos pueden leerlos; solo Administración general los escribe y los cambia.

## ¿Quién lo usa?

- **Todos**: leen los manuales.
- **Administración general**: crea, edita, ordena y elimina secciones y manuales.

## Antes de empezar

- Nada en especial.

## Procesos paso a paso

### Cómo encontrar un manual

1. En el menú, entra a **Manuales**.
2. Escribe en **Buscar en todos los manuales…** lo que quieres hacer (ej. "abono", "traspaso"). Busca en títulos y en el texto.
3. O dale clic a una sección y luego al manual.

### Cómo leer un manual

1. Cada manual empieza con un **Resumen** y quién lo usa.
2. En **Procesos paso a paso** está cada tarea con sus pasos numerados.
3. Los nombres en **negritas** son los botones y campos tal como salen en la pantalla.
4. Los enlaces de **Se conecta con** te llevan a otros manuales relacionados.

### Cómo abrir el manual desde una pantalla

1. En casi todas las pantallas, junto al título, hay un botón de ayuda **¿Cómo se usa?**.
2. Ábrelo para ver los pasos rápidos.
3. Dale **Ver manual completo →** para abrir el manual de esa pantalla.

### Cómo imprimir un manual

1. Abre el manual y dale **Imprimir**.
2. Elige tu impresora o "Guardar como PDF".

### Cómo crear una sección (Administración general)

1. En **Manuales**, dale **+ Nueva sección**.
2. Pon el **Icono** (ej. 📦), el **Nombre** y, si quieres, la **Descripción (opcional)**.
3. Dale **Guardar**.
4. Ordena las secciones con ↑ y ↓. Usa **Editar** o **Eliminar** en cada una.

### Cómo escribir o corregir un manual (Administración general)

1. Entra a la sección y dale **+ Nuevo manual**, o abre uno y dale **Editar**.
2. Escribe el **Título** y elige la **Sección**.
3. En **Escribir**, redacta el texto. Usa `##` para un título de parte, `###` para un proceso, `1.` para pasos y `**texto**` para negritas.
4. Revisa cómo queda en **Vista previa**.
5. Dale **Guardar**.
6. Para quitar un manual, ábrelo y dale **Eliminar**.

> Sigue la misma estructura de los demás manuales: Resumen, ¿Quién lo usa?, Antes de empezar, Procesos paso a paso, Qué significa cada estado o color, Si eres de…, Problemas comunes y Se conecta con.

## Qué significa cada estado o color

- **Negritas**: un botón, campo o pestaña de la pantalla.
- Recuadro con texto (nota): un aviso importante o un tip.

## Si eres de…

- **Cualquier rol**: lees todo y lo imprimes.
- **Administración general**: además escribes y corriges.

## Problemas comunes

- **"No se encontró nada"** → Prueba con otra palabra (ej. "entregar" en vez de "entrega").
- **El manual dice algo distinto a lo que veo** → Puede que cambió la pantalla. Avísale a Administración general para corregirlo.
- **No me sale + Nuevo manual** → Solo Administración general escribe manuales.

## Se conecta con

- [Usuarios y permisos](manual:usuarios): el rol decide qué pantallas ves.
$man$)
    ) as x(orden, clave, titulo, contenido)
   where not exists (select 1 from public.manuales m
                      where m.clave = x.clave and m.eliminado_en is null);
end $$;

-- Verificación: debe regresar 4 filas.
-- select clave, titulo, length(contenido) from public.manuales
--  where clave in ('usuarios', 'catalogos', 'cotizador', 'manuales') and eliminado_en is null order by orden;
