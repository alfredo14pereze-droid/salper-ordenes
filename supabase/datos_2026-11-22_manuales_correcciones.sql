-- =====================================================================
-- Datos 2026-11-22 — Manuales: correcciones de Usuarios e Inventario
-- =====================================================================
-- Fuente: supabase/manuales/administracion/1_usuarios.md y tienda/8_inventario.md.
-- Usuarios: nuevo proceso "Cómo ponerle una contraseña nueva a alguien"
--   (quita el [CONFIRMAR]). Inventario: el botón Crear traspaso ya no se
--   activa si no alcanza.
-- Solo cambia el contenido de esos 2 manuales y SOLO si nadie los editó en
-- la app después de la carga (actualizado_por_nombre = 'Carga inicial');
-- si alguien los editó, no los toca y avisa. Se puede correr dos veces.
-- =====================================================================
do $$
declare v_n int;
begin
  update public.manuales
     set contenido = $man$## Resumen

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

### Cómo ponerle una contraseña nueva a alguien (si la olvidó)

1. Busca a la persona en la lista y dale **Cambiar contraseña**.
2. Escribe la **Contraseña nueva** (mínimo 6 caracteres) y repítela en **Confirmar contraseña**.
3. Dale **Guardar contraseña**. Sale "✓ Contraseña cambiada".
4. Dásela a la persona. Con ella ya puede entrar; la anterior deja de servir.

> En la pantalla de inicio de sesión dice: "¿Olvidaste tu contraseña? Pídele al administrador que te ponga una nueva."

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
- **Alguien olvidó su contraseña** → Dale **Cambiar contraseña** en su renglón y ponle una nueva (ver arriba).

## Se conecta con

- [Catálogos](manual:catalogos): los otros datos base del sistema.
- [Manuales](manual:manuales): cada rol encuentra aquí cómo hacer su trabajo.
$man$,
         actualizado_en = now()
   where clave = 'usuarios' and eliminado_en is null
     and actualizado_por_nombre = 'Carga inicial';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'No se cambió el manual usuarios (no existe o ya lo editaron en la app).'; end if;
  update public.manuales
     set contenido = $man$## Resumen

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

> Si junto a una prenda sale **— no alcanza**, en el origen no hay tantas piezas. El botón **Crear traspaso** no se activa hasta que bajes la cantidad o quites esa prenda.

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
$man$,
         actualizado_en = now()
   where clave = 'inventario' and eliminado_en is null
     and actualizado_por_nombre = 'Carga inicial';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'No se cambió el manual inventario (no existe o ya lo editaron en la app).'; end if;
end $$;

-- Verificación: el de usuarios ya no trae [CONFIRMAR] y sí 'Cambiar contraseña'.
-- select clave, position('CONFIRMAR' in contenido) as confirmar, position('Cambiar contraseña' in contenido) > 0 as nuevo
--   from public.manuales where clave in ('usuarios','inventario') and eliminado_en is null;
