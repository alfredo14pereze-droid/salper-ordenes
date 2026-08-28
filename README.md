# SALPER · Sistema de gestión de órdenes de producción

App para reemplazar el seguimiento en papel de las órdenes de producción de
SALPER (sublimación, uniformes escolares, industrial). Cualquiera con acceso
al link puede ver en qué etapa va cada orden sin tener que preguntar.

**En vivo:** https://salper-ordenes.vercel.app

**Stack:** React + Vite (frontend) · Supabase (Postgres + Storage + API +
realtime). Sin backend propio: el navegador habla directo con Supabase
usando la "anon key" pública, protegida por Row Level Security y funciones
RPC (ver `supabase/schema.sql`, `supabase/schema_v2.sql` y `supabase/schema_v3.sql`).

**Identidad visual:** blanco (fondo) → negro (texto) → amarillo (dentro de
botones negros + acentos puntuales) → naranja (pocos detalles). Rojo y
verde quedan reservados exclusivamente como indicadores de estado (orden
atrasada / completada) — nunca decorativos. El logo real de SALPER está
pendiente de integrar (por ahora hay una insignia con el nombre en texto,
ver `src/components/layout/Logo.jsx` — es el único lugar que hay que tocar
cuando llegue el archivo).

## Funcionalidad

- **Dashboard**: todas las órdenes activas, sección "Próximas a surtir"
  (ordenadas por fecha de entrega más cercana), filtros por tipo/estado/búsqueda,
  banner con el anuncio más reciente.
- **Nueva orden**: número, cliente, tipo (con opción de crear tipos nuevos
  al vuelo), descripción, fecha de entrega, tiempo estimado de producción,
  prendas (tallas/cantidades/color, con Pantone si el tipo es sublimación),
  fotos de referencia, y la opción de prellenar todo desde una plantilla
  (para pedidos habituales, ej. "Polo Colegio X").
- **Detalle de orden**: toda la info + cambio de estado + historial con
  fecha/hora de cada cambio + prendas editables + galería de fotos
  (agregar/quitar) + guardar la orden actual como plantilla reutilizable.
- **Calendario de producción**: vista semanal tipo Gantt calculada a partir
  de fecha de entrega − tiempo estimado, coloreada según el estado actual
  de cada orden.
- **Anuncios internos**: comunicados de la empresa, visibles para todos,
  con opción de fijar los más importantes arriba.
- **Pendientes**: cosas fuera del flujo de una orden de producción (una
  reparación mandada a un taller externo, un trámite, una compra, etc.),
  con checklist simple de pendiente/resuelto.
- **Tiempo real**: si alguien más cambia algo, las demás pantallas
  abiertas se actualizan solas (Supabase Realtime), sin refrescar.

Estados de una orden (fijos, en este orden):
`En confirmación → Confirmado → Cortado → Sublimado → En producción → Completado`

## Preparado para después (no implementado todavía)

Estas cosas ya tienen un lugar pensado en el modelo de datos o la
estructura de carpetas, pero **no tienen UI ni lógica todavía**:

| Función | Qué ya existe | Qué falta |
|---|---|---|
| Roles (admin/producción/consulta) | Comentario con tabla `profiles` sugerida en `schema.sql` | Login, tabla real, políticas RLS por rol |
| Links compartibles por orden | Columna `orders.share_token` (uuid único) ya se genera para cada orden | Vista pública de solo lectura filtrando por ese token |
| Notificaciones | Comentario con tabla `notifications` sugerida en `schema.sql` | Trigger/servicio que dispare avisos (email, WhatsApp, etc.) |

## Estructura del proyecto

