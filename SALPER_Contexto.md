# SALPER — Contexto del proyecto

Sistema de gestión de órdenes de producción para SALPER, S.A. DE C.V.
(uniformes / sublimación / industrial, Torreón, Coahuila).

## Stack

- **Frontend:** React 18 + Vite, `HashRouter` (react-router-dom) — a propósito,
  para que las rutas funcionen igual en Vercel sin config extra de rewrites.
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime). **Una sola
  base de datos**, sin entornos separados de staging/producción — cualquier
  migración de SQL que se aplique afecta directo a lo que usan los usuarios
  reales. Las ramas de git separan el *código*, no los datos.
- **Chat interno:** `api/chat.js` (función serverless de Vercel) + Claude
  (Anthropic) con tool use contra Supabase — módulo aparte en `api/_chat/`,
  no toca la lógica de órdenes.
- **Deploy:** Vercel, auto-deploy en push a `main` (producción). Cualquier otra
  rama genera su propio preview deployment sin tocar producción.
- **PDF:** `@react-pdf/renderer` para el PDF de confirmación de orden
  (`src/components/pdf/OrderConfirmationPdf.jsx`), con variante interna y
  variante para cliente.

## Estructura de módulos

- `src/pages/` — una página por ruta (Dashboard, NuevaOrden, DetalleOrden,
  Calendario, Resumen, Anuncios, Pendientes, Usuarios, Login).
- `src/components/<feature>/` — componentes agrupados por dominio (`orders/`,
  `announcements/`, `pending/`, `chat/`, `pdf/`, `layout/`, `common/`).
- `src/services/` — una capa fina por tabla/RPC (`ordersService.js`,
  `photosService.js`, etc.) — todas asumen que `supabase` puede ser `null` si
  faltan env vars.
- `src/hooks/` — estado + suscripción realtime por recurso.
- `src/contexts/AuthContext.jsx` — sesión + perfil + rol, expuesto vía
  `useAuth()`.
- `src/utils/permissions.js` — **única fuente de verdad** de "quién puede qué"
  del lado del cliente (solo para mostrar/ocultar UI — el servidor valida todo
  de nuevo, ver abajo).
- `supabase/schema*.sql` — migraciones numeradas en orden (`schema.sql`,
  `schema_v2.sql`, ... `schema_v10_guest_read.sql`, ...). Se aplican pegando
  el archivo completo en el SQL Editor de Supabase. **Nunca se edita una
  migración vieja** — los cambios siempre van en un archivo nuevo.

## Roles y permisos

Desde **V21** (Fase 2, Parte 1) el modelo plano de 3 roles se reemplazó por
**10 roles granulares** sobre la misma tabla `profiles` (vinculada a
`auth.users`, columna `role text` con un `CHECK` — no un ENUM nativo de
Postgres, siguiendo la convención que ya traía este proyecto). No se creó una
tabla `usuarios` nueva: `profiles` ya cumplía ese papel y se migró en su
lugar (aditivo — mismo id, mismas columnas, solo cambia el rango de valores
válidos de `role`).

**Tienda:**
- `ventas` (antes `tienda`) — crea/edita pedidos mientras siguen
  `en_confirmacion`; ve todas las órdenes, facturas y órdenes de compra; NO
  sube/edita documentos.
- `contabilidad` — sube/edita documentos de la orden (cotización, orden de
  compra, factura) y gestiona Pedidos a Proveedor; ve todas las órdenes; NO
  crea/edita pedidos de cliente.
- `admin_tienda` — acceso total al dominio tienda (todo lo de `ventas` +
  `contabilidad` sin las restricciones de estado, más cancelar/reactivar
  órdenes y borrar anticipos); ve todo el sistema.

**Fábrica:** `corte`, `bordado`, `sublimado`, `produccion`, `terminado` —
avanzan el estado de la orden y capturan el tiempo estimado (solo mientras
`en_confirmacion`); nunca tocan datos generales (cliente, fechas, tipo,
prendas, documentos). Desde **V22**, estos 5 roles también tienen la
navegación restringida en el frontend a solo Dashboard y Resumen
(`hasRestrictedNav` en `src/utils/permissions.js`) — Calendario, Pendientes,
Anuncios, Órdenes pasadas y Pedidos a Proveedor quedan ocultos para ellos
(capa de UX, no de seguridad — el acceso real ya estaba cerrado por rol en
cada RPC). `admin_fabrica` — acceso total al dominio fábrica; ve todo el
sistema, **sin** esta restricción de navegación.

**General:** `admin_general` — acceso total a los dos dominios + gestión de
usuarios (`admin_update_user_role`, Edge Function `admin-create-user`). No
estaba en el pedido original de roles (que solo describía `admin_tienda` y
`admin_fabrica`); se agregó para que el `admin` original de V1 no perdiera
acceso a la mitad del sistema al migrar — es la única capacidad que **no**
se dividió entre dominios.

Sin registro público: solo `admin_general` da de alta usuarios.

**Migración de los 3 usuarios reales al momento de aplicar V21** (confirmada
con el usuario antes de correr la migración):
`admin`→`admin_general`, `tienda`→`ventas`, `fabrica`→`admin_fabrica` (no uno
de los 5 roles de etapa individuales, porque el `fabrica` de hoy podía tocar
TODAS las etapas — bajarlo a una sola le habría quitado acceso que ya tenía;
el admin reasigna a cada quien su etapa específica después, desde Usuarios).

**Decisiones de dominio no explícitas en el pedido original** (juicio del
autor de la migración, documentado en el header de
`supabase/schema_v21_roles.sql`): Pedidos a Proveedor se asignó a
`contabilidad`, no a `ventas`. `create_anticipo` quedó abierto a `ventas` y
`contabilidad` (cualquiera puede recibir un anticipo); borrar un anticipo y
cancelar/reactivar una orden quedaron restringidos a
`admin_tienda`/`admin_general`.

**Documentos de la orden** (cotización, orden de compra, factura —
`set_order_document`): desde **V22**, `ventas` puede subir/reemplazar
cotización y orden de compra (mientras la orden siga `en_confirmacion`,
mismo tope que ya tenía `contabilidad` para esos dos); la **factura** se
queda exclusiva de `contabilidad`/`admin_tienda`/`admin_general` — `ventas`
nunca puede tocarla. (V21 había dejado los tres tipos de documento cerrados
solo a `contabilidad`; se corrigió tras confirmar con el usuario que ventas
sí necesita subir cotización/orden de compra.)

**LÍMITE ESTRUCTURAL, documentado a propósito:** la regla "cada rol de
fábrica solo modifica el estado de SU etapa" **no se puede aplicar de verdad
todavía** — el estado de una orden vive en una sola columna
(`orders.status`, 11 valores lineales), no hay una fila por etapa. Los 5
roles de etapa + `admin_fabrica` comparten el mismo permiso de escritura
sobre `update_order_status`/`set_estimated_production_days` por ahora (igual
que compartía el `fabrica` de antes). La granularidad por etapa individual
llega en la **Parte 2** (tabla `orden_etapas`). Lo que **sí** se aplica desde
V21: ningún rol de fábrica puede tocar datos generales de la orden (cliente,
fechas, tipo, prendas, documentos) — eso sigue siendo exclusivo de tienda.

**Enforcement:** este proyecto nunca usó políticas RLS de
INSERT/UPDATE/DELETE del lado del cliente — toda escritura ya pasaba por RPC
`SECURITY DEFINER` (ver "Patrón de escritura" abajo), que es funcionalmente
equivalente a RLS por fila para estos fines: el chequeo de rol vive en el
único punto de entrada de cada escritura, no se puede saltar desde el
cliente. La lectura (SELECT) no cambió — sigue siendo pública para todas las
órdenes, cumpliendo "todos los roles pueden VER todo". El frontend
(`src/utils/permissions.js` y los componentes que lo usan) es una capa
adicional de UX (ocultar/deshabilitar botones), no la línea de defensa real.

Desde `main`/V10, la app también tiene **modo invitado**: cualquiera con el
link ve todo en modo lectura (Dashboard, calendario, detalle de orden,
anuncios, pendientes) **sin iniciar sesión**. Ningún botón de
crear/editar/cambiar aparece para invitados, y el servidor lo exige de todos
modos — ver la sección de seguridad abajo.

## Modelo de etapas paralelas (V23)

Desde **V23** (Fase 2, Parte 2) el flujo de producción dejó de ser "una orden
solo puede estar en un estado a la vez". Cada orden tiene una fila por etapa
en la tabla **`orden_etapas`** (`order_id`, `etapa`, `estado`, `responsable_id`,
`iniciado_en`, `completado_en`, `orden_secuencia`) — `estado` es
`pendiente`/`en_proceso`/`completado`, y al ser filas independientes, **dos o
más etapas pueden estar `en_proceso` al mismo tiempo** en la misma orden
(ej. producción y terminado corriendo juntos — confirmado con el usuario:
"muchas veces van a estar activas en producción y en terminado a la vez desde
que empieza a salir la producción hasta la última parte").

**Etapas posibles:** `corte`, `sublimado`, `produccion`, `bordado`,
`terminado`. El nombre de cada etapa coincide 1:1 con el rol de fábrica dueño
(rol `corte` → etapa `corte`, etc.), así que el permiso es una comparación
directa — ver `update_orden_etapa`. `admin_fabrica`/`admin_general` pueden
tocar cualquier etapa.

**Plantillas por tipo de orden** (tabla `plantillas_etapas`, confirmadas con
el usuario — solo 3 tipos llevan flujo de producción propio, `basquetbol`
comparte el de escolar/industrial por inferencia, ajustable después con un
simple INSERT/DELETE en esa tabla):
- `sublimacion`: sublimado → corte → producción → terminado (única con
  etapa de sublimado, y va **antes** de corte).
- `escolar` / `industrial` / `basquetbol`: corte → producción → bordado →
  terminado (sin sublimado). `bordado` es válido en el enum pero para
  `sublimacion` **no se genera** — llega opcional por orden individual en la
  Parte 3 (toggle "¿Incluye bordado?").

Al crear una orden (`create_order`), se auto-generan sus filas de
`orden_etapas` según la plantilla de su tipo, todas en `pendiente`.

**`orders.status` no desapareció** — el Dashboard, calendario, tarjetas y PDF
lo siguen usando sin cambios. Ahora es un **resumen calculado**
(`recompute_order_status`, llamado automáticamente por `update_orden_etapa`):
toma la etapa de mayor `orden_secuencia` que ya esté `en_proceso` o
`completado` y la traduce al vocabulario de siempre (`en_corte`/`cortado`,
etc.) — incluye 2 valores nuevos, `en_produccion`/`produccion`, agregados al
`CHECK` de `orders.status` porque "producción" no tenía pareja propia en el
flujo lineal viejo. Cuando dos etapas están activas a la vez, `orders.status`
solo puede mostrar una (gana la de secuencia más alta) — es un resumen de un
vistazo, no la verdad completa; la verdad completa vive en `orden_etapas` y
se muestra en el detalle de la orden (`OrderEtapasCard`). `recompute_order_status`
nunca toca órdenes canceladas, en `en_confirmacion`, ni ya `completado` —
esos 3 siguen siendo decisiones de todo el pedido, no derivadas de las
etapas.

**`update_order_status` se angostó a los dos "bookends"** de todo el
pedido — esto es lo que **resuelve** el límite estructural documentado en
V21/Parte 1:
- Confirmar (`en_confirmacion` → `confirmado`): igual que antes, cualquiera
  de los 5 roles de etapa + `admin_fabrica`/`admin_general`.
- Completar (→ `completado`): ahora **exclusivo** de
  `admin_fabrica`/`admin_general` (antes cualquier rol de etapa podía —
  cerrar una orden es una decisión de todo el pedido, no de una sola etapa).
- Cualquier otro valor (los estados por-etapa, para corrección manual) solo
  `admin_fabrica`/`admin_general` — el avance normal por etapa individual ya
  vive en `update_orden_etapa`, no aquí.

**Migración de las órdenes existentes** (11 al momento de aplicar V23): cada
una recibió sus filas de `orden_etapas` infiriendo el estado de cada etapa
desde la **posición** de su `status` actual dentro de la secuencia lineal
vieja de 11 valores — nunca se tocó `orders.status` de ninguna orden
existente, solo se generaron las filas nuevas. Verificado con una consulta
cruzando `orders.status` contra las `orden_etapas` resultantes para varios
casos (`en_confirmacion`, `cortado`, `en_terminado`) — la inferencia fue
correcta en los 3.

**Plan de rollback** (mostrado al usuario antes de aplicar, por ser la parte
de mayor riesgo — toca el core del modelo de órdenes): `drop table`
`orden_etapas`/`plantillas_etapas`; `drop function`
`update_orden_etapa`/`recompute_order_status`; revertir `create_order` y
`update_order_status` a la versión de V22 (archivos
`schema_v22_fixes_roles.sql`/`schema_v21_roles.sql` ya tienen esas
versiones completas); revertir el `CHECK` de `orders.status` a los 11
valores de antes — solo seguro si ninguna orden quedó con status
`en_produccion`/`produccion` entre que se aplica y se revierte. Nada de esto
toca `profiles`, anticipos, ni Pedidos a Proveedor — el radio es `orders` +
las 2 tablas nuevas. Texto completo del plan en el header de
`supabase/schema_v23_etapas_paralelas.sql`.

**Verificado en vivo** (simulación directa vía SQL, ya que este entorno no
tiene sesión autenticada para probar login real por rol): se puso una orden
de prueba con `corte`, `producción` y `terminado` los 3 `en_proceso` al
mismo tiempo — sin conflicto (el `UNIQUE (order_id, etapa)` no lo impide, son
filas distintas) — y `orders.status` se recalculó a `en_terminado` (la etapa
de mayor secuencia activa), confirmando exactamente el caso que pidió el
usuario. La orden de prueba se revirtió a su estado original después.

**Frontend:** `OrderEtapasCard.jsx` (nuevo) — lista cada etapa de la orden
con su estado y un botón "Iniciar"/"Marcar completado" si el rol coincide
(`canChangeEtapa`); `StatusChanger.jsx` se angostó a los dos bookends
(confirmar/completar) + un selector de corrección manual solo para
`admin_fabrica`/`admin_general`. `STATUSES`/`STATUS_GROUPS` en
`lib/constants.js` ganaron `en_produccion`/`produccion` (familia ámbar, sin
usar antes) — `StatusStepper`/`StatusBadge`/filtros del Dashboard lo
heredan automáticamente por ser aditivo.

## Patrón de escritura: todo vía RPC, nunca INSERT/UPDATE directo

Ninguna tabla tiene policies de INSERT/UPDATE/DELETE para el cliente. **Toda
escritura pasa por una función de Postgres `SECURITY DEFINER`** (ej.
`create_order`, `update_order_status`, `cancel_order`) que:
1. Revisa `current_user_role()` (helper `SECURITY DEFINER STABLE` que lee
   `profiles.role` para `auth.uid()`) contra las reglas de negocio.
2. Hace el `insert`/`update`.
3. Regresa la fila actualizada.

Razón: así la regla de negocio vive en un solo lugar (no duplicada en cada
policy de RLS), y es más fácil de razonar/depurar.

**Gotchas recurrentes de este patrón (ya mordidos varias veces, documentados
para no repetirlos):**

- **Cambiar la firma de un RPC (agregar/quitar parámetros) crea un
  OVERLOAD nuevo, no reemplaza el viejo.** `CREATE OR REPLACE FUNCTION` solo
  reemplaza in-place si la LISTA DE TIPOS de los parámetros es idéntica a la
  que ya existía. Si cambia, hay que `DROP FUNCTION IF EXISTS
  nombre(firma_vieja);` primero — si no, quedan dos versiones coexistiendo y
  Postgres puede resolver una llamada contra la que no esperas. Pasó DOS
  veces en este proyecto: "column order_sheet of relation orders does not
  exist" (quedó viva una función vieja de 7 parámetros), y de nuevo en
  Fase 2 al agregarle `p_client_id` a `create_order` (quedaron la de 6 y la
  de 7 parámetros coexistiendo hasta que se corrigió a mano). **Distinción
  importante:** cambiar solo el DEFAULT de un parámetro que ya existía sí lo
  resuelve `CREATE OR REPLACE` solo (no cambia la lista de tipos) — pero
  agregar un parámetro NUEVO al final, aunque tenga `default`, SÍ cambia la
  lista de tipos y por lo tanto SÍ necesita el `DROP FUNCTION` antes. Regla
  práctica: si el `create or replace function` de una función existente
  tiene un parámetro de más (o de menos) que la última versión aplicada,
  hay que agregar el `drop function if exists` de la firma vieja arriba,
  sin excepción — y verificarlo después con
  `select pg_get_function_identity_arguments(oid) from pg_proc where
  proname = 'nombre'` (debe dar una sola fila).
- **`GRANT`/`REVOKE` a un rol específico (`anon`, `authenticated`) NO quita lo
  que ya viene de `PUBLIC`.** Postgres otorga `EXECUTE` a `PUBLIC`
  automáticamente en cada `CREATE FUNCTION` — esto es estándar de Postgres,
  no algo de Supabase. Un `revoke execute ... from anon` deja intacto el
  acceso heredado de `PUBLIC` si nunca se hizo `revoke ... from public`. Este
  hueco fue real y grave: cualquiera con la anon key pública podía mutar
  cualquier cosa (hasta cambiar el rol de cualquier usuario a admin) porque
  nunca se había revocado de `PUBLIC`. Fix + checklist completo en
  `schema_v9_security_fix.sql` — **toda función de escritura nueva debe
  llevar `revoke execute ... from public; grant execute ... to
  authenticated;` explícitos**, y conviene verificar con
  `has_function_privilege('anon', 'public.nombre(firma)', 'EXECUTE')` que dé
  `false` antes de darla por buena.
- **Un `IF condicion THEN raise exception` con `condicion = NULL` en
  PL/pgSQL se trata como `FALSE`** (no lanza la excepción). Esto importa
  mucho en checks de rol tipo `if v_role not in ('tienda','admin') then
  raise exception ...` — si `v_role` es `NULL` (nadie ha iniciado sesión, o
  no hay perfil), la condición da `NULL` y el check se salta de largo. Por
  eso todo chequeo de rol en este proyecto envuelve la variable con
  `coalesce(v_role, '')` antes de comparar.
- **Tablas/funciones creadas desde el SQL Editor no traen los `GRANT`
  automáticos que sí trae crear algo desde el Table Editor de Supabase** —
  hay que dar `grant select/execute` explícito a los roles que correspondan
  (`anon`, `authenticated`, y a veces `service_role` para Edge Functions).
- **Migrar datos existentes a un valor nuevo de un CHECK constraint: el
  `DROP CONSTRAINT` va ANTES del `UPDATE`, no después.** Si el `UPDATE` se
  intenta con el constraint viejo todavía puesto (porque el nuevo valor
  aún no está permitido), truena — aunque el `ADD CONSTRAINT` con la lista
  ampliada venga más abajo en el mismo script. Pasó en
  `schema_v13_estados_produccion.sql` al migrar órdenes de "en_produccion"
  a "en_terminado". Orden correcto: `drop constraint` → `update` (con la
  columna ya sin restricción) → `add constraint` (con la lista final,
  ahora que todas las filas ya tienen valores válidos).

## Identidad visual

Regla de color, textual y verbatim (viene del usuario, no negociable sin que
lo pida explícitamente):

> blanco = fondo dominante, negro = texto/botones, amarillo = dentro de
> botones negros y solo algunos acentos puntuales, naranja = pocos detalles.
> Rojo y verde quedan reservados EXCLUSIVAMENTE como indicadores de estado
> (atrasado/completado) — nunca decorativos.

En la práctica: `--color-black`/`--color-amber`/`--color-orange*` para
chrome y acentos; `--color-danger`/`--color-good` (rojo/verde) **solo** para
"esto necesita atención" / "esto salió bien" (urgencia de fecha de entrega,
orden completada, orden cancelada) — nunca como color decorativo de una
categoría o tipo. La progresión ámbar→naranja de `STATUSES[].color` en
`src/lib/constants.js` (una por etapa de producción) es la paleta "neutral"
aprobada para diferenciar categorías/etapas sin invadir el significado de
rojo/verde.

Tipografía: `'Barlow Semi Condensed'` para títulos/labels/badges. Logo real
de SALPER (`src/assets/salper-logo.png`, negro sobre transparente) montado
directo sobre el nav blanco — no hay insignia ni fondo detrás.

## Estado actual (V1, producción, rama `main`)

- CRUD de órdenes con folio automático por tipo (`SUB-001`, `ESC-001`...) vía
  secuencias de Postgres + trigger `BEFORE INSERT`.
- Prendas/tallas/colores por orden (JSONB `orders.items`, sin schema fijo).
- Fotos de referencia (Storage público `order-photos`).
- Plantillas de orden reutilizables (`order_templates`).
- Anuncios internos y pendientes (fuera del flujo de órdenes).
- PDF de confirmación (interno y para cliente) con descarga automática al
  crear la orden + botón para volver a bajarlo.
- Auth con roles + modo invitado de solo lectura (ver arriba).
- Chat interno con Claude (tool use de solo lectura contra Supabase).

## Historial de decisiones / notas

*(Esta sección se va actualizando al final de cada sesión de trabajo, con lo
implementado y las decisiones tomadas — no se borra lo anterior, se agrega.)*

### Fase 2, Parte 1 — Roles y permisos (V21)

Reemplazado el modelo de 3 roles (admin/tienda/fabrica) por 10 roles
granulares — ver la sección "Roles y permisos" arriba para el detalle
completo (enum, migración de usuarios existentes, decisiones de dominio no
explícitas en el pedido original, y el límite estructural documentado sobre
`update_order_status` compartido por los 5 roles de etapa hasta que llegue
`orden_etapas` en la Parte 2). El rol antes llamado `tienda` en este código
pasó a `ventas` (el pedido decía "personal de tienda" → "ventas"; el nombre
real previo en la base era `tienda`, no literalmente "personal de tienda" —
mismo cambio, terminología distinta).

**Archivos tocados:**
- `supabase/schema_v21_roles.sql` (nuevo) — migración aplicada a la base de
  producción compartida: `profiles.role` (drop constraint → UPDATE con CASE
  admin/tienda/fabrica→admin_general/ventas/admin_fabrica → add constraint
  con los 10 valores → default `'ventas'`), `handle_new_user()`, y 13 RPC
  más reescritos con los nuevos chequeos de rol (sin cambiar ninguna firma,
  así que no hizo falta `DROP FUNCTION`).
- `src/utils/permissions.js` — los 9 helpers + `ROLE_LABELS` reescritos para
  los 10 roles.
- `src/pages/UsersPage.jsx` — array `ROLES` (10 valores) y el rol por
  defecto del formulario de alta (`'ventas'`).
- `src/components/orders/OrderPaymentsCard.jsx` — `canRegister`/`canDelete`.
- `src/components/orders/StatusChanger.jsx` — el override de orden cancelada
  ahora exige `admin_general` (antes `admin`).
- `supabase/functions/admin-create-user/index.ts` — lista de roles válidos y
  el gate de quién puede llamar la función (`admin_general`); redesplegada
  vía el Dashboard.

**Verificado desde SQL** (no hay sesión autenticada disponible en este
entorno para probar login real por rol): el `CHECK` de `profiles_role_check`
quedó con los 10 valores nuevos; los 3 usuarios existentes migraron a
`admin_general`/`ventas`/`admin_fabrica`; las 15 funciones reescritas
conservan `anon_exec = false` / `auth_exec = true`; el código fuente
(`prosrc`) de cada función confirma que `create_order`/
`update_order_details`/`set_order_items` mencionan `'ventas'` pero no
`'sublimado'`, y que `update_order_status`/`set_estimated_production_days`
mencionan `'sublimado'` pero no `'ventas'` — es decir, un rol de fábrica
(p. ej. `sublimado`) no puede llamar ninguna función del dominio
ventas/contabilidad (crear/editar pedidos, documentos, proveedores), que es
lo que sí se puede garantizar hoy dado el límite estructural ya documentado
sobre el estado compartido.

**Falta probar manualmente** (requiere login real, no disponible desde
aquí): crear/editar un usuario de cada uno de los 10 roles y confirmar en la
UI que los botones esperados aparecen/desaparecen; iniciar sesión como
`ventas` y confirmar que no ve botón de cambiar estado ni subir documentos;
iniciar sesión como `sublimado` y confirmar que sí ve el cambio de estado
pero no puede editar cliente/fechas/tipo/prendas ni subir documentos;
iniciar sesión como `contabilidad` y confirmar que puede subir factura fuera
de `en_confirmacion` pero no crear pedidos nuevos; confirmar que solo
`admin_general` ve la página de Usuarios y puede dar de alta cuentas
(Edge Function redesplegada).

### Fase 2, Parte 1 — ajustes V22 (después de revisar en producción)

Tras revisar V21 en vivo, el usuario reportó dos cosas y pidió un tercer
cambio; los tres ya están aplicados:

- **Bug**: `admin_general` no podía ver la lista completa en Usuarios —
  causa: la policy RLS `Admin ve todos los perfiles` sobre `profiles` seguía
  comparando contra el rol viejo `'admin'` (se me pasó en V21 porque solo
  revisé cuerpos de funciones RPC, no policies de tabla). Corregido:
  `supabase/schema_v22_fixes_roles.sql`, sección 1.
- **Permiso ampliado**: `ventas` ahora puede subir/reemplazar cotización y
  orden de compra (antes solo `contabilidad`); factura se queda exclusiva de
  `contabilidad`/`admin_tienda`/`admin_general`. `set_order_document`
  reescrito (`schema_v22_fixes_roles.sql`, sección 2) + espejo en
  `src/utils/permissions.js` (`canEditOrderDocument`).
- **Navegación restringida**: los 5 roles de etapa de fábrica ahora solo ven
  Dashboard y Resumen en el nav (`hasRestrictedNav` en `permissions.js`,
  aplicado en `src/components/layout/AppLayout.jsx`). `admin_fabrica` sigue
  viendo todo.

Verificado desde SQL: la policy quedó con `admin_general`; `set_order_document`
conserva `anon_exec=false`/`auth_exec=true` y su `prosrc` menciona `'ventas'`.

**Gestión completa de usuarios para `admin_general`** (pedido explícito del
usuario — nota: el pedido original de Fase 2 nombra este rol `super_admin`;
se mantuvo `admin_general`, ya usado en 15 funciones y en producción, en vez
de renombrar — son el mismo concepto, sin distinción funcional):
`admin_general` ahora puede, desde `/usuarios`, editar el nombre de
cualquier usuario, **suspenderlo** (bloquea su login en Supabase Auth vía
`ban_duration`, sin borrar nada — columna espejo `profiles.suspended_at`
para mostrar "Suspendido" en la UI) o **eliminarlo** por completo
(`auth.admin.deleteUser`; `profiles.id` tiene `ON DELETE CASCADE` hacia
`auth.users(id)`, así que el perfil se borra solo). Nadie puede
suspenderse/eliminarse a sí mismo (resguardo en el backend). La Edge
Function `admin-create-user` pasó de soportar solo "crear" a un campo
`action` (`create`/`update`/`suspend`/`unsuspend`/`delete`), todas
verificando `admin_general` del lado del servidor. `profiles` no tiene
columna de correo (vive solo en `auth.users`), así que la UI no muestra ni
edita el correo actual — el backend sí lo soporta (`action: 'update'` con
`email`) por si se necesita exponerlo más adelante.

El rol `produccion` no tenía una pareja de estados propia en el flujo lineal
(`en_corte`/`cortado`, `en_sublimado`/`sublimado`, etc. sí la tienen). El
usuario aclaró que necesita `en_produccion`/`termino_produccion`, y que
producción y terminado van a estar **activos al mismo tiempo** en una misma
orden (piezas saliendo de producción mientras terminado ya trabaja las
primeras) — algo que la columna única `orders.status` no puede representar.
Se acordó con el usuario adelantar la arquitectura de etapas paralelas de la
**Parte 2** en vez de parchar el modelo lineal — ver la sección "Modelo de
etapas paralelas (V23)" arriba para el detalle completo.

### Fase 2, Parte 2 — etapas paralelas (V23)

Aplicado a la base de producción compartida — ver "Modelo de etapas
paralelas (V23)" arriba para el diseño, la migración de datos, el plan de
rollback y la verificación completa. Resumen de archivos tocados:

- `supabase/schema_v23_etapas_paralelas.sql` (nuevo) — tablas
  `plantillas_etapas`/`orden_etapas`, funciones `recompute_order_status`/
  `update_orden_etapa`, reescritura de `create_order` (auto-genera etapas) y
  `update_order_status` (angostado a confirmar/completar), migración de las
  11 órdenes existentes.
- `src/lib/constants.js` — `en_produccion`/`produccion` en `STATUSES` y
  `STATUS_GROUPS`; nuevos `ETAPA_LABELS`/`ETAPA_ESTADO_LABELS`/
  `ETAPA_ESTADO_COLORS`.
- `src/utils/permissions.js` — `canConfirmOrder`/`canCompleteOrder`
  (reemplazan la lógica interna de `canChangeStatus`) + `canChangeEtapa`
  nueva.
- `src/services/ordersService.js` — `fetchOrdenEtapas`/`updateOrdenEtapa` +
  `orden_etapas` agregada a la suscripción realtime.
- `src/components/orders/OrderEtapasCard.jsx` (nuevo) — lista las etapas de
  la orden con botón de avance por etapa, gated por `canChangeEtapa`.
- `src/components/orders/StatusChanger.jsx` — angostado a "Confirmar
  pedido"/"Marcar como completada" + selector de corrección manual (solo
  `admin_fabrica`/`admin_general`).
- `src/pages/OrderDetailPage.jsx` — monta `OrderEtapasCard`.

**Falta probar manualmente** (requiere login real, no disponible desde
aquí): iniciar sesión como `corte`, `sublimado`, `produccion`, `bordado` o
`terminado` y confirmar que en el detalle de una orden real solo puede
avanzar SU etapa (el botón no aparece para las demás); confirmar que
`admin_fabrica`/`admin_general` sí pueden avanzar cualquier etapa y también
"Marcar como completada"; confirmar que un rol de etapa YA NO puede marcar
una orden como completada (antes sí podía); revisar visualmente el Dashboard
con una orden en `en_produccion`/`produccion` para confirmar que el color
ámbar nuevo se ve bien.

### Fase 2, Parte 1 extendida — soft-delete, hard-delete de catálogos, folios, Control rápido (V24)

Después de la Parte 2, el usuario volvió a pegar el pedido original de
"Roles y permisos" con tareas nuevas que no estaban en la primera versión
que se implementó (V21/V22). Todo lo nuevo quedó en
`supabase/schema_v24_soft_delete.sql` + los archivos de frontend listados
abajo.

**Folios (tarea 10/11 del pedido) — investigado antes de tocar nada,
sin necesidad de cambiar el mecanismo**: desde V5
(`schema_v5_folios.sql`), cada tipo de orden tiene su propia secuencia
nativa de Postgres (`folio_seq_<key>`, `CREATE SEQUENCE ... START 1`) y un
trigger `BEFORE INSERT` (`assign_order_folio`) que llama `nextval()` y arma
`<PREFIJO>-<3 dígitos>`. Una secuencia de Postgres nunca reutiliza un
número así se borre la fila (soft o hard delete) — ya cumplía exactamente
lo pedido, cero cambios de código. Para resetear a 1 antes de cargar
órdenes reales (después de limpiar las de prueba): `ALTER SEQUENCE
public.folio_seq_<key> RESTART WITH 1;` por tipo — acción operativa, no
una migración.

**Soft-delete de órdenes**: `orders.eliminada_en` (timestamptz nullable).
`get_order_delete_impact(p_order_id)` cuenta anticipos/historial/etapas y
si hay documentos subidos, para que el frontend avise antes de confirmar
(`CancelOrderCard.jsx`, botón "Eliminar orden" → impact-check →
confirmación con las cifras → `soft_delete_order`). Una orden eliminada:
desaparece de Dashboard/Resumen/Calendario/Órdenes pasadas
(`fetchOrders()` ahora filtra `eliminada_en is null`); sigue visible en
Control rápido con estado "Eliminada"; y **ningún rol, incluido
admin_general**, puede volver a editarla — se agregó el guard
correspondiente a las 10 funciones que mutan una orden existente
(`update_order_status`, `update_orden_etapa`, `update_order_details`,
`set_order_items`, `set_order_document`, `set_estimated_production_days`,
`create_anticipo`, `delete_anticipo`, `cancel_order`, `uncancel_order`) —
mismo cuerpo de V21/V22/V23, solo se insertó el chequeo, sin cambiar
ninguna firma. `restore_order()` quedó lista del lado del servidor pero
sin botón en el frontend (el pedido lo deja como decisión para después).
`fetchOrderById` (detalle de una orden) NO filtra `eliminada_en` — sigue
abriendo la orden eliminada, solo que ya sin las tarjetas de edición.

**Hard-delete de catálogos** (`proveedores`, `clientes`, `telas`,
`productos`) — exclusivo `admin_general`. Como estos catálogos solo
existían como `<select>` embebidos dentro de formularios (`TelaSelect`,
`ClienteSelect`, `ProveedorSelect`, `ProductoAutocomplete` — un `<select>`
nativo no puede tener un botón de borrar por opción), se construyó una
página nueva **`/catalogos`** (`CatalogosPage.jsx`, solo `admin_general`)
con las 4 secciones en modo lista + botón Eliminar. FKs verificadas antes
de escribir esto: `productos.cliente_id → clientes(id)` es **`ON DELETE
CASCADE`** de verdad (borrar un cliente borra sus productos guardados —
el impact-check lo avisa), mientras que `productos.tela_id`,
`orders.client_id` y `pedidos_tienda.proveedor_id` son `ON DELETE SET
NULL` (no rompen nada, solo pierden la referencia).

**"Control rápido de órdenes"** (tarea 9): página nueva **`/control-rapido`**
(`ControlRapidoPage.jsx`), visible para **todos los roles e invitados**
(mismo criterio de visibilidad total del resto de la app) — tabla de solo
lectura folio/cliente/estado. El estado combina `orden_etapas` (muestra
las etapas `en_proceso` unidas con "+", ej. "Producción + Terminado") con
`orders.status` como respaldo, y "Eliminada" para las que tienen
`eliminada_en`. Única pantalla donde una orden eliminada sigue siendo
visible.

**Archivos tocados**: `supabase/schema_v24_soft_delete.sql` (nuevo);
`src/services/ordersService.js` (`fetchOrders` filtra eliminadas,
`fetchAllOrdersForControl`, `fetchAllOrdenEtapas`,
`getOrderDeleteImpact`/`softDeleteOrder`/`restoreOrder`);
`src/services/clientesService.js`, `telasService.js`,
`proveedoresService.js`, `productosService.js` (cada uno gana
`delete*`/`get*DeleteImpact`); `src/utils/permissions.js`
(`canManageCatalogs`, `canDeleteOrder`); `src/pages/CatalogosPage.jsx`
(nuevo), `src/pages/ControlRapidoPage.jsx` (nuevo);
`src/components/orders/CancelOrderCard.jsx` (botón Eliminar orden +
impact-check), `OrderDocumentsCard.jsx`/`OrderPaymentsCard.jsx` (ocultan
sus controles de edición cuando `eliminada_en` está presente);
`src/pages/OrderDetailPage.jsx` (banner "Eliminada", oculta
StatusChanger/EstimatedDaysCard/OrderEtapasCard en una orden eliminada);
`src/App.jsx`/`AppLayout.jsx` (rutas y nav de `/catalogos` y
`/control-rapido`); `src/styles/index.css` (`.simple-table`).

**Verificado en vivo vía simulación SQL** (sin sesión autenticada
disponible): las 20 funciones nuevas/tocadas conservan
`anon_exec=false`/`auth_exec=true`; las 10 funciones de mutación de
órdenes confirman tener el guard de `eliminada_en` en su `prosrc`; se
marcó una orden de prueba como eliminada, se confirmó que desaparece de
una query estilo `fetchOrders` (`eliminada_en is null` → 0 filas) y que
`bloquearia_el_guard` da `true`, y se revirtió al estado original.

**Falta probar manualmente**: iniciar sesión como `admin_general` y
recorrer el flujo completo de eliminar una orden de prueba (ver el
impact-check con números reales, confirmar que desaparece del Dashboard
pero sigue en Control rápido, confirmar que ningún botón de edición
aparece ya en su detalle); probar borrar un cliente de prueba con
productos asociados y confirmar el aviso de cascada; confirmar que
`/control-rapido` carga para un invitado sin sesión; confirmar que
`/catalogos` da 403 a cualquier rol que no sea `admin_general`.

### Fase 2, Parte 3 — Bordado condicional POR PRENDA (V25)

El pedido original de la Parte 3 planteaba bordado como un toggle a nivel
de ORDEN completa ("¿Incluye bordado?"), con N ubicaciones+fotos sueltas
sin ligar a una prenda en particular. El usuario corrigió esto
explícitamente después de ver cómo había quedado bordado en la Parte 2
(fijo en la plantilla de escolar/industrial): **"el bordado va a ser un
botón en cada prenda para indicar si lleva bordado o no cada prenda, y si
no lleva, que no tenga que pasar por ese paso de la producción"**. Esto
reemplaza el diseño de bordado de V23 — ya no es "todo escolar/industrial
lleva bordado siempre", es condicional por prenda, para **cualquier** tipo
de orden (incluida sublimación, que en V23 no tenía bordado en su
plantilla en absoluto).

**`items` (JSONB en `orders.items`) gana una clave por prenda:
`lleva_bordado` (boolean)** — sin migración de datos, los items existentes
simplemente no la traen (se lee con `coalesce(..., false)`). Cada prenda
también gana un `id` (UUID generado en el cliente, `crypto.randomUUID()`)
para poder ligarle registros de bordado; las prendas de órdenes creadas
antes de V25 no traen `id` — se les asigna uno al cargar el editor
(`OrderItemsCard.jsx`), sin tocar la base.

**La fila `orden_etapas` con `etapa='bordado'` ya no viene de
`plantillas_etapas` — se genera/retira según si AL MENOS UNA prenda de la
orden pide bordado**, resuelto en dos puntos:
- `create_order`: al crear, si algún item trae `lleva_bordado: true`.
- `set_order_items`: si tienda edita las prendas después (mientras la
  orden sigue en `en_confirmacion`), reconcilia la fila — la agrega si
  ahora hace falta y no existía, la quita si ya no hace falta y sigue
  `pendiente` (si ya está `en_proceso`/`completado`, se deja intacta para
  no perder trabajo ya hecho).

Las 11 órdenes de prueba que ya tenían una fila de bordado por venir de la
plantilla vieja de escolar/industrial (V23) se quedaron como están — no
hay forma de saber retroactivamente qué prenda "debía" llevarlo, y son
datos de prueba de todos modos.

**`orden_bordados`**: un registro por ubicación+foto, ligado a la orden Y
a la prenda específica (`item_id`, comparado como texto contra el `id` de
la prenda en el JSONB — no es una FK real, `items` vive en JSONB no en una
tabla). `create_orden_bordado`/`delete_orden_bordado` — exclusivo
`bordado`/`admin_fabrica`/`admin_general`, y solo si la orden realmente
tiene la etapa `bordado` en su flujo. Lectura pública (todos ven todo,
igual que el resto del sistema). Fotos en el mismo bucket público
`order-photos` que las fotos de referencia, bajo
`<orderId>/bordado/<itemId>/<uuid>.<ext>`.

**Frontend**: `OrderItemsEditor.jsx` — botón "¿Lleva bordado?" por prenda
(mismo gate que el resto de sus campos: ventas/admin_tienda/admin_general,
vía el `fieldset disabled` de `OrderItemsCard.jsx`). `OrderBordadosCard.jsx`
(nuevo) — solo aparece si al menos una prenda de la orden tiene
`lleva_bordado`, lista cada prenda con sus registros existentes
(ubicación + foto) y, si el rol califica (`canManageBordado`), un
formulario inline para agregar uno más. `bordadosService.js` (nuevo).

**Verificado en vivo**: los 4 RPCs nuevos/tocados conservan
`anon_exec=false`/`auth_exec=true`. Simulación directa sobre una orden de
prueba de sublimación (que nunca había tenido bordado en su flujo): se
marcó su única prenda con `lleva_bordado=true` y se corrió la misma lógica
de reconciliación de `set_order_items` — apareció la fila `bordado`
`pendiente` en `orden_etapas` (secuencia 3, el valor por default ya que
sublimación no tiene bordado en `plantillas_etapas`); se desmarcó la
prenda y se confirmó que la fila se quitó sola. La orden se revirtió a su
estado original.

**Falta probar manualmente**: iniciar sesión como `ventas`/`admin_tienda`,
marcar una prenda con "¿Lleva bordado?" en una orden nueva o existente, y
confirmar que aparece la tarjeta "Bordado" en el detalle; iniciar sesión
como `bordado` (o `admin_fabrica`/`admin_general`) y subir una foto con
ubicación para esa prenda, confirmar que se ve en la tarjeta y que se
puede quitar; confirmar que un rol sin `canManageBordado` (ej. `ventas`)
ve los registros pero no el botón de agregar.

### Fase 2, Parte 4 — Terminado y remisión (V26)

**Cantidad surtida por talla.** No existe una tabla de líneas de pedido —
las tallas viven dentro de `items[].sizes[]` (JSONB de `orders.items`), así
que cada talla gana dos claves opcionales: `cantidad_surtida` (numeric) y
`comentario_surtido` (text) — sin migración, las tallas existentes
simplemente no las traen (se leen como "sin capturar todavía", se muestran
en negro con "—", no como 0).

**`set_item_surtido(p_order_id, p_item_index, p_talla, p_cantidad_surtida,
p_comentario_surtido)`** — exclusivo `terminado`/`admin_fabrica`/
`admin_general`, bloqueado si la orden está `eliminada_en`. **Diseño por
índice, no por `id` de prenda** — decisión tomada ANTES de tocar el
frontend, no un bug reportado: el `id` de cada prenda (agregado en la
Parte 3) solo se persiste en la base si tienda vuelve a guardar
explícitamente vía `set_order_items`; cualquier orden que no haya pasado
por ahí desde V25 — es decir, casi todas las órdenes reales que se van a
cargar el lunes — no tiene `id` en sus prendas guardadas. Matchear por `id`
habría dejado a `terminado` sin poder capturar nada en esas órdenes. La
función usa `jsonb_array_elements(items) with ordinality` para ubicar la
prenda por posición y reescribe solo esa talla dentro de `sizes[]`. Este
cambio de tipo de parámetro (`p_item_id text` → `p_item_index integer`)
requirió `drop function if exists` antes del `create or replace` (un
`CREATE OR REPLACE` no permite cambiar tipos de parámetro). Verificado en
vivo simulando la lógica exacta sobre la orden real `SUB-003` (sin `id` en
ninguna de sus prendas) y sobre un `id` fabricado — ambos casos
resolvieron la prenda correcta.

**`terminado` de solo lectura en el resto de la orden**: `canManageSurtido`
es la única puerta nueva de UI para este rol; el resto de sus permisos ya
quedaban cerrados desde `canEditOrder`/`canConfirmOrder`/`canCompleteOrder`
en V21/V23 (nunca tuvo acceso de escritura a cliente, fechas, tipo,
cantidades pedidas, ni otras etapas) — Parte 4 no tuvo que tocar esos
helpers, solo confirmar que seguían cerrados.

**`OrderSurtidoCard.jsx`** (nuevo) — se muestra si la orden tiene al menos
una prenda (no depende del status ni del rol: cualquiera ve pedida vs.
surtida, igual que el resto del sistema es de visibilidad total). Cada
talla es una fila con pedida de solo lectura y surtida/comentario
editables solo si `canManageSurtido(role)`, con un botón "Guardar" por
fila que solo se activa si hay cambios sin guardar.

**Remisión de entrega (`RemisionPdf.jsx` + `buildRemisionPdfBlob`)** —
disponible solo cuando `order.status === 'completado'`, compara pedida vs.
surtida por talla con código de color: negro si son iguales o si no hay
dato capturado, rojo si faltó, verde si sobró; muestra el comentario de
las líneas con diferencia y una leyenda (solo si hay al menos una
diferencia). Visible/descargable por **ambos dominios** (tienda y
fábrica) — `canViewRemision()` no restringe por rol, mismo criterio de
visibilidad total que el resto de la app, ya que ambos lados necesitan
confirmar qué se surtió realmente.

**Vista previa antes de descargar (`PdfPreviewModal.jsx`)** — retrofit
aplicado a los dos botones de PDF que ya existían ("Descargar PDF"/"PDF
para cliente" en `OrderDetailPage.jsx`) además del nuevo botón de
remisión: ahora los tres generan el blob y lo muestran en un modal con
`<iframe>` antes de que el usuario decida descargar. La única excepción
deliberada es la descarga automática al crear una orden nueva
(`NewOrderPage.jsx`) — ahí el PDF es un efecto de fondo mientras la página
ya está navegando al detalle, y meter un modal bloqueante en medio de esa
transición sería peor experiencia, no mejor.

**Bug encontrado y corregido en vivo**: la primera versión de
`RemisionPdf.jsx` combinaba `fontStyle: 'italic'` (en el estilo base de la
celda de comentario) con `fontFamily: 'Helvetica-Bold'` (del estilo de
encabezado) en la fila de headers de la tabla — `@react-pdf/renderer` no
resuelve esa combinación y truena en tiempo de render con "Could not
resolve font for Helvetica-Bold, fontWeight 400, fontStyle italic". Se
encontró generando la remisión real en el navegador (no en revisión de
código) — el botón mostraba el error en rojo bajo la fila de botones. Se
corrigió sacando el itálico del estilo base y aplicándolo en un estilo
aparte (`commentText`) solo a las celdas de datos, nunca a las del
encabezado. Reconfirmado en vivo tras el fix: la remisión de la orden real
`2026-0200` renderiza con talla 8 en negro (15 pedida / 15 surtida) y
talla 10 en verde (20 pedida / 23 surtida, con el comentario "Sobraron 3,
cliente pidió de más por error" visible) — sin banner de error.

**Dato de prueba usado y ya revertido**: se cargó temporalmente
`cantidad_surtida`/`comentario_surtido` en la orden real `2026-0200`
(Colegio Vanguard) para poder generar una remisión con diferencias reales
y probar el color-coding en vivo. Se revirtió a su `items` original (sin
esas claves) antes de seguir — no queda dato de prueba en órdenes reales.

**Falta probar manualmente**: iniciar sesión como `terminado` (o
`admin_fabrica`/`admin_general`), abrir una orden con status
`completado`, capturar cantidad surtida/comentario en al menos una talla
con diferencia contra lo pedido, confirmar que se guarda y que la
remisión refleja el color correcto; confirmar que `terminado` no puede
editar ningún otro campo de la orden; confirmar que un rol de tienda
(`ventas`/`admin_tienda`) también puede descargar la remisión de una
orden completada; probar los tres botones de PDF (interno/cliente/
remisión) y confirmar que los tres abren la vista previa antes de
descargar, y que "Descargar" dentro del modal sí dispara la descarga real.

### V27 — fix "Database error deleting user" + vista previa también al crear una orden

Dos correcciones reportadas después de probar Parte 4 en producción, sin
relación entre sí:

**1) No se podía eliminar ningún usuario real desde el panel de
Usuarios.** Causa confirmada en vivo (se consultó `pg_constraint`
filtrando por `confrelid = 'auth.users'::regclass` antes de asumir nada):
de las 5 columnas de `public` que le apuntan a `auth.users(id)` para
"quién hizo esto", solo 2 (`orden_bordados.creado_por`,
`orden_etapas.responsable_id`, ambas de V23/V25) se crearon con `ON
DELETE SET NULL`. Las otras 3 —`orders.created_by`,
`order_status_history.changed_by`, `anticipos.created_by`— se crearon
sin especificar acción de borrado (V4/V16), lo que en Postgres es `NO
ACTION`: en cuanto el usuario a borrar hubiera creado una orden, cambiado
un estado, o registrado un anticipo —es decir, cualquier usuario real que
haya usado el sistema— `auth.admin.deleteUser()` truena con una
violación de foreign key, que Supabase Auth reporta genérico como
"Database error deleting user" sin decir cuál tabla la causó.
`schema_v27_fix_user_delete.sql` les puso `ON DELETE SET NULL` a las 3,
mismo criterio que las otras dos — la orden/el historial/el anticipo NO
se borran ni se rompen al borrar a quien los creó, solo pierden la
referencia a "quién". Verificado en vivo con `pg_get_constraintdef`: las 3
salen ahora con `ON DELETE SET NULL`.

**2) Vista previa también en el PDF que se genera al crear una orden.**
La única excepción que quedó documentada en V26 (auto-descarga sin vista
previa al crear una orden nueva, para no bloquear la transición a la
página de detalle) se eliminó a pedido explícito del usuario: **"quiero
que todos los pdf que se generan primero se vean en vista previa, y ya si
lo quieren descargar que lo descarguen"**. `NewOrderPage.jsx` ya no llama
`downloadBlob` — genera el blob igual que antes y lo manda como
`location.state.pdfPreview` al navegar a `/orden/:id`;
`OrderDetailPage.jsx` lo recoge con un `useState(() =>
location.state?.pdfPreview || null)` (lazy init: se lee una sola vez al
montar, así que cerrar el modal no lo vuelve a abrir) y abre
`PdfPreviewModal` automáticamente, igual que los otros tres botones de
PDF del detalle. Verificado que un `Blob` sobrevive el paso por
`navigate(path, { state })` bajo `HashRouter` (usa `history.pushState`
por debajo, que clona el estado con structured clone — Blob incluido);
además, el mismo mecanismo de pasar `location.state` entre estas dos
páginas ya estaba probado en producción para `photoUploadError`, así que
no es una ruta nueva sin probar. **Ahora los 4 PDFs del sistema
(confirmación al crear, "Descargar PDF", "PDF para cliente", remisión)
pasan todos por vista previa antes de poder descargarse — ya no queda
ninguna excepción.**

**Falta probar manualmente**: crear una orden nueva y confirmar que, en
vez de descargarse sola, se abre el modal de vista previa ya parado en la
página de detalle de la orden recién creada; confirmar que "Descargar"
adentro de ese modal sí baja el archivo; después de las pruebas de
arriba, eliminar un usuario de prueba real (no el propio) que ya haya
creado una orden o cambiado un estado, y confirmar que ahora sí se borra.

### V28 — auditoría de seguridad (checklist "no quiero que me hackeen / demanden")

El usuario pidió una revisión general de seguridad + cumplimiento legal
("privacy policy, terms, cookie policy, refund policy... hide my API
keys... sanitize forms... XSS... rate limiting... CORS... security
headers..."), pensada de forma genérica para "un sitio vibe-coded"
(plantilla que circula para pegarle a cualquier IA). Antes de escribir
nada, se auditó el código real para no fabricar contenido/arreglos que no
corresponden a lo que SALPER realmente es.

**Contexto que cambia todo el análisis legal**: SALPER es un sistema
interno de seguimiento de órdenes de producción (rutas: dashboard,
detalle de orden, calendario, usuarios, catálogos, etc. — ver
`src/App.jsx`), NO un sitio público de marketing/e-commerce. No hay
checkout, no hay reseñas, no hay copy de marketing con afirmaciones, no
hay analytics/píxeles de terceros (`index.html` solo carga Google Fonts),
no hay banner de cookies posible de necesitar porque no hay cookies de
tracking. Por eso, de la lista original: refund policy, "remove fake
reviews", "remove unsupported claims", cookie consent banner y "check
third-party embeds" **no aplican tal cual** — meterlos igual habría sido
peor que no meterlos (contenido legal que no corresponde a lo que el
sitio hace). Sí aplica y quedó pendiente de los datos reales del negocio
(razón social, RFC, domicilio) un Aviso de Privacidad — México se rige
por la LFPDPPP, no por GDPR/CCPA — ya que el sistema sí guarda datos
personales reales (nombres de clientes y del personal) y algunas órdenes
se comparten por link de solo lectura fuera de la empresa. Esto quedó
pendiente de que el usuario confirme esos datos; no se inventó nada.

**Seguridad — ya estaba bien (verificado, no se tocó)**:
- `.env` nunca se subió a git, ni en ningún punto del historial completo
  (escaneado con patrones de llaves conocidas: `sk-ant-`, JWT `eyJ`,
  claves AWS, bloques de llave privada — cero coincidencias).
- `ANTHROPIC_API_KEY` solo vive del lado del servidor
  (`api/_chat/anthropic.js`), nunca en el bundle del navegador.
- Las tools de solo-lectura del chat (`api/_chat/tools.js`) usan la
  `anon key`, no la `service_role key` — mínimo privilegio, ya que esas
  tablas son de lectura pública de todos modos.
- Cero `dangerouslySetInnerHTML`, cero `eval`/`new Function` en todo
  `src/` — sin vector obvio de XSS por HTML sin escapar (React escapa
  todo por default en el resto de la app).
- Rutas de admin (`Usuarios`, `Catálogos`) protegidas en dos capas:
  `RequireRole` en el cliente (UX) + RLS/chequeo de rol en cada RPC del
  lado del servidor (la protección real, ver todas las V2x anteriores) —
  entrar directo por URL sin el rol correcto no sirve de nada.
- Contraseñas: las maneja Supabase Auth completo, nunca se tocan ni se
  ven del lado de la app — ya hasheadas correctamente por su cuenta.
- Sin archivos sensibles en `public/`, sin source maps en el build de
  producción (Vite no los genera a menos que se pida explícito).

**Seguridad — corregido en V28**:
- **CORS abierto (`Access-Control-Allow-Origin: '*'`) en el Edge
  Function `admin-create-user`** (puede suspender/eliminar usuarios
  reales) — se cambió a una lista blanca (`isAllowedOrigin`): el dominio
  de producción, cualquier preview `*.vercel.app` del mismo proyecto, y
  localhost para desarrollo. Riesgo real era bajo de por sí (la
  autenticación es por Bearer token, no cookies, así que un CORS abierto
  no habilita CSRF clásico), pero es defensa en profundidad barata.
  **Pendiente**: redesplegar esta función desde el Dashboard de Supabase
  (Edge Functions → admin-create-user) — el código en el repo ya está
  actualizado pero Supabase no jala del repo automático para Edge
  Functions, hay que pegar/desplegar a mano como siempre.
- **Sin rate limiting en `/api/chat`** — cualquier cuenta con sesión
  podía mandar mensajes sin límite (cada uno cuesta dinero real en la
  API de Anthropic). Se agregó `schema_v28_security_hardening.sql`
  (tabla `chat_rate_limit`, RLS: cada quien ve/inserta solo sus propias
  filas) + `api/_chat/rateLimit.js` (máximo 15 mensajes cada 5 minutos
  por usuario, usando el propio token de quien llama — no la service
  role key). Si falla el chequeo por algún motivo, deja pasar el mensaje
  sin bloquear (mejor un chat sin límite temporal que un chat roto).
  **Pendiente**: aplicar `schema_v28_security_hardening.sql` en el SQL
  Editor de Supabase (no se pudo aplicar en la sesión — la sesión del
  navegador hacia Supabase se había cerrado y no se ponen credenciales).
- **Security headers**: no había ninguno configurado. Se agregó
  `vercel.json` con `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security`.
  **No se agregó Content-Security-Policy** a propósito — mal configurado
  puede romper la carga de Google Fonts, las llamadas a Supabase, o la
  generación de PDFs; necesita su propia sesión de pruebas dedicada, no
  meterlo de prisa junto a todo lo demás.
- **Dependencia actualizada sin riesgo**: `@supabase/supabase-js`
  2.112.4 → 2.116.0 (parche menor, sin cambios que rompan nada).

**Seguridad — encontrado pero NO aplicado a propósito (alto riesgo de
romper la app en un solo cambio, requiere su propia sesión de pruebas)**:
- `react-router-dom` (6.30.6) tiene 2 vulnerabilidades moderadas
  registradas (open redirect vía backslash en `<Link>`/`useNavigate`,
  CVE-2025-68470-bypass; inyección de constructor arbitraria en
  hidratación SSR) — el único fix disponible es saltar a la v7 (cambio
  de versión mayor). Riesgo real de explotación en SALPER es bajo (usa
  `HashRouter`, y no hay ningún flujo donde un parámetro de URL
  controlado por el usuario decida a dónde redirigir), pero la
  vulnerabilidad SÍ existe. Recomendado: planear el salto a v7 como su
  propio trabajo, probando todas las rutas/navegaciones de la app
  después.
- `esbuild` (vía Vite, dependencia de desarrollo) tiene un aviso
  moderado preexistente — solo afecta a quien corre `npm run dev` con el
  navegador abierto a un sitio malicioso al mismo tiempo; no toca nada
  en producción (el build estático desplegado no incluye el dev server
  de esbuild). El fix requiere Vite 5→8 (salto mayor); no se tocó.
- React 18→19, `@vitejs/plugin-react` 4→6: sin vulnerabilidad de
  seguridad detrás (son actualizaciones de mantenimiento normales, no
  fixes de seguridad) — no se tocaron en este barrido.

**Aviso importante, dicho explícito al usuario**: ningún documento legal
generado por IA es garantía de "no te van a demandar" — son borradores de
buena fe, no asesoría legal. Para algo con peso legal real (SALPER ya es
una empresa real en operación), vale la pena que un abogado mexicano lo
revise antes de publicarlo. Tampoco se puede prometer "cero errores" de
forma absoluta ni en el trabajo de seguridad ni en el legal — se avisó
directo al usuario en vez de prometerlo y ya.

**Falta probar/hacer manualmente**:
- Iniciar sesión en el Dashboard de Supabase y aplicar
  `schema_v28_security_hardening.sql`.
- Redesplegar el Edge Function `admin-create-user` con el CORS nuevo.
- Después de ambos: probar el chat desde la app y confirmar que sigue
  funcionando normal, y que después de ~15 mensajes seguidos en 5
  minutos, el siguiente mensaje da el error de límite en vez de
  procesarse.
- Confirmar que crear/editar/suspender/eliminar usuarios sigue
  funcionando igual desde el dominio real de producción.
- Decidir con el usuario: datos reales del negocio (razón social, RFC,
  domicilio) para escribir el Aviso de Privacidad; si quiere Términos de
  uso internos; y cuándo planear el salto de versión de
  react-router-dom/Vite/React (candidato perfecto para probarse primero
  en la rama `dev`, ya que ahí sí puede romper algo sin afectar
  producción).

### V29 — se quita el "modo invitado": nadie externo a SALPER puede entrar

El usuario preguntó cómo asegurarse de que nadie externo a SALPER pudiera
entrar al sistema. Respuesta honesta que hubo que darle primero: **hoy
sí podían** — desde V10, cualquiera con el link veía todo en modo
lectura sin necesidad de cuenta, a propósito (incluso se pidió
expresamente que "Control rápido" fuera visible para invitados en la
Parte 1 extendida de Fase 2, V24). El usuario confirmó explícitamente
que quería cerrar esto por completo ("Solo con cuenta") en vez de las
otras dos opciones que se le ofrecieron (contraseña compartida de
equipo, o dejarlo como está).

**Candado del lado del servidor** (`schema_v29_no_acceso_externo.sql`):
antes de escribir nada se confirmó en vivo, consultando `pg_policies` e
`information_schema.role_table_grants` filtrando por `grantee = 'anon'`,
exactamente qué tenía SELECT expuesto a invitados — 11 tablas
(`announcements`, `clientes`, `orden_bordados`, `orden_etapas`,
`order_status_history`, `order_types`, `orders`, `pending_items`,
`plantillas_etapas`, `productos`, `telas`). El fix real es una sola
línea: `revoke usage on schema public from anon;` — sin `USAGE` en el
schema, `anon` no puede resolver NINGÚN objeto de `public` sin importar
qué GRANT/policy tenga, así que esto es el candado maestro (deja
inservibles de paso los GRANT de `execute` a `anon` que quedaban
colgados desde V1-V3 sobre RPCs de escritura — ya no hacía falta cazar
cada firma una por una). Además, por defensa en profundidad, cada policy
"Lectura pública ..." se recreó como `to authenticated` solamente, y se
revocó el `select` explícito a `anon` en esas 11 tablas — así que aunque
alguien reactive el `USAGE` por error algún día, cada tabla sigue cerrada
por su cuenta. **Verificado en vivo con una llamada real a la REST API**
(no solo revisando políticas): pedir `orders` con la `anon key` regresaba
`200` con datos antes del cambio, y `401` después.

**Candado del lado del cliente** (`App.jsx`): `AuthGate` ya no monta
`<Routes>`/`<AppLayout>` si no hay `user` — sin sesión, lo único que se
renderiza es `<LoginPage />`, sin importar qué ruta se pida. Antes, el
comentario del propio código decía explícitamente "modo invitado... ve
la app completa en modo lectura... nunca la pantalla de login primero"
— ahora es lo opuesto: login primero, siempre, para cualquiera sin
sesión.

**Lo que NO se tocó, a propósito, y por qué**: el bucket de Storage
`order-photos` (fotos de referencia y de bordado) sigue siendo `public:
true` — quien ya tenga la URL directa de una foto (no la app, el archivo
en sí) todavía podría abrirla sin sesión, porque los buckets de Storage
son un espacio de permisos aparte del schema `public` que se cerró aquí.
Es un residual de riesgo bajo (las URLs llevan UUIDs no adivinables, y
ahora nadie externo puede llegar a verlas desde la app para empezar, ya
que ni siquiera pasa de la pantalla de login), pero no es cero. Si se
quiere cerrar también, implica pasar ese bucket a privado y que el
frontend pida URLs firmadas (mismo patrón que ya usa
`orden-documentos`/cotización-factura) — se dejó pendiente como mejora
futura, no se metió en este mismo cambio para no combinar dos cambios de
riesgo distinto en una sola pasada.

**Sobre el Aviso de Privacidad** (pregunta del mismo turno): que SALPER
sea interno NO exime la obligación de la LFPDPPP — esa ley se activa por
procesar datos personales de personas físicas, no por ser un sitio
público. Se revisó el esquema real antes de contestar: `clientes` solo
guarda el nombre de la institución/empresa (nunca teléfono/correo/nombre
de una persona de contacto), así que si eso se mantiene así en la
práctica, la LFPDPPP no aplica a esos datos (una razón social no es dato
personal). Donde sí aplica es al personal (`profiles` guarda nombre
completo + correo de cada cuenta) — ahí sí corresponde un aviso de
privacidad para colaboradores, pero es un documento de RH, no una página
pública del sitio. Pendiente de que el usuario confirme si en algún
campo libre del sistema llegan a anotar datos de una persona de contacto
específica de un cliente.

**Falta probar manualmente**: abrir la URL de producción en una ventana
de incógnito (sin sesión) y confirmar que solo se ve la pantalla de
login, ningún dato de ninguna orden; iniciar sesión con una cuenta real
y confirmar que todo el sistema se ve y funciona exactamente igual que
antes; confirmar que "Control rápido" y el resto de rutas que antes
funcionaban sin cuenta ahora exigen login.

### V30 — teléfono/correo de cliente + roles 'lectura' y 'tienda'

**Teléfono y correo del cliente al crear una orden**: `NewOrderPage.jsx`
gana 2 campos (opcionales) junto al selector de cliente. Si el cliente
elegido/creado ya tenía teléfono/correo guardado de un pedido anterior,
se prellenan solos (sin pisar lo que el usuario ya haya tecleado). Al
guardar la orden, `create_order` hace 2 cosas en una sola función: guarda
un snapshot en la propia orden (`orders.client_telefono`/`client_correo`
— mismo criterio que `client_name`: el catálogo puede cambiar después sin
romper órdenes viejas) y, si la orden viene de un cliente del catálogo
(`client_id`), actualiza también `clientes.telefono`/`correo` para la
próxima vez — solo si se mandó un valor no vacío, nunca borra un dato ya
guardado por dejar el campo en blanco. `OrderDetailsCard.jsx` puede
ver/editar estos 2 campos después de creada la orden (vía
`update_order_details`, sin tocar el catálogo, igual que `client_name`
ahí).

**Bug encontrado y corregido en vivo, antes de dar por cerrado**: agregar
parámetros nuevos a `create_cliente`/`create_order`/`update_order_details`
creó un OVERLOAD aparte en vez de reemplazar la función in-place (mismo
gotcha ya documentado en `schema_v12_catalogos.sql`: una firma con más
parámetros es una función distinta para Postgres, aunque los nuevos
tengan default). Esto dejó temporalmente 2 versiones de cada una — la
vieja sin tocar, y la nueva **sin ningún GRANT explícito** (y por default
de Supabase, una función nueva en `public` nace abierta a
`anon`/`authenticated`, más permisiva de lo que debería). Se encontró
consultando `has_function_privilege` en vivo (no se asumió que el primer
intento había quedado bien) y se corrigió con `drop function` de las 3
firmas viejas + `revoke`/`grant` explícito en las nuevas — reconfirmado
después: 1 sola versión de cada función, `authenticated` puede
ejecutarlas, `anon` no.

**Rol 'lectura' — solo lectura total**: ve exactamente lo mismo que
cualquier rol normal (todo el nav excepto Catálogos/Usuarios, que ya eran
exclusivos de `admin_general`), pero no puede escribir NADA — ni un
folio, ni un pendiente, ni una foto. No hizo falta tocar la mayoría de
los permisos existentes (ya son allowlists explícitas por rol, y
'lectura' simplemente nunca aparece en ninguna), solo hubo que cerrarle
las 4 únicas funciones de escritura que hasta V29 NO tenían NINGÚN
candado de rol (abiertas a cualquier sesión sin distinción, desde que se
crearon): anuncios (crear/borrar), fotos de referencia (subir/borrar) y
cambiar el estado de un pendiente. `create_pending_item` es la única
excepción — sigue abierta para todos excepto 'lectura', porque es la
única escritura que sí tiene 'tienda'.

**Rol 'tienda' — personal de tienda sin funciones de ventas/contabilidad**:
nav reducido a solo Dashboard (ver órdenes) + Pendientes — ni Resumen, ni
Calendario, ni Anuncios, ni Pedidos a Proveedor, ni Control rápido, ni
"Nueva orden" (`isTiendaBasica` en `utils/permissions.js`, deliberadamente
NO combinado con `hasRestrictedNav` de fábrica porque las formas de
restricción no coinciden — fábrica sí ve Resumen y no ve Pendientes,
'tienda' es al revés). ~~Su única escritura en todo el sistema es agregar
un pendiente nuevo — no puede resolverlos~~ **corregido en V31, ver
abajo: sí puede resolverlos.** Mismo candado de servidor que 'lectura' en
anuncios/fotos.

**Falta probar manualmente**: crear un usuario con rol `lectura` desde
Usuarios, iniciar sesión con él y confirmar que ve todo pero no aparece
ningún botón de escritura en ningún lado (ni siquiera navegando rutas
directo); crear una orden nueva con teléfono/correo de un cliente ya
existente y confirmar que la próxima vez que se elija ese cliente, ambos
campos se prellenan solos.

### V31 — 'tienda' sí resuelve pendientes + arranque en producción solo con lo esencial

**Corrección de permisos**: V30 interpretó mal el alcance de 'tienda' —
lo dejó solo agregar pendientes, no resolverlos. El usuario aclaró
explícitamente que sí necesita poder resolverlos (marcar en verde/listo
cuando ya terminó una orden de reparación). `canResolvePendingItems` y
`update_pending_item_status` ya no distinguen a 'tienda' de cualquier
otro rol — solo 'lectura' se queda sin poder tocar nada, en pendientes
como en todo lo demás.

**Arranque en producción con "la idea original"**: el usuario quiere
empezar a usar el sistema con datos reales desde mañana, pero solo con
el flujo esencial — crear/consultar órdenes, cambiar estados de
producción, descargar con historial de cambios — dejando "Pedidos a
Proveedor" para después (y sin remover nada de Inventariado, porque
no existe como módulo aparte: es solo un checkbox dentro de Pendientes,
ver aclaración abajo). Se implementó como **feature flag**, no borrando
código: `src/utils/featureFlags.js` (`PEDIDOS_PROVEEDOR_HABILITADO =
false`) apaga el link del nav (`AppLayout.jsx`) y las 3 rutas
(`App.jsx`, que muestran `FeatureDisabledPage` en vez del módulo real si
alguien entra directo por URL). Todo el código de Pedidos a Proveedor
sigue completo — reactivarlo cuando esté listo es cambiar ese valor a
`true`, nada más.

**Aclaración importante que se le dio al usuario**: no existe un módulo
de "Inventarios" en el sistema — lo único relacionado es el checkbox
"Inventariado"/"No inventariado" dentro de una prenda de categoría
"reparación" en Pendientes (`schema_v17_inventariado.sql`). No había un
módulo aparte que apagar ahí.

**Estrategia de ramas confirmada con el usuario**: `main` se queda como
la versión reducida que empieza a usarse mañana (con los permisos de
roles ya construidos hasta V31, sin tocarlos más por ahora). La rama
`dev` (creada en la sesión anterior, todavía sin nada propio — apunta al
mismo commit que `main` antes de este cambio) es donde se sigue
desarrollando/probando todo lo demás — Pedidos a Proveedor reactivado,
ajustes de permisos más finos, o cualquier otra cosa nueva — sin tocar
lo que ya está en uso real. Cuando algo de `dev` esté listo, se mergea a
`main` de manera puntual (no de golpe).

**3 cosas señaladas antes de cargar datos reales** (pedido explícito del
usuario — "las 3 más importantes que no estoy viendo"):
1. **Respaldos de la base de datos**: el proyecto de Supabase está en el
   plan Free (visible en el dashboard) — ese plan no incluye respaldos
   automáticos ni point-in-time recovery. Con datos reales de negocio
   entrando desde mañana, esto es el hueco más serio: si algo sale mal
   (una migración, un borrado por accidente), no hay red de seguridad.
   Recomendado antes de cargar datos reales: confirmar el plan actual en
   Supabase y valorar si conviene subir a un plan con respaldos, al
   menos mientras dure la operación real del negocio.
2. **La limpieza de datos de prueba + reinicio de folios sigue
   pendiente**: desde la Parte 1 extendida de Fase 2, el plan propio del
   usuario era (a) validar todo con datos de prueba, (b) HARD-delete de
   esas órdenes de prueba, (c) reiniciar la secuencia de folios a 1 por
   tipo, (d) recién ahí cargar órdenes reales desde folio 1. Ese paso
   nunca se ejecutó — las órdenes de prueba (2026-0200, SUB-003, etc.)
   siguen en la base, y los folios reales seguirían la numeración desde
   donde se quedaron las de prueba si no se reinician antes. Se le
   preguntó al usuario si quiere proceder con esto ahora — es
   irreversible (hard-delete), así que no se tocó sin confirmación
   explícita.
3. **Nunca se probó el sistema en una pantalla de celular real** — solo
   existe un punto de quiebre de CSS (`@media max-width: 720px`,
   bastante básico: apila formularios/detalle de orden, ajusta el chat).
   Dado que varios roles de fábrica (corte, sublimado, etc.) muy
   probablemente van a usar esto desde el piso de producción con el
   celular, vale la pena que alguien lo abra en un teléfono real antes
   de que el equipo empiece a depender de esto mañana — no se pudo
   probar aquí porque no hay forma de iniciar sesión sin credenciales
   reales.

### Limpieza de datos de prueba + reinicio de folios (2026-09-13)

El usuario confirmó explícitamente proceder con el punto 2 de arriba.
Antes de tocar nada se auditó en vivo qué había realmente en la base
(nunca se asumió) — ver `supabase/cleanup_datos_prueba_2026-09-13.sql`
para el detalle completo y el hallazgo de en medio (Supabase bloquea el
`DELETE` directo sobre `storage.objects` — `storage.protect_delete()` —
así que las 5 fotos huérfanas se borraron a mano desde Dashboard →
Storage, no por SQL). Resultado final, verificado:
- **0 órdenes** en la base (las 11 de prueba, todas confirmadas como
  tales antes de borrar — nombres como "asaa"/"ssss", folios sin patrón
  real de negocio).
- **0 archivos** en el bucket `order-photos` (las 5 carpetas huérfanas
  correspondientes a esas órdenes, borradas por la UI de Storage).
- **Folios reiniciados a 1** en los 4 tipos de orden que existían
  (`folio_seq_sublimacion`, `folio_seq_escolar`, `folio_seq_industrial`,
  `folio_seq_basquetbol`) — la próxima orden real de cada tipo sale
  como `<PREFIJO>-001`.
- **Tipo "Basquetbol" desactivado** (confirmado por el usuario que era
  de prueba) — ya no aparece en el selector de "Nueva orden" en
  `NewOrderPage.jsx` (`fetchOrderTypes()` ya filtraba por `active=true`,
  no hizo falta tocar el frontend).

El sistema queda listo para que el equipo empiece a cargar órdenes
reales desde folio 1, sin ningún dato de prueba de por medio.

### Limpieza de catálogos (clientes/telas/proveedores/pendientes/anuncios)

El usuario preguntó explícitamente si también se habían limpiado
clientes/telas/etc — no se había hecho en la limpieza anterior (solo
tocó `orders`). Al auditar, a diferencia de las órdenes (donde los
nombres de prueba eran obvios), aquí el contenido no se veía como basura
evidente: `clientes` tenía "Josesito"/"Luis" (sí obviamente prueba), pero
`telas` tenía solo "W50" y `proveedores` solo "Ximo" — nombres
perfectamente creíbles como reales — y `pending_items`/`announcements`
tenían contenido que se leía como operación real del taller ("Plancha
industrial mandada a reparación", "Cierre por mantenimiento"). Se le
preguntó al usuario uno por uno en vez de asumir cuál era prueba y cuál
no — confirmó borrar los 5: **clientes, telas, proveedores,
pending_items y announcements quedaron en 0 filas**, verificado después
de aplicar.

### V32 — folio externo (ORD-0001) + campos abiertos de prenda

**Folio externo**: muchas de las órdenes reales que se van a cargar ya
tienen un folio de un control anterior (formato "ORD" + 4 dígitos,
según el usuario). Se agregó `orders.folio_externo` (texto libre,
capturado a mano — no autogenerado, a diferencia del folio propio de
SALPER) para no perder esa referencia ni confundirse con el control
anterior. Visible en 3 lugares: input al crear la orden
(`NewOrderPage.jsx`, con prellenado si se elige un cliente que no
cambia nada aquí — es un dato por orden, no por cliente), editable
después en `OrderDetailsCard.jsx`, y mostrado junto al folio real de
SALPER en el encabezado de `OrderDetailPage.jsx` para que sea imposible
confundirlos al ver la orden. Mismo gotcha de siempre al agregar el
parámetro a `create_order`/`update_order_details` (documentado y
corregido dentro de la misma migración esta vez, no después) — DROP
FUNCTION antes de cada redefinición, REVOKE/GRANT explícito después,
reconfirmado en vivo con `has_function_privilege`: 1 sola versión de
cada función, `authenticated` puede ejecutarlas, `anon` no.

**Campos abiertos de prenda**: pedido explícito del usuario — agregar
"Manga", "Vivos", "Cuello", "Puños", "Logotipos", "Números" como texto
libre en cada prenda de `OrderItemsEditor.jsx`, iguales para cualquier
tipo de orden/prenda por ahora. Sin migración de esquema — viven dentro
del JSONB `items` sin schema fijo (mismo patrón que `tela_id`,
`lleva_bordado`, etc.), así que solo fue tocar el frontend
(`OrderItemsEditor.jsx`, y los `emptyItem()` de `NewOrderPage.jsx` y
`OrderItemsCard.jsx` para que las prendas nuevas ya los traigan vacíos).
El usuario avisó explícitamente que esto es temporal/genérico a
propósito — en la rama `dev` los va a volver condicionales según prenda
y tipo de orden; por ahora en `main` (producción) se quedan como 6
campos abiertos siempre visibles, sin ninguna lógica condicional.

**Falta probar manualmente**: crear una orden nueva con folio externo
"ORD-0001" y confirmar que se ve junto al folio real en el detalle;
editarlo después desde "Editar" en Detalles; llenar los 6 campos nuevos
de una prenda y confirmar que se guardan al crear/editar la orden.

### V33 — alta de clientes/telas/productos desde Catálogos, sin pasar por una orden

Pedido explícito del usuario: poder agregar clientes, telas y productos
(estos últimos con foto) directo desde `CatalogosPage.jsx`, sin tener que
crear una orden nueva primero — hasta V32, `createCliente`/`createTela`
solo se llamaban desde los selectores inline dentro del formulario de
orden (`ClienteSelect.jsx`/`TelaSelect.jsx`).

**Sin ningún cambio de esquema** — `create_cliente`, `create_tela` y
`create_producto` ya existían con las firmas correctas desde V12/V30,
así que esto fue 100% frontend:
- `AddClienteForm`/`AddTelaForm` (nuevos, dentro de `CatalogosPage.jsx`):
  mismo "crear o reusar" que ya usan los selectores de una orden, ahora
  también disponible junto al título de cada sección.
- `AddProductoForm` (nuevo): a diferencia de "guardar como producto"
  dentro de una orden (`ProductoAutocomplete.jsx`, que en la práctica
  NUNCA adjuntaba una foto real porque las prendas de una orden no
  tienen selector de foto propio), este formulario sí sube un archivo
  real — `uploadProductoFoto` (nuevo, en `productosService.js`) usa el
  mismo bucket público `order-photos` que las fotos de referencia de
  órdenes, bajo su propia carpeta `productos/<clienteId>/...` para no
  mezclarse con las carpetas de órdenes.
- **Proveedores escondido en producción**: pedido explícito del
  usuario ("lo agregamos después") — mismo patrón de feature flag que
  Pedidos a Proveedor (V31): `PROVEEDORES_HABILITADO = false` en
  `featureFlags.js` esconde la sección en `CatalogosPage.jsx`; el
  catálogo y sus RPCs siguen intactos, solo la UI está apagada.

**Sobre la rama `dev`**: el usuario pidió que el trabajo de Proveedores
"se pase a la branch que tenemos para seguir trabajando en eso" — como
`dev` llevaba desde antes de V28 sin actualizarse (todo el trabajo de
V28-V33 se hizo directo en `main`), se sincronizó `dev` con el estado
actual de `main` (mismo código, nada nuevo que mergear en conflicto) y
ahí se dejó `PROVEEDORES_HABILITADO = true` — para que sea el lugar
donde seguir viendo/desarrollando ese catálogo sin afectar la versión
reducida que ya está en uso real.

**Falta probar manualmente**: desde Catálogos, agregar un cliente nuevo
y confirmar que aparece en la lista y en el selector de "Nueva orden";
agregar una tela nueva igual; elegir un cliente y agregarle un producto
con foto, confirmar que se guarda y que aparece en el autocompletado de
producto al crear una orden para ese cliente; confirmar que Proveedores
ya no aparece en `main` pero sí en el preview de `dev`.

### V34 — menú lateral en vez de barra horizontal + "Órdenes pasadas"/"Control rápido" al Dashboard

El usuario mandó una captura de otra herramienta (un CRM con menú
lateral) preguntando mi opinión sobre cambiar a ese patrón, y pidió
además sacar "Órdenes pasadas" y "Control rápido" de la barra de arriba
para que fueran botones dentro del propio Dashboard. Opinión que se le
dio (y con la que se procedió): con ~8-9 secciones en el nav, una barra
horizontal se amontona o se parte en dos líneas — un menú lateral
escala mucho mejor, y en celular se resuelve con el patrón estándar de
"hamburguesa + panel deslizable", que de hecho es MEJOR que una barra
horizontal angosta en pantallas chicas (que o hace scroll lateral o se
ve apretada).

**`AppLayout.jsx` + `index.css`**: la barra `.app-header`/`.app-nav`
horizontal se reemplazó por `.app-sidebar` (fijo a la izquierda en
escritorio, 240px, con el nombre/rol del usuario y "Cerrar sesión"
abajo). En celular (`@media max-width: 720px`, mismo breakpoint que ya
existía) el sidebar se esconde fuera de pantalla
(`transform: translateX(-100%)`) y aparece una `.app-topbar` con un
botón de hamburguesa que lo abre como panel deslizable
(`.app-sidebar--open`) con un overlay oscuro detrás
(`.app-sidebar-overlay`) que lo cierra al tocarlo — también se cierra
solo al navegar a cualquier link. Verificado visualmente en escritorio
y en celular (con el sidebar cerrado y abierto) inyectando el markup
real con las clases de `index.css` en el navegador, ya que no hay forma
de iniciar sesión real para probar el componente completo sin
credenciales.

**"Órdenes pasadas"/"Control rápido" ya no están en el nav** — son
botones dentro de `DashboardPage.jsx` (nuevo `section-header` al inicio
de la página), con la misma visibilidad por rol que tenían como links
del nav (fábrica no ve "Órdenes pasadas"; 'tienda' no ve ninguno de los
dos).

**Falta probar manualmente**: iniciar sesión y confirmar que el sidebar
se ve bien en escritorio; abrir en un celular real (o achicar la
ventana) y confirmar que el botón de hamburguesa abre/cierra el menú
correctamente y que se cierra solo al tocar un link; confirmar que
"Órdenes pasadas" y "Control rápido" siguen funcionando igual, ahora
desde el Dashboard.

### V34b — "Resumen" también se mueve al Dashboard

Mismo criterio que "Órdenes pasadas"/"Control rápido": sale del menú
lateral (`AppLayout.jsx`) y se vuelve un botón más junto a los otros dos
dentro del Dashboard, con la misma visibilidad que ya tenía en el nav
(oculto solo para `tienda` básico).

### V35 — pantalla de Estadísticas (tiempos de producción, % a tiempo)

Pedido del usuario: "otro dashboard diferente de estadísticas... cuánto
nos tardamos en la producción, nuestro porcentaje de pedidos entregados
a tiempo, etc., todo lo que se te ocurra que nos pueda servir." Es de
solo lectura — no agrega ningún RPC ni escritura nueva, solo lee
`orders` + `order_status_history` (mismas tablas y mismos permisos de
lectura que ya usa el resto de la app desde V29: cualquier rol con
sesión puede verla) y calcula todo del lado del cliente.

**Qué mide** (ver `src/utils/orderStats.js`, función pura `computeOrderStats`,
sin llamadas a la base — fácil de ajustar si se necesita otro criterio
después):
- **% de órdenes entregadas a tiempo**: compara, por día calendario, la
  fecha en la que la orden llegó por primera vez a `completado` (según
  `order_status_history`) contra `requested_delivery_date`.
- **Tiempo promedio de producción**: días desde `created_at` hasta ese
  mismo `completado`.
- **Estimado (fábrica) vs. real**: promedio de la diferencia entre
  `estimated_production_days` (lo que capturó fábrica al confirmar) y
  los días reales — solo sobre las órdenes que sí tienen un estimado
  capturado.
- **Tiempo promedio por etapa**: usa la cronología real del historial de
  cada orden (diferencia entre cambios de estado consecutivos),
  agrupado por `STATUS_GROUPS` (igual que los filtros del Dashboard) para
  no separar "en_corte" de "cortado", etc.
- **Desglose por tipo de orden**: mismas tres métricas (completadas, %
  a tiempo, promedio de días) pero por `order_type_key`.
- **Tendencia mensual**: completadas y % a tiempo de los últimos 6 meses
  con al menos una orden completada.
- **Órdenes atrasadas ahora mismo**: activas (no completadas, no
  canceladas) cuya `requested_delivery_date` ya pasó — lista con link
  directo a cada orden.

Las órdenes con `cancelled_at` se excluyen de todo, igual que en el
resto de la app.

**Archivos nuevos:**
- `src/utils/orderStats.js` — los cálculos (puro, sin red).
- `src/hooks/useOrderStatusHistory.js` — un solo `select *` de TODO
  `order_status_history` (no uno por orden como ya hacía
  `fetchOrderHistory`), agrupado por `order_id` en el cliente. Sin
  realtime a propósito (es una pantalla de análisis, no necesita
  refrescarse sola al segundo) — tiene su propio botón "Actualizar".
- `src/services/ordersService.js` — nueva `fetchAllOrderStatusHistory()`.
- `src/pages/EstadisticasPage.jsx` — la pantalla: 5 tarjetas de KPI,
  barras de tiempo promedio por etapa, tabla por tipo de orden, barras de
  tendencia mensual y la lista de atrasadas. Colores semánticos
  reutilizando los tokens que ya existen (`--color-good`/`--color-danger`/
  `--color-warning`) — verde ≥80%, rojo ≤60%, ámbar en medio; no se
  inventó ninguna paleta nueva.
- CSS nuevo en `src/styles/index.css` (`.stats-grid`, `.stat-card`,
  `.stage-bar-row`, `.stats-table`, `.month-bar`, todos junto a
  `.items-grand-total`).

**Dónde vive**: ruta `/estadisticas`, sin proteger a nivel de ruta (mismo
criterio que Resumen/Control rápido/Órdenes pasadas — la protección real
es que la base ya solo responde a `authenticated`). Botón dentro del
Dashboard, junto a "Resumen"/"Órdenes pasadas"/"Control rápido", oculto
solo para `tienda` básico.

**Verificación hecha** (sin poder iniciar sesión real): 1) corrida de
`computeOrderStats` con datos de prueba inyectados en el navegador
(`import()` del módulo real desde el dev server) confirmando a mano cada
número (promedios, % a tiempo, agrupación por etapa, exclusión de
canceladas) — sin errores; 2) smoke-test visual del CSS nuevo inyectando
markup con las clases reales, en escritorio y en celular; 3)
`npm run build` limpio; 4) la app real (login) sigue cargando sin
errores de consola con los imports nuevos.

**Falta probar con datos reales**: como los catálogos/órdenes de prueba
ya se limpiaron a cero (ver más arriba), esta pantalla vivirá vacía
("—" en las tarjetas, sin filas en las tablas) hasta que se completen
las primeras órdenes reales — es esperado, no es un error.

### V36 — Estadísticas a su propia pestaña + candados de permisos en Catálogos

El usuario preguntó "cuando agregamos algo nuevo, ¿quién tiene permiso
para ver o editar eso?" y pidió el resumen completo de roles (respondido
en el chat, no repetido aquí). Al revisarlo se encontró un hueco real y,
en el mismo mensaje, el usuario pidió 2 cambios de permisos concretos —
los tres se resuelven juntos en esta versión.

**1) Hueco de seguridad cerrado — `create_cliente`/`create_tela`/
`create_producto` sin candado de rol.** Estas 3 funciones (agregadas en
`schema_v12_catalogos.sql`, antes de que existiera el modelo de roles
granular) nunca revisaron `current_user_role()` adentro — a diferencia
de `create_order` y el resto de las funciones de escritura. Solo estaban
protegidas porque la pantalla las escondía (`RequireRole` con
`canManageCatalogs`, exclusivo admin_general). Cualquier rol con sesión
que llamara el RPC directo (no desde la pantalla) podía crear un
cliente/tela/producto sin que el servidor lo rechazara. Cerrado en
`supabase/schema_v36_permisos_catalogos.sql` — mismas 3 firmas, solo se
reemplazó el cuerpo (sin DROP FUNCTION, sin volver a tocar GRANT/REVOKE).

**2) Quién puede DAR DE ALTA cada catálogo** (antes: solo admin_general,
para los tres). Pedido explícito del usuario:
- **Clientes**: ventas + admin_general.
- **Telas**: ventas + admin_fabrica + admin_general.
- **Productos**: mismo criterio que Clientes (ventas + admin_general) —
  se capturan juntos, un producto siempre es "de" un cliente ya elegido
  en la misma pantalla; el usuario lo confirmó así vía pregunta directa.

**BORRAR (hard-delete) no cambió — sigue exclusivo de admin_general, sin
excepción**, en los tres catálogos y en Proveedores. Nuevas funciones en
`utils/permissions.js`: `canCreateCliente`, `canCreateTela`,
`canCreateProducto` (= `canCreateCliente`), y `canViewCatalogos` (la
unión de las tres + `canManageCatalogs`, para decidir quién entra a la
pantalla). `CatalogosPage.jsx`: el `RequireRole` de arriba pasó de
`canManageCatalogs` a `canViewCatalogos`; cada `CatalogSection` recibe su
propio `addForm` (o ninguno) y un `canDelete` para esconder el botón
"Eliminar" fila por fila si el rol no puede borrar — la pantalla ahora
puede tener, al mismo tiempo, a alguien que ve pero no puede dar de alta
nada, a alguien que da de alta pero no puede borrar, etc.

**3) Estadísticas se separó del Dashboard, a su propia pestaña del menú
lateral, restringida a los 3 roles admin_\*.** El usuario la quiso como
pestaña propia (no botón dentro del Dashboard, como quedó en V35) y
solo visible para admin_general, admin_tienda y admin_fabrica — "nadie
más" (ni ventas/contabilidad, ni ningún rol de etapa de fábrica). Nueva
`canViewEstadisticas` en `utils/permissions.js`; `AppLayout.jsx` gana el
link `/estadisticas` en `navItems`; `DashboardPage.jsx` pierde el botón
que tenía desde V35; `EstadisticasPage.jsx` gana su propio `RequireRole`
(antes no tenía ninguno — dependía solo de que el nav lo escondiera).

**Verificación hecha**: `computeOrderStats` de V35 no se tocó. Se
corrieron las 6 funciones de permiso nuevas/editadas para los 12 roles
(vía `import()` del módulo real desde el dev server) confirmando a mano
cada combinación — coincide exactamente con lo pedido (ver tabla arriba
en el chat). Smoke-test visual del sidebar con "Estadísticas" en su
lugar. `npm run build` limpio.

**Migración aplicada y verificada en Supabase** (`schema_v36_permisos_catalogos.sql`):
el usuario inició sesión él mismo en el SQL Editor (yo no manejo
credenciales) y desde ahí corrí el script. Verificado con dos queries
después de aplicar: `select proname, pronargs from pg_proc where
proname in (...)` regresó exactamente 1 fila por función
(`create_cliente`=3 args, `create_tela`=1, `create_producto`=8 — sin
overloads viejos) y `has_function_privilege` confirmó `authenticated` =
true / `anon` = false en las tres. El candado de rol ya está activo del
lado del servidor, no solo en el frontend.

### V37 — folio externo con "ORD" automático + búsqueda por folio + correo en Usuarios

Dos pedidos del usuario en el mismo mensaje ("ya es lo último" antes de
empezar a capturar órdenes reales), más uno que llegó a media tarea
("también, en la página de usuarios, que se vea el correo").

**1) Folio externo — "ORD" fijo, solo se captura el número.** Antes era
un input de texto libre (el usuario tenía que escribir "ORD0007"
completo, sin verificación). Ahora: `FolioExternoField.jsx` (nuevo,
componente compartido entre `NewOrderPage.jsx` y `OrderDetailsCard.jsx`)
muestra "ORD" como prefijo fijo (no editable, pegado visualmente a la
caja con la clase nueva `.input-group`) y un input que solo acepta
dígitos, máximo 4 (`inputMode="numeric"`, se filtra cualquier no-dígito
en el propio `onChange`). El valor que maneja el resto del formulario
sigue siendo el folio COMPLETO (ej. "ORD0007") — el componente arma y
desarma el prefijo internamente, así que no hubo que tocar
`ordersService.js` ni las funciones SQL (`p_folio_externo` sigue
recibiendo el string completo, sin cambio de contrato). Formato
confirmado sin guion ("ORD" + 4 dígitos pegados), igual que se pidió en
V32 — se verificó antes de implementar que la tabla `orders` no tenía
ninguna fila con `folio_externo` ya guardado (0 filas), así que no hubo
riesgo de inconsistencia con datos previos.

**2) Búsqueda por folio externo.** El cuadro de búsqueda del Dashboard
(`DashboardPage.jsx`) y de Órdenes pasadas (`PastOrdersPage.jsx`) ya
comparaba `order_number`/`client_name` contra el texto escrito — se le
agregó `folio_externo` al mismo `includes()`. Como es una comparación de
"contiene" (no exacta), buscar solo "0007" ya encuentra una orden con
folio "ORD0007" sin que haga falta escribir el "ORD". Placeholder de
ambos buscadores actualizado para mencionarlo.

**3) Correo en la página de Usuarios.** `public.profiles` nunca ha
guardado el correo (vive solo en `auth.users`, fuera del alcance del
cliente); no había forma de mostrarlo sin una llamada nueva. Se agregó
la acción `'list'` a la Edge Function `admin-create-user` (ya
compartida por crear/editar/suspender/eliminar, con la misma
verificación de que quien llama sea `admin_general`) — regresa
`{id, email}` de `auth.admin.listUsers()` para todos los usuarios.
`usersService.js` gana `fetchUserEmails()`; `UsersPage.jsx` la pide una
vez al entrar (independiente de `useProfiles`, que sigue siendo
realtime) y cruza por `id`. Si esa llamada falla, la pantalla no se
bloquea — cada fila cae de vuelta al id crudo (comportamiento idéntico
al de antes de V37), con un aviso arriba de la lista. El id crudo no
desapareció: quedó como `title` (tooltip) del mismo elemento.
**Desplegada en Supabase** (Dashboard → Edge Functions → admin-create-user
→ Code → pegado vía Monaco + "Deploy updates", confirmado "Successfully
updated edge function") — el archivo en el repo
(`supabase/functions/admin-create-user/index.ts`) es la copia de
respaldo, como ya se documentaba ahí desde antes.

**Verificación hecha**: `npm run build` limpio; smoke-test visual de
`FolioExternoField` (clases `.input-group`) y de la fila de usuario con
correo, inyectando markup con las clases reales en el navegador (no se
pudo iniciar sesión real). Lógica de `FolioExternoField` verificada a
mano (extracción de dígitos de un valor ya guardado, filtrado de
no-dígitos al escribir, límite de 4). La Edge Function se probará de
verdad la próxima vez que se abra Usuarios con sesión real.

### V38 — fecha de creación manual (temporal) + "pendiente de reconfirmación"

Dos pedidos del usuario en el mismo mensaje, sin relación entre sí.

**1) Fecha de creación manual — TEMPORAL.** Mientras se sube el
historial de órdenes que ya estaban activas antes de usar SALPER (con
fecha de creación real muy anterior a hoy), "Nueva orden" gana un campo
opcional "Fecha de creación (temporal — para subir el historial)" — si
se llena, esa fecha se usa tanto en `orders.created_at` como en el
primer registro de `order_status_history`, para que Estadísticas (V35)
mida el tiempo de producción desde la fecha real, no desde hoy. Si se
deja vacío, se comporta exactamente igual que siempre (`now()`).

Gated por el flag nuevo `CAPTURA_FECHA_CREACION_HABILITADA` en
`utils/featureFlags.js` (`true` en `main` por ahora) — el usuario pidió
explícitamente "por un tiempo... luego ya quitamos eso": cuando termine
de subir el historial, basta con poner el flag en `false` y el campo
desaparece de "Nueva orden" (el parámetro del RPC se queda para
siempre, simplemente deja de mandarse — no hace daño dejarlo).
`create_order` ganó `p_created_at timestamptz default null` (con su
`DROP FUNCTION` + `REVOKE`/`GRANT` de siempre, por el gotcha de
overloads) y una validación: rechaza si la fecha es futura.

**2) "Pendiente de reconfirmación" — permanente.** Si una orden YA fue
confirmada por fábrica (o incluso ya avanzó etapas) y después alguien de
tienda le edita algo — datos generales (`update_order_details`) o
prendas/tallas (`set_order_items`) —, la orden queda marcada con
`orders.pending_reconfirmation_at` (timestamp, no boolean — para poder
ver desde cuándo). No aplica si la orden ya está `completado` o
cancelada (ahí no tiene sentido pedirle a fábrica que "reconfirme"
nada). Se limpia con la función nueva `confirm_order_changes`, exclusiva
de fábrica (mismos roles que `canConfirmOrder`) — no mueve `status` ni
ninguna etapa, solo apaga la bandera.

Pedido explícito del usuario sobre cómo se ve: "que a los usuarios de
la fábrica les salga en color azul todo el cuadro, no solo el botón del
estado". Implementado:
- `OrderCard.jsx` (tarjetas del Dashboard): si `pending_reconfirmation_at`
  está activo y el rol actual puede confirmar cambios
  (`canConfirmOrderChanges`, alias de `canConfirmOrder`), toda la
  tarjeta se pinta de azul (`.order-card--needs-reconfirm`, mismo patrón
  que `--overdue`/`--warning`/`--good`) y gana sobre cualquier color de
  urgencia por fecha — pero nunca sobre cancelada/completada. Solo
  fábrica ve el azul; ventas/admin_tienda no (aunque técnicamente puedan
  editar la orden que lo causó).
- `OrderReconfirmBanner.jsx` (nuevo, en el detalle de la orden): visible
  para cualquiera con sesión si la orden está pendiente — el texto
  cambia según el rol (fábrica ve el botón "Confirmar cambios"; el resto
  solo ve desde cuándo lleva pendiente).
- Color nuevo en la paleta: `--color-info`/`--color-info-soft` (azul,
  `#1d5f99`), exclusivo de esta señal — no se reusa en ningún otro lado,
  no sustituye el rojo/verde de urgencia ni el ámbar/naranja de etapa.

**Verificación hecha**: `npm run build` limpio; smoke-test visual de la
tarjeta azul junto a una tarjeta roja normal (para confirmar que se
distinguen bien) y del banner con el botón, inyectando markup con las
clases reales. Migración aplicada y verificada en Supabase: `pg_proc`
regresó exactamente 1 fila por función (`create_order`=11 args,
`update_order_details`=8, `set_order_items`=2,
`confirm_order_changes`=1) y `has_function_privilege` confirmó
`authenticated`=true/`anon`=false en `create_order` y
`confirm_order_changes`.

**Falta probar con datos reales**: crear una orden, confirmarla, editarle
algo como admin_tienda y confirmar que la tarjeta se pone azul para un
rol de fábrica (y sigue normal para ventas/tienda); darle "Confirmar
cambios" desde fábrica y confirmar que se quita.

### V39 — prendas cerradas + roster de nombres/números, solo en sublimación

Todo esto vive en `OrderItemsEditor.jsx` (usado tanto en "Nueva orden"
como al editar una orden ya creada) y está gateado por
`isSublimacion = orderTypeKey === 'sublimacion'` — **escolar e industrial
no cambian en nada**, se quedan exactamente como estaban. Puramente
frontend: `items` sigue siendo el mismo JSONB de siempre, así que no
hizo falta ninguna migración de SQL (los campos nuevos son claves más
en cada prenda del arreglo, igual que `manga`/`vivos`/etc. de V32).

**"Prenda" pasa de texto libre a opciones cerradas** (`GARMENT_OPTIONS_SUBLIMACION`
en `lib/constants.js`): Playera, Short, Chamarra, Sudadera, Pantalonera
— pedido explícito del usuario, para no tener variaciones tipo
"playera"/"Playera "/"jersey" para lo mismo.

**"Color" pasa AL REVÉS: de opciones cerradas a texto libre**, solo en
sublimación — "hay muchos tonos diferentes". Los demás tipos de orden
siguen con el `<select>` de `GARMENT_COLORS` de siempre.

**Cuello y manga solo para las 3 prendas "de arriba"** (Playera, Chamarra,
Sudadera — `GARMENT_TOP_KEYS_SUBLIMACION`); Short y Pantalonera no los
piden. Tela, vivos, puños, logotipos y números se siguen pidiendo para
las 5 por igual (sin cambio ahí). Layout: cuello/manga en su propia fila
condicional arriba de una fila de 4 columnas (nueva clase `.form-row-4`)
con vivos/puños/logotipos/números.

**Roster de nombres y números (nuevo)**: botón "+ Agregar nombres y
números" para Playera/Chamarra/Sudadera, "+ Agregar número" (sin nombre)
para Short — ninguno para Pantalonera. Mismo patrón que "¿Lleva
bordado?" (un toggle que no borra el dato al desactivarse). Cada prenda
gana `tiene_roster: boolean` + `roster: [{talla, nombre, numero}]`. La
tabla es de 3 columnas (2 para short, sin "Nombre") y el selector de
**talla se llena solo con las tallas que ya se agregaron** en "Tallas y
cantidades" de esa misma prenda — pedido explícito del usuario ("para
asegurarnos de que esté bien"), así no se puede escribir a mano una
talla que no coincide con nada.

**Verificación hecha — funcional, no solo visual**: se montó
`OrderItemsEditor` de verdad (con React real, sin mockear el DOM) en una
página de depuración temporal (`main.jsx` apuntando directo al
componente, sin pasar por login/rutas) para poder darle clic/escribir
como un usuario real. Se probó: seleccionar cada prenda de sublimación y
confirmar que cuello/manga y el botón de roster aparecen/desaparecen
según toca; agregar una talla, activar el roster y confirmar que esa
talla ya aparece en su selector; llenar nombre+número y agregar una fila
más; cambiar a "Short" y confirmar que la columna "Nombre" desaparece
sin perder el dato ya cargado; cambiar a "Pantalonera" y confirmar que
no hay ningún botón de roster; cambiar el tipo de orden a "escolar" y
confirmar que Prenda vuelve a texto libre, Color vuelve al `<select>`
cerrado, y cuello/manga se muestran siempre (sin botón de roster). Se
revisó el JSON del estado en cada paso para confirmar la forma exacta de
los datos. Al terminar se restauró `main.jsx` a su versión original y se
borró la página de depuración — no quedó nada de esto en el código.
`npm run build` limpio.

### Limpieza final de órdenes (2026-09-13) — listos para arrancar de verdad

Con V37/V38/V39 ya en producción, el usuario confirmó que ya está listo
para empezar a capturar órdenes reales de una vez por todas y pidió
borrar la única orden que quedaba (una de prueba de sublimación, folio
SUB-001, cliente "Octavio Lopez") y reiniciar la numeración de
sublimación para que la primera orden real vuelva a ser SUB-001.

Antes de borrar se confirmó que solo existía esa 1 orden en todo el
sistema (`select count(*)`) y que las 4 tablas que dependen de
`orders.id` (`order_status_history`, `orden_etapas`, `anticipos`,
`orden_bordados`) tienen `ON DELETE CASCADE` — así que un solo
`DELETE FROM orders` bastó para limpiar todo, sin dejar huérfanos. La
orden no tenía fotos de referencia (0), así que tampoco hizo falta nada
en Storage esta vez.

Aplicado en Supabase: `delete from public.orders where order_number =
'SUB-001';` + `alter sequence public.folio_seq_sublimacion restart with
1;`. Verificado después: `orders`/`order_status_history`/`orden_etapas`/
`anticipos`/`orden_bordados` en 0 filas, y `folio_seq_sublimacion` con
`last_value=1, is_called=false` — la próxima orden de sublimación que se
cree será `SUB-001`. Los folios de escolar/industrial no se tocaron (ya
estaban en 0 desde la limpieza anterior, ninguna orden nueva se había
creado en esos tipos).

### V40 — sublimación sin bordado ni "guardar como producto"

Dos botones de más en sublimación (pedido explícito del usuario, ambos
gateados por el mismo `isSublimacion` de V39 — escolar/industrial no
cambian):

- **"¿Lleva bordado?"** ya no aparece — "las prendas sublimadas nunca
  llevan bordado". Si alguna prenda vieja de sublimación ya tenía
  `lleva_bordado: true` el dato se queda tal cual, solo deja de poder
  tocarse desde aquí (no se fuerza a `false` ni se toca nada por SQL).
- **"Guardar como producto de [cliente]"** (en `ProductoAutocomplete.jsx`,
  nueva prop `canSaveAsProducto`, default `true`) tampoco aparece en
  sublimación. El selector de arriba ("Producto guardado de...", para
  autocompletar con un producto ya guardado) **sí se queda** — el
  usuario solo pidió quitar el botón de guardar uno nuevo, no el
  autocompletado.

Puramente frontend, sin tocar `items` ni ninguna tabla. Verificado
montando `OrderItemsEditor` real (mismo método de V39: `main.jsx`
apuntando directo al componente, con un cliente y un producto de
prueba) — confirmado que en sublimación no aparecen ninguno de los dos
botones (el selector de autocompletar sí), y que en escolar ambos
siguen exactamente igual que antes. Se restauró `main.jsx` y se borró la
página de depuración al terminar. `npm run build` limpio.

### V41 — cotización, orden de compra y anticipo desde "Nueva orden"

El usuario preguntó si esto ya existía en el sistema — sí, pero solo
desde el detalle de una orden YA creada (`OrderDocumentsCard.jsx` /
`OrderPaymentsCard.jsx`, ambas de antes de esta sesión). Pidió poder
capturarlo de una vez al crear la orden, **menos la factura** ("eso ya
hasta después").

Tanto `uploadOrderDocument` como `createAnticipo` necesitan un
`order_id` que ya exista (el documento se guarda en
`storage/<orderId>/...`, el anticipo tiene una FK not-null a `orders`),
así que no había forma de mandarlos junto con `create_order` en una sola
llamada. Se resolvió con el mismo patrón que ya usan las fotos de
referencia en `NewOrderPage.jsx`: los archivos/datos se guardan en
memoria (`cotizacionFile`, `ordenCompraFile`, `anticipoMonto` y demás)
mientras se llena el formulario, y **después** de que `createOrder`
regresa con el `id` de la orden ya creada, se suben/crean en secuencia.
Si algo de esto falla, la orden YA existe — no se cancela nada, se
manda un aviso al detalle (`documentError`/`anticipoError` en el estado
de `navigate`, mismo criterio que el `photoUploadError` que ya existía)
para reintentarlo ahí mismo con los componentes de siempre.

Validación antes de crear la orden (no después): si se puso un monto de
anticipo, "Quién lo recibió" se vuelve obligatorio — mismo criterio que
ya tenía `OrderPaymentsCard.jsx`. La factura no tiene ningún campo aquí
a propósito, ni siquiera para admin_general — solo se sigue subiendo
desde el detalle.

Sin cambios de permisos: quien ya puede crear una orden (ventas/
admin_tienda/admin_general) ya podía subir cotización/orden de compra
(mientras la orden siga en_confirmacion, que es justo el estado en el
que nace) y registrar un anticipo — ver `canEditOrderDocument`/
`OrderPaymentsCard.canRegister` en el código, sin tocar.

**Verificación hecha**: `npm run build` limpio; la sección nueva se
probó aparte (mismo método de depuración temporal que V39/V40) — escribir
un monto de anticipo revela "Quién lo recibió"/"Notas" y borrarlo los
vuelve a ocultar; los botones de subir PDF reusan el mismo patrón
`<input type="file" hidden>` que ya funciona en producción en
`OrderDocumentsCard.jsx` y en el upload de OCR de esta misma página. No
se probó con datos reales de principio a fin (crear una orden de
verdad con cotización+orden de compra+anticipo en el mismo alta) por no
poder iniciar sesión — pendiente de que el usuario lo confirme.

### V42 — bug de teléfono/correo, borrador persistente, varios folios, constancia fiscal, total/restante

Cinco pedidos del usuario en un solo mensaje.

**1) Bug encontrado y corregido: el teléfono/correo no se guardaba al
crear un cliente nuevo.** La causa: `ClienteSelect.jsx` (el "+ Cliente
nuevo" de Nueva Orden) llamaba `createCliente(trimmed)` — SOLO el
nombre. Los campos "Teléfono del cliente"/"Correo del cliente" viven más
abajo en `NewOrderPage.jsx`, separados del botón "Guardar cliente" de
`ClienteSelect`, así que era fácil terminar el alta sin llegar a
llenarlos. Ahora `ClienteSelect` captura teléfono/correo en su propia
mini-forma (Nombre → Teléfono → Correo → "Guardar cliente" hasta abajo,
pedido explícito del usuario) y los manda junto con el nombre. De paso,
`onChange` ahora manda también teléfono/correo (4 argumentos en vez de
2) hacia `NewOrderPage.jsx`, cerrando una condición de carrera que
existía antes (buscar el cliente recién creado en la lista de
`clientes`, que no siempre había alcanzado a refrescarse).

**2) El progreso de "Nueva orden" ya no se pierde al cambiar de pestaña
o de app.** En escritorio cambiar de pestaña nunca borraba nada (React
sigue vivo); el caso real es celular, donde el sistema puede descargar
la pestaña en segundo plano para liberar memoria y, al volver, el
navegador la recarga desde cero. Solución: `NewOrderPage.jsx` guarda un
borrador en `localStorage` (`salper:nueva-orden:draft:v1`) en cada
cambio y lo recupera al entrar — sobrevive tanto a un cambio de pestaña
normal como a una recarga completa. Aparece un aviso arriba del
formulario ("Se recuperó un borrador...") con un botón para descartarlo
y empezar de cero. **Limitación real, no de esta implementación**: los
ARCHIVOS (fotos, PDFs de cotización/orden de compra) no se pueden
guardar en localStorage — un `File` no es serializable — así que esos sí
se pierden si de verdad hay una recarga completa; todo lo demás
(cliente, tipo, fechas, prendas, tallas, roster, folios, anticipo, total)
sí se recupera. El borrador se borra solo al crear la orden con éxito.

**3) Una orden puede llevar varios folios externos.** Antes
`orders.folio_externo` era un solo `text`; un cliente a veces pedía
cosas distintas que en su control anterior (antes de SALPER) quedaron en
VARIAS órdenes de taller separadas. Se reemplazó por
`orders.folios_externos text[]` — las 2 órdenes reales que ya existían
(SUB-001 "ORD3148", SUB-002 "ORD3155") se migraron automáticamente antes
de dejar de usar la columna vieja (que se queda en la tabla, sin usarse,
por si algún día hace falta consultarla). Nuevo componente
`FoliosExternosField.jsx` (mismo "ORD" fijo + 4 dígitos de
`FolioExternoField` de V37, pero ahora junta varios en una lista de
chips con botón de quitar) — reemplaza a `FolioExternoField.jsx`
(borrado, ya sin uso) en `NewOrderPage.jsx` y `OrderDetailsCard.jsx`. La
búsqueda del Dashboard/Órdenes pasadas ahora revisa todos los folios del
arreglo, no solo uno.

**4) Constancia de situación fiscal — es del CLIENTE, no de la orden.**
Un cliente casi siempre pide varias veces y su constancia no cambia
entre pedidos, así que se guarda en `clientes.constancia_fiscal_path`
(no en `orders`) — pero se sube/ve desde el detalle de la orden
(`OrderDocumentsCard.jsx`, cuarta fila) porque es justo ahí donde se
prepara la factura. Mismo bucket privado que cotización/orden de
compra/factura (`orden-documentos`), con su propio prefijo de ruta
(`clientes/<id>/...`) — la policy de ese bucket ya es por `bucket_id`,
no por ruta, así que no hizo falta ninguna policy nueva. Solo aparece si
la orden tiene un cliente del catálogo (`order.client_id`); si la orden
tiene cliente de texto libre, no hay dónde guardarla y la fila no
aparece. Nueva función `set_cliente_constancia_fiscal` y permiso
`canManageClienteDocuments` (ventas/contabilidad/admin_tienda/
admin_general — mismo criterio "tienda" que el resto de documentos).

**5) Total de la orden + Restante, automático.** Nuevo campo opcional
`orders.total_orden` (numeric) — capturable desde "Nueva orden" o
editable después desde `OrderPaymentsCard.jsx` (tarjeta de Anticipos,
donde ya vivía "Recibido"). "Restante" = total - anticipos recibidos,
**calculado en el frontend, nunca guardado** — así nunca se puede
desincronizar si se borra o corrige un anticipo. Rojo si falta pagar,
verde si ya está cubierto o de más. Función nueva `set_order_total`,
**aparte** de `update_order_details` a propósito: cambiar el total no
dispara `pending_reconfirmation_at` (V38) — no es algo que fábrica
necesite reconfirmar, es un dato de tienda/contabilidad.

**SQL — todo en `schema_v42_folios_multiples_total_constancia.sql`**:
`create_order` gana `p_folios_externos`/`p_total_orden` (con su `DROP
FUNCTION` + `REVOKE`/`GRANT`, gotcha de siempre); `update_order_details`
**sí cambió de firma esta vez** (a diferencia de V38) por el cambio de
`folio_externo` a `folios_externos`, así que también lleva su `DROP
FUNCTION`. `set_order_total` y `set_cliente_constancia_fiscal` son
funciones nuevas, no necesitaron `DROP`.

**Verificación hecha**: migración aplicada y verificada en Supabase —
las 2 órdenes reales migraron su folio correctamente a
`folios_externos`, las 4 funciones quedaron en 1 sola versión cada una
(sin overloads viejos) y con `authenticated`=true/`anon`=false. `npm run
build` limpio. Se probó el bug fix y `FoliosExternosField` montando los
componentes reales con datos de prueba (agregar/quitar folios, elegir
cliente existente con y sin contacto guardado, abrir "+ Cliente nuevo" y
confirmar el orden Nombre→Teléfono→Correo→Guardar). El total/restante y
la fila de constancia fiscal en `OrderDocumentsCard`/`OrderPaymentsCard`
se verificaron con un smoke-test visual de las clases reales (no se pudo
probar con datos reales end-to-end por no poder iniciar sesión) — la
lógica de `restante` y los permisos se revisaron a mano con cuidado.
El borrador de localStorage se implementó siguiendo el mismo patrón que
ya usan las fotos/documentos (guardar solo lo serializable) — no se
pudo probar la recuperación tras una recarga real dentro de esta sesión
por la misma razón (necesita sesión real para que `NewOrderPage` cargue
sus datos), pendiente de que el usuario lo confirme cambiando de pestaña
o recargando a la mitad de una captura.

### V43 — "Otro…" en Color (escolar/industrial)

Solo aplica al `<select>` cerrado de Color en `OrderItemsEditor.jsx`
(escolar/industrial — sublimación ya es texto libre desde V39, no
cambia). La lista de `GARMENT_COLORS` no siempre alcanza; ahora tiene
una opción más, "Otro…", que revela un input de texto libre debajo del
select para escribir el color exacto.

El detalle técnico: no basta con mirar `item.color` para saber "está en
modo Otro" — en cuanto se elige "Otro…" el color se vacía (`''`) para
que empiecen a escribir, y una cadena vacía es indistinguible de "no se
ha elegido nada todavía" (el estado inicial). Por eso hay un `Set` aparte
(`otroColorIds`, por `item.id`) que recuerda qué prendas están en ese
modo — puramente de presentación, `item.color` sigue siendo el único
dato que se guarda. Si una prenda YA trae un color que no está en la
lista (una orden vieja, o si cambia de tipo de orden), se detecta sola
sin necesidad de estar en el set. Volver a elegir un color de la lista
(en vez de escribir) sale del modo Otro y esconde el input de nuevo.

**Verificación hecha**: montando el componente real con datos de
prueba — seleccionar "Otro…" revela el input vacío; escribir un color
("Turquesa fosforescente") lo guarda tal cual en `item.color`; volver a
elegir un color de la lista ("Rojo") esconde el input y reemplaza el
valor correctamente. `npm run build` limpio.

### V44 — la causa real de "se borra el progreso al cambiar de pestaña"

El usuario reportó que, incluso después de V42 (borrador en
localStorage), seguía perdiendo cosas al cambiar de pestaña — "no se
guarda todo". Investigando se encontró que el borrador de V42 nunca era
el problema real: **la app entera se estaba desmontando y volviendo a
montar cada vez que la pestaña recuperaba el foco**, sin que hiciera
falta ninguna recarga de página.

**La causa**: `AuthContext.jsx` ponía `loading = true` en CUALQUIER
evento de `supabase.auth.onAuthStateChange` — incluido `'TOKEN_REFRESHED'`,
que Supabase dispara solo (autoRefreshToken) al recuperar la
visibilidad de la pestaña/app, revisando si el token sigue vigente, sin
que el usuario haga nada. `App.jsx` (`AuthGate`) muestra `<Loading/>`
en vez de `<HashRouter><AppLayout><Routes>...` mientras `loading` es
true — así que CADA VEZ que alguien volvía a la pestaña, toda la app
(incluida "Nueva orden") se desmontaba y volvía a montar solo por eso.
El borrador de localStorage (V42) sí recuperaba los campos de texto en
ese remount, pero **las fotos y PDFs elegidos** (`photoFiles`,
`cotizacionFile`, `ordenCompraFile` — `File`s en memoria, nunca
pudieron vivir en el borrador) se perdían siempre, en cada cambio de
pestaña, no solo en una recarga real como se pensaba en V42.

**El fix**: `onAuthStateChange` ahora solo pone `loading = true` para
una transición real de sesión (`'SIGNED_IN'`/`'SIGNED_OUT'`) — un
`'TOKEN_REFRESHED'` (o cualquier otro evento de fondo) actualiza la
sesión/el perfil sin tocar `loading`, así que ya no desmonta nada. Con
esto, el caso normal (cambiar de pestaña o de app y volver) ya NO
remonta "Nueva orden" — todo lo que había en memoria, fotos y PDFs
incluidos, se queda exactamente como estaba, sin necesitar el borrador
para nada. El borrador de V42 se queda como red de seguridad para el
caso más raro de una recarga COMPLETA de verdad (el celular mata el
proceso de la pestaña por memoria) — ahí las fotos/PDFs sí se siguen
perdiendo (un `File` no es serializable), pero ese caso ya es mucho
menos común que "simplemente cambiar de pestaña".

**Verificación hecha**: se interceptó `supabase.auth.onAuthStateChange`
en un arnés de depuración para disparar un evento `'TOKEN_REFRESHED'`
real a mano (con `AuthProvider` real, no mockeado) y confirmar que
`loading` se queda en `false` — antes del fix esto lo ponía en `true`
en cada evento; después del fix, no. `npm run build` limpio.

### V45 — categorías de cliente (escolar/industrial/sublimación) y listas filtradas por tipo de orden

Pedido: "quiero que sean diferentes listas de clientes para cada tipo de
orden. Por ejemplo, para lo escolar, que solo salga la lista de clientes
que sean colegios, también, que a la hora de agregar un cliente nuevo en
catálogos, puedan poner si es escolar, industrial, o de sublimación".

**Decisión de diseño** (confirmada con el usuario vía `AskUserQuestion`
antes de tocar schema, porque cambiaba la forma de la columna): un
cliente PUEDE tener varias categorías a la vez — ej. una fábrica
"industrial" que también pide playeras sublimadas de vez en cuando — no
es excluyente. Por eso `clientes.tipo_orden` es `text[]` (0 a 3 valores:
`'escolar'|'industrial'|'sublimacion'`, los mismos `key` ya sembrados en
`order_types` desde V5), no una sola columna de texto.

**Schema** (`schema_v45_categorias_cliente.sql`):
- `clientes.tipo_orden text[] not null default '{}'`.
- `create_cliente` gana un 4º parámetro `p_tipo_orden text[] default '{}'`
  — cambia de firma, así que se hizo `DROP FUNCTION IF EXISTS
  create_cliente(text,text,text)` antes del `CREATE OR REPLACE` (mismo
  gotcha de siempre: agregar un parámetro, aunque tenga default, cambia
  la aridad y crea un overload aparte si no se dropea primero). Sigue
  siendo "crear o reusar": si el nombre ya existe, actualiza
  teléfono/correo (si se mandan) y SOLO pisa `tipo_orden` si el arreglo
  mandado no viene vacío — para no borrarle la categoría a un cliente ya
  categorizado por accidente en un alta posterior sin categoría.
- RPC nuevo `set_cliente_tipo_orden(p_cliente_id, p_tipo_orden)` — para
  editar la categoría de un cliente que ya existe (los 3 reales de antes
  de V45 quedan con `tipo_orden = '{}'`, ver abajo). Mismo rol que
  `create_cliente` (ventas + admin_general).
- Ambas funciones validan que cada valor de `tipo_orden` esté en el
  conjunto fijo de 3 — no hay FK porque `order_types` es una tabla
  dinámica (se pueden agregar tipos custom con `create_order_type`) y
  esta categorización es explícitamente solo de estos 3.
- Verificado en vivo: `pg_proc` — 1 sola fila por función (sin overload
  viejo); `has_function_privilege('anon', ...)` = false, `authenticated`
  = true en ambas; los 3 clientes reales (Colegio Echavarría, Octavio
  Lopez, TEC MTY) siguen intactos con `tipo_orden = '{}'` después de
  aplicar la migración.

**Clientes sin categoría = visibles en todas las listas.** Un cliente con
`tipo_orden` vacío (los 3 de antes de V45, o cualquiera que se cree sin
marcar nada) aparece en el dropdown de TODOS los tipos de orden, no se
esconde en ninguna — así no se le esconde a nadie un cliente real de la
noche a la mañana. Se pueden categorizar después desde Catálogos
("Editar categoría" en cada fila de Clientes).

**Frontend**:
- `CLIENTE_TIPO_ORDEN_OPTIONS` (`lib/constants.js`) — las 3 opciones
  fijas con su label, usadas en ambos formularios de checkboxes.
- `ClienteSelect.jsx` gana una prop `orderTypeKey`: si es una de las 3
  categorías fijas, el `<select>` de clientes se filtra a los que
  incluyen esa categoría (más los sin categoría); si es un tipo de orden
  custom o todavía no se elige ninguno, se ven todos. Al crear un cliente
  nuevo desde ahí, se le preseleccionan (editable) las casillas según el
  tipo de orden actual.
- `NewOrderPage.jsx`: se reordenó el formulario para que "Tipo de orden"
  quede ANTES que "Cliente" (antes estaba al revés) — si no, elegir el
  tipo de orden después de elegir cliente no tendría ningún efecto de
  filtrado en ese momento. Se agregó un hint explicando el orden.
- `CatalogosPage.jsx`: `AddClienteForm` gana las mismas 3 casillas.
  `CatalogRow` gana un slot `extra` (contenido debajo del nombre) usado
  por el nuevo `ClienteTipoOrdenEditor` — muestra la categoría actual en
  modo lectura + botón "Editar categoría" que abre las casillas y guarda
  con `set_cliente_tipo_orden`. Solo visible para quien puede dar de alta
  clientes (mismo permiso, `canCreateCliente`).
- `clientesService.js`: `createCliente` manda `tipoOrden` como 4º
  argumento; `setClienteTipoOrden(id, tipoOrden)` nuevo.

**Verificación**: arnés de depuración con clientes mockeados (con 1, 2 y
0 categorías) confirmó el filtrado exacto por `orderTypeKey`, que un tipo
custom muestra todos, y que las casillas de "+ Cliente nuevo" se
preseleccionan y se pueden combinar. `npm run build` limpio.

### V46 — "¿Lleva bolsas?" en short sublimado

Pedido: "quiero que cuando sea un short sublimado, agregues un botón para
ver si lleva bolsas o no".

Mismo patrón exacto que "¿Lleva bordado?" (botón toggle ghost/secondary
que cambia `lleva_bolsas: true/false` en la prenda) pero al revés en su
condición: solo aparece cuando `isShort` (sublimación + prenda = Short),
en vez de "todo excepto sublimación". No hace falta migración — `items`
es JSONB sin schema fijo, así que la prenda simplemente gana una clave
más; las prendas viejas sin `lleva_bolsas` se tratan como `false` (falsy)
sin romper nada. Se agregó el default `lleva_bolsas: false` en los 3
lugares donde se construye una prenda nueva vacía (`OrderItemsEditor.jsx`,
`OrderItemsCard.jsx`, `NewOrderPage.jsx`) para que quede consistente
aunque técnicamente solo hace falta cuando se guarda.

**Verificación**: arnés de depuración con una prenda "Short" en sublimación
confirmó que el botón aparece y alterna a "✓ Lleva bolsas"; con "Playera"
(prenda de arriba) confirmó que el botón NO aparece. `npm run build` limpio.

### V47 — "¿Lleva bolsas?" se mueve junto a Prenda y se vuelve un señalamiento imposible de ignorar

El usuario vio V46 en la página y pidió dos ajustes sobre el mismo botón:
que viva junto al campo "Prenda" (en la misma fila que Prenda/Color/
Pantone, señalando exactamente esa captura de pantalla), y que sea "un
señalamiento importante de que si lleva o no" — no un botón ghost que se
puede pasar por alto.

**Ubicación**: la fila de arriba de cada prenda pasa a `form-row-4`
(4 columnas) solo cuando la prenda es Short, agregando "¿Lleva bolsas?"
como 4ª columna junto a Prenda/Color/Pantone. Para las demás prendas
sigue igual (`form-row-3` con Pantone, o `form-row` fuera de sublimación).

**El señalamiento**: se cambió el botón único (ghost/secondary,
"¿Lleva bolsas?" → "✓ Lleva bolsas") por un selector segmentado de dos
mitades, "Sí lleva" / "Sin bolsas", donde **una de las dos SIEMPRE está
pintada** (negro+ámbar para "Sí", naranja fuerte con texto blanco para
"Sin bolsas") — nunca se ve como un campo vacío o neutro, así que el
estado se lee de un vistazo y no se puede dejar sin contestar por
accidente (arranca en "Sin bolsas" por default, que es el valor
`lleva_bolsas: false` de siempre). CSS nuevo: `.bolsas-toggle` /
`.bolsas-toggle__btn` (+ modificadores `--si`/`--no`) en `styles/index.css`.
No se tocó ámbar/negro para "Sí" (reutiliza la paleta de botón primario) y
se usó naranja fuerte para "No" en vez de rojo — el rojo/verde de la
identidad visual se guardan exclusivamente para vencida/completado, no
para esto.

**Verificación**: arnés de depuración a 1000px de ancho (para ver las 4
columnas reales, no la versión de celular en 1 columna) confirmó la
posición junto a Prenda/Color/Pantone y que ambos estados se pintan
correctamente al alternar. `npm run build` limpio.

### V48 — detalle de orden compacto: resumen de prendas, "Cantidad surtida" solo para terminado, foto arriba

Queja del usuario: una orden ya creada se veía "con demasiada información",
"muy feo" — específicamente señaló dos cosas: (1) las prendas se veían
siempre como el formulario completo de captura (todos los inputs de
tela/cuello/manga/vivos/puños/logotipos/números/roster, editable o no) en
vez de un resumen; (2) "Cantidad surtida" (comparación pedido vs.
realmente surtido, por talla) es ruido para cualquiera que no sea
terminado y no debería ni verse fuera de ese rol. Después, mid-turno,
agregó que la foto de referencia se pierde hasta abajo de la página y
debería estar arriba.

**Prendas — resumen por default + "Editar"** (`OrderItemsCard.jsx`,
reescrito): antes `OrderItemsEditor` vivía SIEMPRE montado (con un
`<fieldset disabled>` si el rol no podía tocarlo — visualmente igual de
extenso para todos). Ahora por default se ve un resumen de solo lectura
por prenda (mismo patrón dt/dd que `OrderDetailsCard`: Prenda · Color,
Tela, Pantone, Cuello/Manga/Vivos/Puños/Logotipos/Números si tienen
valor, Tallas y cantidades en una sola línea, y una fila de "Notas" con
Lleva bordado/Lleva bolsas/cantidad de registros del roster si aplica) +
un total de piezas al final. El botón "Editar" (mismo criterio de
siempre, `canEditOrder` — tienda mientras la orden sigue en
`en_confirmacion`, admin_tienda/admin_general siempre) revela el
`OrderItemsEditor` completo tal cual existía, con "Cancelar"/"Guardar
cambios de prendas" — quien no puede editar ya ni ve el botón. "Guardar
esta orden como plantilla" se movió adentro del modo edición (antes vivía
siempre visible arriba del formulario).

**"Cantidad surtida" — visibilidad, no solo edición, restringida a
terminado**: antes se mostraba a cualquier usuario con sesión (`user &&
order.items?.length > 0`), y el candado (`canManageSurtido`: terminado +
admin_fabrica/admin_general) solo bloqueaba poder EDITAR las cantidades,
no verlas. Ahora `OrderDetailPage.jsx` ni monta la sección completa a
menos que `canManageSurtido(role)` — el resto de los roles no sabe que
existe, exactamente como pidió el usuario.

**Foto de referencia arriba**: `PhotoGallery` se movió de hasta abajo
(después de "Historial de estados") a justo después de "Detalles", como
la 2ª tarjeta de la página — ya no se pierde entre Documentos/Pagos/
Prendas/Etapas.

**Verificación**: arnés de depuración con una réplica exacta del JSX del
resumen (2 prendas con distintos campos llenos) confirmó que se ve
compacto y que el total suma bien. `npm run build` limpio.

### V49 — sin recuadros vacíos, "Etapas" solo para fábrica, resumen de dinero unificado

El usuario mandó capturas de la vista de detalle de orden viendo como
ventas (rol "Alfredo Ventas") y se quejó de 3 cosas puntuales, todas bajo
el mismo pedido de "que se vea mucho más limpio para todos menos los
admin":

1. **Recuadro vacío feo**: la tarjeta que envuelve `StatusChanger` +
   `EstimatedDaysCard` se montaba para cualquier usuario con sesión, pero
   AMBOS componentes ya regresaban `null` internamente si el rol no tenía
   nada que hacer ahí (ventas no cambia estados ni captura días
   estimados) — el resultado era una tarjeta blanca completamente vacía.
   Arreglado gateando la sección completa en `OrderDetailPage.jsx` con
   `canChangeStatus(role) || canSetEstimatedDays(role, order)` — si
   ninguno de los dos aplica, la sección ni se monta. admin_general/
   admin_fabrica siempre tienen algo que mostrar ahí, así que a ellos
   nunca les afectaba este bug.

2. **"Etapas de producción" quitada para tienda/lectura**: nuevo
   `canViewEtapas(role)` en `permissions.js` — cuidado importante: NO se
   limitó a "solo admin" como pidió el usuario literalmente, porque
   corte/bordado/sublimado/producción/terminado usan esa tarjeta como su
   herramienta real para avanzar su propia etapa (no es solo informativa
   para ellos, como sí lo es para ventas). Se quedó visible para los 5
   roles de etapa + admin_fabrica + admin_general, y se ocultó solo para
   el lado de tienda (ventas/contabilidad/admin_tienda/tienda) y
   'lectura' — para esos roles sí es puro duplicado de lo que ya muestra
   el `StatusStepper` de arriba.

3. **"Anticipos" → "Pagos", con Total/Recibido/Restante juntos**:
   `OrderPaymentsCard.jsx` mezclaba el total (dentro de una lista de
   "documentos") con "Restante" (que ni aparecía si no había total
   capturado) — pedido explícito: una sola franja con los 3 valores
   siempre visibles (usa "—" solo cuando de verdad no hay dato, "Anticipo
   recibido" siempre muestra un monto real aunque sea $0.00). CSS nuevo
   `.payments-summary`/`.payments-summary__stat` (3 columnas con
   separador, mismo lenguaje visual que `.bolsas-toggle` de V47) — el
   botón "Editar" del total vive dentro de su propia columna. La lista de
   anticipos y el botón "+ Registrar anticipo" se quedan abajo, sin
   cambios de lógica ni de permisos (canRegister/canDelete/canEditTotal
   iguales).

**Verificación**: arnés de depuración replicando `.payments-summary` en
3 escenarios (sin total, con restante pendiente, liquidado) confirmó los
colores y el formato de cada celda. `npm run build` limpio.

### V50 — texto amontonado en Pagos, "T." antes de cada talla, lista de nombres/números en el resumen

Tres pedidos sobre lo recién entregado en V48/V49:

1. **Bug visual en "Pagos"**: "Anticipos registrados" y "Todavía no se ha
   recibido ningún anticipo." se veían encimados. Causa: ese segundo
   texto usaba la clase `page-subtitle`, que trae `margin-top: -20px` —
   pensada para ir pegada justo debajo de un `<h2>` de página, no como
   texto suelto en medio de una tarjeta. Cambiado a `pantone-hint` (mismo
   tono muted, sin margen negativo).

2. **"T." antes de cada talla**: en el resumen de prendas, "Tallas y
   cantidades" mostraba `6: 4` — el usuario reportó que se confundía cuál
   era la talla y cuál la cantidad. Ahora dice `T.6: 4`. Se aplicó el
   mismo prefijo al roster de nombres/números (`OrderItemsCard.jsx`, ver
   punto 3) porque ahí también se mezcla la talla con el número de la
   playera — mismo problema, mismo arreglo, aunque no se pidió
   explícito para esa parte.

3. **Lista real de nombres/números en el resumen**: antes el resumen solo
   decía "Lista de N registros (nombres/números)"; ahora se ve la lista
   completa (una línea por registro: `T.<talla> — <nombre> — #<número>`,
   o sin nombre para short). Solo aplica de facto a sublimación, que es
   la única que llena `tiene_roster`/`roster` (ver V39).

**Verificación**: arnés de depuración con una réplica exacta de ambos
componentes confirmó que ya no hay texto encimado en Pagos y que el
resumen de prendas muestra "T.10: 6 · T.12: 4 · T.CH: 1" y la lista de
nombres/números línea por línea. `npm run build` limpio.

### V51 — Notas internas (nunca visibles para el cliente)

Pedido: "quiero que se puedan agregar notas a las órdenes, pero que eso
solo sea algo interno, que no se vea reflejado en la orden del cliente".

**Schema** (`schema_v51_notas_internas.sql`): `orders.notas_internas
text` nullable, sin relación con `description` (esa SÍ sale en ambos
PDFs — es la descripción del pedido en sí). RPC nuevo
`set_order_notas_internas(p_order_id, p_notas)`, aparte de
`update_order_details` a propósito (mismo criterio que `set_order_total`
en V42: no dispara `pending_reconfirmation_at`, no es algo que fábrica
necesite reconfirmar).

**Por qué nunca puede aparecer en el PDF del cliente**: no es un
permiso ni un `if` que se pueda desactivar por error — `generateOrderPdf.jsx`
y `OrderConfirmationPdf.jsx` simplemente NO referencian `notas_internas`
en ningún lado. Para que apareciera ahí, alguien tendría que agregarlo a
mano en esos archivos.

**Permiso deliberadamente amplio** (`canManageOrderNotes` en
`permissions.js`): cualquier rol con sesión menos `lectura` puede
escribir una nota — se trató como bitácora de comunicación entre áreas
(ej. "cliente pidió que se apure", "cliente conflictivo"), no como un
dato de la orden que necesite el mismo candado que `canEditOrder`.
`lectura` sigue pudiendo LEER las notas (ve todo el sistema), solo no
escribe — mismo criterio que el resto de sus restricciones.

**Nota de seguridad ya existente, documentada de nuevo aquí para que no
se pierda**: `anon` tiene `SELECT` de tabla completa sobre `orders`
desde V10 (modo invitado) — igual que `total_orden`, esta columna
técnicamente viaja en la respuesta cruda de la API para un invitado,
aunque la UI nunca la muestre sin sesión (gateado por `{user && ...}`
en `OrderDetailPage.jsx`, mismo patrón que Documentos/Pagos). No es una
debilidad nueva de esta migración, es el modelo de protección que ya
tenía este proyecto para datos de oficina — si se necesita blindar a
nivel de columna más adelante, es un cambio aparte.

**Frontend**: `OrderNotesCard.jsx` (nuevo) — mismo patrón resumen+Editar
que `OrderDetailsCard`/`OrderItemsCard`: texto de solo lectura por
default con un aviso fijo ("Esto no lo ve el cliente..."), botón
"+ Agregar nota"/"Editar" (según haya o no nota ya) que abre un
textarea. Montada en `OrderDetailPage.jsx` justo después de "Detalles",
visible para cualquiera con sesión.

**Verificación**: arnés de depuración con dos roles (ventas editable,
lectura de solo lectura) confirmó el flujo completo de crear/editar la
nota y que el botón no aparece para lectura. Aplicado en Supabase y
verificado en vivo: 1 sola fila en `pg_proc`, `anon`=false/
`authenticated`=true. `npm run build` limpio.

### V52 — arrastrar y soltar (drag-and-drop) en todos los campos de foto/PDF

Pedido: "quiero que se puedan arrastrar pdf o fotos a los campos que
aceptan fotos o pdf, que no se tenga que subir desde el ordenador
forzosamente".

**Primitivas nuevas** (sin backend, puro frontend):
- `hooks/useFileDrop.js` — hook genérico: da `dragActive` (bool) +
  `dropHandlers` (onDragOver/onDragEnter/onDragLeave/onDrop) para
  pegarle a cualquier elemento envolvente; `onDrop` llama `onFiles(File[])`
  con los archivos soltados, mismo formato que `Array.from(e.target.files)`.
- `components/common/FileDropLabel.jsx` — reemplaza el patrón repetido
  `<label>...<input type="file" hidden/>...</label>` que ya existía en
  varios lados: mismo click-para-elegir de siempre, más los manejadores
  de arrastre ya integrados. Solo cambia la firma de "qué pasa cuando
  hay archivos": antes `onChange={(e) => ...}`, ahora
  `onFiles={(files) => ...}`.
- CSS `.dropzone--active` (outline punteado ámbar + fondo naranja suave,
  se resalta mientras se arrastra un archivo encima) y `.dropzone-inline`
  (envoltorio mínimo para los 2 casos que usan un `<input type="file">`
  nativo visible en vez de un label estilizado).

**Aplicado en los 9 lugares de la app donde se sube foto o PDF**:
`PhotoPicker.jsx` (fotos al crear una orden), `PhotoGallery.jsx` (fotos
de una orden ya creada), `OrderDocumentsCard.jsx` (cotización/orden de
compra/factura + constancia fiscal del cliente — 2 puntos), `NewOrderPage.jsx`
(subir foto/PDF y prellenar con OCR, cotización, orden de compra — 3
puntos), `NewPedidoTiendaPage.jsx` (OCR de pedido a proveedor),
`PendingItemForm.jsx` (foto de una reparación), `CatalogosPage.jsx`
(foto de producto) y `OrderBordadosCard.jsx` (foto de bordado, input
nativo). En los 2 últimos, que usaban un input nativo visible en vez de
un label estilizado, se conservó el input tal cual y solo se envolvió en
un `<span className="dropzone-inline">` para el resaltado.

**Alcance del "campo" que acepta el drop**: el área que resalta y recibe
el archivo es el propio botón/label de "+ Subir…" (no toda la tarjeta) —
sigue siendo mucho más cómodo que forzar el explorador de archivos, pero
no es un dropzone de tarjeta completa.

**Verificación**: arnés de depuración disparando eventos
`dragenter`/`drop` sintéticos con un `DataTransfer` real (sin poder
arrastrar un archivo real del sistema operativo dentro de este entorno)
confirmó: la clase `dropzone--active` aparece al entrar el arrastre y
desaparece al salir, y el archivo soltado llega a `onFiles` igual que
si viniera del selector nativo. `npm run build` limpio.

### V53 — "Ver como": admin_general simula la vista de cualquier otro rol

Pedido: "quiero que yo como admin general, pueda cambiar mi vista de la
página... que mi cuenta se pueda convertir en el tipo de cuenta que yo
quiera con un click".

**Qué es y qué NO es**: es una simulación de PANTALLA únicamente — nunca
un cambio de permisos real. `AuthContext.jsx` ahora distingue `trueRole`
(el rol real del perfil en la base de datos) de `role` (el que ve el
resto de la app — `viewAsRole` si está activo, si no, igual a
`trueRole`). Como absolutamente TODO en el frontend (nav, botones
"Editar", tarjetas visibles/ocultas, `RequireRole` en páginas enteras)
ya leía `role` desde `useAuth()`, con solo cambiar qué valor devuelve ese
`role` la simulación se propaga sola a cada rincón de la app sin tocar
ningún otro archivo. Los RPC de Supabase, en cambio, NUNCA se tocaron —
siguen validando `current_user_role()` del lado del servidor con el rol
real de la sesión, así que esto no otorga ni quita ningún permiso de
verdad: si el admin "ve como ventas" simplemente no aparecen los botones
que ventas no vería, pero en el fondo la cuenta sigue siendo
admin_general con sus permisos reales intactos. Esto se le explicó al
usuario para que quede claro que no es un sandbox de seguridad — para
probar un candado real sigue haciendo falta una cuenta de verdad con ese
rol.

**Dónde vive el control**: `AppLayout.jsx`, pie del menú lateral —
selector "Ver como" con las 11 opciones (todos los roles menos
admin_general, que es "mi vista"), visible SOLO si `trueRole ===
'admin_general'` (nunca según el rol simulado — si no, alguien podría
quedarse "atorado" viendo como otro rol sin forma de regresar). Mientras
hay una vista simulada activa, aparece una franja fija arriba del
contenido ("Viendo como: X — Volver a mi vista") para que nunca se le
olvide que está en modo simulación.

**Persistencia**: se guarda en `localStorage` (sobrevive un refresh
mientras se prueba) y se borra automáticamente al cerrar sesión — para
que no se le quede pegada a otra cuenta que entre después en el mismo
navegador. También se limpia sola si por alguna razón `trueRole` deja de
ser `admin_general`.

**Verificación**: arnés de depuración con el selector + banner (mismos
componentes/CSS) confirmó el flujo completo: elegir un rol cambia el
"role efectivo" al instante, aparece la franja, y "Volver a mi vista"
regresa todo a admin_general. `npm run build` limpio.

### V54 — Calendario rediseñado: vista de mes común, con margen de seguridad

Pedido: "quiero cambiar el calendario, quiero que sea algo así, como un
calendario común, que tenga todas las órdenes ahí, con fechas de
entrega, que cada orden ocupe los días hábiles que va a tomar en el
calendario... si en la fábrica dice que va a tomar 5 días, tu ponla en 7
u 8 días para que esté sobrado". El usuario mandó una captura de un
calendario de pared normal (Dom-Sáb, casillas por día) como referencia
visual.

**Antes**: `ProductionCalendar.jsx` era una tabla tipo Gantt — filas por
orden, columnas por semana (8 semanas fijas hacia adelante). El usuario
lo quería "completamente diferente".

**Aclarado con el usuario antes de tocar código** (2 preguntas, porque
cambiaban el resultado visual y no había forma segura de adivinarlas):
- Días hábiles para la fábrica: **lunes a viernes** (no sábado).
- Regla de margen: sus dos ejemplos (2 días de fábrica → se ve como 5;
  5 días → se ve como "7 u 8") calzan exacto con sumar siempre **+3 días
  hábiles** al estimado — confirmado como la regla a usar.

**`MonthCalendar.jsx`** (nuevo, reemplaza `ProductionCalendar.jsx`):
vista de mes real con navegación (← mes anterior / Hoy / mes siguiente
→), encabezado Dom-Sáb, y una cuadrícula de días (los del mes actual en
blanco, los de meses vecinos en gris, hoy con un círculo ámbar). Cada
orden aparece como un chip de color en cada día de su ventana — mismo
color por estado que ya usaba el calendario viejo (`getStatus`/
`STATUSES`) y la misma leyenda de abajo. Clic en un chip navega al
detalle de la orden.

**`computeCalendarWindow`** (nuevo en `utils/dates.js`, aparte de
`computeProductionWindow` que sigue igual — esa es la que muestra el
estimado REAL sin inflar en "Ventana de producción estimada" del detalle
de la orden, no se toca): `totalDays = estimated_production_days + 3`;
el inicio se cuenta con `subBusinessDays` de date-fns (lunes a viernes,
salta sábado/domingo solo al CONTAR los días hacia atrás) — la barra en
sí se pinta continua en el calendario, fines de semana de por medio
incluidos, solo el conteo del margen salta findes de semana. Verificado
con los dos ejemplos exactos del usuario: 2 días de fábrica con entrega
viernes → aparece lunes a viernes de esa misma semana (5 días); 5 días
de fábrica con entrega viernes → aparece desde el miércoles de la semana
anterior (8 días hábiles reales, con el fin de semana de por medio
pintado también).

**Limpieza**: se borraron `buildWeekColumns`, `rangesOverlap` y
`CALENDAR_WEEKS_AHEAD` (quedaron huérfanos, solo los usaba el calendario
viejo) — `isWithinRange` (ya existía sin usarse) ahora sí tiene un uso
real.

**Verificación**: arnés de depuración con los 2 ejemplos exactos del
usuario confirmó el conteo día por día, navegación de mes y botón "Hoy".
`npm run build` limpio.

### V55 — el calendario detecta demanda alta ("días saturados")

Pregunta del usuario: "¿hay alguna manera de que la página detecte
cuando hay muchas órdenes, mucha demanda, y que ajuste el calendario
acorde a eso?".

**Aclarado con el usuario antes de construir nada** (2 preguntas, porque
cambiaban qué se construye): quería AMBAS cosas — (a) marcar
visualmente los días saturados en el calendario, y (b) avisar al elegir
la fecha de entrega en "Nueva orden" si esa fecha ya está saturada — y
el umbral de "saturado" debía ser **relativo** a la propia carga
reciente del taller, no un número fijo que alguien tuviera que mantener
actualizado.

**`utils/demand.js`** (nuevo): `buildDemandMap(orders)` cuenta, para
cada día, cuántas órdenes tienen ese día dentro de su "ventana de
calendario" (la de V54, ya con el margen de +3 días hábiles incluido) —
y calcula un umbral de saturación como **1.5× el promedio de carga de
los días que sí tienen algo programado**, con un piso de 3 (para que un
taller con muy pocas órdenes encimadas no marque como "saturado" un día
con solo 1 o 2). Se auto-ajusta solo: si el taller en general trae más
volumen, el umbral relativo sube solo, sin tocar código.

**En el calendario** (`MonthCalendar.jsx`): los días que llegan o pasan
el umbral se resaltan con un borde/fondo naranja (nunca rojo — ese queda
exclusivo de "vencida", regla de identidad visual de siempre) y una
etiqueta "⚠ N" con el conteo exacto; nueva línea en la leyenda
explicando qué significa. El umbral se calcula sobre TODAS las órdenes
visibles (no solo el mes que se está viendo), para que no cambie de
significado con solo cambiar de mes.

**En "Nueva orden"** (`NewOrderPage.jsx`): al elegir la fecha de entrega,
si ese día YA está saturado (antes de contar la orden que se está
creando), aparece un aviso naranja debajo del campo — "Esta fecha ya
tiene N órdenes en producción encimadas... considera platicar con el
cliente para correr la fecha". Es solo un aviso, no bloquea crear la
orden.

**Verificación**: arnés de depuración con 5 órdenes entregando el mismo
día (más varias sueltas para no inflar el promedio general) confirmó
que el calendario resalta exactamente ese periodo con el conteo correcto
(⚠3 a ⚠6 según el día) y deja sin marcar los días con 1 sola orden;
además se verificó `buildDemandMap`/`getLoadForDate`/`isSaturated`
directo en consola con el mismo set de datos, mismo resultado. `npm run
build` limpio.

### V56 — la saturación ahora también se mide en prendas, no solo en órdenes

Corrección del usuario sobre V55: "no solo quiero que lo haga por la
cantidad de órdenes, si no por la cantidad de prendas en cada orden...
si hay una orden de 2000 prendas, es más trabajo que 10 órdenes de 10
prendas cada una, entonces quiero que te bases en las dos cosas".

**`utils/demand.js` reescrito**: ahora `buildDemandMap` cuenta, para
cada día, tanto órdenes encimadas como PRENDAS encimadas (suma de
`sizes.cantidad` de todos los items de cada orden — nueva
`getOrderPieceCount`). Se calculan DOS umbrales relativos por separado
(mismo criterio de siempre: 1.5x el promedio, nunca un número fijo):
- Órdenes: igual que V55 (piso de 3).
- Prendas: piso = 3 × el tamaño promedio real de una orden en este
  taller (no un número inventado — sale de los propios datos, mismo
  espíritu que el piso de 3 órdenes).

Un día se marca saturado si CUALQUIERA de los dos umbrales se alcanza —
así una sola orden gigante satura por prendas aunque sea la única orden
ese día (el caso exacto que señaló el usuario), y muchas órdenes
chiquitas siguen saturando por cantidad aunque cada una traiga pocas
piezas.

**Frontend**: el badge del calendario (`MonthCalendar.jsx`) ahora
muestra el número de prendas cuando hay datos capturados (ej. "⚠ 2,000
pz" en vez de solo "⚠ 1"), con el conteo de órdenes en el tooltip; si
una orden todavía no tiene prendas capturadas, cae de vuelta a mostrar
el conteo de órdenes. La leyenda y el aviso de "Nueva orden" explican
ambos umbrales.

**Verificación**: arnés de depuración replicando el ejemplo exacto del
usuario (una orden de 2,000 prendas sola un día vs. 10 órdenes de 10
prendas cada una en otro día) confirmó que AMBOS escenarios se marcan
como saturados — el primero por prendas, el segundo por cantidad de
órdenes. `npm run build` limpio.

### V57 — Módulo "Pedidos Colegio" (BETA, oculto, solo admin_general)

Prompt del usuario: control de "Pedidos Colegio" — ventas de uniformes
escolares levantadas en campo que hoy viven en papel + Microsip, sin
visibilidad de qué falta surtir. Esta beta cubre alta de colegios, pedidos
con sus prendas, folio por colegio, anticipo, abonos posteriores y recibo
en PDF. **Módulo nuevo y aislado**: no toca `orders`, `orden_etapas` ni
ningún flujo de producción.

**Diferencias entre el prompt y el proyecto real (resueltas antes de
construir; el esquema se confirmó con el usuario antes de aplicarse):**
- El prompt pedía construir en la rama `fase-2` — estaba **59 commits
  atrás de `main`** (ya fusionada, ver la sección más abajo). El usuario
  eligió construir **directo en `main`** (el módulo queda oculto para todo
  rol menos admin_general, así que no afecta V1).
- `super_admin` = `admin_general` (mismo criterio que ya se documentó en
  V22). `creado_por`/`registrado_por` apuntan a `profiles(id)` (no existe
  una tabla `users`).
- El PDF de ejemplo (`Downloads/SALPER DEPORTES.pdf`) es de **AVENUE
  SCHOOL, folio AS1** — colegio que NO estaba en la lista de 5 del prompt.
  El usuario pidió sembrarlo como **6º colegio** (código `AS`).

**Esquema** (`supabase/schema_v57_pedidos_colegio.sql`, aplicado y
verificado en vivo): `colegios` (+ `ultimo_folio`, contador por colegio,
extra sobre el prompt), `colegio_pedidos`, `colegio_pedido_articulos` (+
`posicion`, orden de captura; **sin** `cantidad_surtida` todavía — es de
la siguiente fase), `colegio_pedido_abonos`. Colegios sembrados: Instituto
Tricio `IT`, Colegio Doris Beckman `CDB`, Colegio Juan Beckman `CJB`,
Colegio Echavarría `CJE`, Sistema Educativo Nexus `SEN`, Avenue School
`AS`.
- **Folio** = `{codigo}{consecutivo}` (IT1, IT2…). El UPDATE atómico de
  `colegios.ultimo_folio` dentro de `create_colegio_pedido` toma el candado
  de la fila del colegio (dos capturas simultáneas se serializan); solo
  sube, nunca se reutiliza aunque el pedido se elimine (soft delete). Las
  líneas se validan ANTES de consumir el folio, para no quemar un
  consecutivo con un pedido inválido. `codigo_folio` solo letras (1-6) —
  así "A"+"11" nunca choca con "A1"+"1".
- **El servidor calcula todo**: subtotal, importe de cada línea y el
  anticipo (si viene monto manda el monto y se deriva el %; si no, el %,
  default 100 como el recibo de ejemplo). El navegador solo previsualiza.
- **Seguridad, distinta al resto de la app**: aquí NADA es público (hay
  teléfonos de clientes y dinero). RLS activo en las 4 tablas, SELECT solo
  para `authenticated` con `current_user_role() = 'admin_general'`, `anon`
  sin ningún privilegio, `authenticated` sin INSERT/UPDATE/DELETE directo.
  Escritura solo por RPC `SECURITY DEFINER` (`create_colegio`,
  `create_colegio_pedido`, `add_colegio_abono`, `delete_colegio_abono`,
  `soft_delete_colegio_pedido`) con `revoke ... from public` + `grant ... to
  authenticated` y el chequeo de rol adentro. Un abono no puede pasarse del
  saldo pendiente.
- **Verificado en vivo**: 6 colegios sembrados; exactamente 1 fila en
  `pg_proc` por función; `anon` = false (funciones y tablas); RLS en las 4
  tablas. Simulación de los RPC dentro de una transacción con `ROLLBACK`
  (16 chequeos: folios AS1/AS2/AS3, anticipo 100%/50%/monto → 20.83%, líneas
  en orden, abono válido, abono excedido, sin artículos, cantidad 0,
  anticipo > subtotal, abono a pedido eliminado, código duplicado, código
  con número, rol `ventas` rechazado, sin sesión rechazado) — todos
  pasaron, y después se confirmó que no quedó ningún dato (0 pedidos, 0
  líneas, 0 abonos, `ultimo_folio` en 0).

**Frontend**: menú "Pedidos Colegio" solo con `canManagePedidosColegio`
(`admin_general`; usa el rol EFECTIVO, así que con "Ver como" (V53)
desaparece igual que para cualquier rol, y la ruta directa da "No tienes
permiso"). Rutas `/pedidos-colegio`, `/pedidos-colegio/nuevo`,
`/pedidos-colegio/:id`. `PedidosColegioPage` (colegios expandibles con sus
pedidos, saldo en rojo/verde, "+ Agregar colegio"), `NewPedidoColegioPage`
(renglones con auto-agregado, anticipo por % o monto directo, subtotal/
anticipo/saldo en vivo, aviso si el anticipo pasa del subtotal),
`PedidoColegioDetailPage` (Pagos, artículos, abonos con fecha/monto/nota y
borrar, "Eliminar pedido" con confirmación, "Generar recibo PDF").
**Recibo PDF** (`PedidoColegioPdf.jsx`, basado en el ejemplo): encabezado
SALPER DEPORTES + teléfonos, Fecha/Folio, caja Cliente, tabla, importe con
letra del saldo (`montoConLetra`), los 4 términos del ejemplo, Subtotal/
Anticipo/Abonos/Saldo. **Hoja doble**: el recibo va dos veces (COPIA
SALPER / COPIA CLIENTE) separado por línea punteada; si el pedido trae más
de 12 renglones, cada copia pasa a su propia hoja. Se abre en vista previa
(`PdfPreviewModal`) al crear el pedido y con el botón del detalle.

**Verificación del frontend**: app completa montada con un Supabase
simulado en memoria (solo en un arnés temporal, ya borrado): lista →
alta con anticipo por monto → detalle con la vista previa del recibo
abriéndose sola → abono excedido rechazado → abono válido (saldo
actualizado) → "Ver como Ventas" oculta el módulo y bloquea la ruta. El PDF
se renderizó en 3 escenarios (ejemplo AS1, con abonos, y 15 renglones a
2 hojas). Se corrigieron en el camino: "Uno peso" → "Un peso"
(apócope) y el saldo negativo mostrado como `$-499,540.00` (ahora
`-$499,540.00` + aviso en el formulario).

**Decisiones menores tomadas sin preguntar (ajustables):** además de lo
del prompt se agregó borrar abonos y eliminar (soft) un pedido, porque un
error de captura en dinero no debería quedar sin salida; el PDF muestra
solo "Artículo" + "Talla" (el ejemplo trae una columna de código Microsip
y la talla dentro del nombre — el prompt pedía columnas separadas).

**Pendiente — SIGUIENTE FASE (ya diseñada, no incluida en esta beta):**
captura de cantidad surtida por línea con estado automático (completo /
parcial / falta), cortes automáticos por fecha por colegio, resumen
consolidado de faltantes (por producto/talla) y detallado (por cliente), y
envío automático del reporte por correo al cerrarse un corte. También sin
hacer: editar un pedido ya creado (líneas/anticipo), desactivar un colegio
desde la UI (la columna `activo` existe pero no hay botón), y ajustar la
leyenda de "solo entregas totales" del recibo cuando se implemente el
control de entregas parciales.

### V58 — Documentos múltiples, ventas/contabilidad suben después de creada la orden, total por prenda

Pedido del usuario (tres cosas, con capturas de una orden real vista con
"Ver como → Ventas"):

**1. Ventas y contabilidad suben cotizaciones/órdenes de compra aunque la
orden ya esté confirmada, y pueden ser varias.** Antes: una sola columna
por tipo en `orders` (`cotizacion_pdf_path`/`orden_compra_pdf_path`/
`factura_pdf_path`), y ventas/contabilidad solo podían mientras la orden
seguía `en_confirmacion` (tope de estado en `set_order_document` y en
`canEditOrderDocument`). `supabase/schema_v58_documentos_multiples.sql`
(aplicado y verificado en vivo, ADITIVO):
- Tabla nueva `order_documentos` (una fila por archivo; `kind`,
  `path` único, `nombre` original, `created_by`), RLS solo lectura con
  sesión, `anon` sin nada, escritura solo por RPC. Los 2 PDFs que ya
  existían (1 cotización, 1 orden de compra) se COPIARON a la tabla (1→1,
  1→1, factura 0→0); las columnas viejas NO se borraron.
- RPC nuevos `add_order_documento` / `delete_order_documento`: cotización
  y orden de compra → ventas, contabilidad, admin_tienda, admin_general,
  **sin tope de estado**; factura → contabilidad, admin_tienda,
  admin_general (ventas nunca, igual que antes). Orden eliminada = nadie
  edita. `add` exige que la ruta del archivo empiece con el id de ESA
  orden.
- `set_order_document` (que una pestaña desactualizada todavía puede
  llamar) conserva su firma y sus reglas, y ahora además refleja el
  archivo en la tabla nueva — nada subido desde una pestaña vieja queda
  invisible (mismo problema de "pestaña vieja" que ya se vio en V44/
  error de `p_folio_externo`).
- Frontend: `OrderDocumentsCard` reescrita (lista de archivos por tipo,
  "Subir PDF (o arrastra aquí)" / "+ Agregar otro" con varios a la vez,
  "Ver", "Quitar"); `documentsService` (`fetchOrderDocumentos`,
  `uploadOrderDocument` ahora agrega en vez de reemplazar,
  `deleteOrderDocumento`; se quitó `removeOrderDocument`, que no tenía
  usos); `canEditOrderDocument` sin tope de estado; `NewOrderPage` también
  acepta varios PDFs por tipo al crear la orden.
- Verificado: simulación SQL con `ROLLBACK` (13 chequeos: ventas sube 2
  cotizaciones a una orden ya en `en_terminado`, ventas rechazada con
  factura, contabilidad sí, rol `corte` rechazado, ruta de otra orden,
  tipo inválido, orden eliminada, compat de `set_order_document`, sin
  sesión) y después se confirmó que no quedó nada (2 documentos, rol del
  admin restaurado). En pantalla (Supabase simulado): ventas sube 2 PDFs
  arrastrando a la vez y quita uno en una orden ya confirmada; contabilidad
  puede con los 3 tipos; `terminado` solo ve.

**2. "Que el admin general pueda borrar anticipos" — no requirió cambio
de código.** `delete_anticipo` ya permitía `admin_general`/`admin_tienda`
(verificado en la base en vivo), y el botón "Borrar" de `OrderPaymentsCard`
usa `canDelete` = esos mismos roles. En la captura del usuario estaba
activo **"Ver como → Ventas"** (V53), que simula el rol EFECTIVO — y
ventas no puede borrar anticipos, así que el botón no aparece en esa
vista. Se le explicó: volver a "Mi vista (Administrador general)".

**3. Total por prenda.** `OrderItemsCard` (resumen de prendas del detalle
de la orden) ahora muestra "Total de esta prenda: N piezas" por cada
prenda, además del total de piezas de la orden. `ResumenPage` (Resumen
por cliente) muestra "· N pz" junto al nombre de cada prenda. (El PDF de
la orden ya traía el total por prenda.)

### V59 — "Nueva orden" (y Calendario) en blanco: una talla `null` en una orden real

**Reporte del usuario:** al darle clic a "Nueva orden" la página no cargaba
(pantalla completamente en blanco, ni menú lateral).

**Causa raíz (reproducida en producción, en el Chrome real con sesión, leyendo
la consola):** `TypeError: Cannot read properties of null (reading
'cantidad')`, dentro de `getOrderPieceCount` (`utils/demand.js`, V56 — el
cálculo de prendas por día para marcar "días saturados"). Una orden REAL, la
**ESC-005** (Colegio Hernando de Tovar Parras, Pantalonera), tenía una talla
`null` suelta en la posición 12 de su lista `sizes` — un dato raro que
nunca había estorbado porque nada lo recorría a todas las órdenes a la vez.
"Nueva orden" (aviso de fecha saturada, V55) y el Calendario (V54–V56)
recorren TODAS las órdenes para calcular la demanda, así que esa sola talla
nula tiraba la pantalla completa. Mi verificación de V55/V56 solo probó con
datos que yo mismo armé — no con las 32 órdenes reales; la revisión de datos
que hice esta vez (fechas nulas, días estimados, `items`/`sizes` que no
fueran arreglos) tampoco vio el caso hasta que la consola dio el error
exacto (la consulta original no revisaba elementos `null` DENTRO del
arreglo).

**Arreglos:**
1. `ordersService.js`: `fetchOrders`/`fetchOrderById` ahora LIMPIAN `items`
   al leer (`limpiarItems`: descarta items y tallas que no sean objetos,
   `sizes` siempre arreglo) — así todo lo que recorre `sizes[].cantidad`
   (Dashboard, Resumen, PDF, Surtido, resumen de prendas, demanda, edición)
   recibe siempre la forma esperada. **No se modificó nada en la base** —
   la ESC-005 sigue teniendo su `null`; el código simplemente ya lo tolera
   (si alguien edita las prendas de esa orden y guarda, el `null` se
   descarta solo).
2. `utils/demand.js` (`getOrderPieceCount`) y `api/_chat/tools.js`
   (`sumarPiezas`, chat del lado del servidor, que leía las órdenes sin
   pasar por `ordersService`): defensa extra con `?.`/`Array.isArray`.
3. **`ErrorBoundary` nuevo** (`components/common/ErrorBoundary.jsx`,
   montado en `AppLayout.jsx` con `key={location.pathname}`): antes, UN
   error al pintar cualquier pantalla dejaba TODA la app en blanco sin
   ningún mensaje; ahora el error se contiene en el área de contenido —
   el menú sigue visible, se explica qué pasó, con el detalle técnico y
   botones "Recargar la página" / "Ir al Dashboard".

**Verificación:** con el arnés se confirmó que `getOrderPieceCount`/
`buildDemandMap` ya no truenan con items `null`, tallas `null` o `sizes`
`null` (cuenta 5 piezas ignorando los nulos), y que el `ErrorBoundary` con
un error forzado (el mismo TypeError) muestra el mensaje con el menú
visible en vez de blanco. **Pendiente de confirmar por el usuario** (no hay
sesión propia para probar el flujo real completo): que "Nueva orden" y el
Calendario vuelvan a cargar en producción.

### Fase 2 (rama `fase-2`) — trabajo previo, sin relación con lo de arriba

Las 7 mejoras del módulo de Órdenes que pidió el usuario, en 3 fases (ver
`/Users/alfredoperez/.claude/plans/gleaming-purring-wirth.md` para el plan
completo con el SQL exacto). **Código terminado, migraciones aplicadas y
todo verificado** — tanto en la base de datos (SQL directo) como en el
frontend contra datos reales (modo invitado, consola limpia, sin 404).

Al aplicar `schema_v12_catalogos.sql` se repitió el gotcha de firmas de RPC
(ver más abajo): `create_order` quedó con dos versiones coexistiendo (6 y 7
parámetros) porque agregar `p_client_id` cambia la lista de tipos aunque
tenga default. Se corrigió al momento con
`drop function if exists public.create_order(text, text, text, date,
integer, jsonb);` y se dejó ya corregido en el archivo del repo para que
nadie más caiga en lo mismo.

**Fase 1 (visual):**
- Documentos por orden: `OrderDocumentsCard.jsx` + `documentsService.js`,
  bucket privado `orden-documentos` (a diferencia de `order-photos`, que es
  público) — decisión tomada con el usuario porque estos PDFs pueden traer
  precios.
- Color por urgencia de entrega: `OrderCard.jsx` ahora usa 3 escalones
  (vencida/≤3 días → rojo reusando `--overdue`; 4-7 días → ámbar, clase
  nueva `--warning`; >7 → neutro). Verificado con órdenes reales.
- Color por etapa: `STATUSES` en `constants.js` ganó `textColor` por
  entrada; `StatusBadge.jsx` pinta cada etapa con su propio color (ya
  existía la paleta ámbar→naranja, solo no se usaba en el badge). Verificado
  con órdenes reales — "Cortado" y "Sublimado" ya se ven distintos.

**Fase 2 (catálogos):**
- `telas`/`clientes`/`productos`: tablas nuevas, lectura pública (como el
  resto de la app), alta solo con sesión vía RPC "crear o reusar"
  (`create_tela`/`create_cliente`, idempotentes por nombre normalizado —
  mismo patrón que ya usaba `create_order_type`).
- `orders.client_id` (nullable) + `create_order` con `p_client_id` opcional
  al final — 100% compatible con órdenes viejas.
- `items[].tela_id`/`tela_nombre`: snapshot en el JSON del item (mismo
  criterio que el folio: si la tela se borra/renombra después, la orden
  vieja no se entera).
- Duplicado de cliente: exacto lo resuelve el índice único en la base (nunca
  truena); "parecido" usa una distancia de Levenshtein simple
  (`src/utils/similarity.js`, sin dependencia nueva) como aviso suave, no
  bloqueante.
- Auto-agregar fila de talla: en `OrderItemsEditor.jsx`, `updateSize` agrega
  sola una fila vacía cuando la última fila del item queda completa.
- Autocompletado de producto por cliente: `ProductoAutocomplete.jsx`, solo
  aparece con un cliente EXISTENTE seleccionado; autocompleta
  garment/color/pantone/tela/foto de la prenda y se puede seguir editando.

**Verificado en esta sesión (SQL directo en Supabase, ya limpio de datos de
prueba):**
1. Ambas migraciones aplicadas sin errores.
2. `has_function_privilege('anon', ..., 'EXECUTE') = false` en las 5
   funciones nuevas/modificadas (`set_order_document`, `create_tela`,
   `create_cliente`, `create_producto`, `create_order`) — solo
   `authenticated` puede ejecutarlas.
3. `create_tela('Popelina Prueba')` llamada dos veces (con espacios/
   mayúsculas distintas) regresó el mismo `id` las dos veces — confirma la
   normalización.
4. `create_cliente` y `create_producto` probados directo — funcionan.
5. `orders.client_id` / `cotizacion_pdf_path` / `orden_compra_pdf_path`
   confirmadas `is_nullable = YES`.
6. Frontend (modo invitado, detalle de una orden real): consola sin
   errores, ni un solo 404 — antes de aplicar las migraciones sí los había.

**Cierre:** el usuario probó todo con su sesión real en el preview de
`fase-2` y le gustó — el único ajuste pedido fue que el campo de tela
(dentro de cada prenda) siguiera exactamente el mismo patrón que el de
cliente: botón cerrado dice "+ Tela nueva" (no "+ Guardar tela", que sonaba
a que guardaba algo sin haber escrito nada), y solo al abrirlo aparece
"Guardar tela". Corregido en `TelaSelect.jsx`.

`fase-2` ya se fusionó a `main` y está en producción
(https://salper-ordenes.vercel.app) — confirmado con un deploy Ready y un
200 real al sitio. Las 7 mejoras del módulo de Órdenes quedan completas y
en vivo. Pendiente real: ninguno — cualquier ajuste de aquí en adelante es
una mejora nueva, no algo inconcluso de esta fase.

### Quita el picker de plantillas de Nueva orden

A petición del usuario, se quitó el selector "Usar plantilla" (y toda su
lógica: aplicar campos/prendas/fotos de una plantilla) del formulario de
nueva orden. `order_templates`, `TemplatePicker.jsx` y el botón "Guardar
esta orden como plantilla" (en el detalle de la orden) se dejaron sin
tocar — quedan un poco huérfanos (ya no hay dónde aplicar una plantilla
guardada), pendiente de que el usuario decida si también los quiere quitar.

### Más etapas de producción, con colores por familia (V13)

Se amplió el flujo de 6 a 9 estados — cada actividad (confirmación, corte,
sublimado, terminado) ahora tiene un par "entrando" / "esa etapa ya se
cerró", igual que ya pasaba con confirmación:

```
en_confirmacion → confirmado
en_corte        → cortado
en_sublimado    → sublimado
en_terminado    → terminado
completado
```

Cada familia tiene su propio color con dos tonos (claro = entrando, sólido
= terminada esa etapa): confirmación en ámbar (sin cambio), corte en azul,
sublimado en rosa, terminado en morado, completado en verde (sin cambio,
sigue siendo la única etapa con significado semántico de "bien"). Nunca se
usa rojo para etapas — rojo sigue exclusivo para urgencia de fecha de
entrega.

Como todo el frontend (`StatusBadge`, `StatusStepper`, `StatusChanger`,
`OrderFilters`, el calendario, el PDF) ya leía `STATUSES` de forma
genérica, el único cambio de código fue `src/lib/constants.js` — cero
lógica nueva, solo datos.

**Gotcha nuevo, documentado arriba en la sección de RPC:** al migrar datos
existentes a un valor que el CHECK constraint viejo todavía no permite, hay
que tirar el constraint viejo ANTES del UPDATE, no después — si el UPDATE
va primero (con el constraint viejo todavía puesto), truena. Pasó en esta
migración (`schema_v13_estados_produccion.sql`): las 2 órdenes que estaban
en "en_produccion" se migraron a "en_terminado" recién después de mover el
`drop constraint` arriba del `update`.

Aplicado y verificado en la base real (las 2 órdenes migraron bien, el
constraint final tiene los 9 valores, `update_order_status` sigue con
`anon_can_execute = false`) y en producción
(https://salper-ordenes.vercel.app).

### Bordado, Órdenes pasadas, filtros agrupados, banner (V14)

Cuatro pedidos que llegaron juntos en la misma sesión, aplicados juntos:

1. **Estado "bordado"**: nueva pareja `en_bordado` → `bordado` (verde
   azulado/teal), entre sublimado y terminado — mismo patrón claro/sólido
   que las demás etapas. `orders_status_check` y `update_order_status` se
   ampliaron (`schema_v14_bordado_y_reparaciones.sql`); como no había datos
   que migrar (estado nuevo, no reemplazo), no hizo falta el cuidado de
   orden que sí hizo falta en V13.

2. **Órdenes pasadas**: las órdenes en `completado` ya no viven mezcladas
   en el Dashboard — se filtran ahí (`currentOrders = status !== 'completado'`)
   y aparecen en una pestaña nueva `/pasadas` (`PastOrdersPage.jsx`, mismos
   filtros de tipo/búsqueda que el Dashboard). Nunca se borran, solo se
   archivan — es una vista distinta de la misma tabla `orders`.

3. **"Orden de reparación" en Pendientes**: `pending_items` ganó 5 columnas
   nullable (`garment`, `talla`, `cantidad`, `foto_url`, `foto_path`) — un
   pendiente "general" las manda todas en null y no cambia en nada.
   `create_pending_item` pasó de 3 a 8 parámetros (requirió `DROP FUNCTION`
   de la firma vieja antes del `CREATE OR REPLACE`, y el `revoke ... from
   public` de siempre en la firma nueva — ver gotchas). El formulario
   (`PendingItemForm.jsx`) tiene un selector Tipo (General / Orden de
   reparación); al elegir reparación aparecen prenda*/talla/cantidad,
   comentarios (reusa `description`, solo cambia el placeholder) y una
   foto. La foto se sube al bucket `order-photos` ya existente, bajo
   `pending/` (confirmado por grep que sus policies son authenticated-only,
   sin hueco público — no hizo falta bucket nuevo).

4. **Filtro de estado agrupado**: el Dashboard tenía 8 chips de estado (uno
   por cada "entrando"/"terminada"). Ahora hay un `STATUS_GROUPS` en
   `constants.js` que junta cada par bajo un solo chip (ej. "Cortado" =
   `en_corte` + `cortado`) — 5 chips en vez de 8 (6 con "Completado", pero
   ese grupo no se ofrece en el Dashboard porque esas órdenes ya no están
   ahí). `STATUSES` (la lista granular) no cambió — el badge de cada
   tarjeta sigue mostrando el estado exacto; solo el filtro se agrupó.
   Nuevo helper `matchesStatusGroups()` en `utils/status.js`.

5. **Color del banner de Anuncio**: antes usaba el mismo tono ámbar suave
   que las tarjetas de "Próximas a surtir", y se confundían a simple vista.
   Ahora es fondo negro con texto ámbar/blanco (mismo patrón que los
   botones primarios de la marca) — llamativo y ya no se mezcla visualmente
   con las órdenes urgentes.

Todo aplicado y verificado: migración corrida en Supabase (constraint con
`en_bordado`/`bordado`, columnas nuevas en `pending_items`,
`create_pending_item` con una sola firma de 8 parámetros y
`anon_can_execute = false`), y verificado visualmente en `npm run dev`
(banner negro/ámbar bien diferenciado, chips agrupados filtrando
correctamente, Órdenes pasadas mostrando la única orden completada, sin
errores de consola). El formulario de "Orden de reparación" se armó
siguiendo el mismo patrón de `photosService.js`/`ClienteSelect.jsx`, pero
no se pudo probar en vivo con sesión real dentro de este panel (no hay
sesión activa y no tecleo credenciales, ver regla de este proyecto) — queda
pendiente que el usuario lo pruebe con su sesión.

**Pendiente sin resolver, sigue en pie:** el botón "Guardar esta orden como
plantilla" (detalle de orden) sigue huérfano desde que se quitó el picker
de plantillas — el usuario no ha dicho si también lo quiere quitar.

### "Por Confirmar" en rojo, "Confirmada" en verde + favicon

Dos cambios cosméticos independientes, pedidos en la misma sesión:

**Colores de "Por Confirmar"/"Confirmada":** a petición explícita del
usuario, los dos primeros estados de `STATUSES` (`en_confirmacion` →
"Por Confirmar", `confirmado` → "Confirmada") ahora usan el mismo rojo de
urgencia (`--color-danger`, `#c7351f`) y el mismo verde de completado
(`--color-good`, `#2f8f4e`) — para que salte a la vista qué orden todavía
necesita revisión de fábrica. Se le presentó al usuario el conflicto con
la regla de "rojo/verde exclusivos para atrasado/completado" antes de
tocar nada (`AskUserQuestion`); eligió explícitamente romper la regla para
este par de estados. Documentado como excepción deliberada tanto en el
comentario de `STATUSES` (`constants.js`) como en el comentario de
identidad visual de `index.css`, para que no se "corrija" por error más
adelante. Las demás etapas (corte/sublimado/bordado/terminado) siguen
fuera de rojo/verde. El chip de filtro agrupado que antes decía
"Confirmado" se renombró a "Confirmación" (cubre ambos sub-estados, ya
no tiene sentido llamarlo igual que la etiqueta granular nueva).

**Favicon personalizado:** se agregó el ícono de SALPER (la letra S con
una estrella, sobre fondo negro) como favicon del sitio. Los 6 archivos
(`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`,
`apple-touch-icon.png`, `android-chrome-192x192.png`,
`android-chrome-512x512.png`) los generó el usuario y se copiaron a
`public/` (carpeta que no existía todavía — Vite la sirve automáticamente
en la raíz del sitio). `index.html` ganó los `<link>` correspondientes en
el `<head>`. No hay `manifest.json`/`site.webmanifest` en el proyecto, así
que no aplicó ese paso. Verificado: los 6 archivos responden 200 con el
tamaño/tipo correcto (`fetch` desde la app), los `<link>` aparecen en el
DOM con las rutas esperadas, y `npm run build` los copia a `dist/`
correctamente.

### Historial de estado en el PDF de la orden

El usuario pidió que los PDFs de orden (`OrderConfirmationPdf.jsx`, ambas
variantes "interno"/"cliente") incluyan el historial de cambios de status —
para poder mandarle el PDF a un cliente que pregunte en qué va su orden,
sin tener que abrir la app. Dos agregados al documento:

1. Un badge de "Estado actual" junto al folio, en el header, con el mismo
   color/etiqueta que usa `StatusBadge` en la app (`getStatus(order.status)`
   de `utils/status.js` — mismos datos, cero duplicación de la paleta).
2. Una sección nueva "Historial de estado" (después de prendas, antes de la
   nota de "sujeta a confirmación"): un renglón por cada cambio, con un
   punto del color de esa etapa, la etiqueta, fecha/hora
   (`formatDateTime`) y las notas si las hay. Se ordena cronológico
   ascendente (más viejo arriba) dentro del propio componente — no importa
   en qué orden llegue `history` desde quien lo llama.

`downloadOrderConfirmationPdf` (en `utils/generateOrderPdf.jsx`) gana un
parámetro opcional `history` que se pasa tal cual al componente. En
`OrderDetailPage.jsx` ya se tenía el historial cargado (`useOrder` lo trae
junto con la orden) — solo hubo que pasarlo. En `NewOrderPage.jsx` (se
genera el PDF justo al crear la orden, antes de que exista ningún cambio
real) se sintetiza un historial de un solo renglón con el estado inicial
que el propio `create_order` ya insertó, en vez de pedirlo aparte a la
base.

Sin cambios de schema — `order_status_history` y `fetchOrderHistory` ya
existían de antes, solo no se usaban en el PDF. Probado generando el PDF
real de una orden con varios cambios de estado (capturando el blob antes
de que se revocara, decodificándolo a archivo y leyéndolo): el badge y
cada renglón del historial salen con el color correcto por etapa
(incluye rojo/verde de "Por Confirmar"/"Confirmada"), notas en cursiva,
orden cronológico correcto.

El usuario confirmó que le gustó, pero notó que el PDF de prueba que le
mandé no traía el resumen de "Prendas, tallas y colores" — esa sección
nunca se tocó (sigue igual, gated a `items.length > 0`); lo que pasó es
que esa orden de prueba en particular no tenía prendas capturadas como
tal, solo texto libre en la descripción. Se volvió a probar con una orden
que sí tiene items reales (SUB-003) y la sección sale exactamente igual
que antes, junto con el historial nuevo — sin regresión.

### Documento de Factura (mismo patrón que cotización/orden de compra)

`schema_v15_factura.sql`: columna `factura_pdf_path` (nullable) +
`set_order_document` gana un tercer `p_kind` = `'factura'`, mismo bucket
privado `orden-documentos` que ya existía (sin cambios de Storage
policies). Misma firma de función que antes → `CREATE OR REPLACE` sin
`DROP`, y aun así se repitió el `revoke`/`grant` explícito por costumbre
del proyecto (no hacía falta, pero no cuesta nada).

Diferencia deliberada frente a cotización/orden de compra: esos dos solo
los puede editar tienda mientras la orden sigue "en_confirmacion" (son
documentos de ANTES de producción); la factura casi siempre se sube
DESPUÉS (cuando ya se entregó o está por entregarse), así que para
`'factura'` esa restricción de estado no aplica — tienda puede
subir/reemplazar la factura sin importar en qué estado esté la orden.
Admin sigue sin restricción en los tres casos. Esto obligó a cambiar
también el lado del frontend: `OrderDocumentsCard.jsx` antes calculaba un
solo `editable` para toda la tarjeta con `canEditOrder(role, order)`; con
la excepción de factura, ese único flag ya no alcanza — ahora hay
`canEditOrderDocument(role, order, kind)` en `permissions.js` (espejo
exacto de la regla del RPC) y `editable` se calcula por renglón, no por
tarjeta completa.

Verificado: columna existe, la función tiene una sola firma con
`anon_exec = false`/`auth_exec = true`, y se probó la función real desde
el SQL Editor (sin sesión, rechaza con el mensaje correcto — confirma que
parsea y corre bien) más una tabla de verdad de la condición
`tienda_blocked` para las 5 combinaciones kind/estado relevantes,
confirmando que factura nunca se bloquea y cotización/orden de compra sí
se bloquean fuera de en_confirmacion, igual que antes. No se pudo probar
el flujo de subida end-to-end con una sesión real de tienda/admin dentro
de este panel (sin sesión activa, no tecleo credenciales) — queda
pendiente que el usuario lo pruebe con su login.

### Fecha de creación en el cuadrito de orden (Dashboard)

`OrderCard.jsx` ahora muestra "Creada: {fecha}" junto a "Entrega: {fecha}"
en el pie de la tarjeta, mismo renglón separadas por "·". Cambio de una
sola línea (`order.created_at`, ya venía en la orden, `formatDate` ya
existía) — sin cambios de schema ni de servicio. Verificado visualmente:
cabe en una línea sin romper el layout de la tarjeta.

### Anticipos por orden (control de pagos adelantados)

`schema_v16_anticipos.sql`: tabla nueva `anticipos` (no columnas en
`orders`) — `order_id`, `monto`, `metodo_pago` (CHECK en
efectivo/tarjeta/transferencia), `recibido_por`, `notas`, `created_at`,
`created_by`. Tabla separada, no columnas sueltas, porque una orden puede
recibir más de un anticipo (uno inicial, luego un abono) — mismo espíritu
que `order_status_history` siendo la bitácora de estados.

**Decisión de privacidad importante:** a diferencia de `orders`/
`order_status_history`/etc (de lectura pública para invitados desde
schema_v10), `anticipos` NO se abre a `anon` — es información financiera
(montos, quién manejó el dinero), mismo criterio que cotización/orden de
compra/factura (que viven en un bucket privado). Un invitado con el link
sigue viendo todo lo demás de la orden, pero nunca los anticipos.

RPCs: `create_anticipo` (tienda o admin, sin restricción por estado de la
orden — un anticipo puede llegar en cualquier momento) y
`delete_anticipo` (solo admin — corregir un error de captura, mismo
criterio que cancelar una orden: mover dinero es decisión de
administrador). `src/services/anticiposService.js` +
`src/components/orders/OrderPaymentsCard.jsx` (nuevo, mismo patrón visual
que `OrderDocumentsCard`: lista + formulario, `recibido_por` se
autocompleta con `profile.full_name` de quien tiene la sesión abierta
pero queda editable) — montado en `OrderDetailPage.jsx` dentro del mismo
bloque `{user && (...)}` que Documentos/StatusChanger, invisible para
invitados.

Alcance de esta vez: el anticipo vive en el detalle de cada orden (no hay
indicador en la tarjeta del Dashboard) — el pedido del usuario fue "un
campo en cada orden", no un badge en el tablero; si más adelante lo
quiere ahí también, es un hook nuevo que sume anticipos por orden en el
Dashboard, agregable después sin tocar lo de hoy.

Verificado en Supabase: tabla con las 8 columnas esperadas, ambas
funciones con una sola firma y `anon_exec=false`/`auth_exec=true`. No se
pudo probar el flujo de captura end-to-end con sesión real (sin sesión
activa en este panel, no tecleo credenciales) — queda pendiente que el
usuario lo pruebe con su login de tienda o admin.

### "Inventariado" / "No inventariado" obligatorio en Orden de reparación

`schema_v17_inventariado.sql`: columna nueva `pending_items.inventariado`
(boolean, nullable — un pendiente "general" nunca la usa). Mismo gotcha
de siempre: `create_pending_item` ganó un parámetro más → cambia la lista
de tipos → hubo que tirar la firma vieja (8 args) antes de crear la de 9.

La obligatoriedad NO vive en la base (la columna es nullable a propósito,
para no romper pendientes ya creados con `inventariado = null`) — vive en
`PendingItemForm.jsx`: dos botones tipo chip ("Inventariado" /
"No inventariado"), ninguno activo por default, y `handleSubmit` no deja
enviar el formulario si `tipo === 'reparacion'` y no se eligió ninguno
(mismo patrón que la validación ya existente de "prenda"). `PendingItemCard.jsx`
muestra el badge correspondiente solo cuando el valor no es null (para
que los pendientes de reparación creados ANTES de este cambio, que se
quedaron en null, no muestren "No inventariado" por error).

Verificado en Supabase: columna `inventariado boolean` existe, la función
tiene una sola firma (9 argumentos, `p_inventariado boolean` al final) con
`anon=false`/`auth=true`. Verificado en el navegador que la vista de
invitado (sin sesión) sigue mostrando bien los pendientes existentes, sin
errores de consola — el formulario en sí (con el toggle nuevo) no se pudo
probar interactivamente por la misma razón de siempre (sin sesión activa
en este panel).

### Módulo "Pedidos a Proveedor" (schema_v18, 3 fases)

Módulo nuevo e **independiente** del flujo de órdenes de producción —
para la tienda de artículos deportivos, no para uniformes/sublimación.
Resuelve que a veces una sola persona le pide mercancía a un proveedor
sin avisarle a nadie más: ahora queda un registro centralizado de qué se
pidió, quién lo pidió, qué llegó realmente y a qué costo. Se construyó en
3 fases, cada una validada con el usuario antes de la siguiente (a
petición explícita de su prompt inicial).

**Tablas** (`schema_v18_pedidos_tienda.sql`): `pedidos_tienda`
(proveedor, pedido_por, fecha_pedido, estado, fecha_recepcion,
verificado_por, notas) y `pedidos_tienda_articulos` (pedido_id FK
cascade, nombre_articulo, cantidad_pedida, cantidad_recibida,
precio_unitario, nota_problema). Ninguna toca `orders`/nada del módulo
de producción.

**Decisión de privacidad, distinta al resto de la app:** desde V10 un
invitado ve todo en modo lectura sin sesión — este módulo es la
excepción. Trae costos reales de proveedor, así que **no tiene modo
invitado en absoluto**: ni la tabla se abre a `anon` (RLS + GRANT solo
`authenticated`), ni el link de nav aparece, ni la ruta responde sin
sesión (`RequireRole allow={canViewPedidosTienda}` en las 3 páginas).
Cualquier rol con sesión puede VER (`canViewPedidosTienda`); solo
tienda/admin pueden crear/recibir/verificar (`canManagePedidosTienda`) —
fábrica no participa, es compra para la tienda deportiva.

**Flujo de estados:** `pedido` (recién creado) → `recibido` (opcional,
solo cambia fecha de recepción) → `verificado` **o** `con_problema`,
decidido automáticamente por `verificar_pedido_tienda` según lo
capturado: si algún artículo quedó sin `cantidad_recibida`, con cantidad
distinta a la pedida, o con `nota_problema`, el pedido cierra en
"con_problema"; si todo cuadra, en "verificado". No se puede volver a
verificar un pedido ya cerrado (protege contra pisar datos por
accidente). Colores de estado (`PEDIDO_TIENDA_ESTADOS` en
`constants.js`): pedido=ámbar claro, recibido=azul, verificado=verde
(`--color-good`, mismo significado que "Completado"), con_problema=rojo
(`--color-danger`, mismo significado que "Atrasada") — reusa la paleta ya
aprobada, no inventa hex nuevos.

**UI:** `PedidosTiendaPage` (lista), `NewPedidoTiendaPage` (formulario,
con `PedidoArticulosEditor` — mismo patrón exacto de auto-agregar fila
que tallas/cantidades en `OrderItemsEditor`, mismas clases CSS
`sizes-table`/`sizes-row`), `PedidoTiendaDetailPage` (detalle + botones
de acción). Desde el detalle: "Marcar como recibido" (solo si
`estado='pedido'`) y "Verificar pedido" (si `estado` es `pedido` o
`recibido`) abre `VerificarPedidoForm` — por cada artículo compara en
vivo `cantidad_recibida` contra `cantidad_pedida` y resalta la fila:
rojo si falta (`--color-danger`/`--color-danger-soft`), ámbar si sobra
(`--color-warning`/`--color-orange-soft`), neutro si coincide. El costo
total del pedido (suma `cantidad_recibida × precio_unitario`) se muestra
en el detalle solo una vez verificado.

**Verificado:** las 3 fases con build limpio y sin errores de consola;
schema aplicado y confirmado en Supabase (tablas con 17 columnas, 3
RPCs con `anon=false`/`auth=true`); guest bloqueado del nav y de la URL
directa; la lógica de decisión `verificado`/`con_problema` se probó
insertando y borrando datos de prueba reales en la base (dos pedidos,
uno sin discrepancias y otro con un artículo corto, confirmando
`hay_problema = false`/`true` respectivamente) — no se pudo probar el
flujo completo con una sesión real de tienda/admin dentro de este panel
(sin sesión activa, no tecleo credenciales); queda pendiente que el
usuario cree y verifique un pedido real con su login.

### Catálogo de proveedores + reconocimiento de pedidos por foto (schema_v19)

Dos extensiones al módulo "Pedidos a Proveedor", ambas dentro de "Nuevo
pedido".

**Catálogo de proveedores** (`schema_v19_proveedores.sql`): tabla
`proveedores` (nombre, contacto, tipo_material, notas, created_at),
mismo patrón "crear o reusar" idempotente que telas/clientes
(`nombre_normalizado` generado + índice único), pero de lectura **solo
autenticada** — a diferencia de telas/clientes (públicas, para el módulo
de órdenes que sí tiene invitado), `proveedores` vive dentro de Pedidos a
Proveedor, que no tiene modo invitado en absoluto. `pedidos_tienda` gana
`proveedor_id` (uuid, nullable) — la columna `proveedor` (texto) se
queda como snapshot del nombre al momento del pedido, mismo criterio que
`orders.client_name`/`client_id`: si el proveedor se renombra o se borra
después, el pedido viejo no se rompe.

`ProveedorSelect.jsx` sigue el mismo patrón de `ClienteSelect.jsx`
(dropdown + "+ Nuevo proveedor" inline, sin salir del formulario,
detección de duplicado exacto/parecido reusando `utils/similarity.js`
directamente — no se reimplementó esa lógica). No se reusó el
*componente* `ClienteSelect` tal cual porque el alta rápida de proveedor
también captura contacto y tipo de material (campos que un cliente no
tiene) — si esos dos quedaran fuera del formulario inline, nunca se
llenarían, porque no existe todavía una página de administración de
proveedores aparte. `notas` sí se dejó fuera del alta rápida (para no
sobrecargar el formulario) — solo editable por ahora entrando directo a
la base; si se quiere una página completa de "Proveedores" más adelante,
es un CRUD nuevo, no un cambio a este flujo.

**Reconocimiento automático por foto** (`api/pedido-ocr.js`, nuevo
endpoint serverless): al elegir una foto de la nota/remisión en "Nuevo
pedido", se manda al backend (nunca al cliente — la `ANTHROPIC_API_KEY`
vive solo en la función serverless, confirmado que ya está configurada
en Vercel para Production/Preview/Development) junto con el token de
sesión de Supabase (mismo patrón que `/api/chat`: requiere sesión,
cualquier rol, porque cuesta dinero real por llamada). El endpoint fuerza
una sola *tool* (`registrar_articulos`, `tool_choice` fijo) en vez de
pedirle a Claude que conteste con JSON en texto libre — así la respuesta
sale siempre estructurada, sin parsear texto ni arriesgarse a que se
cuele una explicación antes/después. Forma de la respuesta:
`{ articulos: [{ nombre, cantidad, talla }] }` (`talla` puede venir
`null`), donde cada artículo requiere `nombre` no vacío y `cantidad > 0`
— cualquier fila que no cumpla eso se descarta en vez de mandarse a
medias. `pedidos_tienda_articulos` ganó una columna `talla` (nullable)
para poder guardar este dato cuando aplica (ej. playeras, tenis) — un
pedido capturado a mano sin foto se queda con talla en null, sin romper
nada.

**Nunca bloquea el formulario:** la extracción de una foto manuscrita o
de mala calidad nunca va a ser perfecta, así que el endpoint SIEMPRE
regresa `200` salvo por sesión/validación (401/400) — si Claude no
encuentra nada o la llamada falla, regresa `{ articulos: [], warning:
'...' }` en vez de un error duro. El frontend (`pedidoOcrService.js`,
`NewPedidoTiendaPage.jsx`) solo PRELLENA `PedidoArticulosEditor` con lo
reconocido — nunca guarda nada en la base directamente, y nunca pisa
filas que el usuario ya haya llenado a mano (las conserva y agrega las
reconocidas después, más una fila vacía para seguir capturando). Límite
de tamaño: 3MB por foto del lado del cliente
(`MAX_OCR_PHOTO_SIZE_MB` en `pedidoOcrService.js`), con un segundo
resguardo del lado del servidor — las funciones serverless de Vercel
tienen un tope de payload de ~4.5MB, y una imagen en base64 pesa ~33%
más que el archivo original, así que 3MB de foto deja margen de sobra.

**No incluido a propósito** (fuera de lo que pidió el usuario, se puede
agregar después si hace falta): la foto de la nota/remisión no se
guarda como documento adjunto del pedido — se usa una sola vez para la
llamada a Claude y se descarta. Si más adelante se quiere conservarla
como evidencia (como cotización/orden de compra/factura en el módulo de
órdenes), sería un bucket privado nuevo + una columna de path, mismo
patrón que `schema_v11_documentos.sql`.

**Verificado:** build limpio, `node --check api/pedido-ocr.js` sin
errores de sintaxis, `ANTHROPIC_API_KEY` confirmada presente en las 3
environments de Vercel (`vercel env ls`), migración aplicada y
verificada en Supabase (tabla `proveedores` con sus 7 columnas,
`pedidos_tienda.proveedor_id` y `pedidos_tienda_articulos.talla`
existen, ambas funciones con una sola firma y
`anon=false`/`auth=true`), guest sigue bloqueado del formulario de nuevo
pedido. No se pudo probar el flujo completo (elegir/crear proveedor,
subir una foto real y confirmar el prellenado) con una sesión real
dentro de este panel — sin sesión activa, no tecleo credenciales; queda
pendiente que el usuario lo pruebe con su login de tienda o admin y una
foto real de una remisión.

**Ampliado después: también acepta PDF, no solo foto.** El campo de
"Foto de la nota o remisión" ahora es "Foto o PDF" — `accept="image/*,
application/pdf"` en el input, y `api/pedido-ocr.js` arma el bloque de
contenido para Claude como `type: 'document'` (en vez de `type: 'image'`)
cuando `mediaType === 'application/pdf'`, mismo prompt y misma tool para
ambos casos. Al agregar un segundo tipo de archivo, se renombraron los
nombres genéricos que ya no tenía sentido dejar como "photo/image"
(`MAX_OCR_PHOTO_SIZE_MB` → `MAX_OCR_FILE_SIZE_MB` en
`pedidoOcrService.js`, `imageBase64` → `fileBase64` en el cuerpo de la
petición y en el endpoint) — verificado que no quedó ninguna referencia
vieja (`grep` en `src/`/`api/`). Mismo límite de 3MB para ambos tipos de
archivo. Verificado: build limpio, `node --check` del endpoint sin
errores, y se confirmó leyendo el archivo servido por el dev server que
el nombre nuevo del export sí llegó al navegador (un error de consola
que apareció durante la edición resultó ser un log viejo en caché de la
herramienta de este panel, no un problema real del código — confirmado
comparando contra el archivo tal como lo sirve Vite).

### Reconocimiento por foto/PDF extendido a "Nueva orden" + endpoint generalizado

El endpoint de reconocimiento ya no es exclusivo de Pedidos a Proveedor —
se generalizó para servir dos flujos:

- **Renombrado:** `api/pedido-ocr.js` → `api/document-ocr.js`,
  `src/services/pedidoOcrService.js` → `documentOcrService.js`,
  `recognizePedidoPhoto(file)` → `recognizeDocument(file, context)`. El
  `context` (`'pedido_proveedor'` | `'orden'`) decide qué *tool*/prompt
  usa el endpoint y qué trae la respuesta — cada contexto tiene su propia
  tool de Anthropic (`registrar_articulos` vs `registrar_orden`), ambas
  con el mismo criterio de "nunca inventar, omitir si no se lee con
  certeza". `NewPedidoTiendaPage.jsx` sigue funcionando idéntico, solo
  cambiaron los nombres.
- **`registrar_orden`** (nueva tool, solo para `context: 'orden'`):
  además de `articulos` (nombre/cantidad/talla, igual que pedidos a
  proveedor), intenta leer `cliente` y `fecha_entrega` — **solo si
  aparecen explícitos y sin ambigüedad** en el documento; si no, regresan
  `null` (nunca inventados). `fecha_entrega` se valida server-side como
  `YYYY-MM-DD` real (`isValidIsoDate`) antes de mandarla al frontend.
- **`NewOrderPage.jsx`**: nuevo bloque de carga (foto o PDF, mismo
  patrón visual que Pedidos a Proveedor) arriba del todo, antes de
  "Cliente". Al reconocer:
  - **Prendas**: se mapean a `OrderItemsEditor`'s `items` (cada
    artículo reconocido = una prenda con una talla/cantidad) — mismo
    criterio de "nunca pisar lo ya tecleado a mano" que en Pedidos a
    Proveedor (conserva filas con contenido, agrega las reconocidas,
    deja una fila vacía al final).
  - **Fecha de entrega**: se prellena solo si el campo sigue vacío.
  - **Cliente**: es el caso más delicado — el formulario usa
    `ClienteSelect` (dropdown atado a `clientId`+`clientName` del
    catálogo), así que no se puede simplemente meter un `clientName`
    suelto sin `clientId` (dejaría la UI en un estado a medias, el
    dropdown seguiría diciendo "Selecciona un cliente…"). Se resolvió
    así: si el nombre reconocido coincide EXACTO (vía
    `utils/similarity.js`, `similarity() === 1`) con un cliente ya en el
    catálogo, se selecciona solo (clientId + clientName); si no hay
    match exacto, se muestra un aviso informativo ("Se reconoció el
    cliente 'X' — no está en el catálogo. Usa '+ Cliente nuevo'…") sin
    tocar el estado del formulario, y el usuario decide si lo agrega.
    Nunca se sobreescribe un cliente ya elegido a mano.
- **Nunca autoguarda**: igual que en Pedidos a Proveedor, todo esto solo
  prellena — la orden se sigue creando con el botón normal de "Crear
  orden", después de que el usuario revisa/corrige.

Verificado: build limpio, `node --check` del endpoint renombrado sin
errores, `grep` confirmó cero referencias a los nombres viejos
(`pedidoOcrService`, `recognizePedidoPhoto`, `pedido-ocr.js`) en
`src/`/`api/`, y se confirmó leyendo el archivo servido por Vite que
`NewOrderPage.jsx` sí trae `recognizeDocument(file, 'orden')`. No se pudo
probar el reconocimiento en vivo con una sesión real (mismo límite de
siempre) — queda pendiente que el usuario lo pruebe con una foto/PDF de
una orden real.

### Confirmación de contraseña al crear usuario

`UsersPage.jsx` (`NewUserForm`): campo nuevo "Confirmar contraseña".
Validación en dos capas, como se pidió:

- **Frontend:** aviso en vivo bajo el campo (`passwordsMismatch`, se
  calcula en cada render — no espera al submit) en cuanto hay algo
  tecleado en la confirmación que no coincide, más un bloqueo real del
  submit en `handleSubmit` (mismo `if` que corta la función antes de
  llamar a `createUser`, como ya hacía la validación de "mínimo 6
  caracteres"). El botón "Crear usuario" también se deshabilita mientras
  `passwordsMismatch` sea `true`.
- **Backend:** `usersService.createUser` ahora manda `password_confirm`
  junto con `password` a la Edge Function `admin-create-user`, que
  agrega un `if (password !== password_confirm)` → 400 "Las contraseñas
  no coinciden." — espejo exacto de la regla del frontend, por si
  alguien llama al endpoint directo saltándose la UI. La función se
  desplegó desde el editor del Dashboard de Supabase (mismo patrón que
  las migraciones SQL: se pegó el archivo completo y se le dio "Deploy
  updates"), y el archivo de respaldo en el repo
  (`supabase/functions/admin-create-user/index.ts`) se actualizó
  igual — confirmado que el timestamp de la función pasó a "a few
  seconds ago" tras el deploy.

No se pudo probar el flujo completo (crear un usuario real con
contraseñas que coinciden y que no coinciden) con una sesión de admin
real dentro de este panel — queda pendiente que el usuario lo pruebe.

### Fix: el reconocimiento de "Nueva orden" creaba una prenda por talla

El usuario probó el reconocimiento de "Nueva orden" y reportó que una
prenda con varias tallas (ej. "Playera M x10, Playera L x5" en el mismo
documento) salía como PRENDAS SEPARADAS en vez de una sola prenda con
varias filas de talla/cantidad. Causa: el merge en `NewOrderPage.jsx`
convertía cada artículo reconocido en un `item` de
`OrderItemsEditor` 1 a 1, sin agrupar — correcto para Pedidos a Proveedor
(ahí cada renglón SÍ es su propio artículo en la base, no hay concepto de
"prenda con varias tallas"), pero equivocado para una orden, donde
`items` agrupa tallas dentro de una misma prenda (`sizes[]`).

**Fix, en dos partes:**

1. `NewOrderPage.jsx`: nueva función `agruparArticulosPorPrenda()` — agrupa
   los artículos reconocidos por nombre (comparación sin distinguir
   mayúsculas/espacios) ANTES de convertirlos en `items`, así que ahora
   una sola prenda con 3 tallas del documento se vuelve un solo `item` con
   3 renglones en `sizes[]`, no 3 prendas. Probado con un script suelto
   (no en el flujo real, ver limitación de siempre) confirmando que
   agrupa correctamente y no mezcla prendas distintas.
2. `api/document-ocr.js`: la tool `registrar_orden` ahora tiene su propio
   schema de artículos (`ARTICULOS_SCHEMA_ORDEN`, antes compartía el mismo
   que Pedidos a Proveedor) con una instrucción explícita: si la misma
   prenda aparece en varias tallas, usar el nombre IDÉNTICO en cada
   renglón (sin meterle la talla al nombre) — para que el agrupado del
   punto 1 realmente los reconozca como la misma prenda y no se le escape
   por una variación de texto entre renglones.

Verificado: build limpio, `node --check` del endpoint, y un script de
Node aparte confirmando la lógica de agrupado con datos de prueba
(3 renglones de "Playera polo" con distinta capitalización/espacios →
1 sola prenda con 3 tallas; "Short" aparte). No se pudo volver a probar
con una foto/PDF real y una sesión real — queda pendiente que el usuario
lo confirme con el mismo documento que le falló antes.

### V60 — "Nueva orden": tipo primero, clientes por tipo, cliente incidental, menos texto

**Pedido del usuario:** (1) lo primero del formulario debe ser el tipo de
orden; (2) el cliente se ofrece según el tipo (un cliente puede ser de más de
un tipo); (3) un cliente nuevo se da de alta en Catálogos, NO desde la orden;
(4) si el cliente no está registrado, capturar nombre/teléfono/correo a mano
sin guardarlo como cliente futuro (clientes incidentales); (5) había
demasiado texto/información — dejarlo simple.

**Cambios (solo frontend, sin cambios de base de datos):**
- `utils/clientes.js` (nuevo): `filtrarClientesPorTipo` + `CLIENTE_OTRO`.
  Clientes con `tipo_orden` vacío se siguen mostrando en TODOS los tipos
  (los clientes reales aún no están categorizados; se esconderían de golpe).
  Tipos personalizados ("+ Nuevo tipo") muestran todos.
- `ClienteSelect.jsx` reescrito: deshabilitado hasta elegir tipo; lista
  filtrada; última opción "Otro cliente (no registrado)" que abre
  Nombre* / Teléfono / Correo. Ya NO existe "+ Cliente nuevo" aquí. En la
  orden se guarda `client_id = null` con nombre/teléfono/correo en la propia
  orden; el catálogo no se toca.
- `NewOrderPage.jsx`: orden Tipo → Cliente → Fecha de entrega → Prendas; el
  prellenado por foto/PDF pasó a un botón chico junto al título (si no hay
  tipo elegido avisa; si el cliente reconocido no está en el catálogo queda
  como "Otro cliente"); cambiar de tipo limpia el cliente si ya no
  corresponde; notas, fotos, folios anteriores, cotización/OC, total y
  anticipo quedan en dos secciones plegables opcionales; se quitaron casi
  todos los textos de ayuda (incluidos los de Pantone y roster en
  `OrderItemsEditor`). Borradores viejos siguen funcionando.
- Arreglo de paso: el aviso de fecha saturada ya no sale sin fecha/carga.

**Verificación:** arnés con supabase falso (clientes con categorías): Escolar
muestra multi-tipo + sin categoría y oculta industriales; cambiar de tipo
limpia el cliente; "Otro cliente" envía `p_client_id: null` con nombre,
teléfono y correo. Build limpio.

### V61 — Campos de cada prenda en el mismo orden que la orden física

**Pedido del usuario:** con la foto de la orden de taller en papel, que los
campos de "Nueva orden" (vivos, etc.) sigan el MISMO orden que la hoja física,
sin agregar ningún campo.

**Cambio (`OrderItemsEditor.jsx` + `.item-fields` en `index.css`):** una sola
columna con el orden del papel: Prenda → Color → Manga → Vivos → Cuello →
Puños → Tela → Logotipos → Números → Tallas y cantidades. Sin campos nuevos.
Los condicionales se conservan en su lugar (Pantone tras Color solo en
sublimación; "¿Lleva bolsas?" tras Prenda solo en Short; Manga/Cuello solo en
prendas de arriba). "¿Lleva bordado?" y la lista de nombres/números pasaron a
DESPUÉS de las tallas; el autocompletado de productos del cliente quedó arriba
de los campos (los rellena). Verificado en arnés leyendo el orden del DOM.

### V62 — Folios anteriores y fecha de creación visibles otra vez

**Pedido del usuario:** volver a mostrar "folio anterior" y "fecha de creación"
en Nueva orden para terminar de subir las órdenes pendientes. V60 los había
metido en la sección plegable. Ahora van siempre visibles, entre Fecha de
entrega y Prendas (`NewOrderPage.jsx`). La fecha de creación sigue atada a
`CAPTURA_FECHA_CREACION_HABILITADA` (`true`); al terminar la carga histórica
basta ponerla en `false`. La sección plegable queda como "Notas y fotos".

### V63 — Módulo "Talleros" (muestrarios que se prestan)

Reemplaza la hoja TALLEROS del Excel `Control_Salper.xlsx` (18 talleros,
TAL-001…TAL-018, más el catálogo de prendas de la hoja CONFIG).

**Decisiones del usuario:** agregar `tallas` y `tallas_faltantes`; fábrica
también ve el módulo (a veces son quienes piden los talleros); "quién recibe"
es TEXTO LIBRE (sin catálogo de clientes).

**Schema (`supabase/schema_v63_talleros.sql`):** `mt_productos`,
`mt_contenedores` (estado de uso disponible/prestado/en_reparacion SEPARADO de
estado de contenido completo/incompleto, como en el Excel; ubicación
tienda/fabrica nullable — el Excel la traía vacía), `mt_movimientos`
(prestamo/devolucion/ajuste; `persona_equipo` + `persona_externa`; `orden_id`
uuid FK opcional). Código TAL-### por SECUENCIA (nunca se recicla; los nuevos
empiezan en TAL-019). Bucket público `mt-fotos` (subir/borrar solo admins).
RLS: lectura para todo rol con sesión salvo `tienda` (rol básico); escritura
solo por RPC `mt_*` SECURITY DEFINER.

**Permisos:** ver = todos menos `tienda` (fábrica incluida, solo consulta);
prestar/devolver = ventas, admin_tienda, admin_general; alta/edición/baja y
catálogo de prendas = admin_tienda, admin_general (`canViewTalleros`,
`canLoanTalleros`, `canManageTalleros`).

**Frontend:** `/talleros` (filtros por prenda/color/estado/búsqueda, tarjetas,
contadores, catálogo de prendas) y `/talleros/:id` (foto, datos, historial);
modales Prestar (con vínculo opcional a una orden activa), Devolver (permite
corregir completo/incompleto y tallas faltantes) y Alta/Edición con foto.
Verificado con arnés (datos falsos) para ventas, corte y admin_general.
**Aplicado en Supabase (2026-09-24)** con verificación: 24 prendas, 18
talleros (7 incompletos), 6 funciones `mt_*` con anon = false / authenticated
= true, sin INSERT directo para authenticated, RLS activo en las 3 tablas,
bucket `mt-fotos` público, secuencia lista para TAL-019.

### V64 — Prendas de la orden visibles en el Dashboard

Pedido del usuario: que la tarjeta de cada orden en el Dashboard diga qué
lleva ("Short", "Playera y Short"…). `utils/prendas.js` (`resumenPrendas`:
nombres únicos sin distinguir mayúsculas, en orden de captura, unidos con
"," y "y"; tolera items nulos) + línea `.order-card__prendas` en
`OrderCard.jsx` (máx. 2 renglones). Sin cambios de base de datos.

### V65 — Talleros: "Prestar parcial" (solo algunas tallas)

Pedido del usuario: botón "Prestar parcial" para registrar qué tallas se
prestaron cuando no sale el tallero completo. `supabase/schema_v65_prestamo_
parcial.sql`: `mt_contenedores.tallas_prestadas` (préstamo vigente; null =
completo) y `mt_movimientos.tallas` (historial); `mt_prestar` gana el
parámetro opcional `p_tallas_prestadas` (DROP de la firma anterior) y
`mt_devolver` limpia/registra las tallas. Un tallero parcial cuenta como
`prestado` (un solo préstamo vigente a la vez; devolver regresa todo).
Frontend: botón "Prestar parcial" en tarjeta, detalle y encabezado; el modal
exige las tallas; se muestra "Parcial: CH, M" en tarjeta, detalle, historial
y al devolver. Verificado con arnés. Aplicado en Supabase (2026-09-24): una sola versión de mt_prestar, 6 funciones mt_* con anon = false, 2 columnas nuevas.

### V66 — Producción y Premios · FASE 1 (esquema y catálogos)

Reemplaza el Excel `Salper_Produccion.xlsm` (producción por operadora y
premios semanales). Trabajo directo en `main` (decisión del usuario; la rama
`fase-2` no se usa). Terminología de interfaz: **"valor generado"**, nunca
"sueldo". Fases 2–5 pendientes (motor de premios, captura rápida, cierre y
aprobación, reportes); **una fase por vez, con visto bueno del usuario**.

**Datos y decisiones (Excel real):**
- 635 operaciones (folios únicos 1–2039; 485 textos con espacios sobrantes,
  recortados; prenda `CHAMARA CON FORRO` → `CHAMARRA CON FORRO`, 20 filas).
- 35 personas; 33 con número de operadora (faltan EMP009 y EMP027, ambas
  inactivas). EMP014 está activa pero NO participa en bonos. 32 participan.
- Reglas: 6 meta + 4 lugar + **4 mejora** (el Excel trae 80%→$300 además de
  los 3 del prompt; el usuario pidió conservarla → 14 reglas). Consecuencia:
  la prueba de la Fase 2 (semana que cierra 2026-09-22) da **$6,800** con las
  4 reglas de mejora ($6,700 solo con 3; calculado en Python antes de tocar
  la base) — el resultado esperado se ajustó.
- Historial: 528 filas / 16 fechas (martes, miércoles y jueves mezclados);
  falta la semana que cierra 2026-08-04; 09-23 y 09-24 son la MISMA semana
  (cierre 09-22, se conserva la del 24). Se importa en la Fase 2 (con tabla de
  mapeo aprobada primero).

**Permisos (confirmados):** montos solo `admin_general` y `admin_fabrica`
(super_admin = admin_general). Juanis (secretaria): ROL NUEVO
`captura_produccion` — solo captura producción (fases 3–4) y consulta órdenes
(menú: solo Dashboard; sin chat, anuncios, pendientes, notas, fotos,
talleros ni montos). `prod_registros` guarda el valor en pesos, así que su
lectura será por un RPC sin montos (Fase 3), nunca por SELECT directo.

**SQL aplicado (2026-09-24):**
- `supabase/schema_v66_produccion_fase1.sql`: 8 tablas `prod_*` (semana con
  `UNIQUE(fecha_inicio)` miércoles→martes; RLS; sin acceso anon; sin escritura
  directa), helpers `prod_puede_ver_montos()`/`prod_puede_capturar()`, rol
  nuevo en `profiles_role_check` y en `admin_update_user_role`, y parche a las
  7 funciones que bloqueaban roles por lista (anuncios, fotos, pendientes,
  notas) + las políticas de Talleros. Los parches toman la definición VIVA.
- `supabase/schema_v66b_guardas_captura.sql`: 4 funciones que nunca tuvieron
  candado de rol (`create_order_type`, `create_order_template`,
  `delete_order_template`, `recompute_order_status`) ahora rechazan al rol
  nuevo. Las encontró una simulación: como `captura_produccion` (transacción
  con ROLLBACK) se llamaron las 60 funciones de escritura del sistema → 58
  bloqueadas; las otras 2 (`delete_order_documento`, `update_orden_etapa`)
  validan un argumento antes del rol pero usan lista positiva de roles.
  Control: `admin_general` sigue pudiendo. Otros roles no cambiaron.
- Catálogos: `scripts/import_produccion_fase1.py` lee el `.xlsm`
  (`scripts/data/`, ignorado por git) y GENERA `scripts/data/import_fase1.sql`
  (idempotente, `on conflict do nothing`); aplicado dos veces: 635
  operaciones, 35 operadoras (33 con número), 14 reglas, config
  (0.025 / 25650), sin duplicados, 0 semanas/registros.

**Frontend:** `ROLE_LABELS`/Usuarios/"Ver como" con `captura_produccion`;
`isCapturaProduccion`, `canViewProduccionMontos`, `canCapturarProduccion`;
menú reducido y sin chat para ese rol; sin permisos de anuncios, pendientes,
notas ni talleros.

**Pendiente / avisos:**
- Desplegar `supabase/functions/admin-create-user` (ya lleva el rol nuevo en
  `VALID_ROLES`) desde el Dashboard para poder CREAR usuarios con ese rol;
  cambiar el rol de un usuario existente ya funciona.
- Hueco previo a V66 (sin tocar): `lectura` y `tienda` tampoco están
  bloqueados en las 4 funciones sin candado; y la restricción de roles en la
  base NO incluye `lectura`/`tienda` (V30 nunca la actualizó → no se pueden
  asignar hoy).
- Límite de seguridad de lectura: cualquier usuario con sesión puede LEER casi
  todas las tablas (diseño "todos ven todo"); la restricción de Juanis es de
  menú/botones + escritura bloqueada en el servidor.

### V67 — Producción y Premios · FASE 2 (motor de premios e historial) — COMPLETA

- **Motor** (`supabase/schema_v67_produccion_motor.sql`, aplicado 2026-09-24):
  `prod_calcular_premios(semana_id)` (calcula y REGRESA sin guardar; vista
  previa) y `prod_aprobar_semana(semana_id)` (calcula, guarda el snapshot en
  `prod_premios_semana`, congela el valor por persona y pone `aprobada`).
  Toda la lógica de premios vive ahí, nada en el frontend. Semana anterior =
  la APROBADA inmediatamente anterior que exista; mejora en PORCENTAJE (bug de
  unidades del Excel evitado); participan quienes tengan `participa_bonos` y
  `activo` aunque valgan 0; lugar = 1 + mayores estrictos (empates comparten).
  Verificado: `anon` sin acceso, `captura_produccion` bloqueado,
  `admin_general` permitido.
- **Historial importado** (`scripts/import_produccion_historial.py` →
  `scripts/data/import_historial.sql`, ignorado por git; mapeo aprobado por
  el usuario): 16 fechas → **15 semanas** (`importada = true`, `aprobada`),
  495 valores; la fila duplicada del 2026-09-23 se descartó y se conservó la
  del 09-24 (misma semana, cierre 09-22). No hay semanas duplicadas ni inicios
  que no sean miércoles. Semana sin datos: la que cierra 2026-08-04. Nota: en
  el historial, desde el cierre 09-08 aparecen EMP034 y EMP035 (reemplazan a
  EMP027 y EMP009, inactivas) — son personas distintas, ya existían en el
  catálogo.
- **Caso de prueba** (semana que cierra 2026-09-22 vs 2026-09-15, 32
  participantes): **total de premios $6,800** (meta $1,400 + lugar $3,200 +
  mejora $2,200). Con solo 3 niveles de mejora (sin 80%→$300) daría $6,700, y
  el Excel daba $7,600 por sus dos bugs. Dos personas con valor 0 empatan en
  el lugar 31 y reciben bono de lugar ($50), como se confirmó. Una persona con
  semana anterior en 0 queda "Sin base".
- Pendiente: Fase 3 (captura rápida con teclado).

### V68 — Producción y Premios · FASE 3 (captura rápida)

- **Pantalla `/produccion/captura`** ("Producción" en el menú; admin_general,
  admin_fabrica y `captura_produccion`): fecha (hoy por default, sin fechas
  futuras) → operadora (busca por número o nombre, ↑↓ + Enter) → **Folio →
  Tab/Enter → Piezas → Enter guarda y vuelve al Folio**. **F2** cambia de
  operadora sin soltar el teclado (el foco sigue al flujo con un efecto, no con
  timeouts). Muestra prenda·parte·operación del folio al escribirlo;
  lista de lo capturado ese día por operadora (editar/borrar mientras la
  semana siga abierta) y contador "X de Y operadoras capturadas hoy" con la
  lista de a quién le falta. **Nunca muestra pesos.**
- **Validaciones (servidor):** folio inexistente → error, no guarda; folio
  inactivo o piezas > 1.5× lo esperado por jornada (`segundos_jornada /
  segundos`) → ADVERTENCIA que se confirma con Enter otra vez (no bloquea);
  semana no abierta (o fecha futura) → no permite.
- **SQL aplicado** (`supabase/schema_v68_produccion_captura.sql`): RPCs
  `prod_capturar_registro`, `prod_editar_registro`, `prod_borrar_registro`,
  `prod_listar_registros`, `prod_resumen_captura` (+ helper interno
  `prod_semana_de`, sin grant) que NO devuelven montos; la semana
  (miércoles→martes) se crea/asigna sola en la primera captura; snapshot de
  segundos y precio al guardar. Los admins también corrigen en `en_revision`.
- **Verificado** como `captura_produccion` en transacción con ROLLBACK:
  captura normal (respuesta sin montos), folio inexistente, confirmación por
  exceso, semana aprobada bloqueada, fecha futura bloqueada, listar/resumen,
  editar/borrar, y `select` directo a `prod_registros` → 0 filas visibles.
  Pantalla probada con arnés de teclado real (Enter/Tab/F2).
- Pendiente: Fase 4 (cierre semanal, revisión y aprobación).

### V69 — Producción y Premios · FASE 4 (cierre, revisión y aprobación)

- **Cierre semanal SIN cron** (activar `pg_cron` es un cambio de plataforma, no
  se hizo): una semana ya NO la puede capturar quien solo captura
  (`captura_produccion`) en cuanto termina el martes (00:00 hora de Torreón =
  "martes 23:59"). El estado `en_revision` se materializa al abrir la pantalla
  de revisión (`prod_cerrar_vencidas`) o con el botón "Pasar a revisión"
  (`prod_cerrar_semana`). Los admins corrigen registros mientras la semana NO
  esté aprobada (`prod_puede_editar_semana`, misma regla en las 3 RPC de
  captura, re-creadas con la misma firma).
- **Aprobar** (`prod_aprobar_semana`) ahora exige `en_revision`; congela el
  snapshot en `prod_premios_semana`. **Reabrir** (`prod_reabrir_semana`): solo
  `admin_general`, con motivo (se agrega a `notas`), borra el snapshot y deja
  la semana en `en_revision`; las semanas importadas del Excel no se reabren.
- **Pantalla `/produccion/revision`** ("Revisión producción"; admin_general y
  admin_fabrica): selector de semana, botones según estado, resumen (total de
  premios, personas, valor generado, comparación contra la semana anterior),
  tabla por lugar (valor generado, semana anterior, mejora o "Sin base",
  bonos, total) y detalle por operadora con sus registros. Todo el cálculo
  viene del servidor (`prod_revision_semana`: congelado si está aprobada,
  calculado si no). `supabase/schema_v69_produccion_revision.sql`.
- **Verificado** con una semana de prueba en transacción con ROLLBACK
  (Juanis captura → cierre → vista previa → aprobar → snapshot → editar/borrar/
  capturar bloqueados → reabrir con motivo → editar de nuevo): 100% según lo
  esperado; Juanis no puede aprobar, reabrir ni ver montos.
- Pendiente: Fase 5 (dashboard, imprimibles, pantallas de administración).

### V70 — Producción y Premios · FASE 5 (dashboard, imprimibles y administración)

- **SQL aplicado** (`supabase/schema_v70_produccion_reportes_admin.sql`, solo
  admin_general/admin_fabrica): `prod_historial_valores` (valor por operadora
  por semana; aprobadas/importadas desde `prod_valor_semana`, las demás desde
  registros), `prod_guardar_operacion`, `prod_guardar_operadora`,
  `prod_guardar_regla`, `prod_guardar_config`. No hay función de borrado: las
  operaciones solo se desactivan y un folio jamás se reutiliza. Verificado con
  ROLLBACK (altas, duplicados, ediciones, permisos; Juanis bloqueada).
- **`/produccion/dashboard`**: una fila por operadora activa con semana actual,
  anterior, promedio de las 4 anteriores, % de cambio, mejor semana, semanas
  con datos (valor > 0) y clasificación (umbral propuesto ±10% contra su
  promedio: "Arriba / En su / Abajo de su promedio", "Sin base"). Lógica en
  `utils/produccionStats.js`.
- **Imprimibles (ajustado a petición: sin número de operadora; el ranking solo trae lugar, nombre, valor actual, anterior y % de mejora, sin bonos)** (`components/pdf/ProduccionPdf.jsx`, vista previa en
  `PdfPreviewModal` antes de descargar): **hoja por operadora** (valor
  generado, lugar, premio desglosado, gráfica de barras de las últimas 8
  semanas, comparación con su promedio; "no es tu sueldo") — una hoja por
  persona o una sola desde el botón "Hoja" — y **ranking general** de la
  semana (una hoja, total de premios). Probado con datos reales (semana
  16–22 sep: total $6,800).
- **`/produccion/admin`** (pestañas): Operaciones (filtro por prenda,
  búsqueda, editar parte/operación/segundos, activar/desactivar, panel
  "folios libres por centena", alta con sugerencia de folio), Operadoras
  (alta/edición, participa en bonos, activa), Reglas de premios (mejora en
  %), Configuración (precio por segundo y segundos de jornada). Aviso fijo:
  "Cambiar un tiempo o precio no modifica semanas ya capturadas".
- **Folios por centena** (`sugerirFolioPrendaExistente`, `sugerirCentenaNueva`,
  `validarFolioNuevo`): prenda existente → máximo folio de esa prenda + 1,
  saltando folios de cualquier otra prenda (las centenas compartidas: 400
  Playera/Camisolas, 1000 Chamarras); prenda nueva → primera centena libre
  (hoy **1300**); folio editable con validación de existencia, aviso si queda
  fuera de la centena de la prenda, y aviso si a la centena le quedan < 10
  libres. Hoy ninguna centena está por debajo de 10 libres. (El renombre de
  "CHAMARA CON FORRO" ya se hizo en la Fase 1.)
- Menú: "Dashboard producción" y "Admin producción" (admins). Fuera de
  alcance (sin tocar): foto del papelito con Claude Vision, ligar registros a
  órdenes, avance a media semana para cada operadora, COSTEO/ORDEN PROD.

### V71 — Talleros: historial visible, teléfono del cliente y dinero que deja

Pedido: historial por tallero (quién lo prestó, a quién y cuándo, para saber a
quién preguntar si hay un problema) + campo de teléfono del cliente + campo por
si deja dinero. `supabase/schema_v71_talleros_contacto_deposito.sql` (aplicado
2026-09-25): columnas `prestado_telefono`/`prestado_deposito` en
`mt_contenedores` y `telefono`/`deposito` en `mt_movimientos`; `mt_prestar`
(+`p_telefono`, `p_deposito`) y `mt_devolver` (+`p_deposito_devuelto`) con DROP
de las firmas anteriores; una sola versión de cada una, anon sin acceso.
Frontend: modal Prestar con "Teléfono del cliente" y "Dinero que deja ($)"
(opcionales); Devolver con "Dinero que se le devuelve" (prellenado con lo que
dejó); tarjeta y detalle muestran "Tel." y "Dejó $"; el detalle ahora trae una
TABLA "Historial de préstamos" (fecha, movimiento, quién lo prestó/recibió,
cliente, teléfono, dinero, detalle) y las tarjetas tienen botón "Historial".
Aviso: talleros lo ven todos los roles con sesión salvo `tienda` y
`captura_produccion` (fábrica incluida), así que teléfono y dinero también.


### V72 — Estadísticas de producción (Fase 6)

Nueva sección de menú "Estadísticas de producción" (`/estadisticas-produccion`,
solo `admin_general`/`admin_fabrica`), separada de "Estadísticas" (tiempos de
entrega) pero con el mismo estilo. `supabase/schema_v72_produccion_estadisticas.sql`
(aplicado 2026-09-25): funciones NUEVAS, todas con `prod_puede_ver_montos()` y
sin acceso para anon: `prod_stats_info`, `prod_stats_semanas`,
`prod_stats_distribucion_meta`, `prod_stats_destacados`, `prod_stats_prendas`,
`prod_stats_operaciones`, `prod_stats_dias`. Nada de cálculo duplicado en el
frontend (premios de semanas abiertas/en revisión salen de `prod_revision_semana`).
Filtros: rango de semanas (default últimas 12) + operadora. Secciones: KPIs de la
semana elegida, tendencia valor vs premios, premios/valor %, distribución por
nivel de bono meta (incluye "sin bono meta"), destacados (top 5 valor, top 5 %
mejora sin "Sin base", rachas de 3+ semanas ≥10% abajo de su promedio de 4),
valor por prenda, top 10 operaciones (piezas y valor) y producción por día
(mié–mar). Las semanas importadas solo traen totales por persona: prendas,
operaciones y días usan solo semanas con registros, con nota "Datos por operación
desde …". Semanas abiertas/en revisión se marcan "preliminar" (barras rayadas).
Origen del premio: `congelado` (aprobada con snapshot), `preliminar`, `calculado`
(importada sin snapshot: se recalcula con las reglas actuales).
Aviso: por ser recalculado, el total de premios de semanas importadas cambia si se
cambia "participa en bonos" o las reglas. Validado: semana 09-22 = $6,800 con las
32 participantes originales; hoy da $6,400 porque Adriana Aguirre y Jaqui Romero
se marcaron "no participa".

### V73 — "Costura" en estados y usuarios

Solo etiquetas (las claves internas no cambian): estado `en_produccion` →
"En costura", `produccion` → "Costura terminada", grupo/etapa "Costura", rol
`produccion` → "Costura", `captura_produccion` → "Captura de costura".
"Producción" queda para el proceso completo (Órdenes/Etapas de producción, módulo
Producción y Premios).


### V74 — PWA instalable

`vite-plugin-pwa` (registerType `prompt`, generateSW). Manifest "SALPER", standalone,
theme `#16130f`, fondo `#f7f6f2`, `start_url` `./#/`; íconos 192/512 + `maskable-icon-512.png`
(copia del 512, el logo ya cae dentro de la zona segura) + apple-touch-icon. El service
worker solo precachea JS/CSS/HTML/íconos; SIN runtimeCaching, así que Supabase y APIs
nunca se cachean. Aviso "Hay una nueva versión — Actualizar" (`components/pwa/UpdatePrompt.jsx`,
revisa cada 30 min y al volver a la app). `/#/instalar` es pública (también sin sesión):
botón Instalar con `beforeinstallprompt` (capturado en `lib/pwaInstall.js`), pasos de
Safari para iPhone/iPad (avisa si no es Safari), "Ya tienes la app instalada". Login
email+contraseña en localStorage: funciona en la app instalada; en iPhone se inicia
sesión una vez porque no comparte sesión con Safari. `vercel.json`: sw.js/manifest sin caché.


### V75 — Nombre visible: "SALPER · Sistema Operativo"

Antes "Órdenes de producción". Cambiado en: `<title>` (index.html), subtítulo del
encabezado (AppLayout), login y descripción del manifest PWA. No se tocaron repo,
URL, tablas ni rutas; "órdenes de producción" sigue como nombre del módulo de órdenes.


### V76 — "Entregada" y "Lista para entregar"

Sin cambios de base de datos: el estado final sigue siendo la clave `completado`
(ya era un paso manual, solo `admin_fabrica`/`admin_general`), ahora con etiqueta
**"Entregada"**; al confirmarla pasa a Órdenes pasadas. Botón "Confirmar entrega al
cliente" con `window.confirm`. Cuando `status === 'terminado'` (todas las etapas
listas) se muestra la insignia verde "✓ Lista para entregar" (`StatusBadge`, así
sale en tarjetas y detalle) y un aviso en la tarjeta de estado; la orden sigue en el
Dashboard hasta confirmar la entrega. Textos "completadas" → "entregadas" en Órdenes
pasadas y Estadísticas (las estadísticas de tiempo miden hasta la entrega).


### V77 — Precios y facturación por orden

`supabase/schema_v77_precios_facturacion.sql` (aplicado 2026-09-26, todo aditivo salvo el
parche del candado y la política de `anticipos`). Tablas: `cliente_razones_sociales`
(varias por cliente, una predeterminada), `orden_precios` (por prenda: `item_index` +
snapshot de `prenda`, precio unitario, extras `[{concepto,monto}]` por pieza),
`orden_facturacion` (requiere factura, `precios_incluyen_iva` default true, razón social
elegida + `fiscal_snapshot`), `fin_config` (`candado_desde`). Los precios NO van en
`orders.items` (lo lee cualquier rol): RLS solo para `fin_puede_ver()` = admin_general,
admin_tienda, admin_fabrica, ventas, contabilidad. Editan precios/facturación:
admin_general, admin_tienda, ventas (`fin_puede_editar`); razones sociales: + contabilidad.
Todo el cálculo en Supabase: `orden_totales` (subtotal, IVA, total, anticipos, saldo,
faltantes), `orden_faltantes`, `ultimo_precio_cliente_prenda`, `orden_resumen_entrega`.
IVA: sin factura total = capturado; factura + precios con IVA → total = capturado y se
desglosa /1.16; factura + "más IVA" → +16%. Anticipos: se reusa la tabla `anticipos` (V16);
su lectura ahora también es solo `fin_puede_ver()` (antes cualquier rol con sesión).
`orders.total_orden` (V42, total manual) sigue como respaldo de órdenes viejas.
Candado: `update_order_status` (parche sobre la definición viva) llama a
`fin_validar_entrega` al pasar a `completado`: exige precio en toda prenda con piezas y
razón social si pide factura; solo para órdenes creadas desde `candado_desde`
(las anteriores no se bloquean). Si las prendas cambian de posición/nombre después de
fijar precios, esa prenda cuenta como "sin precio". Frontend: `OrderFacturacionCard`
(precios, extras, sugerencia del último precio del cliente, switch de factura, razón
social con alta sin salir de la orden, totales, "Resumen de entrega" con vista previa/PDF
`EntregaResumenPdf`), `RazonesSocialesManager` (también en Catálogos > Clientes).
Simulación con roles (transacción revertida): producción no ve/edita nada; 3 razones
sociales con una sola predeterminada; 15 pzs Playera $180+$25 y 10 Short $100 = $4,075;
con factura+IVA incluido → subtotal 3,512.93, IVA 562.07; "más IVA" → total 4,727; anticipo
$1,000 → saldo 3,075 / 3,727; candado bloquea "Falta precio en: Short"; orden vieja pasa.


### V78 — Pendientes tienda ↔ fábrica (reemplaza el módulo de Pendientes viejo)

`supabase/schema_v78_pendientes_tienda_fabrica.sql` (aplicado 2026-09-26, todo aditivo,
prefijo `pf_`). La tabla vieja `pending_items` (0 filas) y sus 2 funciones quedan intactas,
sin uso (se pueden borrar más adelante); se quitó su código del frontend. Tablas:
`pf_tipos_trabajo` (catálogo editable: Arreglo, Bordado, Ajuste, Sublimado, Otro),
`pf_pendientes` (folio `P-0001` de la secuencia `pf_folio_seq`, nunca se reutiliza;
descripción, tipo, cantidad, fotos jsonb en el bucket order-photos/pendientes, fecha
requerida obligatoria, cliente y orden opcionales, `estado_desde`), `pf_historial`
(quién/rol/cuándo/nota). Estados: enviado_a_fabrica → recibido_en_fabrica ("Por hacer") →
**listo_para_regresar** (estado intermedio agregado) → enviado_a_tienda → recibido_en_tienda;
`con_problema` desde cualquier estado con nota obligatoria, y `pf_resolver_problema`
regresa al estado previo. Roles tienda: ventas, contabilidad, admin_tienda, tienda; fábrica:
corte, bordado, sublimado, produccion, terminado, admin_fabrica; admin_general todo; ver:
todos menos captura_produccion. RPCs: `pf_crear`, `pf_editar` (solo antes de que fábrica
reciba), `pf_cambiar_estado`, `pf_cambiar_estado_lote` (aplica a los válidos y reporta
omitidos), `pf_resolver_problema`, `pf_guardar_tipo`. Realtime en `pf_pendientes`.
Frontend: `/pendientes` (bandejas por rol, filtros tipo/cliente/fechas, buscador de folio,
selección múltiple con barra fija "Confirmar (N)", botón grande de un toque por tarjeta,
rojo si enviado a fábrica y sin recibir >1 día o vence hoy/vencido, amarillo ≤2 días),
`/pendientes/:id` (historial, problema/resolver, etiqueta PDF 80×50 mm con vista previa).
Simulación con roles (revertida): 3 pendientes de tienda → fábrica recibe en lote → uno
con problema (sin nota bloqueado) y resuelto → listo → enviado → tienda cierra en lote;
historial de 7 pasos con usuario y rol; captura_produccion ve 0. El contador de folios se
reinició a P-0001 tras la simulación.


### V79 — Roles `lectura` y `tienda` ya se pueden asignar + edge function al día

`supabase/schema_v79_roles_lectura_tienda.sql` (aplicado 2026-09-26): `profiles_role_check`
solo aceptaba 11 roles; `lectura` y `tienda` existían en código desde V30 pero la base los
rechazaba. Ahora acepta los 13 (solo amplía; nadie cambia de rol). La edge function
`admin-create-user` desplegada tampoco traía `captura_produccion` en `VALID_ROLES`
(estaba solo en el repo); se desplegó la versión del repo (idéntica salvo esa línea,
verificado por hash), así que ya se puede crear a Juanis con ese rol.


### V80 — Pendientes: "¿es para un cliente?"

`supabase/schema_v80_pendientes_para_cliente.sql` (aplicado 2026-09-26): `pf_pendientes`
gana `es_para_cliente`, `cliente_nombre`, `cliente_telefono`, `prenda`, `talla`. Si es para un
cliente, `pf_crear`/`pf_editar` (firma nueva, DROP de la anterior) exigen nombre, teléfono,
tipo de prenda y talla; si no, se guardan en null ("se queda en la tienda"). El nombre se
liga a `cliente_id` solo si coincide con un cliente del catálogo; si no, es incidental.
Formulario con botones "No, se queda en la tienda" / "Sí, es de un cliente"; tarjeta, detalle
y etiqueta muestran los datos; el filtro de cliente ahora es por nombre/teléfono más un
selector "solo de clientes / solo de la tienda". Simulación revertida: sin teléfono o sin
talla se bloquea; para tienda queda todo en null; editar de cliente a tienda limpia los campos.


### V81 — Pendientes: prenda y talla siempre obligatorias

`supabase/schema_v81_pendientes_prenda_talla_siempre.sql` (aplicado 2026-09-26): tipo de
prenda y talla se piden en TODO pendiente (para cliente o para la tienda); nombre y teléfono
solo si es para un cliente. Mismas firmas que V80 (`create or replace`). El formulario las
muestra siempre (fuera del bloque del cliente); tarjeta, detalle y etiqueta las muestran
siempre. Simulación revertida: sin prenda/talla se bloquea aunque sea de tienda; sin teléfono
se bloquea si es de cliente.


### V82 — Pendientes: sin fecha de regreso, prenda abierta, solo Arreglo y Bordado

`supabase/schema_v82_pendientes_sin_fecha_tipos.sql` (aplicado 2026-09-26): `fecha_requerida`
ya no es obligatoria (se quitó del formulario; `pf_crear`/`pf_editar` sin ese chequeo). Las
alertas de urgencia por fecha desaparecen para pendientes nuevos (siguen si un pendiente
viejo la trae); la alerta roja de "enviado a fábrica y sin recibir >1 día" se mantiene. El
filtro de fechas ahora es por fecha de envío (creación). "Tipo de prenda" es texto libre
(sin sugerencias). Tipos de trabajo: solo Arreglo y Bordado activos; Ajuste, Sublimado y
Otro quedaron desactivados (no borrados; reactivables en "Tipos de trabajo"). Etiqueta:
muestra "Enviado el" cuando no hay fecha de regreso.


### V83 — Pendientes: sin orden relacionada, inventariado siempre, pagado por cliente

`supabase/schema_v83_pendientes_inventariado_pagado.sql` (aplicado 2026-09-27): se quita
`order_id` (columna dropeada; nunca se usó) y el selector "Orden relacionada" del
formulario. Se agregan `inventariado` (SIEMPRE obligatorio, explícito true/false, mismo
criterio que el módulo viejo de "Orden de reparación") y `pagado` (obligatorio solo si
`es_para_cliente`; null si no). `pf_crear`/`pf_editar`: DROP + recreate con la firma nueva.
Formulario: botones "Inventariado / No inventariado" (siempre visibles) y "Pagado / No
pagado" (solo dentro del bloque de cliente). Tarjeta y detalle muestran ambos.
Limpieza de datos: se borró **P-0001** (era prueba); **P-0002** (Claudia Puentes, real) se
marcó **pagado**; **P-0003** (real, sin cliente) se dejó igual. El folio P-0001 no se
reutiliza (mismo criterio que folios de orden); el siguiente pendiente nuevo será P-0004.


### V84 — Pendientes: nota sin traslape + "inventariado" solo si se queda en tienda

`supabase/schema_v84_pendientes_inventariado_solo_tienda.sql` (aplicado 2026-09-27):
`pf_crear`/`pf_editar` ya no exigen `inventariado` cuando el pendiente es para un cliente
(se guarda en null, igual que `pagado` cuando no lo es); solo es obligatorio cuando se
queda en la tienda. P-0002 (Claudia Puentes) se limpió su `inventariado` a null. Formulario:
el botón "Inventariado / No inventariado" ahora solo aparece cuando NO es para un cliente
(en ese caso se ve "Pagado / No pagado" en su lugar); tarjeta y detalle muestran uno u otro
según corresponda. Además, arreglado un traslape visual: el aviso junto a "Nota" (en
confirmar/marcar problema) usaba la clase `page-subtitle`, que trae un margen negativo
pensado solo para ir pegada debajo de un `<h2>` — se cambió a `pantone-hint` (mismo tono,
sin ese margen), que es la clase que ya se usaba en otras partes del sistema para este
mismo caso.


### V85 — Pendientes: sin filtros ni buscador

Se quitó todo el bloque de filtros (buscar folio, tipo, cliente/tienda, cliente por nombre
o teléfono, rango de fechas) de `/pendientes` — con pocos pendientes a la vez no hacía
falta, y quedaba encima de las bandejas. Las bandejas (En camino a fábrica / En fábrica /
etc.) se quedan igual: son las colas de trabajo, no un filtro de búsqueda. Solo cambio de
frontend, sin tocar Supabase.


### V86 — Pendientes: se quita "con problema"

Se quitó de la pantalla toda la parte de "con problema": la bandeja en ambas vistas
(tienda/fábrica), el botón "Marcar con problema", "Resolver problema" y la insignia/borde
rojo en tarjeta y detalle. Ningún pendiente real estaba en ese estado (se verificó antes de
tocar nada). Solo frontend: el estado `con_problema` y `pf_resolver_problema` se quedan en
Supabase sin usarse (no se borró nada de la base), por si se necesita revertir esto después.


### V88 — Nuevo rol "Admin (Fábrica) — solo lectura" (para el papá del usuario)

`supabase/schema_v88_admin_fabrica_lectura.sql` (aplicado 2026-09-27): rol nuevo
`admin_fabrica_lectura` que ve todo lo que ve admin_fabrica, sin poder escribir nada.
Regla de diseño: **nunca** se agregó el rol nuevo a una función de escritura.

- `profiles_role_check` y `admin_update_user_role` (esta última también le faltaban
  'lectura'/'tienda' desde V30 — se corrigió de paso) amplían su lista.
- Producción: `prod_puede_ver_montos()`/`prod_puede_capturar()` (guardan lectura Y
  escritura a la vez) se dejan intactas; se crean `prod_puede_ver_lectura()` /
  `prod_puede_ver_captura()` nuevas, y SOLO las funciones 100% de lectura
  (`prod_calcular_premios`, `prod_revision_semana`, `prod_listar_semanas`,
  `prod_historial_valores`, `prod_stats_*`, `prod_listar_registros`,
  `prod_resumen_captura`) y las policies de SELECT de `prod_config`/`reglas_premios`/
  `registros`/`valor_semana`/`premios_semana`/`operaciones`/`operadoras`/`semanas` se
  parchan (vía `pg_get_functiondef` + reemplazo de texto sobre la definición viva,
  mismo método que V66b) para usarlas. Ninguna función que guarda/aprueba/cierra/borra
  se tocó.
- `fin_puede_ver()` (V77, 100% lectura) se amplía directo.
- Se cerraron 6 candados tipo "denylist" que de otro modo habrían dejado escribir al
  rol nuevo por omisión (no estaba en la lista = pasa): `create_announcement`,
  `delete_announcement`, `add_order_photos`, `remove_order_photo`,
  `set_order_notas_internas`, `update_pending_item_status` (este último, del módulo
  viejo de pendientes, ya sin uso).
- Frontend (`src/utils/permissions.js`): `canViewEtapas`, `canViewEstadisticas`,
  `canViewProduccionMontos`, `canViewFinanzas`, `canViewCatalogos` amplían para
  incluirlo; `SIN_ESCRITURA_GENERAL` lo agrega (anuncios/fotos/notas quedan
  bloqueadas); `canViewSurtido` (nueva) abre la tarjeta de "Cantidad surtida" con
  `canManageSurtido` decidiendo adentro si se ve editable o de solo lectura.
  `esFabricaSoloLectura(role)` es el helper para "ocúltame los controles de escribir,
  déjame ver todo". `ProduccionRevisionPage` esconde los 3 botones de acción; las 4
  pantallas de "Admin producción" (`OperacionesAdmin`/`OperadorasAdmin`/`ReglasAdmin`/
  `ConfigAdmin`) esconden altas/ediciones y deshabilitan checkboxes/inputs, dejando
  las tablas visibles. `PendientesPage` lo trata como dominio "fábrica" solo para
  elegir la bandeja por default (no para poder confirmar nada).
- **Excluido a propósito:** `/produccion/captura` (captura diaria) sigue oculto para
  este rol — es una pantalla de captura pura, sin valor real en solo lectura; si se
  quiere después, se puede agregar con el mismo patrón.
- Simulación con roles (revertida): 12 lecturas distintas (órdenes, stats de
  producción, catálogos de producción, precios/facturación, anticipos, pendientes)
  funcionaron; 14 intentos de escritura (cambiar estado de orden, aprobar/cerrar
  semana, guardar config/regla/operadora, capturar registro, precios, razón social,
  anuncio, foto, nota interna, confirmar pendiente, cambiar su propio rol, crear tela)
  quedaron bloqueados; admin_general sí pudo asignarle el rol nuevo a un usuario.


### V89 — Módulo de Inventario (artículos por fuera de Microsip) — SQL aplicado

`supabase/schema_v89_inventario.sql` (aplicado 2026-09-28). No existía un "Inventario de
Tela" previo en el proyecto; se reusó el patrón de Talleros (catálogo + bitácora de
movimientos + folio de secuencia que nunca se reutiliza). Todo NUEVO, prefijo `inv_`.

- **Modo prueba (punto D):** `inv_acceso_beta` (una fila, tu usuario por correo) +
  `inv_tiene_acceso()`, usado por TODAS las policies/RPCs. RLS habilitado en la tabla
  misma sin ninguna policy de SELECT (ni tú puedes leerla directo — solo la consulta la
  función security definer). Abrir el módulo a más gente después = agregar filas ahí, o
  cambiar `inv_tiene_acceso()` para que también mire el rol.
- **Roles** (aplican encima del modo prueba): `inv_puede_ver()` = admin_general,
  admin_tienda, admin_fabrica (fábrica: solo ve). `inv_puede_mover()` = admin_tienda,
  admin_general (movimientos, conteos, traspasos). `inv_puede_editar()` = igual a
  `inv_puede_mover()` (catálogos).
- **Catálogos:** `inv_ubicaciones` (Bodega tercer piso, Tienda), `inv_secciones`,
  `inv_tallas` (37 tallas, columna `orden` con el esquema de grupos: infantil con hueco
  para TALL/(NN), letra, pantalón, "Sin talla" al final), `inv_motivos` (6 editables +
  3 de sistema: Conteo inicial, Conteo físico, Traspaso — no editables desde la UI).
- **`inv_articulos`:** sección + prenda + talla + mínimo opcional + activo. Sin columna de
  ubicación propia — la existencia es por (artículo, ubicación), siempre
  `SUM(inv_movimientos.cantidad)`, nunca un número guardado.
- **`inv_movimientos`:** bitácora append-only, cantidad firmada.
- **`inv_traspasos`/`inv_traspaso_lineas`:** folio T-0001 (secuencia, nunca se reutiliza).
  `inv_crear_traspaso` crea salida+entrada de cada línea en una sola función = una
  transacción (todo o nada); valida que no se traspase más de lo que hay en origen.
  `estado` ya listo para 'en_transito' (hoy solo 'aplicado').
- **`inv_conteos`/`inv_conteo_lineas`:** `inv_crear_conteo` guarda una foto de la
  existencia de hoy por sección+ubicación (para imprimir); `inv_confirmar_conteo` crea un
  ajuste solo donde hay diferencia.
- Simulación con roles (revertida): ventas no ve nada (ni filas ni `inv_acceso_beta`
  directo — "permission denied"); admin_fabrica ve existencias pero no puede mover ni
  editar; admin_tienda mueve, transfiere (folio T-0001, matemática correcta en origen y
  destino) y hace conteos; una venta que excede existencia se bloquea; un traspaso que
  excede existencia no crea ninguna fila (todo o nada); un conteo con +2 de diferencia
  ajusta correctamente.
- Bug atrapado por Supabase antes de aplicar: `inv_acceso_beta` se creaba sin RLS —
  corregido (RLS habilitado, sin policy de SELECT para nadie, incluido tu propio usuario).

`scripts/import_inventario.py` (nuevo, corre local, no toca la base): lee
`scripts/data/inventario-tercer-piso.csv` (gitignorado), corrige
"Quirurjico"/"Quirurjio" → "Quirúrgico" (en sección y en prenda), quita el prefijo "T.",
une "N/A"/"Sin Talla" en "Sin talla", imprime el resumen por sección antes de escribir, y
genera `scripts/data/import_inventario.sql` (gitignorado, idempotente, avisa si ya hay
movimientos de "Conteo inicial" en vez de duplicar). Resumen real: 465 artículos, 15
secciones, 3,224 piezas totales.

### V90 — Inventario: importación inicial aplicada (465 artículos, 3,224 piezas)

Pegar los 465 bloques de SQL generados por V89 (~360KB) resultó poco práctico en el editor
de Supabase, así que `supabase/schema_v90_inventario_importar_rpc.sql` agrega
`inv_importar_inicial(p_filas jsonb)`: recibe un arreglo JSON compacto
`[{seccion, prenda, talla, piezas}, ...]` y hace del lado del servidor lo mismo que hacía
el SQL generado (crear sección/artículo si no existen; insertar el movimiento de "Conteo
inicial" solo si todavía no hay ninguno con ese motivo — correrlo dos veces no duplica).
Mismo candado que el resto del módulo (`inv_puede_editar()`). `scripts/import_inventario.py`
se reescribió para generar una sola llamada a esta función en vez de los bloques repetidos
(42KB en vez de 360KB).

Ajuste encontrado al aplicar: varias filas reales del CSV traen `piezas: 0` (el artículo
existe en el Sheet pero hoy no tiene existencia). `inv_movimientos.cantidad` tiene
`check (cantidad <> 0)`, así que la función crea el artículo de todas formas pero omite el
movimiento cuando piezas=0 (la existencia igual queda en 0 vía `SUM`).

Aplicado 2026-09-28: se impersonó a un usuario `admin_general` desde el SQL Editor
(`set_config('request.jwt.claim.sub', ...)` + `set local role authenticated`, el patrón ya
usado en este proyecto para acciones administrativas puntuales desde ahí, ya que el editor
no tiene `auth.uid()` por defecto). Resultado verificado con SELECT directo: 15 secciones,
465 artículos, 449 movimientos (465 − 16 filas con piezas=0), 3,224 piezas — coincide
exactamente con el resumen de `import_inventario.py` y con el Google Sheet original.

Pendiente: todo el frontend del módulo (pantalla principal, historial, conteo físico,
traspasos, administración de catálogos) — por ahora solo existen schema + datos.

### V91 — Inventario: primer draft del frontend completo

Todo NUEVO, sin tocar ningún módulo existente. `src/services/inventarioService.js`
(lectura directa de catálogos + RPCs de V89/V90, escritura siempre por RPC) y
`src/hooks/useInventario.js` (catálogos + existencias por sección). Rutas nuevas bajo
`/inventario`, `/inventario/traspasos`, `/inventario/conteos`, `/inventario/admin`;
un solo link en el nav ("Inventario"), visible solo si `canViewInventario(role) &&
isInventarioBetaUser(user)` (mismo candado del modo prueba, espejo del servidor —
`RequireInventarioAccess` lo repite como defensa en profundidad si alguien entra
directo por URL).

- **Pantalla principal** (`InventarioPage.jsx`): secciones como pestañas
  (`.type-tabs`, reusado de tipos de orden), prendas agrupadas por talla (orden del
  catálogo) en tarjetas por prenda con "chips" por talla — cada chip muestra la
  existencia (roja si está bajo el mínimo) y botones +/− grandes que abren
  `MovimientoModal` (cantidad default 1, motivo, ubicación, nota). Toggle
  Total/por-ubicación y buscador por prenda. Click en el valor abre
  `HistorialModal` (usuario/fecha/motivo/nota/folio de traspaso si aplica).
- **Traspasos** (`InventarioTraspasosPage.jsx` + `TraspasoFormModal.jsx`): buscador
  por folio, alta con buscador de artículo global (todas las secciones) + líneas +
  cantidad, aviso si excede existencia en origen (el servidor igual valida
  todo-o-nada). Al confirmar se genera el PDF del vale (`InventarioTraspasoPdf.jsx`,
  mismo estilo que `RemisionPdf.jsx`) con `PdfPreviewModal` — mismo patrón que el
  resto de los PDFs de SALPER.
- **Conteos físicos** (`InventarioConteosPage.jsx` + `ConteoCapturaModal.jsx`):
  "Nuevo conteo" pide sección+ubicación, llama `inv_crear_conteo` (toma la foto de
  existencia de hoy) y abre de inmediato el PDF para imprimir
  (`InventarioConteoPdf.jsx`, columna "Conteo" en blanco). La captura muestra
  Sistema vs. un input de Conteo por línea (en rojo si difiere) y al confirmar solo
  manda las líneas sí capturadas — `inv_confirmar_conteo` ajusta nada más donde hay
  diferencia. Un conteo ya confirmado se abre en solo lectura.
- **Administración** (`InventarioAdminPage.jsx`, exclusivo de quien puede editar):
  4 pestañas (Secciones/Ubicaciones/Motivos/Artículos). Nunca hay borrado real —
  ninguno de los RPC de V89 lo expone — "eliminar" siempre es desactivar
  (`activa`/`activo`), así que un artículo con movimientos no se puede perder. Los 3
  motivos de sistema (Conteo inicial/Conteo físico/Traspaso) se muestran aparte,
  sin edición (el RPC los bloquea igual del lado del servidor).

Sin SQL nuevo — V89/V90 ya traían todos los RPC de lectura/escritura necesarios;
`fetchArticulosAdmin` es la única lectura directa nueva (tabla `inv_articulos`, para
que Administración también vea los artículos desactivados, a diferencia de
`inv_existencias()` que solo trae los activos).

Verificado: `npm run build` sin errores; no se pudo probar en vivo con sesión real
dentro de esta sesión (el módulo exige tu correo exacto — no hay credenciales para
iniciar sesión desde aquí). Pendiente que confirmes en el navegador: crear un
movimiento, un traspaso y un conteo con datos reales.

### V92 — Inventario: tallas completas, reporte por colegio, prefijo "T." y acordeón

Cuatro ajustes a la pantalla principal, todos pedidos después de ver el primer draft:

- **Tallas completas por prenda ("que no haya, diga 0")**: `fillTallaGaps()` en
  `InventarioPage.jsx` agrega "chips virtuales" (existencia 0, sin fila real en
  `inv_articulos` todavía) para las tallas del catálogo que faltan ENTRE la más chica
  y la más grande que esa prenda ya tiene en ese colegio. Es "por familia" —
  infantil/letra/pantalón/sin-talla, mismos cortes de `orden` que sembró V89 — nunca
  mezcla familias (ej. no le pone tallas de pantalón 28-44 a una playera que solo usa
  infantil, aunque el orden numérico quede "cerca"), y no ofrece variantes TALL/(NN)
  a menos que la prenda ya las use. Verificado contra datos reales de producción
  (Echavarria/Instituto Tricio/Quirúrgico Dama) antes de aplicar — la primera versión
  (rellenar todo el rango sin agrupar por familia) sí mezclaba letra/pantalón
  incorrectamente y se descartó. El artículo real (`inv_articulos`) se crea recién al
  primer movimiento sobre un chip virtual (`MovimientoModal` llama `guardarArticulo`
  antes de `registrarMovimiento` si `articuloId` viene null) — no antes, no hay
  alta masiva ni SQL nuevo.
- **Reporte por colegio** (`ReporteModal.jsx` + `InventarioReportePdf.jsx` +
  `generateInventarioReportePdf.jsx`): botón "Reporte" en la pantalla principal, para
  el colegio activo. Elige alcance — una ubicación específica, "Consolidado (total)"
  o "Consolidado detallando almacenes" (columna por ubicación + total) — y prenda
  (todas o una). Usa los mismos datos ya cargados en pantalla (incluidas las tallas
  rellenadas), sin pedir nada nuevo al servidor.
- **Prefijo "T." en tallas numéricas** (`src/utils/inventarioTallas.js`,
  `formatTalla()`): "10" se muestra "T.10" en toda la UI y los PDFs (chips, modales,
  Administración, traspasos, conteos, reportes) para no confundirla con una
  cantidad. Solo tallas puramente numéricas (incluye pantalón 28-44 y variantes TALL/
  "(NN)"); las de letra (XS…5XL) y "Sin talla" se quedan igual. Es solo
  presentación — `inv_tallas.nombre` en la base sigue sin el prefijo.
- **Prendas como acordeón**: cada prenda es ahora un header clicable (colapsado por
  defecto) en vez de una tarjeta siempre expandida — para colegios con muchas prendas
  (Instituto Tricio tiene ~20+) no hay que scrollear todo para llegar a una de más
  abajo. La llave de "abierto/cerrado" incluye la sección (`${seccionId}:${prenda}`),
  no solo el nombre de la prenda — varios colegios repiten nombres de prenda (Falda,
  Pantalon…) y sin eso abrir una en un colegio la dejaba abierta también en otro.

Sin SQL nuevo. Verificado con `npm run build` y una simulación en Node del algoritmo
de `fillTallaGaps` contra 6 casos reales de producción (incluidos los 2 que la
primera versión rellenaba mal) antes de dar el cambio por bueno.

### V93 — Reporte con checks de prendas + paleta viva en Estadísticas

Dos ajustes, sin SQL:

- **Reporte con selección libre de prendas**: `ReporteModal.jsx` cambió de un select
  de una sola prenda a "Todas las prendas" (checkbox) + una lista de checks — se
  puede pedir el reporte de cualquier combinación (una, dos, tres… o todas).
  `handleGenerarReporte` en `InventarioPage.jsx` recibe `prendasFiltro` (arreglo o
  `null`) en vez de un solo nombre; `InventarioReportePdf.jsx` ya no arma el
  subtítulo internamente (antes solo sabía "una prenda o todas") — ahora lo recibe
  ya armado (`subtitulo`) desde `generateInventarioReportePdf.jsx`, que sí sabe
  listar varios nombres o abreviar a "N prendas".
- **Paleta viva en las 2 pantallas de Estadísticas** (Estadísticas y Estadísticas de
  producción): pedido explícito del usuario — "colores más vivos… que las gráficas
  no tengan negros". Se agregaron 6 tokens nuevos en `:root`
  (`--color-chart-blue/pink/green/purple/red/teal`), a propósito **distintos** de
  `--color-danger`/`--color-good` (que siguen siendo exclusivos de
  atrasado/completado — la regla de identidad visual de SALPER de solo usar
  rojo/verde para esos dos estados sigue intacta fuera de estas 2 pantallas). Se
  usaron para: las barras de `.stage-bar-row__fill` (Tiempo promedio por etapa /
  Distribución por bono meta) ahora rotan un color distinto por fila en vez de un
  solo naranja; `.month-bar__fill` (Tendencia mensual) pasó de ámbar a azul vivo; el
  borde bajo el encabezado de `.stats-table` pasó de negro a azul vivo; y en las
  gráficas SVG de producción (`StatsCharts.jsx`, clases `.pstat-*`) la barra "Valor
  generado" pasó de **negro** a azul vivo, "Premios" de ámbar a rosa vivo, y la
  línea de "Premios sobre valor generado" de naranja a morado vivo (para
  diferenciarla de las barras). El rayado ámbar de "semana preliminar" se dejó
  igual (es un indicador de estado, no una serie de datos).

No se pudo verificar visualmente con sesión real (no hay credenciales de la app
disponibles en esta sesión, igual que en V91/V92) — verificado solo con
`npm run build`.

### V94 — Pendientes: estado "entregado" (solo pendientes de cliente)

`supabase/schema_v94_pendientes_entregado.sql` (aplicado 2026-09-28, aditivo,
verificado con hash y con SELECTs directos después de correrlo).

**Qué se agregó:**
- 4 columnas nullable en `pf_pendientes`: `entregado_en`, `entregado_por` (FK
  `profiles`), `entregado_por_nombre` (snapshot, mismo patrón que
  `creado_por_nombre`/`cambiado_por_nombre` — no estaba en el pedido original pero
  es el criterio que ya usa toda la tabla, así que se agregó para no romper la
  convención), `recogio` (texto libre).
- `'entregado'` se agregó al check constraint de `estado` (`pf_pendientes_estado_check`,
  drop + recreate con el mismo nombre).
- RPC nuevo `pf_marcar_entregado(p_id, p_recogio)`: exige `pf_puede_entregar()`
  (ver permisos abajo), que el pendiente sea `es_para_cliente = true` y que esté en
  `recibido_en_tienda`; pasa a `entregado`, llena los 4 campos nuevos y
  `cerrado_en`, e inserta su fila en `pf_historial` (mismo mecanismo de siempre —
  el historial de "Entregado" sale gratis, sin pantalla nueva).
- `pf_aplicar`/`pf_resolver_problema`: `cerrado_en` ya NO se llena en
  `recibido_en_tienda` cuando `es_para_cliente = true` (se queda `null` hasta
  `pf_marcar_entregado`); para pendientes que se quedan en la tienda, sigue
  llenándose exactamente igual que antes.

**Qué se decidió:**
- Permiso propio y más angosto: `pf_puede_entregar()` = `ventas, admin_tienda,
  admin_general` — a propósito NO incluye `contabilidad` ni el rol básico `tienda`
  (que sí están en `pf_es_tienda()`, usado por el resto del flujo). Pedido
  explícito del usuario.
- Frontend (`permissions.js`: `canMarcarEntregado`; `pendientesService.js`:
  `marcarEntregado`, `diasEsperandoEntrega`; `PendientesPage.jsx`,
  `PendienteCard.jsx`, `PendienteDetailPage.jsx`, `EntregarModal.jsx` nuevo):
  - Bandeja "Cerrados" (tienda) se partió en dos: **"Por entregar"**
    (`recibido_en_tienda` + `es_para_cliente`, ordenada por `estado_desde`
    ascendente — reusa esa columna, no hace falta una nueva para "antigüedad") y
    **"Cerrados"** (lo que de verdad terminó: no-cliente en `recibido_en_tienda`, o
    cualquiera en `entregado`). La tarjeta ya no se pinta "cerrada" (opacidad) para
    un pendiente de cliente que todavía no se entrega; se resalta en rojo pasados
    7 días esperando (mismo estilo que la alerta de ">1 día sin recibir" que ya
    existía).
  - Botón grande "Marcar como entregado" (solo si `canMarcarEntregado` y el
    pendiente aplica) abre `EntregarModal` — un campo opcional "¿Quién recogió?"
    y confirmar, nada más obligatorio.
  - Badge `badge--status-entregado`: mismo verde que ya usa "Completado" en
    órdenes (criterio ya establecido de "verde = terminado de verdad").
  - Bandeja "Enviados a tienda" de fábrica ahora también incluye `entregado`
    (solo lectura, fábrica no actúa sobre ese estado).

**Qué quedó pendiente:**
- Verificación en vivo con datos reales (no hay credenciales de la app en esta
  sesión) — falta que el usuario confirme: marcar un pendiente de cliente real
  como entregado, revisar que aparece en "Cerrados" y con el badge/hora/usuario
  correctos, y que uno de tienda (sin cliente) se sigue cerrando igual que
  siempre en "recibido_en_tienda".
- No se tocó `pf_cambiar_estado_lote` (confirmación en bloque): "entregado" es
  deliberadamente una acción de un solo pendiente a la vez (con su propio campo
  opcional de "quién recogió"), no se agregó a la lógica de lote.

### V95 — Inventario: se abre por rol (ya no es "modo prueba")

`supabase/schema_v95_inventario_roles.sql` (aplicado 2026-09-28, verificado con
hash y con la tabla de roles simulada). Pedido explícito del usuario: "agregues ya
el módulo de inventarios a las vistas de todos... tienda básico pueda cambiar el
inventario, y que los admins y ventas tengan acceso para verlo".

- `inv_puede_ver()`: ahora también `ventas` y `tienda` (antes solo los 3 admin).
- `inv_puede_mover()` (movimientos, traspasos, conteos): ahora también `tienda`
  (antes solo `admin_tienda`/`admin_general`). `ventas` y `admin_fabrica` se
  quedan en solo lectura.
- `inv_puede_editar()` (Administración: catálogos de secciones/ubicaciones/
  motivos/artículos): **decisión propia, no explícita en el pedido** — se dejó
  igual que antes (`admin_tienda`/`admin_general`), ya NO como alias de
  "mover" — `tienda` puede cambiar existencias pero no administrar catálogos.
  Los admins conservan su capacidad de mover (el mensaje del usuario podía leerse
  como "los admins solo ven", pero eso hubiera sido un downgrade de algo ya
  construido y probado en V91-V93 sin que lo pidiera explícitamente — se avisó
  al usuario de esta interpretación).
- Se quitó por completo el candado de "modo prueba" (`isInventarioBetaUser` /
  `INVENTARIO_BETA_EMAIL` en el frontend, y la dependencia de
  `inv_tiene_acceso()` en las 3 funciones de permiso del lado del servidor). La
  tabla `inv_acceso_beta` y la función `inv_tiene_acceso()` se quedan en la base
  sin uso (no se borraron — mismo criterio que `con_problema` en V86).
- Frontend: `permissions.js` (`canViewInventario`/`canMoverInventario`/
  `canEditarInventario` actualizados), `AppLayout.jsx` (el link ya no depende del
  correo), `RequireInventarioAccess.jsx` (defensa en profundidad, solo por rol).

Pendiente: confirmar con un usuario real de rol `tienda` o `ventas` (al aplicar
el cambio se confirmó que hoy no hay ningún usuario con rol `tienda` dado de
alta; no se revisó `ventas`) que la pantalla se ve y actúa como se espera.

### V96 — Vistas de estación para fábrica (Parte 1)

Sin cambios de esquema — todo lee de tablas/RPCs que ya existían (`orders`,
`orden_etapas`, `update_orden_etapa`, `update_order_status`). Objetivo: que
corte/bordado/sublimado/producción/terminado tengan una interfaz extremadamente
simple, con solo lo necesario para su trabajo — antes veían el mismo Dashboard/
detalle de orden que todo el mundo, solo con el nav recortado.

- **`src/config/vistasPorRol.js`** (nuevo): un solo lugar que define, por rol
  de etapa, su `accionLabel` ("Cortado", "Bordado", "Costura lista"…) y si
  lleva el placeholder de consumo (`corte`, único) — para no regar
  `if (role === 'corte') ...` por el código. `esRolDeEstacion(role)` es el
  único punto que decide "¿este rol usa la vista de estación?".
- **Misma ruta `/` y `/orden/:id`, contenido distinto**: `DashboardPage.jsx` y
  `OrderDetailPage.jsx` se partieron en un wrapper delgado (`if
  (esRolDeEstacion(role)) return <Estacion...Page/>`) + su contenido de
  siempre movido a un componente interno (`DashboardContent`/
  `OrderDetailContent`) — el branch vive en el wrapper, nunca entre llamadas a
  hooks del componente original, para no romper las reglas de hooks. Cualquier
  link/QR/notificación que ya apunte a `/orden/:id` sigue funcionando igual,
  solo cambia qué ve quién lo abre.
- **`EstacionHomePage.jsx`** ("Siguientes órdenes"): `useOrders()` +
  `useAllOrdenEtapas()` (hook nuevo, mismo patrón de agrupar por `order_id`
  que ya usaba `ControlRapidoPage.jsx`) — filtra a órdenes no canceladas donde
  mi etapa sigue en `pendiente`/`en_proceso`, ordenadas por fecha de entrega,
  con los mismos colores de urgencia de `OrderCard.jsx` (se reusan las clases
  `order-card--overdue/--warning` tal cual, no se inventó paleta nueva).
  **Decisión**: una orden `en_confirmacion` también aparece aquí (sus filas de
  `orden_etapas` ya existen desde que se crea) — se avisó al usuario en el
  plan y se confirmó así.
- **`EstacionOrderPage.jsx`**: por prenda, solo `garment`+`color`, `tela_nombre`
  y tallas/cantidades (mismo formato `T.10: 4` que `OrderItemsCard.jsx`) — nada
  de manga/cuello/vivos/fotos/precios. Un botón: "Confirmar" si la orden sigue
  `en_confirmacion` (mismo `update_order_status` que ya podían usar estos
  roles), o si no, el `accionLabel` de mi estación. El botón hace, en un solo
  tap, las DOS transiciones de `orden_etapas` (`pendiente→en_proceso→completado`)
  en vez de saltarse a `completado` directo — así `iniciado_en` queda igual de
  completo que si alguien hubiera dado los 2 pasos por separado en
  `OrderEtapasCard.jsx` (que sigue existiendo, solo lo ven admin_fabrica/
  admin_general/tienda ahora). **Corte** además tiene un campo "Reporte de
  consumo" deshabilitado ("Próximamente") — sin lógica, se conecta en la
  Parte 4.
- **Layout mínimo**: `AppLayout.jsx` — si `esRolDeEstacion(role)` (el rol
  EFECTIVO, para que "Ver como" simule también el shell), se salta sidebar,
  nav y `ChatWidget` por completo: solo una barra con el logo y "Cerrar
  sesión". El banner de "Ver como" se conserva ahí mismo, es la única forma de
  que admin_fabrica regrese a su vista completa mientras prueba una estación.
- **"Ver como" (V53) se amplía a `admin_fabrica`**: antes exclusivo de
  `admin_general`. `permissions.js` gana `puedeVerComoOtroRol(trueRole)` y
  exporta `FABRICA_ETAPA_ROLES` (antes privado); `AuthContext.jsx` cambia sus
  4 guardas de `trueRole === 'admin_general'` a esa función.
  `admin_fabrica` solo puede elegir entre los 5 roles de etapa (no ventas/
  contabilidad/etc., eso sigue siendo dominio exclusivo de admin_general).

Pendiente: verificación visual con sesión real (no hay credenciales de la app
en esta sesión, mismo motivo que V91-V95) — falta confirmar con cada uno de
los 5 roles (o simulándolos vía "Ver como" desde admin_fabrica) que la lista,
el detalle y el botón de acción se ven y actúan como se espera.

### V97 — Estación: 2 botones + nav mínimo (bug real encontrado con captura de pantalla)

El usuario mandó una captura real "viendo como Bordado" — el shell de estación
(V96) no tenía NINGÚN link, ni siquiera de vuelta a "Siguientes órdenes". Si
alguien caía en `/pendientes` (ruta que estos roles sí pueden ver desde V78) y
ahí cambiaba a "Ver como" una estación, se quedaba varado sin forma de volver
— eso es lo que se veía en la captura, no una pantalla vacía. Dos arreglos:

- `AppLayout.jsx`: el topbar de estación ahora lleva 2 links, "Órdenes" (→ `/`)
  y "Pendientes" (→ `/pendientes`, solo si `canViewPendientes(role)` — ya lo
  era desde V78). Sigue sin sidebar completo ni ChatWidget.
- `EstacionOrderPage.jsx`: el botón único que hacía las 2 transiciones en un
  tap se reemplazó por 2 botones explícitos, **"En progreso"** y
  **"Finalizado"** (pedido explícito del usuario) — cada uno llama
  `update_orden_etapa` directo con su estado (`en_proceso`/`completado`); el
  que ya está activo se resalta. `vistasPorRol.js` perdió el campo
  `accionLabel` (ya no hace falta, los 5 roles usan el mismo par de botones).

Sigue sin poder verificarse con sesión real en esta sesión.

### V98 — Bug de realtime + Pendientes recortado por estación

Segunda captura de pantalla real del usuario ("viendo como Costura"): pantalla
en rojo, `ErrorBoundary` mostrando "cannot add `postgres_changes` callbacks
for realtime:orders-realtime after `subscribe()`".

**Causa encontrada**: `subscribeToOrderChanges()` (`ordersService.js`) usaba
un nombre de canal FIJO (`'orders-realtime'`). `EstacionHomePage.jsx` llama
DOS hooks que cada uno se suscribe por su cuenta (`useOrders` +
`useAllOrdenEtapas`, nuevo de V96) — el cliente de Supabase regresa el MISMO
canal (ya suscrito) para el segundo, y agregarle un `.on(...)` después de
`subscribe()` revienta. Nadie más en el código llamaba 2 hooks así a la vez
en la misma pantalla, por eso no había aparecido antes. **Arreglo**: nombre de
canal único por llamada (`orders-realtime-${crypto.randomUUID()}`). Se aplicó
el mismo arreglo preventivo a `subscribeToPendientes()`
(`pendientesService.js`), que tenía el mismo patrón aunque todavía no lo
hubiera disparado.

**Pendientes recortado por estación** (pedido explícito del usuario, en el
mismo mensaje): antes de esto, CUALQUIER rol con sesión (salvo
`captura_produccion`) veía Pendientes completo.
- `terminado`: sigue viendo TODO — las 4 bandejas de siempre
  (`pendientesCompleto` en `vistasPorRol.js`).
- `bordado`/`produccion` (costura): pantalla nueva y mucho más chica
  (`EstacionPendientesPage.jsx`) — solo su lista de "por hacer"
  (`recibido_en_fabrica`) YA filtrada a su tipo de trabajo
  (`pendientesTipo: 'Bordado'`/`'Arreglo'` — los únicos 2 tipos activos desde
  V82), un botón "Marcar listo" por tarjeta, sin bandejas ni selección
  múltiple. Reusa `usePendientes()`/`cambiarEstado()`/`SIGUIENTE` tal cual,
  cero RPC nuevo.
- `corte`/`sublimado`: sin acceso — no existe un tipo de trabajo "Corte" ni
  "Sublimado" en Pendientes, así que no tenían nada que filtrar de todos
  modos. `canViewPendientes()` ahora regresa `false` para estos 2 (antes
  regresaba `true` para cualquier rol de fábrica), así que el link
  desaparece del nav Y la ruta `/pendientes` bloquea con `RequireRole` si
  entran directo por URL.

Sin cambios de esquema en ninguno de los 2 arreglos.

### V99 — Operadoras: folio y número consecutivos automáticos

Pedido del usuario: *"Cuando agregue una persona nueva, quiero que el folio y
el numero se pongan automaticamente, que sea el consecutivo, que no solo se
sugiera, que se haga automaticamente."* Antes, "Nueva operadora" pedía folio
(`EMP036` era solo un placeholder de ejemplo, no un valor calculado) y número
como inputs manuales de texto/número.

**Schema (`supabase/schema_v99_operadoras_folio_automatico.sql`, aplicado en
vivo)**: `prod_guardar_operadora` reescrita — misma firma, sin DROP. En el
branch de ALTA (`p_id is null`) ya NO usa lo que mande el cliente para folio/
número: calcula `v_numero = max(numero_operadora) + 1` (avanza siempre, no
rellena huecos de bajas) y `v_folio_empleado = 'EMP' || lpad(v_numero, 3,
'0')` — patrón confirmado contra los datos reales (numero 1→EMP001, etc.). El
branch de EDICIÓN (`p_id` presente) no cambia: sigue permitiendo corregir
folio/número a mano, por si hace falta arreglar un error.

**Frontend (`OperadorasAdmin.jsx`)**: en el modal, los inputs de "Folio de
empleado"/"Número de operadora" ahora solo se muestran al EDITAR; al crear se
reemplazan por un texto explicando que se asignan solos. El botón "Guardar"
ya no exige `folioEmpleado` no vacío al crear (solo al editar) — antes eso
habría bloqueado el submit en cuanto se ocultó el campo.
`guardarOperadora()`/`produccionService.js` no cambió: sigue mandando lo que
traiga el form (vacío al crear), y el RPC simplemente lo ignora en ese caso.

`npm run build` limpio. Sin poder probar con sesión real en este entorno
(sin credenciales de login) — igual que el resto de los cambios de esta
sesión, verificación visual pendiente del lado del usuario.

### V100 — Inventario de tela (Fase 2, Parte 2)

Pedido del usuario, con plan mostrado y confirmado antes de aplicar
("PARTE 2 — INVENTARIO DE TELA", con diagnóstico previo obligatorio).

**Diagnóstico (antes de tocar nada)**: `telas` (V12) era un catálogo
mínimo (id/nombre/nombre_normalizado/created_at) sin unidad de medida y
**sin relación real con `proveedores`** — `proveedores` (V19) pertenece al
módulo de Pedidos a Proveedor (compras de tienda), que además está
**apagado en producción** (`PROVEEDORES_HABILITADO = false`). Se confirmó
con el usuario dejar telas y proveedores desacoplados por ahora (la nota
libre de "Entrada de tela" cubre "número de factura del proveedor"), y que
`super_admin` (rol pedido, no existe) se traduce a `admin_general`.

**Esquema (`schema_v100_inventario_tela.sql`, aplicado en vivo)**:
- `telas.unidad` (nullable, `check in ('metro','kilo')`). `create_tela`
  gana `p_unidad` opcional (con su `drop function` de la firma vieja —
  gotcha de siempre). `update_tela(p_id, p_nombre, p_unidad)` nueva — antes
  no existía NINGUNA edición de tela, solo alta/baja.
- `movimientos_tela` (`tela_id`, `tipo` `entrada`/`consumo_corte`/`ajuste`,
  `cantidad`, `unidad`, `orden_id` nullable, `usuario_id`, `fecha`, `nota`).
  **Criterio de signo elegido** (documentado en el header del archivo):
  `cantidad` siempre lleva el signo real del efecto — `entrada` siempre +,
  `consumo_corte` siempre −, `ajuste` puede ser + o − según el conteo
  físico. Así `inventario_actual` es una suma simple sin `CASE`.
  `consumo_corte` no se genera todavía en esta Parte 2 — la tabla ya queda
  lista para que la Parte 3 inserte ahí desde el placeholder "Reporte de
  consumo" que ya existe en `EstacionOrderPage.jsx` (rol `corte`, desde
  V96/V97).
- `v_inventario_telas` — vista, `sum(cantidad)` por tela, lectura tan
  abierta como `telas` (anon + authenticated).
- `registrar_entrada_tela`/`registrar_ajuste_tela` — RPCs exclusivos
  `admin_fabrica`/`admin_general` (pedido explícito). Ambos exigen que la
  tela ya tenga `unidad` definida. La de ajuste exige `nota` no vacía y
  `cantidad <> 0`; la de entrada exige `cantidad > 0`.
- `get_tela_delete_impact`/`delete_tela` extendidas para también
  contar/bloquear por `movimientos_tela` (antes solo avisaban de
  `productos`) — una tela con historial de movimientos ya no se puede
  eliminar. Cambia el tipo de retorno de `get_tela_delete_impact`, así que
  también necesitó `drop function`.
- `v_movimientos_tela` (agregada aparte, ya con el esquema anterior
  corriendo) — `movimientos_tela.usuario_id` apunta a `auth.users`, no a
  `profiles` (mismo patrón que `orden_etapas.responsable_id` ya usaba), y
  `profiles` tiene RLS (solo tu propio perfil, o `admin_general` ve
  todos) — así que un embed de PostgREST no habría resuelto el nombre para
  el resto de los roles. Esta vista corre con los privilegios de quien la
  creó (no `security_invoker`), así que sí puede leer todos los `profiles`
  y expone **solo** `full_name` — nada más sensible del perfil.

**Frontend**:
- `src/pages/InventarioTelaPage.jsx` (nuevo, ruta `/inventario-tela`,
  nav "Inventario de tela") — formularios de Entrada y Ajuste + una tabla
  de referencia con el inventario actual de cada tela. Exclusivo
  `admin_fabrica`/`admin_general` (`canGestionarInventarioTela`, nueva en
  `permissions.js`). Nombrada distinto del módulo "Inventario" de prendas
  (V91+) para no confundirlos.
- `CatalogosPage.jsx`, sección Telas: cada fila gana un editor de unidad
  inline (mismo patrón que `ClienteTipoOrdenEditor`), la línea
  "Inventario: X · Comprometido: 0 · Disponible: X" (comprometido queda en
  0 hasta la Parte 3), y un botón "Ver historial" que carga
  `movimientos_tela` de esa tela bajo demanda. Visible a quien ya ve
  Catálogos hoy (`ventas`/`admin_fabrica`/`admin_general`/
  `admin_fabrica_lectura`) — sin candado nuevo, es solo lectura salvo la
  unidad (que ya usa el mismo permiso que dar de alta telas).

`npm run build` limpio. Verificado sin sesión real (no hay credenciales en
este entorno): `/inventario-tela` y `/catalogos` cargan sin errores de
consola ni del servidor de desarrollo en modo invitado (piden login, igual
que Catálogos ya hacía antes de este cambio — no es una regresión).
Verificación visual con datos reales pendiente del lado del usuario.

**Pendiente para la Parte 3**: conectar "comprometido" a órdenes reales, y
generar movimientos `consumo_corte` automáticos desde el "Reporte de
consumo" de `corte` en `EstacionOrderPage.jsx`.

### V101 — Consumos por prenda y cálculo de comprometido/disponible (Fase 2, Parte 3)

Pedido del usuario, con diagnóstico y plan mostrados y confirmados antes
de aplicar. En el camino, el usuario también resolvió por su cuenta (con
el pasted de Parte 3+4) las dos preguntas que yo había dejado abiertas
tras V100 (¿cómo se calcula comprometido? ¿consumo real manual o
automático?) — este V101 sigue esa versión final, no mis propuestas
intermedias.

**Diagnóstico**: `orders.items` (JSONB) ya trae `tela_id` por prenda desde
V12 (una orden puede usar más de una tela); `garment` es texto libre (o
uno de 5 valores fijos de sublimación) — **no existe un catálogo formal de
prendas**, así que `consumos_prenda.prenda` es texto normalizado, igual
que `telas.nombre_normalizado`. Tallas también son texto libre por
renglón. "Confirmada y no cortada" = `orders.status <> 'en_confirmacion'`
y `cancelled_at is null` y la fila de `orden_etapas` para `etapa='corte'`
tiene `estado <> 'completado'`.

**Esquema (`schema_v101_consumos_prenda.sql`, aplicado en vivo)**:
- `consumos_prenda` (prenda, tallas text[] nullable = promedio general,
  consumo, unidad). `guardar_consumo_prenda`/`eliminar_consumo_prenda`
  (exclusivo `admin_fabrica`/`admin_general`) — la validación de "una
  misma talla no puede repetirse entre filas de la misma prenda" y "solo
  un promedio general por prenda" vive AQUÍ (no se puede expresar con un
  CHECK simple de Postgres, necesita comparar contra otras filas).
- `calcular_consumo_orden(p_items jsonb) returns jsonb` — el motor de
  cálculo: recibe el arreglo de prendas de una orden (guardada, o el
  borrador que tienda todavía está armando en pantalla — no hace falta
  guardar primero) y regresa consumo estimado agrupado por tela, más los
  renglones sin consumo registrado y los renglones cuya unidad no
  coincide con la de su tela (esos NO se suman, solo se reportan). Una
  sola función reutilizada tanto para el preview en vivo como para el
  cálculo de comprometido — una sola fuente de verdad.
- `v_comprometido_telas` — agrega `calcular_consumo_orden(items)` de
  todas las órdenes confirmadas-y-no-cortadas, sumado por tela.
- `v_inventario_telas` se **extiende** (mismas columnas de V100 + 2
  nuevas al final: `comprometido`/`disponible`) — `CREATE OR REPLACE VIEW`
  permite agregar columnas sin romper nada que ya la usaba.
- `fetch_prendas_conocidas()` — nombres de `garment` ya usados en órdenes
  reales, solo para el aviso "prenda no encontrada" del import de CSV (no
  hay catálogo formal de prendas contra qué validar).

**Frontend**:
- `OrderTelaResumen.jsx` (nuevo) — panel "Tela" montado dentro de
  `OrderItemsEditor.jsx` (se ve tanto al crear como al editar una orden
  mientras siga `en_confirmacion`): una fila POR CADA tela usada en la
  orden (puede haber varias) con consumo estimado de esa orden (calculado
  en vivo vía `calcular_consumo_orden`, sin guardar primero), inventario
  actual, comprometido en otras órdenes, y disponible después de esta
  orden. Alerta roja si el disponible sale negativo ("Falta tela: pedir
  X"), aviso amarillo si hay renglones sin consumo o con unidad
  distinta.
- `canVerComprometidoTela(role)` (nueva en `permissions.js`) — oculta
  comprometido/disponible a los 5 roles de estación de fábrica y a
  `admin_fabrica_lectura` (pedido explícito del usuario). Se evaluó
  aparte de `canViewCatalogos` a propósito: la audiencia del panel "Tela"
  en una orden es `canEditOrder` (ventas/admin_tienda/admin_general), que
  no siempre coincide con quién ve Catálogos (`admin_tienda` no ve
  Catálogos hoy, pero sí debe ver esto). Es una capa de UX, no de
  seguridad — igual que el resto del sistema, la vista SQL sigue con
  lectura abierta.
- `CatalogosPage.jsx`, Telas: comprometido/disponible ahora reales
  (dejaron de estar fijos en 0 desde V100), ocultos con el mismo
  candado.
- `InventarioTelaPage.jsx`: la tabla de referencia ahora también muestra
  comprometido/disponible reales (audiencia ya es
  `admin_fabrica`/`admin_general`, no necesita el candado aparte).
- `ConsumosPrendaPage.jsx` (nuevo, ruta `/consumos-prenda`, nav
  "Consumos por prenda") — exclusivo `admin_fabrica`/`admin_general`
  (`canGestionarConsumosPrenda`). Tabla editable (prenda, tallas
  separadas por coma, consumo, unidad) + import de CSV con vista previa
  de errores (tallas duplicadas, unidad inválida, prenda no reconocida)
  antes de guardar nada — parseo de CSV escrito a mano, sin agregar
  ninguna librería nueva. Dentro del CSV, varias tallas de un mismo
  renglón se separan con `|` (la coma ya separa columnas).

`npm run build` limpio. Verificado en el navegador sin sesión real:
`/consumos-prenda` y `/nueva` cargan sin crash en modo invitado (piden
login, esperado). Verificación visual con datos reales pendiente del
lado del usuario.

**Pendiente para la Parte 4**: reporte de corte real (campo "Tela usada"
obligatorio antes de marcar "Cortado", movimiento `consumo_corte` real,
comparación estimado vs. real) — sigue en el placeholder deshabilitado de
`EstacionOrderPage.jsx`, todavía no implementado.

### V102 — Reporte de corte real y precisión de consumos (Fase 2, Parte 4)

Pedido del usuario, con diagnóstico y plan mostrados y confirmados antes
de aplicar.

**Decisión de diseño que tuve que resolver y flagueé al usuario**: el
operador de corte captura "tela usada" **por tela**, no por prenda (pidió
mantenerlo "extremadamente simple"). Pero una tela puede repartirse entre
varias prendas de la misma orden, y el reporte de "Precisión de consumos"
se pide **por prenda** — no hay forma exacta de saber cuánto del real fue
de cada prenda cuando comparten tela. Resuelto: el real se **prorratea
proporcionalmente** entre las prendas según qué % del estimado
representaba cada una (exacto cuando una tela la usa una sola prenda,
aproximado cuando se comparte) — documentado explícitamente como
aproximación en el reporte, no como medición exacta.

**Esquema (`schema_v102_reporte_corte.sql`, aplicado en vivo)**:
- `movimientos_tela` gana `consumo_estimado` y `orden_prendas_snapshot`
  (ambas nullable, solo se llenan en `consumo_corte`) — snapshot del
  estimado al momento del corte, para que el reporte no cambie después si
  se editan `consumos_prenda`.
- `calcular_consumo_detalle(p_items)` — mismo matching que ya usaba
  `calcular_consumo_orden` (Parte 3) pero a nivel de renglón
  (tela+prenda+talla) en vez de agregado.
  `calcular_consumo_orden` **se reescribió** (misma firma, sin DROP) para
  reusar esta función en vez de duplicar la lógica — el contrato de
  salida no cambió, así que `OrderTelaResumen.jsx` (Parte 3) sigue
  funcionando exactamente igual.
- `marcar_corte(p_orden_id, p_consumos)` — `p_consumos` = una entrada
  `{tela_id, cantidad}` por cada tela de la orden (todas obligatorias).
  En una sola llamada: inserta el/los movimiento(s) `consumo_corte` (con
  su snapshot) y completa la etapa de corte en `orden_etapas` — la orden
  deja de "comprometer" esa tela automáticamente (ya lo resuelve el
  filtro de `v_comprometido_telas` de la Parte 3, sin tocar nada ahí).
  Permiso: `corte`/`admin_fabrica`/`admin_general`, igual que
  `update_orden_etapa`.
- `v_movimientos_tela` se extiende (2 columnas nuevas:
  `consumo_estimado`, `tela_nombre`).
- `v_precision_consumos` — por prenda, promedio de la diferencia
  estimado-vs-real (prorrateada), y `alerta` cuando pasa de ±10%.

**Frontend**:
- `EstacionOrderPage.jsx`: el placeholder deshabilitado desaparece.
  Específicamente para `corte` (los otros 4 roles de estación no cambian),
  un campo "Tela usada" obligatorio POR CADA tela de la orden (con su
  unidad al lado), y el botón pasa de "Finalizado" a **"Cortado"** —
  deshabilitado hasta llenar todos los campos, con una confirmación
  simple antes de mandar ("¿Confirmas que se usaron X…?"). El operador no
  ve estimado, inventario, ni comparación — cero relación con
  `OrderTelaResumen`. Una vez cortado, el botón queda fijo en "Cortado"
  (deshabilitado) para no permitir un segundo envío accidental que
  duplicaría el movimiento.
- `OrderCorteResumen.jsx` (nuevo) — montado en `OrderDetailPage.jsx`,
  exclusivo `admin_fabrica`/`admin_general`: estimado vs. real y
  diferencia % por tela, solo aparece si la orden ya fue cortada.
- `ConsumosPrendaPage.jsx` gana la sección "Precisión de consumos" —
  reporte general por prenda, con el aviso de prorrateo y `alerta` cuando
  la diferencia promedio pasa de ±10%.

`npm run build` limpio. Verificado en el navegador sin sesión real:
`/consumos-prenda` y `/` cargan sin crash en modo invitado (piden login —
en este entorno de desarrollo local el modo invitado también pide login,
sin relación con este cambio). Verificación visual con datos reales
pendiente del lado del usuario — en particular, probar el flujo completo
de "Cortado" con una orden real es lo más importante de confirmar antes
de darlo por bueno en producción.

Con esto queda completa la Fase 2 de este bloque de trabajo (Partes 1-4:
vistas de estación, inventario de tela, consumos por prenda y comprometido,
reporte de corte real).

### V103 — Ranking de producción visible para Juanis (captura_produccion)

Pedido del usuario: que Juanis (rol `captura_produccion`) pueda ver el
resultado de cada operadora e imprimir el ranking. También preguntó cómo
funciona el cambio de semana de producción — se le explicó (no aplica
ningún cambio de código, solo diagnóstico): es 100% automático y sin
cron — `prod_semana_de(fecha)` calcula la semana (miércoles-martes) de
una fecha y crea esa fila la primera vez que alguien captura algo en
ella; y una semana `abierta` pasa sola a `en_revision` en cuanto alguien
abre la pantalla de Revisión y su martes ya pasó (`prod_cerrar_vencidas`,
interna) — o con el botón manual "Cerrar semana" si se quiere antes.

**Conflicto encontrado y confirmado con el usuario**: desde V66-V70,
`captura_produccion` **nunca** ve montos en pesos — regla explícita,
documentada, aplicada en todo el módulo. Pero el ranking que ya existía
muestra "valor generado" en MXN por operadora. Se preguntó explícitamente
y el usuario confirmó: sí, quiere que Juanis vea ese monto — se relaja la
regla **a propósito y solo para esto**.

**Alcance, angosto a propósito** (no fue un "abrir todo Producción"):
- Nav: solo se abrió "Dashboard producción" (`canVerRankingProduccion` =
  `canViewProduccionMontos` + `captura_produccion`). "Revisión
  producción" y "Admin producción" **siguen** exclusivos
  `admin_general`/`admin_fabrica`, sin cambios.
- Dentro de Dashboard, "Imprimir hojas por operadora" (bulk y por fila)
  **se oculta** para `captura_produccion` — esas hojas sí traen el
  desglose real de bonos/premio (`bono_meta`/`bono_lugar`/`bono_mejora`/
  `total_premio`), que no se le abrió.
- "Imprimir ranking" pasa a usar una función nueva
  (`prod_ranking_semana`) en vez de `prod_revision_semana` — misma
  fuente de datos (snapshot congelado si la semana ya está aprobada, si
  no el mismo cálculo en vivo), pero **sin las columnas de bono/premio**
  siquiera en la respuesta de la red — no es solo ocultar en la UI.

**Bug real que encontré y corregí antes de terminar**: mi primer diseño
de `prod_ranking_semana` reusaba `prod_calcular_premios` para el cálculo
en vivo (semana no aprobada) — pero esa función tiene su PROPIO candado
interno hardcoded a `prod_puede_ver_montos()` (sin importar quién la
llame ni desde dónde), así que Juanis habría sido rechazada igual para
cualquier semana todavía no aprobada. Verificado en vivo contra la SQL
Editor (`ERROR: No tienes permiso...`). Corregido copiando dentro de
`prod_ranking_semana` solo las CTEs de ranking de `prod_calcular_premios`
(sin los cross join de bonos) — `prod_calcular_premios` en sí **no se
tocó**, sigue exclusiva admin, y `prod_ranking_semana` ya no la llama.
Reverificado con datos reales tras el arreglo: funciona.

`schema_v103_produccion_ranking_captura.sql` aplicado en vivo
(`prod_puede_ver_ranking()`, `prod_historial_valores` con el candado
relajado, `prod_ranking_semana` nueva). `npm run build` limpio.
Verificado en vivo con SQL real que ambas funciones regresan datos
correctos y sin duplicados de firma.

### V104 — Producción: el cierre automático de semana espera un día más

El usuario explicó cómo trabajan de verdad: la producción de una semana
(miércoles a martes) se sigue capturando el **miércoles siguiente** (los
papelitos del martes se meten al sistema un día después) — la revisión
real para definir premios de nómina es hasta el **jueves**.

Esto expuso un bug real en el diseño original (V69, documentado
literalmente como "se cierra en cuanto termina el martes"):
`prod_cerrar_vencidas()` se dispara cada vez que un admin abre "Revisión
producción", y cerraba cualquier semana `abierta` cuyo martes ya hubiera
pasado — es decir, **desde el miércoles**. Si un admin abría esa pantalla
el miércoles (por cualquier motivo, no necesariamente para esa semana en
particular), la semana que Juanis seguía llenando se cerraba de golpe
(`en_revision`) y ella se quedaba bloqueada — solo
`admin_general`/`admin_fabrica` pueden capturar en una semana
`en_revision`.

**Arreglo** (`schema_v104_produccion_cierre_jueves.sql`): se movió el
umbral un día — `prod_cerrar_vencidas()` ahora solo cierra semanas cuyo
martes pasó hace **más de un día** (a partir del jueves, no del
miércoles). Mismo nombre/firma, sin tocar tablas ni otras funciones — el
botón manual "Cerrar semana" no cambió, sigue disponible si algún admin
quiere cerrarla antes a propósito. Aplicado en vivo, verificado que solo
existe una versión de la función con el cuerpo nuevo.

### V105 — Vistas de fábrica: terminado real, fotos y Pendientes (Parte A)

Pedido del usuario, con diagnóstico mostrado y confirmado antes de
aplicar. Sin cambios de esquema — todo frontend.

**Diagnóstico (resumen, completo en el mensaje al usuario)**: la captura
de cantidad surtida (`OrderSurtidoCard.jsx`, permiso `canManageSurtido` ya
incluía a `terminado`) y la remisión (`buildRemisionPdfBlob`/
`RemisionPdf.jsx`, V26) ya existían — el problema era de enrutamiento:
`OrderDetailPage.jsx` manda a TODO rol de estación a la vista mínima de
Parte 1 (`EstacionOrderPage.jsx`), que nunca montaba ese componente. Las
fotos (`order.reference_photos` / tabla `orden_bordados`) tenían el mismo
problema — existían, pero ningún rol de estación las veía. El patrón de
colores rojo/falta-verde/sobra que pedía el usuario **ya existía**
también, dentro de `RemisionPdf.jsx` (`colorSurtida`) — se reusaron los
mismos tokens (`--color-danger`/`--color-good`, iguales en hex a los que
ya traía el PDF) en vez de inventar otros.

**Cambios**:
- `vistasPorRol.js`: `terminado` gana `surtidoFinal: true`.
- `EstacionOrderPage.jsx`:
  - `EstacionSurtidoTerminado` (nuevo, reemplaza el botón "Finalizado"
    SOLO para `terminado`) — tabla Talla/Pedido/Real por prenda, "Real"
    precargado con `cantidad_surtida` ya guardada o, si no hay, con lo
    pedido; color en el borde/texto del input (falta/sobra, mismos
    tokens de arriba); comentario opcional. Botón "Confirmar y generar
    reporte": guarda todas las filas (`setItemSurtido`, reusado tal
    cual), completa la etapa (`updateOrdenEtapa(..., 'terminado',
    'completado')` — fecha/hora/usuario ya los captura esa función sola,
    sin cambios), arma el PDF con los valores recién guardados (sin
    esperar un refetch) y muestra la vista previa (`PdfPreviewModal`,
    reusado). Una vez completada la etapa, el botón queda fijo en
    "Reporte generado" (mismo criterio que "Cortado" de Parte 4 — evita
    reenvíos accidentales).
  - `EstacionFotos` (nuevo) — `bordado` ve solo `orden_bordados` agrupado
    por prenda (ubicación + foto), con el aviso "Esta orden no tiene foto
    de bordado" si no hay ninguna; el resto ve `order.reference_photos`.
    Miniaturas (84×84, `object-fit: cover`) que abren en grande dentro de
    un `Modal` genérico ya existente (`components/talleros/Modal.jsx`) —
    nada nuevo que mantener.
- **Pendientes**: no se tocó — ya era exactamente lo pedido (solo
  `terminado` ve el módulo completo; `corte`/`sublimado` no lo ven en
  absoluto; `bordado`/`producción` ven su lista filtrada). Se confirmó en
  el diagnóstico, no había nada que cambiar.
- **"Ver como [rol]"**: no necesitó cambio aparte — reusa la misma
  `EstacionOrderPage.jsx`, así que hereda todo esto automáticamente.

`npm run build` limpio (agregado CSS nuevo para las miniaturas:
`.estacion-fotos`/`.estacion-foto-thumb`). Verificado en el navegador sin
sesión real que no hay errores de consola nuevos. Verificación visual con
datos reales (una orden con fotos de bordado, una con fotos de
referencia, y el flujo completo de "Confirmar y generar reporte") sigue
pendiente del lado del usuario — es la más importante de las tres partes
de esta sesión para probar con cuidado, por generar un documento oficial
(remisión) y completar una etapa de producción.

### V106 — Producción: el cierre es a las 11 AM del jueves (hora exacta)

Afinando V104: el usuario precisó que el cierre no es "cualquier momento
del jueves" sino específicamente **~11 AM** (la revisión para premios de
nómina es a mediodía). V104 solo comparaba fechas (cerraba desde la
medianoche del jueves); V106 compara fecha+hora exacta:
`(fecha_fin + 2 días) a las 11:00, hora Torreón`. Mismo
nombre/firma/tabla, sin tocar nada más.

También se aclaró (sin cambio de código, solo explicación) una confusión
del usuario: a qué semana entra un registro capturado "ahorita" depende
de la **fecha que se le ponga al registro**, no del momento en que se
captura — el sistema nunca usa "ahora" para decidir la semana de un
registro, solo la fecha del papelito.

**Pendiente, sin resolver todavía**: el usuario también describió que la
captura de la semana NUEVA (la que ya empezó hoy miércoles) no debería
poder empezar sino hasta el jueves por la tarde, después de la revisión
de la semana anterior — un candado adicional, distinto del cierre, que
bloquearía capturar fechas de la semana que apenas comienza hasta que se
abra explícitamente.

Aplicado en vivo, verificado con datos reales: hoy (miércoles 30,
10:44 am) la semana 23-29 sigue `abierta` y su `cierra_en` calculado da
exactamente 2026-10-01 11:00:00, como se pidió.

### V107 — Producción: la semana nueva no abre hasta el jueves 1:00 PM

El usuario confirmó que SÍ quería que el sistema bloqueara activamente la
captura de la semana nueva (no era solo descripción de su flujo) — y
precisó la hora de apertura: **1:00 PM del jueves** (2 horas después del
cierre de las 11 AM de V106, dando margen a la revisión de mediodía).

**`prod_capturar_registro`** (única función tocada — editar un registro
que ya existe no necesita este candado, la apertura ya pasó cuando se
creó) gana una validación NUEVA, distinta del candado de "la semana ya
cerró" (V104/V106, que mira el `estado` guardado): aquí se calcula la
fecha de inicio de la semana de `p_fecha` y se bloquea si `hoy < (esa
fecha + 1 día) a la 1:00 PM` — es decir, no importa el `estado` (que
siempre nace `abierta`), se bloquea la apertura misma.
`admin_general`/`admin_fabrica` quedan exentos (mismo criterio que ya se
usa para corregir semanas `en_revision`).

Verificado en vivo con datos reales: ahora mismo (miércoles 30, ~10:49
am) capturar algo fechado HOY quedaría bloqueado hasta
`2026-10-01 13:00:00` — jueves 1 PM, exacto. Capturar algo de la semana
anterior (hasta el martes 29) sigue totalmente permitido.

### V108 — Aviso de cambio de semana en la pantalla de captura

Pedido del usuario: un aviso en `ProduccionCapturaPage.jsx` (donde Juanis
captura) para saber cuándo ya se puede empezar a subir la semana nueva.

**Bug real que esto sacó a la luz**: la pantalla de captura ya calculaba
su propio `vencida`/`puedeCapturar` del lado del cliente (para
deshabilitar el formulario sin esperar la respuesta del servidor), pero
con la regla VIEJA (`sem.fin < hoy` — cerraba desde que cambiaba la
fecha, sin hora) y **sin ningún candado de apertura** — quedó
desactualizado frente a V106/V107 (cierre 11am jueves, apertura 1pm
jueves). Ya corregido: ahora calcula los mismos umbrales exactos que el
servidor (`conHora(sem.ini, 1, 13)` para apertura, `conHora(sem.fin, 2,
11)` para cierre) — mismo criterio, in-line, no una llamada a la base.

**Aviso**: un reloj en vivo (`setInterval` cada 60s) recalcula esto solo,
sin recargar la página. Dos estados nuevos, con su propio color
(reutilizando tokens ya existentes):
- **Todavía no abre** (ámbar, `--color-warning`): "Todavía no se abre la
  captura de esta semana — abre el [fecha] a la [hora]. Sigue subiendo
  la semana anterior mientras tanto." — aparece mientras la semana de la
  fecha elegida no haya llegado a su jueves 1pm; el formulario se queda
  deshabilitado (`admin_general`/`admin_fabrica` exentos, igual que el
  servidor).
- **Ya cerró** (rojo, `--color-danger`): mensaje que ya existía, sin
  cambio de texto.

El "aviso de cambio de semana" que pidió el usuario es exactamente esa
transición: en cuanto el reloj cruza la 1pm del jueves, el aviso ámbar
desaparece solo y la pantalla vuelve a su estado normal — sin necesidad
de guardar "ya lo vi" en ningún lado.

`npm run build` limpio. CSS nuevo: `.captura__aviso`/`--espera`/
`--cerrada`. Verificado en el navegador sin sesión real que no hay
crash. Verificación con Juanis usando la pantalla real, sobre todo
alrededor de un jueves a mediodía, pendiente del lado del usuario.

### V109 — "Imprimir" en cada sección de Admin producción

Pedido del usuario: un botón de imprimir PDF en cada sección de
`ProduccionAdminPage.jsx`. Se agregó a las 3 secciones que son
catálogos/listas — **Operaciones**, **Operadoras**, **Reglas de
premios** — no a Configuración (son solo 2 números, no hay nada real
que listar ahí; decisión de alcance propia, no lo pidió explícitamente
pero tampoco aplicaba).

**`ProduccionPdf.jsx`** gana 3 documentos nuevos (`CatalogoOperacionesDoc`,
`CatalogoOperadorasDoc`, `CatalogoReglasDoc`), reusando los mismos
estilos/colores/helpers (`money`, tokens de color) que ya traían
`ProduccionOperadorasDoc`/`ProduccionRankingDoc` — no es una paleta
nueva. Tablas genéricas (`colXs`/`colSm`/`colMd`/`colFlex`) en vez de un
set de columnas por tabla. `generateProduccionPdf.jsx` gana los
`buildCatalogoXPdfBlob` + `catalogoPdfFileName` correspondientes.

**`ImprimirCatalogo.jsx`** (nuevo, compartido por las 3 secciones) —
encapsula generar+vista previa (reusa `PdfPreviewModal` tal cual) para
no repetir ese manejo de estado 3 veces. Cada sección imprime su
catálogo **completo** (no el filtrado/recortado que se ve en pantalla —
`OperacionesAdmin` limita la tabla a 300 filas visibles, pero el PDF
lleva todas).

Verificado generando los 3 PDFs con datos de prueba fuera de la app
(misma técnica de Node+esbuild ya usada antes en esta sesión, sin
necesidad de sesión real): operadoras (35 filas, 1 página), operaciones
(60 filas, pagina sola en 2 sin cortar ninguna fila), reglas (3 tablas,
1 página) — los tres se ven bien, sin texto cortado ni columnas
encimadas. `npm run build` limpio.

### V110 — Corte: trazo en vez de metros a mano; Terminado: botones Correcta/Parcial

Pedido del usuario a partir de dos capturas de pantalla (vista de corte y
de terminado). Sin cambios de esquema — ninguno de los dos RPC
(`marcar_corte`/`set_item_surtido`) cambió de firma, solo cómo el
frontend arma los valores que les manda.

**Corte** — "Tela usada" (un solo número) se reemplaza por 3 campos POR
CADA tela de la orden: **largo del trazo**, **piezas por trazo**,
**número de hojas**. Se calculan solos: `metros = largo × hojas`
(eso es lo que se manda a `marcar_corte`, igual que antes — el RPC no
supo la diferencia) y `piezas cortadas = piezas por trazo × hojas`,
mostrado debajo de los 3 campos como referencia ("= X metros de tela ·
Y piezas cortadas"). **Piezas cortadas es solo informativo en pantalla
— no se guarda en ningún lado** (no hay hoy una columna para eso ni se
pidió compararlo contra el pedido); si más adelante se quiere usar para
algo (por ejemplo comparar contra lo pedido, como ya se hace con
consumo estimado vs. real de tela), se puede agregar después. El botón
"Cortado" sigue exigiendo los 3 campos llenos por cada tela antes de
habilitarse, y la confirmación sigue mostrando los metros calculados.

**Terminado** — cada renglón (talla + cantidad pedida) ya no arranca con
un input de cantidad precargado: ahora son **dos botones**, "Correcta"
(la cantidad real es la misma que pide la orden — un solo toque, no hay
que escribir nada) y "Parcial" (abre un campo para escribir la cantidad
real, de más o de menos, con el mismo color rojo/verde de siempre —
`--color-danger`/`--color-good` — y un comentario opcional). El botón
"Confirmar y generar reporte" ahora exige que **cada renglón tenga una
decisión tomada** (Correcta o Parcial-con-cantidad) antes de habilitarse
— antes bastaba con dejar todo en lo precargado sin tocar nada. Si la
orden ya traía algo capturado (se había quedado a medias), el estado
inicial de cada botón se infiere de `cantidad_surtida` guardada
(coincide con lo pedido → Correcta ya marcada; si no, Parcial con el
valor guardado).

CSS nuevo: `.estacion-trazo`/`__total` (corte), `.surtido-fila`/
`__cabeza`/`__talla`/`__cantidad`/`__botones` (terminado), con los
botones apilándose a ancho completo en celular (`@media max-width:
720px`) para que queden grandes y fáciles de tocar.

`npm run build` limpio, verificado en el navegador sin sesión real que
no hay errores de consola. Sin poder probar el flujo completo con una
orden real (no hay credenciales en este entorno) — verificación visual
con datos reales pendiente del lado del usuario, como el resto de los
cambios de esta sesión.

**Corrección post-captura de pantalla**: el usuario probó V110 en el
celular y mandó capturas — `.estacion-acciones` era `display: flex` (fila)
con `.estacion-btn { flex: 1 }`, así que "En progreso" quedaba lado a
lado con el bloque de corte/terminado y, al ser `align-items: stretch`
por default, se estiraba a la altura completa de ese bloque (una columna
negra gigante). Cambiado a `flex-direction: column` — ahora "En
progreso" siempre queda arriba, ancho completo, y debajo el contenido
de esa etapa (los 3 campos de corte, los botones de terminado, o
"Finalizado" para los demás roles) — aplica a los 5 roles de estación
por igual, no solo a corte/terminado, para mantener el mismo patrón en
toda la pantalla.

### V111 — Roles de fábrica, Parte 1: roles, ruteo y accesos

Pedido del usuario a partir de un documento de 5 partes ("Correr en
orden: Parte 1 → validar → Parte 2 → …"). Esta entrada es **solo la
Parte 1**; las Partes 2-5 (etapas/plantillas, detalle de corte, diseños
de sublimación, rediseño de Pendientes) quedan pendientes, cada una con
su propio diagnóstico+confirmación cuando se pida.

**Diagnóstico mostrado y confirmado antes de aplicar** (consulté
`profiles` en vivo): ninguno de los 6 operadores de piso del documento
(Pancho/Toño/Carmen/Samuel/Adriana/Jackie) tiene cuenta todavía — solo
existían 8 perfiles reales (Salva=`admin_fabrica`,
Salvador Perez=`admin_fabrica_lectura`, Alfredo Pérez=`admin_general`,
Juanis=`captura_produccion`, 2×`contabilidad`, 2×`ventas`). Esto cambió
el alcance real de la Parte 1 — no hay ninguna fila de `produccion` que
migrar a `costura`, solo hay que dejar el rol disponible para cuando se
creen esas cuentas (el usuario las crea él mismo desde Usuarios).
`captura_produccion` **no era nuevo** (existe desde V66) — solo se le
amplían permisos. `super_admin` no existe — se usó `admin_general`,
confirmado como "papá" (sin cambios, ya podía aprobar premios). Para
Juanis, "Revisión y ranking" = solo el ranking que ya tenía desde V103
(sin montos reales, confirmado sin cambio) e "Inventario de insumos"
confirmado = el mismo "Inventario de tela" (V100), con otro nombre en
el documento.

**Esquema (`schema_v111_roles_fabrica_parte1.sql`, aplicado en vivo)**:
- `profiles_role_check` gana `'costura'`. `'produccion'` se queda
  (deprecated, sin usuarios reales) — ningún valor se borró.
- `update_orden_etapa`: mismo cuerpo de siempre + un caso especial
  (`costura` puede tocar la etapa `produccion`, que **no se renombró** —
  eso sería un cambio más grande y la Parte 2 todavía no confirma la
  secuencia final de etapas, así que no tenía sentido adivinarla ahora).
- `registrar_entrada_tela`: se amplía a `captura_produccion` — **solo
  entradas**; `registrar_ajuste_tela` no se tocó.
- **Hueco encontrado de pasada** (Regla 4 del documento: permisos reales
  en Supabase, no solo escondidos en el menú): `create_announcement`/
  `delete_announcement` solo bloqueaban `lectura`/`tienda` del lado del
  servidor — el cliente ya escondía el botón para `captura_produccion`/
  `admin_fabrica_lectura` también, pero el servidor nunca lo exigía.
  Se cerró parejo con lo que el cliente ya asumía, y se agregaron los
  roles de estación + `costura`.

**Frontend**:
- `FABRICA_ETAPA_ROLES`/`PF_FABRICA` ganan `'costura'`; `ROLE_LABELS`
  agrega `costura: 'Costura'` y marca `produccion: 'Costura (obsoleto —
  usa "costura")'` para que no se vuelva a asignar por error desde
  Usuarios. `canChangeEtapa` espeja el caso especial del RPC.
- `vistasPorRol.js`: `costura: { etapa: 'produccion', pendientesTipo:
  'Arreglo' }` — mismo comportamiento que `produccion` ya tenía.
- `canRegistrarEntradaTela(role)` (nueva) = admin_fabrica/admin_general/
  captura_produccion. `InventarioTelaPage.jsx` ahora usa esto para
  entrar, pero el formulario de "Ajuste" se queda oculto si el rol no
  cumple `canGestionarInventarioTela` — Juanis solo ve "Entrada de
  tela" + el inventario de solo lectura.
- `canManageAnnouncements` se separó de `SIN_ESCRITURA_GENERAL` (esa
  lista también gobierna fotos de referencia, que los roles de estación
  SÍ pueden seguir subiendo, sin cambio) — ahora excluye específicamente
  a los 5 roles de estación + costura. Nav de Anuncios: se quitó la
  restricción de V22 para esos roles (pedido explícito, revierte esa
  decisión) — ven Anuncios de solo lectura.
- Nav: se agregó el link de "Control rápido" (ya era de lectura abierta
  desde V24, solo le faltaba aparecer en el menú — antes solo se llegaba
  por URL directa) y "Inventario de tela" para Juanis; su lista blanca
  (`RUTAS_CAPTURA`) se amplió para incluir ambos + Anuncios.
- `RequireRole.jsx`: pedido de ruteo ("si entra por URL a una pantalla
  prohibida, redirige a su pantalla de inicio") — ahora redirige a `/`
  para los roles con un home claro (los de estación, vía
  `esRolDeEstacion` — incluye `costura` automáticamente —, más
  `captura_produccion`/`tienda` básica). El resto de los roles
  (ventas/admin_*/etc., sin un solo "home" obvio) se quedan con el
  mensaje de "no tienes permiso" de siempre.

`npm run build` limpio. Verificado en vivo con SQL real: el constraint
de roles ya acepta `costura`, y `update_orden_etapa`/
`registrar_entrada_tela`/`create_announcement`/`delete_announcement`
quedaron sin duplicados de firma. Verificado en el navegador sin sesión
real que `/`, `/anuncios`, `/control-rapido` e `/inventario-tela`
cargan sin errores de consola nuevos. Falta crear las cuentas reales
de los 6 operadores (el usuario las hace desde Usuarios) y, después de
eso, validar con cada rol antes de seguir a la Parte 2 — como pide el
propio documento ("Correr en orden... No saltarse validaciones").

### V113 — Pendientes: el rol básico `tienda` también puede marcar entrega a cliente

`supabase/schema_v113_pendientes_tienda_entrega.sql` (aplicado 2026-09-30,
verificado con hash y con `select proname, count(*) ... group by proname` para
confirmar que no quedó un overload duplicado de la función). Pedido explícito
del usuario, revierte a propósito la exclusión que él mismo había pedido en
V94.

- Único cambio: `pf_puede_entregar()` gana `'tienda'` en su lista de roles
  permitidos (antes solo `ventas`, `admin_tienda`, `admin_general`).
  `contabilidad` se queda fuera, igual que antes — nunca estuvo incluida.
- Frontend: `canMarcarEntregado()` en `permissions.js` — mismo espejo de
  siempre. Al ser la única función que gatea el botón "Marcar como entregado"
  en `PendientesPage.jsx`/`PendienteDetailPage.jsx`, no hizo falta tocar esos
  componentes: el botón aparece solo en cuanto el rol pasa.
- 100% aditivo: ninguna tabla, columna ni estado nuevo — solo se ensanchó una
  función `security definer` ya existente.

`npm run build` limpio. Verificado en modo invitado (sin sesión) que
`/pendientes` sigue cargando sin errores de consola nuevos — no fue posible
probar con una sesión real de rol `tienda` en este entorno (sin credenciales),
queda pendiente que el usuario lo confirme viendo el botón "Marcar como
entregado" en la bandeja "Por entregar" con un usuario real de ese rol.

### V114 — Captura de producción: la lista de capturado es por semana, no por día

`supabase/schema_v114_produccion_lista_semana.sql` (aplicado 2026-09-30,
verificado con hash y con `select proname, count(*) ... group by proname`).
Pedido explícito del usuario: Juanis no debía tener que cambiar el selector de
fecha solo para ver/editar un folio que ya había capturado otro día de la
misma semana.

- RPC nuevo `prod_listar_registros_semana(p_fecha, p_operadora_id)` — mismo
  shape que `prod_listar_registros` pero filtra por el rango de la semana
  (miércoles a martes) que contiene `p_fecha`, no por `fecha = p_fecha`.
  `prod_listar_registros` (por día) se queda intacta — no se tocó ni se
  eliminó, por si algo más la llega a necesitar.
- Frontend (`produccionService.js`: `listarRegistrosSemana`;
  `ProduccionCapturaPage.jsx`): la tabla de "Capturado" ahora siempre trae
  todos los registros de la semana de la operadora elegida, sin importar qué
  día tenga puesto el selector de fecha. Se agregó una columna **Fecha**
  (antes no hacía falta, al ser un solo día) y el título cambió de "Capturado
  hoy/el [fecha]" a "Capturado esta semana (del X al Y)". El selector de
  fecha y el formulario de captura de folio/piezas no cambiaron — siguen
  sirviendo para registrar en un día específico; solo la lista de abajo dejó
  de depender de esa fecha para *mostrarse*. Editar/Borrar por fila: misma
  lógica de permisos de siempre (sin cambios).

`npm run build` limpio. Verificado en modo invitado que `/produccion/captura`
sigue cargando sin errores de consola nuevos (solo los ya esperados de
Supabase sin sesión en este entorno). Pendiente que el usuario lo confirme
con la cuenta real de Juanis: capturar en un día, cambiar el selector a otro
día de la misma semana, y confirmar que el primer folio sigue apareciendo
(con su fecha correcta) y se puede editar sin volver a cambiar la fecha.

### V115 — Revisión de producción: buscador por operador

Sin cambios de esquema. Pedido explícito del usuario: su papá revisa el
desglose de producción y necesitaba encontrar fácil a un operador específico
sin tener que recorrer toda la tabla.

- `ProduccionRevisionPage.jsx`: input "Buscar operador" (número o nombre)
  arriba de la tabla de detalle — filtra solo esa tabla (`filasFiltradas`,
  client-side). Los totales de arriba (premios, personas evaluadas, valor
  generado, comparación con semana anterior) siguen calculándose sobre la
  semana completa, no sobre el filtro.
- CSS nuevo (`.revision__buscador`) en `src/styles/index.css`, mismo patrón
  visual que el resto de labels+input de la app.

`npm run build` limpio.

### V116 — Parte 1B: rol de consulta de tienda (`consulta_tienda`)

`supabase/schema_v116_consulta_tienda.sql` (aplicado 2026-09-30, verificado
con hash y con una query que confirma: el constraint de roles ya acepta
`consulta_tienda`, hay exactamente 1 política SELECT en cada una de las 4
tablas de Pedidos Colegio (sin duplicados), y `inv_puede_ver` sigue siendo
una sola función). Rol nuevo, solo lectura, para el tío del usuario.

**Diagnóstico previo a aplicar** (siguiendo la regla del usuario de mostrar
esquema/RLS y esperar confirmación): de los 5 módulos que debía ver, solo 2
necesitaban cambio real de RLS —
- **Pedidos Colegio**: SELECT estaba cerrado a `admin_general` únicamente
  (`schema_v57_pedidos_colegio.sql`) → se reemplazaron las 4 políticas para
  incluir también `consulta_tienda`.
- **Inventario de tienda**: `inv_puede_ver()` no lo incluía → se agregó,
  sin tocar `inv_puede_mover()`/`inv_puede_editar()` (consulta_tienda nunca
  mueve ni edita inventario).
- **Talleros/Muestrarios**, **Catálogos** y **PDFs** (remisión/cotización/
  orden de compra) ya estaban abiertos a cualquier rol autenticado desde
  antes — no necesitaron ningún cambio de RLS.

Esta app no tiene políticas de escritura por cliente en ninguna tabla — todo
INSERT/UPDATE/DELETE pasa por RPCs `security definer` que validan el rol
internamente — así que la regla de "solo SELECT, nada de escritura" ya se
cumple automáticamente para cualquier rol nuevo sin necesidad de revocar nada
ni de abrir ningún RPC de escritura para `consulta_tienda`.

**Corrección a la especificación original del usuario:** la Regla 3 pedía
"mismo componente [badge 'Solo lectura'] que Juanis" — se verificó por grep
exhaustivo (`olo lectura`, `SoloLectura`, `solo-lectura`, `read-only`,
`readonly`) que **no existe ningún componente así en el código**; Juanis
(captura_produccion) nunca tuvo un badge de ese tipo. Se construyó uno nuevo
desde cero (ver abajo) en vez de intentar reusar algo que no existía.

**Frontend (`src/utils/permissions.js`):**
- `SIN_ESCRITURA_GENERAL` gana `'consulta_tienda'` — sin esto, el rol habría
  podido escribir anuncios, notas internas y fotos de referencia (esas tres
  funciones usan un patrón "todos pueden excepto estos", no un allow-list).
- `canViewPedidosColegio(role)` nueva = `canManagePedidosColegio(role) ||
  role === 'consulta_tienda'` — el nav y las 2 páginas de Pedidos Colegio
  usan esta para ENTRAR; `canManagePedidosColegio` (sin cambio, sigue
  admin_general-only) sigue gateando cada botón de escritura por separado
  dentro de esas páginas (agregar colegio, nuevo pedido, registrar/borrar
  abono, eliminar pedido — ninguno tenía candado de rol propio porque antes
  la pantalla completa ya era admin_general-only; con el nuevo visitante de
  solo lectura, cada uno se envolvió en `puedeGestionar &&`).
- `canViewCatalogos`/`canViewInventario`: se agregó `consulta_tienda`. Los
  botones de alta/baja/mover/editar de esas pantallas ya estaban gateados
  por funciones separadas (`canCreateCliente`, `canMoverInventario`,
  `canEditarInventario`, etc.) que NO incluyen a este rol — no hizo falta
  tocar ningún componente de Catálogos/Inventario más allá del acceso.
  `Talleros` (`canViewTalleros`) y `Pendientes` (`canViewPendientes`) ya
  admitían cualquier rol no-estación — `consulta_tienda` entró gratis, sin
  cambio.
- `esConsultaTiendaSoloLectura(role)` nueva — helper para el badge y el
  recorte de nav.
- `ROLE_LABELS.consulta_tienda = 'Consulta (Tienda) — solo lectura'`.

**`AppLayout.jsx`:**
- Nav recortado al allow-list exacto de la Parte 1B: Dashboard (siempre
  visible), Pendientes, Control rápido (ya abierto a todos desde V24),
  Talleros, Inventario, Catálogos, Pedidos Colegio. Se excluyen explícitamente
  **Calendario** y **Anuncios** — aunque ambos son de lectura abierta para
  cualquier sesión (y hasta para invitados), no estaban en la tabla de
  "Puede ver" que confirmó el usuario, así que no aparecen en su menú (Regla
  4: "el menú solo muestra los módulos permitidos"). El resto de los módulos
  de fábrica ya devolvían `false` en sus propias funciones `canView*`, sin
  necesitar ningún cambio aparte.
- `consulta_tienda` se agregó a `VIEW_AS_ROLES` — admin_general ya puede
  probar este rol con "Ver como", sin necesitar una cuenta real.
- Badge naranja nuevo `<span className="badge badge--outline">Solo lectura</span>`
  — en el topbar (junto al logo, visible en celular sin abrir el sidebar) y
  en el pie del sidebar (junto al nombre, escritorio). CSS nuevo
  (`.app-header__readonly-badge`) solo de márgenes — reusa `badge`/
  `badge--outline`, que ya son el mismo ámbar/naranja usado en el resto de
  la app.

**`RequireRole.jsx`:** `consulta_tienda` se agregó a `ROLES_CON_INICIO_PROPIO`
— URL directa a cualquier pantalla que no le toque (Producción, Revisión
producción, Inventario de tela, Consumos por prenda, Estadísticas, Usuarios,
`/pedidos-colegio/nuevo`) redirige a `/` en vez de mostrar "no tienes
permiso" (Regla 4, validación "URL directa a un módulo de fábrica →
redirige"). Calendario/Anuncios no tienen este candado — nunca lo tuvieron
para ningún rol (son de lectura abierta hasta para invitados) y agregarlo
solo para este rol habría sido una inconsistencia nueva, así que se dejaron
fuera del nav pero sin bloqueo duro de URL.

**Preparado para subir de permisos después (Regla 5):** todo vive en
`permissions.js` — para darle a este usuario capacidad de editar algo más
adelante, solo hace falta tocar la función `canX` correspondiente (o crear
una nueva), nunca reescribir componentes.

`npm run build` limpio. Verificado en modo invitado que las rutas no truenan
(sin sesión real de `consulta_tienda` disponible en este entorno — queda
pendiente que el usuario lo confirme con la cuenta real de su tío o con "Ver
como consulta_tienda" desde admin_general): menú coincide con la tabla, no
aparece ningún botón de crear/editar/eliminar/guardar en ningún módulo
permitido, puede abrir/descargar PDFs, y URL directa a un módulo de fábrica
redirige al dashboard.

### V118 — Captura de producción: ya no hay selector de fecha

Sin cambios de esquema. Pedido explícito del usuario: Juanis (captura_
producción) no debía tener que pensar en fechas para capturar folios/
piezas — "no quiero que esté batallando".

- `ProduccionCapturaPage.jsx`: se quitó el `<input type="date">` de arriba.
  En su lugar solo queda el texto "Semana del X al Y · abierta/en revisión"
  (que ya existía desde V108) — es la única referencia temporal visible.
- La fecha con la que se guarda cada folio ya no la elige nadie: se calcula
  sola (`fecha`, ahora derivada en vez de estado controlado por un input).
  Normalmente es hoy. La única excepción es el hueco entre que cierra una
  semana (martes) y abre la siguiente (jueves 1pm) — durante esas ~1.5
  días "hoy" ya cae en la semana nueva (que técnicamente no ha abierto)
  pero la anterior sigue aceptando captura hasta el jueves 11am (mismo
  criterio que ya exige el servidor en `prod_puede_editar_semana`); el
  frontend detecta ese hueco solo (comparando la hora contra el mismo
  umbral de apertura que ya se usaba para el aviso) y sigue fechando ahí,
  sin preguntarle nada a Juanis.
- La lista de "Capturado esta semana" (con columna Fecha, Editar/Borrar)
  no cambió — sigue siendo la de V114, ya mostraba toda la semana de
  una vez.
- Este cambio se separó a propósito del branch `rediseno-visual` (en
  progreso en paralelo, ver más abajo) — es una corrección funcional, no
  visual, y el usuario quería que Juanis lo tuviera ya, sin esperar a que
  el rediseño completo se apruebe y se fusione. Se aplicó directo sobre
  `main` vía un worktree temporal con solo este archivo, para no arrastrar
  nada del rediseño todavía sin aprobar.

`npm run build` limpio (verificado en un worktree aislado antes de hacer
push). Verificado en vivo con una cuenta de prueba real: el formulario de
captura ya no pide fecha, "Semana del 23 sep al 29 sep · abierta" se ve
correcto, y la lista de la semana sigue funcionando (folio/piezas/editar/
borrar) exactamente igual que antes.

### V119 — Inventario: reporte global de movimientos

`supabase/schema_v119_inventario_reporte_movimientos.sql` (aplicado
2026-10-01, verificado con hash y sin duplicados de función). Pedido del
usuario: poder revisar todas las entradas/salidas/ajustes/conteos del día,
la semana, el mes, etc. — no solo el historial de un artículo a la vez
(`HistorialModal`, ya existía).

- RPC nuevo `inv_reporte_movimientos(p_desde, p_hasta, p_seccion_id,
  p_ubicacion_id, p_tipo)` — junta `inv_movimientos` con artículo/talla/
  sección/ubicación/motivo/traspaso. 100% aditivo y sin abrir permisos
  nuevos: `inv_movimientos` ya era legible por cualquiera que pase
  `inv_puede_ver()` desde V89; esto solo lo junta y filtra servidor-side.
- Página nueva `/inventario/movimientos` (link "Movimientos" junto a
  "Reporte"/"Traspasos"/"Conteo físico" en Inventario, visible a
  cualquiera que vea Inventario — no solo a quien puede mover, porque es
  de solo lectura): atajos de rango (Hoy/Esta semana/Este mes/
  Personalizado), filtros de tipo/sección/ubicación, resumen de
  entradas/salidas, y tabla con fecha, prenda+talla, sección, ubicación,
  tipo, cantidad (verde/rojo), motivo, nota (+ folio de traspaso si
  aplica) y usuario.
- `inventarioService.js`: `fetchReporteMovimientos()` nueva.

`npm run build` limpio. Verificado en vivo con cuenta real: "Hoy" sin
movimientos se ve bien (estado vacío), "Esta semana" trajo 469 movimientos
reales con el resumen (+3229 entradas / −36 salidas) y la tabla completa
correctas.

### V120 — Perfil de sublimación (Samuel): etapa Impresión + diseños

`supabase/schema_v120_sublimado_impresion_disenos.sql` (aplicado
2026-10-01 por el usuario desde el SQL Editor; verificado después con una
consulta: 13 órdenes de sublimación recibieron `impresion` en
`completado`, la plantilla tiene `impresion` en secuencia 0, existe
`orden_disenos`, una sola versión de cada función y `anon` sin EXECUTE
sobre `add_orden_diseno`). Decisiones confirmadas con el usuario: etapa
nueva (no reusar `sublimado`), diseños sin aprobación de ventas por ahora.

- **Etapa nueva `impresion`** (solo plantilla `sublimacion`, secuencia 0,
  antes de `sublimado`). Rompe el 1:1 rol↔etapa en dos casos: `impresion`
  la reporta el rol `sublimado` (Samuel) y `sublimado` pasa al rol `corte`
  (Pancho). `update_orden_etapa` y `canChangeEtapa` son el espejo.
  `orders.status` **no** ganó valores nuevos: `recompute_order_status` no
  se tocó, así que una orden que solo lleva la impresión arrancada sigue
  en "Confirmado"; el avance real está en `orden_etapas`.
- **Órdenes existentes**: reciben su fila de `impresion` — `completado`
  si la orden ya se entregó o si otra etapa ya arrancó, `pendiente` si no.
- **Diseños**: tabla `orden_disenos` (`tipo` = `propuesta` | `final`) +
  `add_orden_diseno` / `delete_orden_diseno` (sublimado, admin_fabrica,
  admin_general). `propuesta` solo en órdenes de sublimación; `final` en
  cualquiera. Archivos en el bucket `order-photos`, carpeta `disenos/`.
  Sin flujo de aprobación todavía.
- **Frontend**: `vistasPorRol.js` (`sublimado` → etapa `impresion`,
  `dashboardSublimado`, `disenos`; `corte` gana `etapasExtra:
  ['sublimado']`). `SublimadoHomePage.jsx` (nuevo): bandejas "Pendientes
  de impresión" / "Diseño pendiente" / "Todas" + buscador de folio sobre
  todas las órdenes. `EstacionHomePage.jsx`: una lista por etapa cuando la
  estación reporta más de una (corte ve "Pendientes de sublimado" y
  "Pendientes de corte"). `EstacionOrderPage.jsx`: un bloque de botones
  por cada etapa mía que la orden tenga; botón final "Impresa" para
  sublimado. `OrderDisenosCard.jsx` (nuevo) se usa en la vista de estación
  y en el detalle de orden de los demás roles (solo lectura salvo admin).

`npm run build` limpio. Verificado en local con "Ver como" (solo
lectura): las pantallas de sublimado y corte cargan. Al aplicar la
migración no había ninguna orden de sublimación activa (las 13 estaban
entregadas), así que el dashboard de Samuel arranca vacío, y tampoco
había usuarios con rol `sublimado` ni `corte`. Falta probar con una
cuenta real de rol `sublimado`: subir un diseño y marcar "Impresa".

---

### V121 — Inventario: catálogo estructurado, tallas completas y búsqueda flexible (fusionado a `main` y SQL aplicado el 2026-10-01)

**Estado:** desarrollado en la rama `inventario-catalogo` (salió de `main`,
no de `fase-2`: `fase-2` se quedó en el 2 de septiembre, 133 commits atrás y
sin el módulo de Inventario — confirmado con el usuario) y **fusionado a
`main` el 2026-10-01 a pedido explícito del usuario** ("ya haz el merge, ya
que quede en la página oficial"). `supabase/schema_v121_inventario_catalogo.sql` **se aplicó en Supabase el
2026-10-01** desde el SQL Editor (cargado en una consulta nueva y verificado
por hash contra el archivo de `main` antes de ejecutar; resultado "Success.
No rows returned"). Verificación posterior con SELECT: 3 clasificaciones,
17 tipos de prenda, 2 juegos (13 tallas), las 14 funciones nuevas sin
overloads duplicados, RLS activo en las 6 tablas nuevas, y los 465
artículos / 472 movimientos / 3,188 piezas intactos (0 modelos todavía:
todos los artículos arrancan "sin clasificar").

**Problema que resuelve:** artículos dados de alta con cualquier nombre
(duplicados, nombres inconsistentes), tallas que había que crear sueltas, y
un buscador de traspasos que solo comparaba texto corrido contra `prenda`
("polo tricio 12" no encontraba nada).

**Esquema (100% aditivo — no se borra/renombra nada ni cambia la firma de
ninguna función existente):**

- **"Cliente o línea" = `inv_secciones`.** Ya era exactamente eso (colegios
  y líneas mezclados) y todas las pantallas/reportes agrupan por sección, así
  que NO se creó un catálogo paralelo: solo gana `clasificacion_id` y
  `cliente_id` (liga opcional y única al catálogo `clientes` de Órdenes).
- `inv_clasificaciones` (Colegio / Empresa / Marca / Línea, ampliable),
  `inv_tipos_prenda` (17 de semilla: los del pedido + los que ya existen en
  el inventario real), `inv_juegos_tallas` + `inv_juego_tallas_det`
  (semilla: "Escolar infantil" 2-16 y "Adulto" CH/M/L/XL/2XL — decisión del
  usuario: se usan L/XL/2XL, las tallas que ya existían, NO G/XG/XXG).
- **`inv_modelos`** = la prenda sin talla (sección + tipo de prenda +
  variante). Único por esa combinación sin importar acentos/mayúsculas/
  espacios (`inv_norm()`), que es el candado real contra duplicados. La
  variante es **texto libre** (decisión del usuario), con sugerencias de las
  ya usadas.
- `inv_articulos.modelo_id` (nullable): **NULL = "sin clasificar"**, el
  artículo funciona como siempre. Único parcial `(modelo_id, talla_id)`.
- `inv_alias` (de un modelo o de un artículo; origen microsip/proveedor/
  interno) — no existía ninguna tabla de alias antes.
- **El nombre generado NO se guarda.** Un artículo creado desde un modelo
  guarda en `prenda` el texto "Tipo + Variante" (ej. "Playera polo Blanca")
  para que las pantallas ya en producción lo agrupen igual que a los viejos;
  el nombre completo `[Tipo] [Cliente o línea] [Variante] T.[Talla]` se arma
  al mostrarlo (`src/utils/inventarioCatalogo.js`). Las tallas de letra
  siguen sin prefijo "T." (regla de V92).

**RPCs nuevos:** `inv_guardar_clasificacion`, `inv_guardar_tipo_prenda`,
`inv_guardar_talla` (talla nueva al catálogo general, ej. "18" con orden
180), `inv_guardar_juego_tallas`, `inv_clasificar_seccion`,
`inv_crear_modelo` (modelo + todas sus tallas en 0, una transacción; si ya
existe regresa `ya_existia` sin cambiar nada; un artículo suelto con el
mismo texto de prenda no se duplica, se vincula), `inv_modelo_agregar_talla`,
`inv_entrada_modelo` (entrada por cuadrícula, todo o nada, solo las tallas
capturadas), `inv_guardar_alias` / `inv_quitar_alias`,
`inv_vincular_articulos` (clasifica artículos viejos: solo llena
`modelo_id`, no renombra ni toca existencia), `inv_desvincular_articulos`
(deshacer; borra el modelo si queda vacío) e `inv_catalogo()`.
Permisos con los helpers de V95 sin tocarlos: crear modelos / catálogos /
alias / clasificar = `inv_puede_editar()` (admin_tienda, admin_general —
confirmado con el usuario); entrada por cuadrícula = `inv_puede_mover()`
(incluye `tienda`).

**GOTCHA encontrado — tope de 1000 filas de PostgREST:** `inv_existencias(null)`
regresa una fila por artículo × ubicación: hoy 465 × 2 = **930**, a 35
artículos de que Supabase (max rows = 1000 por default) empiece a cortar el
resultado en silencio. El alta de traspaso que está en producción usa
justo esa llamada. Por eso `inv_catalogo()` regresa **un solo JSON**
(artículos + existencias ≠ 0 + modelos + alias), que no tiene ese tope. En
esta rama ya nadie llama `inv_existencias(null)` salvo como respaldo.

**Búsqueda flexible — en el navegador** (`src/utils/inventarioBusqueda.js`,
componente `ArticuloBuscador.jsx`): con cientos/miles de artículos es
instantánea (< 2 ms con los 465 reales) y da resultados en cada tecla sin
ir al servidor; una función en Supabase solo valdría la pena arriba de
~20 mil artículos. Reglas: tokens en cualquier orden, cada uno debe ser
inicio de una palabra del nombre o de un alias; sin acentos/mayúsculas/
puntuación; "T.12"/"t12" = talla 12; un token numérico se compara EXACTO
contra la talla o contra un número completo del nombre (`12` nunca trae
120; `2032` encuentra "Gen 2032"); primero lo que tiene existencia, luego
mejor coincidencia. Se usa en traspasos (existencia en el origen), en la
pantalla principal (busca en TODAS las secciones y lleva al grupo) y, para
modelos, en "Dar entrada".

**Frontend:**
- `InventarioPage.jsx`: carga todo el catálogo una vez
  (`useInventarioCatalogo`) y la pestaña filtra en memoria. Agrupa por
  modelo (todas sus tallas, las que están en 0 en gris — `inv-chip--cero`)
  y, lo no clasificado, por texto de prenda como antes. "Ver todo con
  tallas" abre todos los grupos del cliente; filtro por clasificación sobre
  las pestañas. Un modelo creado con el asistente muestra exactamente sus
  tallas; uno formado al clasificar artículos viejos (sin juego) conserva
  el relleno de huecos de V92, y una talla "hueco" que recibe su primer
  movimiento nace ya dentro del modelo (`MovimientoModal` →
  `inv_modelo_agregar_talla`).
- `NuevoModeloModal.jsx`: asistente de 6 pasos (clasificación → cliente o
  línea con buscador y "+ nuevo" en línea, sugiriendo clientes de Órdenes
  para no duplicar → tipo de prenda → variante → juego de tallas con
  casillas → vista previa). Avisa "Ya existe este modelo, ¿quieres usarlo?".
- `EntradaModeloModal.jsx`: elegir modelo → cuadrícula talla | hay |
  cantidad → Guardar; las vacías no se mandan.
- `ModeloOpcionesModal.jsx`: talla extra, alias, deshacer clasificación.
- `InventarioSinClasificarPage.jsx` (`/inventario/sin-clasificar`, solo
  quien edita): por cada (sección, prenda) propone tipo + variante leyendo
  el nombre (`sugerirClasificacion`: "Playera Polo Gen 2032" → Playera polo
  / "Gen 2032"); se corrige y se aplica uno por uno o en grupo. Nada se
  aplica sin confirmar.
- `InventarioAdminPage.jsx`: pestañas nuevas Clasificaciones, Tipos de
  prenda, Tallas y juegos; cada sección muestra su clasificación.

**Compatibilidad:** si la base aún no tiene V121, `fetchCatalogo()` detecta
que `inv_catalogo` no existe y cae a `inv_existencias(null)`: todo se ve
"sin clasificar" como hoy y los botones nuevos no aparecen. Al revés, el
frontend que hoy está en producción sigue funcionando con V121 aplicado
(columnas nuevas nullable, funciones viejas intactas).

**Verificado** (sin tocar Supabase): (1) las migraciones V89, V90, V95, V119
y V121 corridas completas en un Postgres en memoria (PGlite), V121 dos veces
(idempotente), con un escenario de punta a punta y los 3 roles; (2) las
pantallas reales contra esa misma base en memoria, sembrada con los 465
artículos reales: crear modelo → 8 tallas en 0; repetirlo → aviso; entrada
solo a T.10 y T.12 → las demás no se mueven; `po tri 12`, `tri polo 12`,
`pólo TRI` en traspaso → la prenda correcta; `12` no trae otras tallas;
traspaso mezclando artículo viejo + nuevo (folio y PDF); clasificar los
465 de un jalón sin conflictos y sin cambiar piezas ni nombres; roles
`tienda`/`ventas`; base sin V121. `npm run build` limpio. **Falta:** probar
en producción con sesión real (crear un modelo, darle entrada, un traspaso).

**Pendiente / no incluido:** editar un modelo ya creado (cambiar tipo o
variante — hoy se deshace la clasificación y se vuelve a crear); alias por
artículo individual en la UI (el esquema ya lo soporta, la pantalla solo
administra alias por modelo); los PDFs de traspaso/conteo siguen mostrando
`prenda` + talla como antes.

### V122 — Menú en celular: nombre y "Cerrar sesión" visibles y al alcance

Reporte del usuario con captura de un iPhone (rol `tienda`): el menú
lateral "queda raro" y no se ven ni el nombre ni el botón de cerrar sesión.
Dos causas, ambas solo de CSS/JSX (sin SQL):

- El drawer medía `100vh`, que en Safari de iPhone es más alto que lo
  visible (la barra del navegador tapa la parte de abajo) — el pie con el
  nombre y el botón quedaba fuera de la pantalla. Ahora en celular mide
  `100dvh` (con `100vh` de respaldo), respeta `safe-area-inset-top/bottom`,
  y el que hace scroll es `.app-nav`, no el menú completo: el pie siempre
  queda a la vista aunque el rol tenga 20 opciones. Al abrir, la opción
  activa se trae a la vista (`useEffect` en `AppLayout.jsx`).
- "Cerrar sesión" era un `.btn--ghost`, que el rediseño pinta con texto
  oscuro (#1c2127) — invisible sobre el sidebar oscuro. Ahora es
  `.app-sidebar__signout`: botón de ancho completo, 44px de alto, texto
  blanco "Cerrar sesión" (también en escritorio).
- Alcance con el pulgar: en celular las opciones se pegan abajo, junto al
  pie (el menú se abre desde "Más", que está abajo), y el drawer es un poco
  más ancho (`min(300px, 84vw)`).

Verificado en el entorno de prueba local a 375×812 con rol `tienda` (4
opciones) y `admin_general` (20, con scroll interno y pie visible), y a
1280px que el sidebar de escritorio no cambió salvo el botón. No se probó
en un iPhone real antes de subirlo.

## V117 — Rediseño visual (branch `rediseno-visual`, fusionado a `main`)

Branch creado desde `main` (no desde `fase-2`: ese branch quedó obsoleto
hace 127 commits — confirmado con el usuario antes de empezar). Todo el
trabajo de esta sección se hizo en `rediseno-visual` y se fue revisando en
el Preview Deployment de Vercel en cada paso (Parte 0 con tokens/`/design`,
luego Dashboard, detalle de orden, formularios, resto de módulos,
Calendario/estaciones, y el ajuste de color de "Confirmada") — el usuario
dio su visto bueno explícito a cada entrega antes de la siguiente, y al
final autorizó fusionar todo a `main`.

**Reglas seguidas** (del documento de rediseño que pasó el usuario): solo
cambios visuales (nada de lógica ni de base de datos), tokens/componentes
primero con visto bueno en `/design` antes de tocar el resto de la app, y
aplicar en orden (Dashboard → detalle de orden → formularios → resto de
módulos).

### Parte 0 — Sistema de diseño

- **Playwright** instalado como dev dependency. `scripts/capturas-rediseno.mjs`
  (nuevo, reusable) toma capturas en 393×852 y 1440×900 de 5 pantallas
  (Dashboard, detalle de orden, Nueva orden, Pendientes, Talleros), login
  vía `.env.capturas` (gitignorado). Capturas "antes" guardadas en
  `/capturas-rediseno/antes`, "después" en `/capturas-rediseno/despues`,
  mismos nombres para comparar.
- **Tokens nuevos** (`src/styles/design-system.css`) y **componentes base**
  (`src/design/components.jsx`: Chip, EtapaChip, UrgenciaChip, AppBar,
  SearchBar, OrderRow, OrderCard, Tabs, Button, KpiTile, FormField,
  BottomNav) — todo bajo la clase `.design-root`, que es justo la bisagra
  de todo este trabajo: mientras algo no lleve esa clase, no cambia nada,
  así que se pudo ir prendiendo módulo por módulo sin arriesgar el resto.
- **`/design`** (`src/pages/DesignSystemPage.jsx`): página de muestra con
  tipografía (Inter + JetBrains Mono para folios, cargadas en `index.html`),
  colores base, los 9 chips con nombre + mapeo etapa→chip + urgencia,
  botones, KPI tile, campo de formulario, tabs, SearchBar, OrderRow,
  OrderCard y el preview de AppBar+BottomNav (incluye variante "Solo
  lectura"). Visible solo para `admin_general` (`canViewDesignSystem`) — el
  documento pedía `super_admin`, rol que no existe en SALPER. El usuario
  dio su visto bueno viendo capturas de esta página antes de seguir.

### Aplicado a Dashboard, detalle de orden y formularios

- `AppLayout.jsx`: `useRediseno` decide si el `<div className="app-shell">`
  lleva también `design-root` — empezó limitado a `/` y `/orden/:id`,
  luego `/nueva`, y al final (ver "Resto de módulos" abajo) se dejó en
  `true` para toda la app. Sidebar oscura en escritorio (logo invertido a
  blanco por CSS — no existe versión blanca del PNG), AppBar oscura +
  BottomNav nuevo en celular (Órdenes/Pendientes/Más — "Más" abre el
  mismo sidebar de siempre, no se duplicó nada). Nav activo en acento
  naranja. Badge "Solo lectura" de consulta_tienda (V116) se ve igual en
  ambos temas.
- `src/styles/dashboard-redesign.css` (nuevo): overrides de clases ya
  existentes (`.order-card`, `.badge*`, `.order-filters*`, `.chip*`,
  `.input`, `.btn*`, `.card`, `.item-block`, `.status-stepper__label`,
  `.order-detail__*`, etc.), todos prefijados `.design-root` — cero JSX
  nuevo en los componentes reales salvo dos excepciones controladas:
  - `OrderCard.jsx`: se envolvió el contenido de siempre en
    `.order-card__full` (con `display: contents` por default — o sea,
    efecto cero cuando no hay rediseño) y se agregó un bloque nuevo
    `.order-card__compact` (oculto por default) con fila tipo rectángulo
    para celular — pedido explícito del usuario tras ver el mock de
    `/design`: folio + cliente · urgencia + prenda, chip de etapa a la
    derecha. En celular+rediseño se invierte cuál de los dos se ve.
  - `lib/constants.js` (`STATUSES[].color/textColor`): se probó la paleta
    nueva de chips y el usuario pidió explícitamente **conservar los
    colores originales** — se revirtió, documentado en el propio archivo.
    El resto del rediseño (tipografía, forma, sombras) sí se quedó.
- Nueva orden: `.order-form`, labels en mayúsculas, `.item-block` (prenda)
  en gris claro — mismo patrón de overrides, sin tocar `NewOrderPage.jsx`.

### Resto de módulos

Una vez que los overrides de Dashboard/detalle/formularios resultaron ser
sobre clases muy compartidas (`.card`, `.btn*`, `.input`, `.chip*`,
`.badge*`, `.order-filters*`, `.simple-table`, sidebar/topbar/bottomnav),
`useRediseno` se dejó en `true` para toda la app de un jalón — Pendientes,
Talleros, Inventario (incluye el nuevo `/inventario/movimientos` de V119),
Catálogos, Pedidos Colegio, Estadísticas, Calendario, Producción/Revisión,
Usuarios, etc. heredaron el look nuevo sin tocar una sola línea de cada
página. Verificado con una pasada de capturas (escritorio + celular, cuenta
real) por cada una — sin errores de consola en ninguna. Único ajuste
adicional: `.design-root .btn { text-decoration: none }` (las sidebar-links
estilo botón, ej. "Movimientos"/"Traspasos", salían subrayadas por
default del navegador — bug preexistente, no introducido por el rediseño,
aprovechado para corregirlo de paso).

### Calendario y vistas de estación (pedido explícito tras revisar el Preview)

El usuario revisó el Preview Deployment y pidió explícitamente actualizar
dos cosas que se habían quedado con el look viejo:

- **Calendario**: a diferencia del resto de módulos, `MonthCalendar.jsx`
  tiene sus propias clases (`.month-calendar__*`, `.calendar-legend__*`)
  que ningún override genérico tocaba — se agregaron overrides dedicados
  (encabezado de días oscuro, celdas blancas, día "hoy" en acento
  naranja, día saturado en ámbar, tipografía Inter). Los chips de cada
  orden siguen usando `status.color`/`status.textColor` tal cual (colores
  originales, sin cambio).
- **Vistas de estación** (`esEstacion` en `AppLayout.jsx` — corte/bordado/
  sublimado/costura/terminado): se había dejado fuera a propósito por
  interpretar que el documento solo pedía la pantalla de Juanis; el
  usuario aclaró que también las quería. Se agregó `design-root` a ese
  shell separado (`app-shell--estacion`/`app-topbar--estacion`) y
  overrides para `.estacion-nav__link` (mismo tratamiento oscuro+acento
  que el sidebar normal), `.estacion-card`/`.estacion-order__folio`
  (blanco, sin borde, folio en mono) y `.estacion-prenda` (gris claro,
  como `.item-block`). El shell de "Ver como" (franja amarilla) no
  necesitó cambio — ya usaba tokens compartidos.

Durante este paso se detectó una sesión de Claude Code distinta
trabajando en paralelo sobre el mismo working tree (archivos sin commit
de las Partes 2-4 de roles de fábrica — `SublimadoHomePage.jsx`,
`EstacionCard.jsx`, etc. — y un cambio de branch de `rediseno-visual` a
`main` que no hizo este hilo). Se avisó al usuario antes de seguir; se
resolvió solo (la otra sesión siguió en su propio worktree) y no hubo
pérdida de nada — ver memoria del proyecto
(`salper-ordenes-project.md`) para la convención de worktrees separados
que evita que esto se repita.

`npm run build` limpio en cada paso. Verificado en vivo: Calendario
(escritorio) y la vista de Corte/Bordado simulada con "Ver como"
(Siguientes órdenes, detalle de orden con el formulario de captura,
Pendientes de bordado) — todas consistentes con el resto del rediseño,
sin errores de consola.

### "Confirmada" deja de ser verde

El usuario revisó el Preview y notó que el Calendario se veía "todo
verde" — "Confirmada" compartía el mismo verde que "Completado" (ver la
excepción deliberada documentada arriba), y como la mayoría de las
órdenes visibles en un momento dado solo están "confirmadas" (apenas
arrancando), el calendario daba la impresión falsa de que casi todo
estaba terminado. Pidió explícitamente sacarla de esa excepción y dejó
el color exacto a mi criterio.

- `lib/constants.js`: `confirmado` pasa de verde (`#2f8f4e`, el mismo de
  `completado`) a un gris neutro propio (`#64748b` / texto blanco) — ni
  rojo (no es urgente) ni verde (no está terminada), igual de neutral
  que el resto de etapas intermedias que tampoco usan rojo/verde.
  "Por Confirmar" se queda en rojo (sin cambio, el usuario no lo
  cuestionó). El comentario del archivo se actualizó para reflejar que
  la excepción rojo/verde ya solo aplica a "Por Confirmar".
- Como `StatusBadge`/`MonthCalendar`/`OrderCard` leen el color desde
  `STATUSES` dinámicamente, el cambio se propagó solo a los tres sin
  tocar esos componentes.

`npm run build` limpio. Verificado en vivo: Calendario ya no se ve "todo
verde" (mezcla de gris/azul/otros según la etapa real de cada orden) y
el Dashboard muestra el badge "Confirmada" en gris, distinto de
"Completado" (que sigue en verde).

El usuario confirmó el último ajuste ("ahí está perfecto") y autorizó
fusionar todo a `main` — se mezcló `main` (que para entonces ya traía V120
y V121, ver arriba) hacia `rediseno-visual` primero para resolver cualquier
diferencia con cuidado (único conflicto real: este mismo archivo, por
escribirse en paralelo en los dos branches — se resolvió a mano,
conservando el contenido de ambos lados); el resto de los archivos se
fusionó limpio sin intervención. Resultado ya en `main`/producción.

### Fix — Usuarios: faltaban los roles `costura` y `consulta_tienda`

`UsersPage.jsx` tenía su propia lista `ROLES` (separada de `permissions.js`) y
nunca se actualizó cuando V111 creó `costura` y V116 creó `consulta_tienda`:
los dos roles existían en la base y en el resto del código, pero no se podían
asignar desde Usuarios — por eso la persona de costura (Carmen) quedó con el
rol obsoleto `produccion` (único "Costura" que aparecía en el desplegable).
Se agregaron los dos a la lista. `produccion` se deja en el desplegable
(etiquetado obsoleto) para que las cuentas que ya lo tienen sigan mostrando su
valor actual; funcionalmente `costura` y `produccion` hacen lo mismo en las
vistas de estación (misma etapa `produccion`, mismos pendientes de "Arreglo"),
pero `costura` es el rol correcto de aquí en adelante. Falta que el usuario
cambie a Carmen a `costura` desde Usuarios → editar.

### V123 — Producción: moverse entre semanas y corregir semanas cerradas (con interruptor para Juanis)

`supabase/schema_v123_produccion_semanas_anteriores.sql` (aplicado 2026-10-02
por el usuario desde el SQL Editor; el archivo se cargó desde GitHub raw con
hash verificado; después se verificó con una consulta: una sola versión de
cada función, interruptor sembrado en 1, `anon` sin EXECUTE sobre las dos
funciones nuevas, `authenticated` con EXECUTE sobre `prod_puede_editar_semana`,
y las dos funciones modificadas usan el interruptor).

Problema: la semana cerró (jueves 11am, V106) con captura mal hecha y ya no se
podía corregir. Además, desde V118 la pantalla de Captura siempre abre la semana
actual, así que ni un admin (que sí podía editar en_revision desde V69) tenía
cómo llegar a la semana anterior.

- **Selector de semana** en `ProduccionCapturaPage.jsx` (← Semana anterior /
  Semana siguiente →, hasta 12 hacia atrás). `fecha` sigue sin pedirse: en una
  semana anterior los registros nuevos se fechan con el último día de esa
  semana. Aviso "Estás viendo una semana anterior" con botón para volver, y aviso
  claro si la semana está **aprobada** (hay que reabrirla en Revisión producción,
  solo admin_general). El resumen "X de Y operadoras capturadas" solo se muestra
  en la semana actual (no tiene sentido por día en una pasada).
- **Permiso real del servidor, no adivinado**: la pantalla llama
  `prod_puede_editar_semana(estado, fin)` (misma función que usan
  editar/borrar) para decidir si muestra Editar/Borrar y el formulario en una
  semana cerrada — así respeta aprobada, el rol y el interruptor.
- **Interruptor `prod_config.captura_semanas_anteriores`** (1 = activo): con él
  prendido, `captura_produccion` (Juanis) puede capturar/editar/borrar en semanas
  `abierta` o `en_revision` — nunca `aprobada`. Con él en 0 todo queda exactamente
  como antes. Se sembró en **1** porque el usuario pidió el acceso "ahorita" y
  quiere quitarlo cuando terminen la corrección. Se apaga desde **Admin producción
  → Configuración → "Juanis puede capturar y editar en semanas cerradas"** (RPC
  `prod_set_captura_semanas_anteriores`, solo admin_general / admin_fabrica) — sin
  tocar SQL.
- `prod_capturar_registro` se re-creó idéntica a V107 salvo una línea (el candado
  de semana en_revision acepta también a quien tenga el interruptor);
  `prod_puede_editar_semana` conserva su regla de V69 para el resto de casos.
- Observación sin tocar (no pedida): `prod_puede_editar_semana` conserva la
  cláusula `p_fin >= hoy` de V69 para quien no es admin ni tiene el interruptor,
  que ya no coincide con el cierre del jueves 11am de V104/V106 — con el
  interruptor apagado, Juanis no puede editar/borrar en miércoles/jueves-antes-
  de-las-11 una semana que técnicamente sigue abierta (sí puede capturar nuevo).

`npm run build` limpio. Probado en vivo con la cuenta admin: el selector llega a la
semana anterior (en revisión) con Editar/Borrar, y el interruptor aparece marcado
reflejando el valor sembrado (no se cambió en la prueba). No se probó con la cuenta
real de Juanis (sin credenciales): el comportamiento de ella depende de la
función de servidor ya verificada, pero conviene que lo confirme entrando ella.

### V124 — Usuarios: `admin_update_user_role` y `admin-create-user` aceptan `costura` y `consulta_tienda`

`supabase/schema_v124_admin_update_user_role_roles_nuevos.sql` (aplicado 2026-10-02
por el usuario desde el SQL Editor, cargado desde GitHub raw con hash verificado;
verificado después: una sola copia de la función, acepta ambos roles nuevos y
sigue exigiendo `admin_general`).

Síntoma: al cambiar a Carmen a "Costura" desde Usuarios salía "Rol inválido:
costura". Causa: V111 (costura) y V116 (consulta_tienda) agregaron los roles al
CHECK de `profiles` y a `permissions.js`, pero había **otras tres listas de roles
duplicadas** que nadie actualizó: `UsersPage.jsx` (arreglado antes, sin SQL), la
función `admin_update_user_role` (lista de V88 — esta migración) y la Edge
Function `admin-create-user` (`VALID_ROLES`). Lección para futuros roles: al
crear uno, buscar `'admin_fabrica_lectura'` en todo el repo para encontrar
todas las listas, no solo el CHECK.

- Cambio de la función: solo la lista de roles válidos (misma firma, mismo
  permiso, `create or replace`).
- `supabase/functions/admin-create-user/index.ts`: `VALID_ROLES` actualizado **en
  el repo, pero la Edge Function se despliega aparte desde el Dashboard de
  Supabase** — **todavía NO redesplegada**. Hasta que se haga, crear una cuenta
  NUEVA con rol `costura` o `consulta_tienda` desde Usuarios seguirá dando "Rol
  inválido" (cambiar el rol de una cuenta ya existente sí funciona).

### V125 — Roles y permisos editables desde la app (Fase 1: lo central)

`supabase/schema_v125_roles_permisos_fase1.sql` (aplicado 2026-10-02, cargado desde
GitHub raw con hash verificado; verificado después con 8 comprobaciones booleanas:
conteos por permiso, catálogo, 15 funciones reescritas, grants, tablas sin
escritura directa, `admin_general` con todo, `costura` en `pf.fabrica`).

**Qué es:** hasta hoy "qué puede hacer cada rol" estaba escrito a mano en SQL
(~203 chequeos de `current_user_role()` en 57 migraciones, 16 funciones auxiliares) y en
`permissions.js` (62 funciones). Fase 1 convierte en datos las 15 funciones auxiliares
centrales (inventario, finanzas, pendientes, producción) y sus gemelas del frontend.

- Tablas nuevas: `permisos_catalogo` (15 permisos, con módulo/etiqueta/descripcion/nivel),
  `rol_permisos` (rol × clave; la fila existe = permitido) y `rol_permisos_log` (historial,
  solo lo lee `admin_general`). Sin políticas de escritura: todo pasa por
  `admin_set_rol_permiso(rol, clave, permitido)`, solo `admin_general`, que además
  rechaza tocar `admin_general` (anti-bloqueo) y valida el rol contra
  `profiles_role_check` (así no se crea otra lista duplicada de roles).
- `tiene_permiso(clave)` consulta la tabla con el rol real del usuario. Las 15 funciones
  (`fin_*`, `inv_*`, `pf_*`, `prod_*`) conservan nombre/firma/grants y ahora llaman a
  `tiene_permiso`, por eso las políticas RLS y RPC que las usan no se tocaron.
  `prod_puede_editar_semana` NO se migró (mezcla rol con estado/fecha; fase posterior).
- La migración empieza con una guarda de deriva: compara cada función viva con lo que
  se siembra y aborta sin cambiar nada si alguien la modificó a mano.
- Siembra = comportamiento de ese día, con **un cambio deliberado**: `costura` se agregó a
  `pf.fabrica` (antes `pf_es_fabrica()` la omitía aunque el frontend la trataba como
  fábrica; Carmen veía Pendientes pero el servidor le rechazaba confirmar). Se puede
  desmarcar desde la pantalla.
- Diferencia previa que quedó corregida en pantalla: `admin_fabrica_lectura` veía el botón
  de ranking de producción pero el servidor no se lo permitía; `prod.ver_ranking` se
  sembró según el servidor.

**Frontend:** `permisosService.js`; `AuthContext` carga `rol_permisos` junto con el perfil
(antes de `loading=false`) y llama a `setPermisosMap`; los helpers de `permissions.js`
(`canViewFinanzas/Edit*`, `canViewInventario/Mover/Editar`, `pfEsTienda/Fabrica`,
`canViewPendientes` (la lógica de estaciones sigue encima), `canMarcarEntregado`,
`canCapturarProduccion`, `canViewProduccionMontos` ↔ `prod.ver_lectura`,
`canVerRankingProduccion`) consultan el mapa y, si no cargó, usan el valor fijo de
siempre. "Ver como" funciona sin cambios (el mapa trae todos los roles). Pantalla nueva
`/roles-permisos` ("Roles y permisos", solo `admin_general`): selector de rol, casillas por
módulo con etiqueta "Solo ver"/"Puede modificar", guardado inmediato e historial.
`ROLES_ASIGNABLES` en `permissions.js` es ahora la única lista de roles para Usuarios y
esta pantalla (el CHECK de la base sigue siendo la fuente real).

**Pruebas:** `npm run build` limpio; en local con la cuenta admin: la matriz de `ventas` y
`lectura` coincide con lo de hoy, activar/desactivar `pf.entregar` en `lectura` guarda,
refleja y registra en el historial (se dejó como estaba), `admin_general` sale marcado y
bloqueado, sin errores de consola. **No probado con cuentas reales de otros roles.**

**Falta (fases siguientes):** migrar el resto de chequeos de rol módulo por módulo
(órdenes, catálogos, producción restante, usuarios, anuncios, etc.); `prod_puede_editar_semana`;
`prod.ver_montos` y `prod.ver_captura` no tienen gemelo en el frontend todavía.
Para futuros roles: agregarlos al CHECK, a `ROLES_ASIGNABLES` y marcar sus permisos en la
pantalla; ya no hay que reescribir funciones SQL para las 15 centrales.

### V126 — Sublimación: nombres y números siempre visibles con Enter; búsqueda por folio anterior

Puramente frontend (sin SQL; `items` sigue siendo el mismo JSONB).

**Nombres y números.** La lista (`roster`, V39) existía pero solo aparecía tras elegir
la prenda y apretar el botón "+ Agregar nombres y números"; si la prenda no coincidía
con las 5 opciones (p. ej. una orden vieja o cargada desde foto/PDF con otro texto) el botón
ni se mostraba, y con eso parecía que "ya no salía". Ahora, en órdenes de **sublimación**
(todas las prendas menos Pantalonera), la sección **Nombres y números** (solo **Números** para
Short) está siempre visible, sin botón. En `OrderItemsEditor.jsx`:
- Talla, nombre y número son campos de texto. Enter pasa al siguiente campo; en el último se
  abre una fila nueva **con la misma talla** (casi siempre vienen agrupados por talla) y el
  cursor queda en Talla con el texto seleccionado. Enter ya no manda el formulario.
- La talla debe ser una de "Tallas y cantidades" de esa prenda (regla de V39): al salir del
  campo se acomoda a mayúsculas/minúsculas (`m` → `M`) y si no existe se marca en rojo con
  el aviso y las tallas válidas (no bloquea el guardado).
- `tiene_roster` ya no se activa a mano: se calcula al guardar (`utils/roster.js`,
  `limpiarRoster`), que además descarta filas vacías. Se usa en "Nueva orden" y al editar la
  prenda en el detalle de la orden. Una prenda que antes tenía datos pero el botón apagado
  ahora los vuelve a mostrar.

**Búsqueda por folio anterior (control anterior, `folios_externos`).** La pantalla de la
estación de Sublimado (`SublimadoHomePage.jsx`, el buscador "cualquier orden") solo
comparaba folio SALPER y cliente, por eso Samuel no encontraba una orden por su folio
anterior. Ahora las tres búsquedas (Dashboard, Órdenes pasadas y Sublimado) usan
`utils/ordenesBusqueda.js`: folio, cliente y folios anteriores, tolerando espacios y guiones
(`ORD 0007`, `ord-0007`, `0007`, `esc 018`). Además, el Dashboard (que no mezcla completadas)
ahora muestra "También en Órdenes pasadas (N)" cuando la búsqueda solo coincide con órdenes
completadas, que antes salía como "No hay órdenes". Probado en local con "Ver como"
sublimado: `ord 3149` encuentra SUB-006 (completada). Pendiente: confirmar con Samuel.

### V127 — Enter avanza de campo en todos los formularios

Frontend únicamente. `src/hooks/useEnterComoTab.js` (instalado una vez en `AppLayout`) hace que
Enter, en un input o select de cualquier formulario `form.order-form` (órdenes, pendientes,
inventario, talleros, catálogos, producción, usuarios…) o de un contenedor con
`data-enter-next`, pase al **siguiente campo visible y editable**; el último paso es el botón de
guardar (otro Enter lo manda). Detalles:
- Respeta lo que un campo ya manejó solo (`defaultPrevented`): roster, folios externos. Folio
  externo: con dígitos, Enter lo agrega (como siempre); con el campo vacío, Enter sigue al
  siguiente campo. Roster: en la última fila vacía, Enter sale hacia el siguiente campo (la talla
  heredada por sí sola ya no cuenta como registro, `utils/roster.js`).
- En `<textarea>` Enter sigue siendo salto de línea; **Ctrl/⌘+Enter** avanza.
- Salta campos dentro de `<details>` cerrados (Notas y fotos / Cotización), ocultos o
  deshabilitados, y si un campo no acepta el foco prueba el siguiente.
- `data-enter-normal` en un formulario conserva el Enter de siempre: se puso en el **login**.
- En celular el teclado muestra "Siguiente" (`enterKeyHint`).
- La edición de prendas en el detalle de la orden (`OrderItemsCard`) no es un `<form>`; se
  envolvió con `data-enter-next` (ahí no hay botón de guardar en la cadena).
- No aplica a `ProduccionCapturaPage` (tiene su propio flujo de Enter) ni a buscadores sueltos.
Probado en local con teclado real en "Nueva orden": cliente → fechas → folio (Enter agrega
ORD3149/ORD3150, vacío sigue) → prenda → color → … → tallas → nombres y números → "Crear orden".
No se probó formulario por formulario (es un mecanismo común), solo Nueva orden.

### V128 — Indicador de nota interna en las tarjetas de orden

Frontend únicamente, sin SQL. El admin de fábrica agrega notas internas (`orders.notas_internas`)
y no había forma de saber cuáles órdenes las tenían sin abrirlas una por una. Ahora
`OrderCard.jsx`, en cualquier orden activa con nota y con sesión iniciada:
- tarjeta completa en **morado** (`.order-card--con-nota`, tokens `--color-nota`/`--color-nota-soft`,
  y su regla en `dashboard-redesign.css`) — mismo estilo que el azul de "se modificó después de
  confirmarse", pero con otro color para no confundirse;
- línea "✎ Nota: <texto>" (una línea, recortada con …); en el celular, chip "✎ Nota" junto al folio.
- Si la orden además se modificó después de confirmarse, gana el azul (señal más urgente) y la
  línea de nota se sigue mostrando. Canceladas/completadas no se pintan (la línea de nota sí).
- Invitados sin sesión no ven notas (igual que en el detalle).
Hoy hay 30 órdenes con nota (21 sin completar). Se probó en local (escritorio y celular).
Se descartó (a pedido del usuario) la versión con "notas nuevas / vistas" y SQL de fecha y
autor por nota: no hace falta para este uso. Las pantallas de estación de fábrica
(`EstacionHomePage`) no usan `OrderCard` y no muestran este indicador todavía.

### V129 — Pendientes: varias prendas por pendiente y pago con anticipo

`supabase/schema_v129_pendientes_prendas_anticipo.sql` (aplicado 2026-10-04, cargado desde GitHub
raw con hash verificado; empieza con una guarda de deriva que exige que `pf_crear`/`pf_editar`
vivas sean las de V84). Verificado: una `pf_crear` y una `pf_editar` (17 parámetros y 18), grants
(authenticated sí, anon no), pendientes existentes rellenados (13), y una prueba dentro de un
bloque que se revierte solo (nada quedó en la base): crear con 2 prendas + anticipo → `cantidad`
= 3 (suma), `prenda/talla` = primera línea, `pago_estado='anticipo'`, `pagado=false`, total 1500 y
anticipo 500; anticipo ≥ total y talla vacía rechazados; llamada con los 13 parámetros viejos
sigue funcionando; `pf_editar` cambia a pagado y limpia total/anticipo.

- **Prendas:** `pf_pendientes.prendas` (jsonb `[{prenda,talla,cantidad}]`). Las columnas de siempre se
  siguen llenando (`prenda`/`talla` = primera línea, `cantidad` = total de piezas) para no romper
  nada que las lea. El formulario (`PendienteForm.jsx`) tiene una línea por prenda con cantidad
  propia (se quitó el campo "Cantidad" general) y agrega una línea vacía sola al llenar prenda y
  talla de la última; la vacía del final no se guarda. Muestra "Total: N piezas" si hay varias.
- **Pago:** nueva opción **Anticipo** (además de Pagado / No pagado): pide total del trabajo y
  anticipo y muestra "Resta" calculado (total − anticipo, no se guarda). Reglas (también en el
  servidor): total > 0, anticipo > 0 y anticipo < total. Columnas `pago_estado`
  (`pagado|no_pagado|anticipo`), `pago_total`, `pago_anticipo`; `pagado` queda true solo si 'pagado'.
- **Cambio en la base de funciones:** se borraron las firmas viejas de `pf_crear`/`pf_editar` y se
  recrearon con 4 parámetros opcionales al final (evita dos sobrecargas ambiguas para la API), mismos
  permisos. Auxiliares nuevas: `pf_normalizar_prendas`, `pf_normalizar_pago`.
- **Pantallas:** `utils/pendientesPago.js` (`prendasDe`, `resumenPrendas`, `textoPago`) alimenta la
  tarjeta (`PendienteCard`), el detalle (`PendienteDetailPage`) y la estación
  (`EstacionPendientesPage`): "Chamarra talla M ×2 · Short talla L" y "Anticipo $500 · Resta $1,000".
  Los pendientes anteriores se ven igual que antes (caen a `prenda/talla/cantidad` y `pagado`).
- **No probado:** el envío real desde la pantalla (crear un pendiente real dejaría una fila en la
  base de producción); sí se probó el formulario (alta de prendas, Enter, anticipo/resta) y las
  funciones con la prueba que se revierte. Pendiente: que el usuario cree uno real y lo confirme.
- La etiqueta imprimible (`generatePendientePdf.jsx`) no usa prenda/talla/cantidad, así que no
  cambia.

### Arreglo 2026-10-04 — folios de pendientes quemados por mi prueba, y tipo "borado"

`supabase/fix_folios_pendientes_y_tipo_borado_2026-10-04.sql` (aplicado con hash verificado, con guardas).
- **Qué pasó:** la prueba de V129 corrió `pf_crear` dentro de un bloque `do $$ … raise exception` para
  revertirlo, pero **las secuencias de Postgres no se revierten**: quemó P-0015 y P-0016. Los 3
  pendientes reales del usuario (creados después) salieron como P-0017/18/19.
- **Arreglo:** se renumeraron a P-0015/16/17 y `pf_folio_seq` quedó en 17 (el siguiente es P-0018).
  Ojo: la etiqueta imprimible se nombra con el folio (`Etiqueta-P-00xx.pdf`); si alguien ya imprimió
  una con el folio viejo (17/18/19), ese número ya no corresponde al mismo pendiente.
- **Lección:** NO probar funciones que generan folios (`pf_crear`, `create_order`, etc.) en la base
  de producción, ni siquiera con rollback: gasta folios que el usuario ve. Probar solo con SELECTs, o
  contra funciones sin secuencia.
- **Tipo de orden "borado":** duplicado mal escrito de "bordado", sin órdenes ni plantillas → se
  borró (`order_types`). "Bordado" se queda. No existe pantalla para renombrar/borrar tipos de orden
  (solo "+ Nuevo tipo…" al crear una orden); se hace por SQL.

### V130 — Notas internas: botón "Resolver"

`supabase/schema_v130_notas_resolver.sql` (aplicado 2026-10-04, hash verificado; comprobado: anon sin
acceso a `resolver_nota_orden`, authenticated sí, columnas y trigger creados, 0 notas resueltas al inicio).
- Columnas `orders.nota_resuelta_en` / `nota_resuelta_por_nombre`; trigger `orders_nota_reabrir_trg`
  (BEFORE UPDATE OF notas_internas) las borra si el texto de la nota cambia; RPC
  `resolver_nota_orden(p_order_id, p_resuelta)` (no 'lectura', 'captura_produccion',
  'admin_fabrica_lectura' ni 'consulta_tienda'; exige que exista nota). No se tocó
  `set_order_notas_internas`.
- Frontend: en el detalle de la orden (`OrderNotesCard`) botón "✓ Resolver"; resuelta = texto tachado +
  "✓ Resuelta por X · fecha" + "Reabrir". `OrderCard` ya no pinta morado ni muestra "✎ Nota" si la nota
  está resuelta (V128). `canResolverNotas` en `permissions.js`; `resolverNotaOrden` en el servicio.
- Probado en local con una orden real: resolver → desaparece de las tarjetas (31 → 29 apariciones) →
  reabrir → vuelve; quedó como estaba.

### V131 — Varios cortes, buscador en todas las estaciones, sublimado a Samuel, ubicación del bordado

`supabase/schema_v131_corte_multiple_sublimado_samuel.sql` (aplicado 2026-10-04, hash verificado, con
guarda de deriva; verificado: ambas funciones nuevas, grants authenticated sí/anon no, `impresion` sigue
siendo del rol sublimado). Dos funciones, sin tablas ni columnas nuevas:
- `update_orden_etapa`: la etapa `sublimado` ahora la reporta el rol **sublimado** (antes `corte`);
  parche de un solo reemplazo sobre la definición viva. admin_fabrica/admin_general siguen pudiendo todas.
- `marcar_corte(uuid, jsonb)`: acepta VARIOS cortes por tela y cortes de telas fuera de las prendas
  (p. ej. vivos). Por cada tela suma sus cortes en un solo movimiento `consumo_corte` y junta las
  descripciones (`nota` de cada elemento) en `movimientos_tela.nota`. Las telas de las prendas siguen
  siendo obligatorias; llamada vieja (sin nota) funciona igual.

Frontend:
- **Corte** (`EstacionOrderPage.jsx`, `TelaUsadaCorte`): un bloque por tela como antes + "+ Agregar otro
  corte" (campo "¿Qué corte es?" obligatorio, selector de tela con todas las telas, trazo/piezas/hojas).
  Cada corte manda `{tela_id, cantidad, nota}`; la confirmación muestra el total por tela.
  `OrderCorteResumen` tiene columna "Cortes" con la nota.
- **Buscador**: `EstacionHomePage` (corte, bordado, costura, terminado) busca por folio, folio anterior o
  cliente en cualquier orden (`utils/ordenesBusqueda.js`). Sublimado ya lo tenía.
- **Sublimado → Samuel**: `vistasPorRol.js` (corte solo corte; sublimado = `impresion` + `sublimado` con
  `finalLabels` Impresa/Sublimada), `canChangeEtapa`, bandeja nueva "Pendientes de sublimado" y chip de
  estado en `SublimadoHomePage`. Lo que estaba pendiente de sublimar para corte pasa solo a Samuel.
- **Bordado**: campo `bordado_ubicacion` por prenda (texto libre, "¿Dónde va el bordado?") en
  `OrderItemsEditor` (solo si lleva bordado y no es sublimación); se ve en el resumen de la prenda, en
  `OrderBordadosCard` (junto a las fotos), en la vista del bordador y en `EntregaResumenPdf`.
- Probado en local con "Ver como": corte (buscador, sin sección de sublimado, formulario de cortes con
  extra, deshabilitado hasta completar), sublimado (bandejas, botones Impresa/Sublimada), campo de bordado.
  **No probado**: confirmar un corte real (descontaría tela del inventario real); la primera orden real que
  corte Pancho será la prueba. Tampoco se probó con las cuentas reales de Samuel/Pancho.
- Nota: la interfaz del SQL Editor se quedó en "Running…" y la conexión de Chrome se cayó mientras corría;
  se comprobó con consultas de solo lectura que la migración sí quedó aplicada completa.

### V133 — Catálogo de productos por cliente: ficha completa, carga de las fichas de uniformes y página por colegio

Fusionado a `main` el 2026-10-04 (rama `catalogo-productos`, salió de `main` en V131). El SQL
(`schema_v133_catalogo_productos.sql`) **ya está aplicado en Supabase** y verificado (17 columnas en
`productos`, una sola copia de `guardar_producto`, `anon` no la puede ejecutar).

**Estructura final del catálogo** (`public.productos`, V12 + V133, todo aditivo):
- De V12: `cliente_id`, `nombre`, `garment`, `color`, `pantone`, `tela_id`, `foto_url`, `foto_path`.
- Nuevas: `especificaciones jsonb` (manga, vivos, cuello, punos, bies, hilo, tecnicas[], proveedor,
  observaciones, tela_extra, ficha, color_sugerido_de_foto), `bordados jsonb`
  (`[{ubicacion, descripcion, foto_url, foto_path}]` — la foto es la del logotipo), `tallas text[]`,
  `tallas_rango text`, `fotos jsonb` (`[{url, path}]`, igual que `orders.reference_photos`;
  `foto_url`/`foto_path` siempre traen la primera), `pendiente_validar boolean`, `notas_validacion text`.
- RPC nueva `guardar_producto(...)` (ventas / admin_general): con `p_id` actualiza; sin `p_id` busca por
  cliente + nombre y crea si no existe. `create_producto`/`delete_producto` no se tocaron.
- **Sin índice único por cliente + nombre**, a propósito: "Guardar como producto" usa el nombre de la
  prenda como nombre del producto y fallaría con la misma prenda en dos colores.
- Fotos en el bucket público `order-photos`, carpeta `productos/<clienteId>/`.

**Carga de las fichas "Layout Uniformes Escolares"** (`data/catalogo/catalogo_salper.json` + 55 fotos):
- Clientes ligados: Colegio Echavarría, Domus (ficha "Colegio Domus"), IMES, Tricio (ficha "Instituto
  Tricio"). Cliente creado: 18 de Marzo (escolar).
- Telas ligadas: Pique, Tampa, polifel afelpado. Creadas: Pique 50/50 (los tres piqué 50/50 de color son
  una sola tela; el color va en el producto), Dubay XS, Qatar 2.
- 28 productos: Echavarría 7, Domus 10, IMES 7, 18 de Marzo 3, Tricio 1.
- 21 quedaron con `pendiente_validar` (los 18 con `revisar` o color tomado de la foto, más los que no
  traen color o tallas); `notas_validacion` dice qué falta en cada uno.
- Tallas (decisión de Alfredo): la 16 es la misma que XS y no se usa. "2-XL" = 2…14, XS, CH, M, L, XL;
  "0-XL" y "2-40" = 0, 1, 2…14, XS, CH, M, L, XL; "S-5XL" = CH…5XL.

**Script de recarga:** `data/catalogo/` (el JSON y las fotos) **no está en git** (el repo es público;
está en `.gitignore`) — vive solo en la máquina de Alfredo, en `salper-ordenes-catalogo/data/catalogo/`.
Desde la raíz del repo, `node scripts/seed_catalogo.mjs --simular` (no escribe) y
`node scripts/seed_catalogo.mjs` (carga). Usa `.env` y la cuenta admin_general de `.env.capturas`. Es
idempotente, pero **lo que diga el JSON pisa lo editado en la app**; solo se conservan las fotos subidas
desde la app (logotipos de bordados y fotos extra). Imprime el checklist de pendientes por cliente.

**Frontend:**
- Nueva orden (`ProductoAutocomplete.jsx`, `utils/productoCatalogo.js`): el catálogo del cliente se ve
  con miniatura, nombre y prenda; elegir un producto COPIA a la prenda (snapshot en `orders.items`)
  prenda, color, tela, manga, vivos, cuello, puños, observaciones (campo nuevo de la prenda, solo si viene
  del catálogo) y los bordados. Aviso "⚠️ Datos por validar" en los incompletos.
- **Bordados con foto en la orden** (`BordadosPrenda.jsx`, escolar/industrial): al marcar "Lleva bordado"
  ya no hay un solo texto "¿Dónde va?", sino una lista de bordados, cada uno con foto y dónde va,
  guardada en la prenda como `items[].bordados[] = {id, ubicacion, foto_url, foto_path}` — la misma forma
  que V132 usa en las órdenes de tipo bordado (`uploadFotoBordado`, carpeta `bordados-orden/`). Si la
  prenda viene del catálogo llegan llenos, con la foto del logotipo si el producto la tiene.
  `bordado_ubicacion` (V131) se sigue llenando con las ubicaciones. **Al crear la orden se exige al menos
  una foto de bordado por prenda que lleva bordado** (`validarFotosBordado`); al editar una orden ya
  creada no se exige, para no bloquear órdenes viejas.
- **Las tallas NO se cargan solas** (se probó y Alfredo pidió quitarlo): se capturan a mano. `tallas`
  queda en el catálogo solo como referencia.
- Los bordados no se precargan en `orden_bordados` (ahí solo escribe bordado/admin de fábrica con la
  etapa activa); viven en la prenda.
- Catálogos: las listas (Clientes, Telas…) son desplegables y arrancan cerradas. Ya no hay sección
  "Productos por cliente": cada fila de Clientes tiene el botón "Ver catálogo de prendas (N)", que abre su
  página (`/catalogos/cliente/:id`, `CatalogoClientePage.jsx`) con sus productos en tarjetas, la ficha completa,
  filtro "Solo pendientes de validar" y alta/edición (datos, fotos y bordados con foto del logotipo).

**Pendiente:** V132 (sin commit en `rediseno-visual`) toca `OrderItemsEditor`/`OrderItemsCard`/`NewOrderPage`/
`bordadosService`, igual que esto: habrá que conciliar al fusionarlo; observaciones y logotipos todavía no salen en PDFs ni en las
pantallas de estación; editar productos sigue siendo solo de ventas/admin_general.

### V132 — Órdenes de tipo "bordado": simples, solo bordado y terminado

`supabase/schema_v132_plantilla_etapas_bordado.sql` (aplicado 2026-10-04, hash verificado, con guarda): dos
filas en `plantillas_etapas` para el tipo `bordado` → **bordado (1)** y **terminado (2)**. `create_order`
copia la plantilla (la etapa bordado la decide `lleva_bordado` y toma su secuencia de aquí). Verificado:
las dos filas existen. No hay ninguna orden de tipo bordado todavía (no se creó ninguna de prueba).

Frontend (`utils/bordadoOrden.js`, `components/orders/BordadoItemsEditor.jsx`; `OrderItemsEditor` lo usa
cuando `orderTypeKey === 'bordado'`):
- Solo **prenda** (Camisa, Polo, Playera, Pantalón, Chamarra, Sudadera, Chaleco, Mandil, Cachucha, "Otra…"),
  **tallas y cantidades** y **bordados**: cada bordado = foto + "¿Dónde va?" (texto libre), salvo
  **cachucha**, que solo pide la foto. Se pueden subir **varias fotos a la vez** (cada una es un bordado).
  Nada de tela, color, cuello, manga, vivos, puños, logotipos, números ni bolsas. Cotización, orden de compra,
  factura, total y anticipo siguen como siempre.
- Los bordados viven dentro de la prenda (`items[].bordados[] = {id, ubicacion, foto_url, foto_path}`), no en
  `orden_bordados`, así tienda los captura al crear la orden sin depender de permisos de bordado. Las fotos se
  suben al elegirlas (`uploadFotoBordado`, carpeta `bordados-orden/`).
- Validación (`validarItemsBordado`): cada prenda necesita la foto de su bordado y su "dónde va" (no
  cachucha). `normalizarItemsBordado` marca `lleva_bordado` en todas las prendas (así el servidor crea la etapa
  bordado) en "Nueva orden" y al editar prendas en el detalle.
- Se ven en el detalle (`OrderBordadosCard`), en la pantalla del bordador (`EstacionOrderPage`) y, el texto de
  ubicaciones, en `EntregaResumenPdf`.
- **Cruce con la otra sesión (V133):** mientras yo trabajaba en este directorio, otra sesión (catálogo de
  productos, V133) confirmó en su commit mi `uploadFotoBordado` y reutilizó la misma forma de datos
  (`bordados[]`) en su `BordadosPrenda` para escolar/industrial. Se mezcló sin pérdida: en los otros tipos
  sigue su lista de bordados (V133) y en `bordado` el editor simple de V132; la validación de foto usa la de
  V132 para órdenes de bordado y la de V133 para las demás. Lección: este directorio es compartido; las
  sesiones deben usar worktrees separados.
- No probado: crear una orden de bordado completa (crearía una orden real); sí el formulario, la subida de
  varias fotos (archivos de prueba borrados del almacenamiento) y que escolar conserva su editor.

### V134 — Impresión por prenda (etapa de terminado) y dos tipos nuevos de pendiente (2026-10-05)

`supabase/schema_v134_impresion_prenda_y_pendientes.sql` (aplicado 2026-10-05 desde el SQL Editor, hash
verificado, con guarda de deriva).

**Nueva orden (escolar/industrial/basquetbol):** los botones "¿Lleva bordado?" y "¿Lleva impresión?" van
juntos debajo de Logotipos (antes el de bordado estaba al final de la prenda). "Lleva impresión"
(`items[].lleva_impresion`) abre una lista igual a la de bordados: `items[].impresiones[] = {id, ubicacion,
foto_url, foto_path}` (`BordadosPrenda` con `tipo="impresion"`; fotos en `bordados-orden/`). Al crear la
orden se exige al menos una impresión y cada una con foto y lugar (`validarImpresiones`). No aplica a
sublimación ni a órdenes de tipo bordado.

**Etapa `impresion_prenda`** (etiqueta "Impresión"): distinta de `impresion` (V120, papel de sublimación,
rol sublimado). La reporta el rol **terminado** (`update_orden_etapa` parcheada; `canChangeEtapa`;
`vistasPorRol.js`: terminado gana `etapasExtra: ['impresion_prenda']` con botón final "Impresa", así ve
"Pendientes de impresión" aparte de terminado). La crea/quita el trigger `orders_sync_impresion_prenda`
(after insert/update of items en `orders`) según haya alguna prenda con `lleva_impresion`; solo se quita
si sigue `pendiente`. Secuencia = la de bordado. `recompute_order_status` no se tocó: la etapa no tiene
estado propio en `orders.status`. No se redefinieron `create_order` ni `set_order_items`.

**Pendientes:**
- `pf_tipos_trabajo` gana `partes text[]` y `solo_envio boolean`; `pf_pendientes` gana `partes_listas
  text[]`; estado nuevo `mercancia_recibida` en el CHECK.
- **"Arreglo y bordado"** (`partes = {Arreglo, Bordado}`): le aparece a bordado y a costura (su
  `pendientesTipo` es también su "parte"; `esTrabajoDe`). Cada quien marca la suya con
  `pf_marcar_parte(id, parte)`; con todas listas pasa a `listo_para_regresar` vía `pf_aplicar`.
  Terminado/admin pueden seguir marcándolo listo completo desde las bandejas.
- **"Envío de mercancía"** (`solo_envio`): al confirmar "recibido en fábrica" el trigger
  `pf_pendientes_cerrar_envio` lo deja en `mercancia_recibida` con `cerrado_en` (el historial registra
  "recibido_en_fabrica"). Se ve en "Cerrados" (tienda) y en la bandeja "Mercancía recibida" (fábrica). El
  formulario sigue pidiendo prenda y talla.
- No se tocaron `pf_aplicar` ni `pf_crear`.

**No probado en vivo:** crear una orden con impresión ni los dos tipos de pendiente (gastarían folios
reales). Sí: el formulario (lista de impresiones y validación) y la verificación del SQL por consulta.

### 2026-10-05 — Juanis no podía capturar: la semana 30 sep–6 oct estaba "en revisión" por un cierre manual

Síntoma: "Ya no se puede capturar en esta semana" con la semana del 30 sep al 6 oct. Diagnóstico (solo lectura):
`prod_cerrar_vencidas` viva sí tiene la regla de V106 (fecha_fin + 2 días a las 11:00 hora Monterrey) y a esa
semana le tocaba cerrar el **jueves 8 oct 11:00**; no hay cron (el cierre automático corre al abrir la pantalla
de Revisión). Por tanto alguien la pasó a `en_revision` a mano con **"Pasar a revisión"** (Revisión producción →
`prod_cerrar_semana`; pide un `confirm()` que avisa que se bloquea la captura de Juanis). No hay registro de quién
(prod_semanas no guarda quién/cuándo cierra). La semana tenía 208 registros, 0 premios, no aprobada, no importada.
Arreglo (dato, 1 fila, con guarda): `update prod_semanas set estado='abierta'` para esa semana. Nota: la UI solo
permite "Reabrir…" semanas **aprobadas** (→ en_revision); de en_revision a abierta no hay botón, por eso fue SQL.
Pendiente ofrecido al usuario: advertir/bloquear "Pasar a revisión" antes de la hora de cierre.

### V135 — "Venta Mostrador": plantilla de etapas, backfill y cliente Salper (2026-10-05)

`supabase/schema_v135_venta_mostrador_plantilla.sql` (aplicado 2026-10-05 desde el SQL Editor, hash
verificado; comprobado después con consultas de solo lectura).

**Qué pasó:** el tipo `venta_mostrador` ("Venta Mostrador", prefijo `VEN`) se creó el 29-sep con
"+ Nuevo tipo…" de Nueva orden. `create_order_type` no creaba plantilla, así que sus 4 órdenes
(VEN-001 a VEN-004, de ventas, ya `confirmado`) nacieron sin filas en `orden_etapas` y no le aparecían
a ninguna estación de fábrica.

**Arreglo (el tipo se queda activo):**
- Plantilla: **corte (1) → produccion (2) → terminado (4)**. "Costura" es la etapa `produccion` (la
  reporta el rol `costura`; el rol `produccion` no tiene usuarios). El 3 queda libre para `bordado`, que
  NO va en la plantilla: `create_order` lo agrega con secuencia 3 si alguna prenda trae `lleva_bordado`.
- Backfill: las 4 órdenes recibieron sus 3 etapas en `pendiente` (12 filas). Ninguna llevaba bordado.
  `orders.status` no se tocó (siguen `confirmado`); el flujo Por confirmar → Confirmada → … es el mismo
  de todos los tipos.
- Cliente **"Salper"** creado en `clientes` con las tres categorías (`escolar`, `industrial`,
  `sublimacion`: sale en todos los tipos). Las 4 órdenes pasaron de "Venta Mostrador" (texto, sin
  `client_id`) a ese cliente.

### V136 — Tipos de orden con candados y cliente fijo en Venta Mostrador (rama `venta-mostrador-plantilla`)

**ESTADO: SQL aplicado en Supabase el 2026-10-05** (`supabase/schema_v136_tipos_orden_candados.sql`,
hash verificado). **Frontend fusionado a `main` el 2026-10-05** (rama `venta-mostrador-plantilla`).

**SQL (V136):**
- `order_type_puede_administrar()`: `admin_tienda`, `admin_fabrica`, `admin_general` ("super_admin" no
  existe; es `admin_general`).
- `create_order_type` cambia de 4 a 5 parámetros (`p_etapas text[]`): exige rol administrador y al
  menos una etapa; el tipo nace inactivo, recibe su plantilla y se activa. Si la key ya existe, error
  (antes lo reactivaba y renombraba). El frontend viejo (solo `p_key`/`p_label`) recibe el aviso de que
  faltan etapas.
- Nuevas: `set_order_type_etapas(key, etapas[])` y `set_order_type_active(key, bool)` (mismos roles).
  Interna `order_type_guardar_plantilla` (sin grant): etapas válidas `impresion`, `sublimado`, `corte`,
  `produccion`, `terminado`; secuencias fijas (sin sublimado: corte 1, produccion 2, terminado 4; con
  sublimado/impresión: 0, 1, 2, 3, 4). **Nunca toca la fila `bordado`** de una plantilla.
- Trigger `order_types_exigir_plantilla_trg` (before insert / update of active): un tipo no puede
  estar activo sin plantilla, tampoco por SQL a mano.
- Trigger `orders_validar_tipo_ins` (before insert en `orders`; corre antes de
  `trg_assign_order_folio` por orden alfabético, así un rechazo no gasta folio): rechaza la orden si no
  generaría ninguna etapa (plantilla sin etapas distintas de bordado y ninguna prenda con
  `lleva_bordado`), con mensaje claro. No se redefinió `create_order`.
- Mismo trigger + `orders_validar_tipo_upd` (before update of client_name/client_id/order_type_key):
  en órdenes `venta_mostrador` fuerza `client_id`/`client_name` al cliente "Salper".
- La migración empieza con guardas (firma vieja de `create_order_type`, ningún tipo activo sin
  plantilla, existe el cliente Salper).

**Frontend:**
- `canManageOrderTypes` (`permissions.js`). "+ Nuevo tipo…" en Nueva orden solo lo ven esos 3 roles
  (**`ventas` ya no puede crear tipos**) y pide las etapas (`EtapasPlantillaChecks`, por defecto corte,
  costura y terminado).
- **Catálogos → Tipos de orden** (`components/catalogos/TiposOrdenSection.jsx`): lista todos los tipos
  con sus etapas, "+ Agregar tipo de orden", "Editar etapas" (solo afecta órdenes nuevas) y
  Activar/Desactivar. `admin_tienda` ahora entra a Catálogos (antes no): ve las demás listas sin botones
  de alta ni baja.
- Nueva orden: con tipo Venta Mostrador el cliente se pone solo en "Salper" y el selector queda
  bloqueado (`ClienteSelect` con `bloqueado`); al cambiar a otro tipo se limpia. Antes de guardar se
  consulta `plantillas_etapas`: si la orden no generaría etapas, no se guarda y se muestra el motivo.
- Detalle de orden (editar): el campo Cliente queda deshabilitado en órdenes de Venta Mostrador.
- Constantes: `TIPO_VENTA_MOSTRADOR`, `CLIENTE_SALPER_NOMBRE`, `ETAPAS_PLANTILLA_OPTIONS`.

**Verificado tras aplicar (solo lectura y llamadas que el servidor rechaza antes de escribir):**
`create_order_type` con 5 parámetros, `anon` sin acceso y `authenticated` sí; la interna sin grant;
los 3 triggers creados (`orders_validar_tipo_ins` corre antes de `trg_assign_order_folio`). Con la
cuenta admin_general: crear tipo sin etapas → rechazado; tipo que ya existe → rechazado; etapas vacías
o `bordado` en `set_order_type_etapas` → rechazado. Tipos y plantillas quedaron igual (22 filas).
`npm run build` limpio.

**No probado:** las pantallas (el entorno local pide iniciar sesión), crear un tipo real, crear una
orden de Venta Mostrador ni el rechazo de una orden sin etapas (escribirían en producción o gastarían
folios). La primera orden real de Venta Mostrador será la prueba del cliente fijo.

### V137 — "Creada por" en órdenes y pendientes (rama `venta-mostrador-plantilla`)

**ESTADO: `supabase/schema_v137_orden_creada_por.sql` aplicado el 2026-10-05** (hash verificado;
comprobado: las 82 órdenes quedaron con nombre — Jose Alfredo Otero 70, Giss 10, Alfredo Pérez 2).
Frontend fusionado a `main` el 2026-10-05.
- **Órdenes:** `orders.created_by` ya existía, pero `profiles` solo lo lee el propio usuario o un admin,
  así que los demás roles no podían ver el nombre. V137 agrega `orders.created_by_nombre` (texto), lo
  rellena en las órdenes existentes desde `profiles.full_name` y un trigger before insert
  (`orders_llenar_creado_por_trg`) lo llena al crear. No se redefinió `create_order`. Se muestra como
  "Creada por: Nombre" en la tarjeta (`OrderCard`), el detalle (`OrderDetailsCard`) y la vista de
  estación (`EstacionOrderPage`). Sin el SQL aplicado simplemente no aparece.
- **Pendientes:** `pf_pendientes.creado_por_nombre` ya existía (V78); ahora sale "Creado por: Nombre" en
  la tarjeta (`PendienteCard`) y el detalle dice "Creado por" en vez de "Creó". No necesita SQL.
- No se agregó a los PDFs. `npm run build` limpio; no probado en pantalla.

### Detalle de orden: se quita la nota del cambio de estado (2026-10-05)

`StatusChanger` ya no tiene el campo "Nota opcional sobre este cambio…" (pedido de Alfredo: sobra, para
eso están las Notas internas). `update_order_status` se sigue llamando con nota vacía; las notas viejas
del historial se siguen mostrando. Sin SQL.

**V135, V136, V137 y este cambio se fusionaron a `main` el 2026-10-05** (rama
`venta-mostrador-plantilla`). Las pantallas no se probaron en local antes de fusionar (pedía sesión);
quedan por confirmar en producción.

### Detalle de orden: se quita el aviso "Próximamente — Link compartible" (2026-10-05)

Pedido de Alfredo. `ComingSoonCard` se borró (no se usaba en ningún otro lado). La tarjeta de "Zona de
administrador" (cancelar/eliminar) ahora solo se dibuja para quien puede cancelar o eliminar; antes la
tarjeta existía siempre por el aviso. Sin SQL. Subido a `main`.

### V138 — Pendientes de cliente: "Dado de baja" / "Pendiente de baja" en inventario (rama `venta-mostrador-plantilla`)

**ESTADO: `supabase/schema_v138_pendientes_baja_inventario.sql` aplicado el 2026-10-06** (hash
verificado) **y frontend fusionado a `main`.** Comprobado: 12 pendientes de cliente en `false`, 4 de
tienda en `null`; `anon` sin acceso a `pf_marcar_baja`; id inexistente y pendiente de tienda rechazados.
No se probó marcar una baja real (escribiría en un pendiente real) ni las pantallas.
- Solo aplica a pendientes `es_para_cliente` (los que se quedan en tienda siguen con
  "Inventariado / No inventariado"). Columnas nuevas en `pf_pendientes`: `baja_inventario` (true = dado
  de baja, false = pendiente de baja, null = no es de cliente), `baja_en`, `baja_por`, `baja_por_nombre`.
  Los pendientes de cliente existentes quedan en "Pendiente de baja".
- Trigger `pf_pendientes_baja_coherente_trg`: de cliente nunca queda null (por defecto false); si se
  edita a "se queda en tienda", se limpia.
- RPC `pf_marcar_baja(id, bool)` (`pf_es_tienda()`): marca o regresa, y deja renglón en `pf_historial`
  (mismo estado antes/después, la nota dice qué pasó). **No se tocaron `pf_crear`/`pf_editar`**: el
  formulario guarda el pendiente y, si se eligió "Dado de baja", llama después a `pf_marcar_baja`.
- Frontend: en `PendienteForm` (bloque de cliente) botones obligatorios "Dado de baja / Pendiente de
  baja"; `PendienteCard` y el detalle muestran "Inventario: …"; en `PendienteDetailPage` tienda puede
  cambiarlo con los dos botones en cualquier estado. `marcarBaja` y `textoBaja` en `pendientesService`.
- `npm run build` limpio.

### 2026-10-06 — Inventario: catálogos de Nexus, Avenue School e Instituto Tricio (solo datos, sin código)

Hecho con las RPC de V121 (`inv_guardar_talla`, `inv_crear_modelo`, `inv_modelo_agregar_talla`) y la cuenta
admin_general; todo en 0, sin tocar existencias. Fuente: los Excel de artículos de Microsip que pasó Alfredo.
- **Tallas nuevas en el catálogo:** `00` (orden -10), `3`, `3 TALL`, `8 TALL`, `10 TALL`, `12 TALL`, `14 TALL`,
  `46`, `48`. Decisiones de Alfredo: se crea la `00` (Microsip trae 00, 0, 01, 02); XCH de Microsip = `XS`.
- **Nexus** (sección que creó Alfredo): Playera polo 6–3XL y Sudadera 6–4XL (sin tallas 0–4).
- **Avenue School:** Pantalón 0–10, 30, 32 y sus Tall 0–10 en el MISMO modelo (el modelo "Pantalón Tall"
  se fusionó en "Pantalón" a pedido de Alfredo, con `inv_desvincular_articulos` + `inv_vincular_articulos`;
  las 60 piezas Tall intactas; esos artículos conservan el texto de prenda "Pantalon Tall"); Vestido Marinero 0–14 (incluye la 3) con
  su Tall de cada talla, en el mismo modelo; Bermuda 0–10; Falda Envolvente (nuevo) 0–14; Playera polo ya
  estaba completa. 30 y 32 sin Tall.
- **Instituto Tricio:** Playera polo Gen 2029 a 2038 (2029, 2031 y 2038 nuevos) y "sin generacion", todas
  00–3XL; Chamarra Bordada y sin Bordar 00–5XL; Pantalón hasta 48; Falda, Pantalonera y Short con Logotipo
  00–5XL (equivalen a "Short falda", "Pants" y "Short deportivo" de Microsip).
- No se dieron de alta los artículos "TALLA ESPECIAL" de Microsip (no hay talla equivalente).

### 2026-10-06 — Inventario: las tallas "sugeridas" (huecos de V92) ya no mezclan TALL con (NN)

`InventarioPage.jsx` (`fillTallaGaps`), sin SQL. Al completar los catálogos de Avenue y Tricio aparecieron
chips en gris de tallas que no existen: TALL en la Chamarra sin Bordar de Tricio (por tener 1(20)/2(22)) y
1(20)/2(22) en el Pantalón de Avenue (por tener TALL). La regla trataba "TALL" y "(NN)" como un solo estilo.
Ahora `estiloVariante` los separa (una variante solo se sugiere si la prenda ya usa ESE estilo) y
`TALLAS_SIN_RELLENO` (`3`, `3 TALL`) nunca se sugieren. Las 1(20) y 2(22) reales de la Chamarra sin Bordar
se quedan (así están etiquetadas las prendas; Alfredo las va a mandar reetiquetar). Comprobado con una
simulación de solo lectura sobre los datos reales: Tricio, Avenue y Nexus quedan sin tallas sugeridas de más.

### V139 — Tiempos reales por etapa: cronómetro en estaciones y reporte (rama `tiempos-etapas`, 2026-10-06)

**ESTADO: frontend subido a `main` el 2026-10-06 (rama `tiempos-etapas`).
`supabase/schema_v139_tiempos_etapas.sql` NO está aplicado.** El frontend funciona sin el SQL, salvo
"Corregir horas" (necesita la función nueva).

Salió de un prompt que pedía columnas `hora_inicio`/`hora_fin`/`operario_id`, tiempos estándar del Excel y
valor/premios en el mismo reporte. Decisiones de Alfredo después de ver el estado real:
- **No hay columnas nuevas de tiempo**: se usan `iniciado_en`/`completado_en`/`responsable_id` de V23.
- **Sin tiempo estándar por ahora** (el Excel solo trae segundos por operación de costura, no por etapa):
  el reporte muestra solo tiempos reales; varianza y % de cumplimiento quedan para cuando haya estándar.
- **Operario = la cuenta que tocó Iniciar** (sin selector).
- **Valor generado y premios siguen separados** (no hay relación entre `prod_registros` y órdenes/etapas).

Qué hay:
- `src/utils/horasHabiles.js`: `calcularHorasHabiles(inicio, fin)` → minutos de 8:00 a 18:00, lunes a
  viernes, en hora de Torreón (no la del dispositivo). No descuenta comida ni festivos (v2).
  `src/utils/tiemposEtapas.js`: medición y resúmenes del reporte. Pruebas: `node --test src/utils/*.test.js`.
- **Estaciones** (`EstacionOrderPage.jsx`): "En progreso"/"Finalizado" → **Iniciar** (verde) y
  **Terminar**; mientras corre se ve el cronómetro (`EtapaCronometro.jsx`, rojo, con el tiempo hábil);
  al terminar, el tiempo real y las horas, ya sin poder reabrir. Corte y terminado conservan su formulario
  de cierre.
- **Detalle de orden** (`OrderEtapasCard.jsx`): cronómetro, operario, tiempo real y, solo `admin_general`,
  "Corregir horas" (pide motivo).
- **Reporte** (`components/produccion/TiemposEtapas.jsx`, al final de Estadísticas de producción): periodo
  (semana lunes–domingo, mes, rango) por fecha de fin de la etapa, filtros de operario y etapa, tablas por
  etapa y por operario (promedio, mediana, más rápida/lenta, minutos por pieza), detalle, Imprimir y CSV.
  No entran al promedio las etapas sin inicio, las de inicio y fin de corrido (< 2 min) ni las hechas
  todas fuera de horario. Al 2026-10-06 la mayoría del historial es "de corrido" (p. ej. corte: 48 de 66).
- **SQL V139** (pendiente de aplicar): trigger `orden_etapas_tiempos_guard_trg` (la estación no reabre
  una etapa terminada; re-terminar no pisa la hora de fin; el operario queda fijo en quien inició; volver
  a "pendiente" limpia inicio/fin/operario), tabla `orden_etapas_correcciones` y RPC
  `corregir_tiempos_etapa` (solo `admin_general`). No modifica `update_orden_etapa` ni filas existentes.
- Probado: pruebas de las utilidades, `npm run build` y las pantallas nuevas con datos de ejemplo en un
  entorno local sin base (`.claude/harness-tiempos/`, servidor `salper-tiempos-harness`, puerto 5198).
  **No probado**: con sesión real ni contra Supabase (solo una lectura de la consulta del reporte), ni el
  SQL (no se ha corrido).

### 2026-10-06 — Inventario: Pantalón de Gabardina Marino con tallas 17 y 28–48 (solo datos)

Sección "Pantalon Industrial". Tenía 34–42 con existencia; se agregaron 28, 30, 32, 44, 46, 48 y la talla
nueva `17` (orden 170, creada en el catálogo de tallas), todas en 0.

### 2026-10-07 — Inventario: la sección "Pantalon Industrial" ahora se llama "Pantalón Variado" (solo datos)

Renombrada con `inv_guardar_seccion` (mismo id, mismos artículos, misma clasificación y orden). Producto
nuevo en esa sección: Pantalón JSV (variante "JSV"), solo talla 32, en 0.

### V140 — Estaciones: cada quien ve lo que ya le toca + pausa del cronómetro (rama `pausa-etapas`, 2026-10-07)

**ESTADO: en `main`/producción desde el 2026-10-07 (despliegue confirmado: el bundle servido es el de
`dist/`). `supabase/schema_v140_pausa_etapas.sql` aplicado el 2026-10-07 desde el SQL Editor (hash
verificado) y comprobado por consulta: 3 columnas, trigger activo, `anon` sin acceso, 0 filas con pausa.**
Al aplicar, con el filtro nuevo: bordado ve 22 de 31 órdenes (9 esperan corte), costura 28 de 40 (12
esperan) y terminado 14 de 48 (34 esperan a que costura o bordado empiecen).

Salió de un prompt armado fuera (tablas `ordenes`, `etapa_nombre`, `inicio_en`/`fin_en`, vistas
`CosturaView`/`BordadoView`, RPC `get_ordenes_por_rol`, deploy a `fase-2`). Contra el sistema real:
- **"Terminado marca solo la etapa" y "trabajo simultáneo" ya existían** (V23 + V139: Iniciar/Terminar
  por etapa, etapas en paralelo). No se rehízo nada de eso.
- **Filtro por estación** — sin SQL ni RPC, en el cliente (`src/utils/ordenesDeEstacion.js`,
  `situacionEnEstacion`, usado por `EstacionHomePage.jsx`):
  - costura (etapa `produccion`) y bordado: la orden sale cuando **corte está terminado**;
  - terminado: cuando **costura o bordado ya empezaron o terminaron**;
  - la condición solo aplica si la orden tiene esa etapa previa (tipo "bordado", sin corte, le sale a
    bordado de inmediato); una etapa ya iniciada nunca se esconde; corte, impresión, sublimado e
    "impresión por prenda" no cambian.
  - Las que esperan el paso anterior se cuentan al pie ("Hay N órdenes más que todavía esperan…") y el
    buscador las sigue encontrando. Las tarjetas marcan "En proceso" / "⏸ En pausa".
- **Pausa** (no es un estado: la etapa sigue `en_proceso`): columnas `pausada_en`, `tiempo_pausado_ms` y
  además `pausas` (jsonb `[{inicio, fin}]`, que el prompt no traía: hace falta para descontar tiempo
  **hábil**; con solo los milisegundos una pausa de toda la noche restaría 16 h). RPC
  `pausar_orden_etapa(orden, etapa, pausar)` con el mismo permiso que `update_orden_etapa`; trigger
  `orden_etapas_pausa_guard_trg` (terminar cierra la pausa abierta; volver a pendiente borra las pausas).
  No toca funciones existentes ni depende del V139 de tiempos.
  - Botón **⏸ Pausar / ▶ Reanudar** solo en bordado y terminado (`pausa: true` en `vistasPorRol.js`);
    costura no, como pidió. El servidor sí lo permitiría a cualquier dueño de etapa: dárselo a otra
    estación es agregar esa bandera, sin SQL.
  - `src/utils/pausasEtapa.js`: `msTrabajados`, `minutosHabilesTrabajados`. `EtapaCronometro` ahora recibe
    la fila (`etapa={et}`) y se pone gris "En pausa"; `medirEtapa` y el reporte descuentan las pausas
    (motivo nuevo "Todo el tiempo en pausa"). `fetchEtapasTerminadas` pide `*` para no romperse sin V140.
- Probado: `node --test src/utils/*.test.js` (18), `npm run build`, y pausar/reanudar en el ejemplo local
  (`salper-tiempos-harness`, puerto 5198). **No probado**: con sesión real de bordado/terminado (nadie
  ha tocado Pausar en producción todavía; `pausar_orden_etapa` no se ha ejecutado nunca).
