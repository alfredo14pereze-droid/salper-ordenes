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

Tres roles (tabla `profiles`, vinculada a `auth.users`): **admin** (todo),
**tienda** (crea órdenes; solo puede editarlas mientras siguen
`en_confirmacion`), **fabrica** (confirma órdenes, avanza el estado, captura
tiempo estimado de producción — nunca crea ni edita datos generales). Sin
registro público: solo un admin da de alta usuarios (Edge Function
`admin-create-user`).

Desde `main`/V10, la app también tiene **modo invitado**: cualquiera con el
link ve todo en modo lectura (Dashboard, calendario, detalle de orden,
anuncios, pendientes) **sin iniciar sesión**. Ningún botón de
crear/editar/cambiar aparece para invitados, y el servidor lo exige de todos
modos — ver la sección de seguridad abajo.

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

### Fase 2 (rama `fase-2`)

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
