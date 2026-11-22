---
clave: usuarios
titulo: Usuarios y permisos
---
## Resumen

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