```
src/
  lib/            # cliente de Supabase, constantes (estados, colores)
  services/       # única capa que habla con Supabase (CRUD + RPC + realtime)
  hooks/          # useOrders, useOrder, useOrderTypes (fetching + estado)
  utils/          # fechas, slugs, helpers de estado — sin dependencias de UI
  components/
    layout/       # AppLayout (header + nav)
    orders/       # tarjetas, badges, filtros, stepper, cambio de estado, historial
    calendar/     # ProductionCalendar (vista Gantt semanal)
    common/       # loading/error/empty states, pantalla de config faltante
  pages/          # una página por ruta (Dashboard, Nueva orden, Detalle, Calendario)
supabase/
  schema.sql      # esquema base: órdenes, tipos, historial, RLS, realtime
  schema_v2.sql   # fotos (Storage), anuncios, pendientes
  schema_v3.sql   # prendas (orders.items) y plantillas de orden
```

La idea de esta separación: para agregar roles o notificaciones más
adelante, normalmente solo se toca `services/` + una tabla nueva en un
`schema_v4.sql`, y se agrega un componente/página — sin tener que
reescribir el resto.

## Puesta en marcha local

Necesitas [Node.js](https://nodejs.org/) 18 o superior instalado.

```bash
npm install
cp .env.example .env
```

Llena `.env` con los datos de tu proyecto de Supabase (Project Settings →
API → Project URL y `anon` `public` key).

Luego, en el **SQL Editor** de tu proyecto de Supabase, pega y corre todo
el contenido de [`supabase/schema.sql`](supabase/schema.sql). Esto crea las
tablas, los tipos de orden iniciales (sublimación/escolar/industrial), las
funciones de creación/cambio de estado, las políticas de seguridad y
habilita realtime.

Después, corre también [`supabase/schema_v2.sql`](supabase/schema_v2.sql)
(agrega el bucket de Storage para fotos, y las tablas de anuncios y
pendientes), y luego [`supabase/schema_v3.sql`](supabase/schema_v3.sql)
(prendas de la orden y plantillas).

Finalmente:

```bash
npm run dev
```

Abre la URL que te muestre la terminal (normalmente `http://localhost:5173`).

## Despliegue

### Vercel (recomendado)

1. Sube este proyecto a un repositorio de GitHub.
2. En Vercel, "Add New Project" → importa el repo. Detecta Vite automáticamente.
3. En "Environment Variables" agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Cada push a `main` vuelve a desplegar solo.

### GitHub Pages (alternativa)

El proyecto ya está configurado para esto (`base: './'` en `vite.config.js`
+ rutas con `HashRouter`, así que no necesitas configurar reescritura de URLs):

```bash
npm run build
npx gh-pages -d dist
```

(La primera vez, instala la dependencia de despliegue: `npm install -D gh-pages`.)

Como GitHub Pages sirve sitios estáticos sin variables de entorno en build
time del lado del servidor, las variables `VITE_*` quedan "quemadas" en el
build que corras localmente — asegúrate de tener tu `.env` correcto antes
de correr `npm run build`.

## Seguridad (léelo antes de usarlo con datos reales)

Sin login todavía, las políticas de Supabase dejan la **lectura abierta**
a quien tenga la anon key (necesario para que cualquiera en el equipo vea
el estado de las órdenes sin credenciales). Las **escrituras** no tienen
policy directa de INSERT/UPDATE: solo pasan por las funciones
`create_order`, `update_order_status` y `create_order_type` (`security
definer`), que validan los datos antes de tocar las tablas. Cuando se
agregue autenticación y roles, lo que hay que endurecer es:

1. Reemplazar las policies `select using (true)` por unas que revisen
   `auth.uid()` / el rol del usuario.
2. Decidir qué rol puede ejecutar cada función RPC (hoy: `anon` y
   `authenticated` pueden ejecutar las tres).

## Limitaciones conocidas de esta V1

- No se corrió `npm install` / `npm run dev` / `npm run build` en esta
  sesión (el entorno no tenía Node.js) — verifícalo tú antes de confiar
  en que compila sin errores.
- No hay pruebas automatizadas.
- El calendario muestra la *ventana de producción estimada* completa
  coloreada según el estado actual de la orden; no reparte automáticamente
  cuánto tiempo debería tomar cada sub-etapa (cortado, sublimado, etc.) —
  eso requeriría capturar tiempos estimados por etapa, que no pedía esta V1.
