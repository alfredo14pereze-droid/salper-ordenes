// Reglas de permisos por rol, centralizadas en un solo lugar para que
// los componentes no dupliquen la lógica de "quién puede qué" — cada
// regla de aquí tiene su espejo validado del lado del servidor (ver los
// RPC en supabase/schema_v21_roles.sql), así que estos helpers son solo
// para decidir qué mostrar/ocultar en la UI, no la única línea de
// defensa: si alguien se salta la UI, el servidor igual lo rechaza.
//
// Desde V21 el modelo plano de 3 roles (admin/tienda/fabrica) se
// reemplazó por roles granulares:
//   Tienda:  ventas, contabilidad, admin_tienda
//   Fábrica: corte, bordado, sublimado, produccion, terminado, admin_fabrica
//   General: admin_general (acceso total a los dos dominios + usuarios)
// V30 agregó dos roles más, sin dominio propio:
//   lectura: ve todo el sistema (como cualquier rol normal), no puede
//     modificar NADA — ni una sola escritura pasa para este rol, ni
//     aquí ni del lado del servidor (ver schema_v30_roles_extra.sql).
//   tienda:  personal de tienda sin funciones de ventas/contabilidad —
//     solo ve Dashboard (para consultar órdenes) y Pendientes, y su
//     única escritura permitida es agregar un pendiente nuevo (no puede
//     resolverlos, ni tocar nada más del sistema).
// Ver la sección "Roles y permisos" de SALPER_Contexto.md para el
// detalle completo de la migración y sus decisiones.

const FABRICA_ETAPA_ROLES = ['corte', 'bordado', 'sublimado', 'produccion', 'terminado']

export function canCreateOrder(role) {
  return role === 'ventas' || role === 'admin_tienda' || role === 'admin_general'
}

// ventas solo mientras la orden sigue "en_confirmacion"; admin_tienda/admin_general siempre.
export function canEditOrder(role, order) {
  if (role === 'admin_tienda' || role === 'admin_general') return true
  if (role === 'ventas') return order?.status === 'en_confirmacion'
  return false
}

// Documentos de la orden (cotización/orden de compra/factura): mismo
// espejo que set_order_document en Supabase. ventas y contabilidad pueden
// subir cotización/orden de compra (mientras la orden siga
// "en_confirmacion"); la factura es exclusiva de contabilidad, y sin tope
// de estado — casi siempre se sube DESPUÉS de que fábrica ya confirmó
// (cuando se entrega o se está por entregar).
export function canEditOrderDocument(role, order, kind) {
  if (role === 'admin_tienda' || role === 'admin_general') return true
  if (role === 'contabilidad') return kind === 'factura' || order?.status === 'en_confirmacion'
  if (role === 'ventas') return kind !== 'factura' && order?.status === 'en_confirmacion'
  return false
}

// V42 — constancia de situación fiscal: es del CLIENTE, no de una orden
// en particular, así que no depende del estado de ninguna orden (a
// diferencia de canEditOrderDocument arriba). Mismos roles "tienda" de
// siempre, contabilidad incluida (es quien más la necesita al facturar).
export function canManageClienteDocuments(role) {
  return role === 'ventas' || role === 'contabilidad' || role === 'admin_tienda' || role === 'admin_general'
}

// Desde V23 (etapas paralelas, ver schema_v23_etapas_paralelas.sql) el
// límite estructural documentado en V21 quedó resuelto: cada rol de etapa
// ya NO comparte permiso sobre todo orders.status — solo puede tocar su
// propia fila en orden_etapas (ver canChangeEtapa abajo). Lo que queda en
// update_order_status son los dos "bookends" de todo el pedido:

// Confirmar un pedido nuevo (en_confirmacion -> confirmado): cualquier rol
// de etapa + admin_fabrica/admin_general, igual que antes.
export function canConfirmOrder(role) {
  return FABRICA_ETAPA_ROLES.includes(role) || role === 'admin_fabrica' || role === 'admin_general'
}

// Marcar una orden como completada: exclusivo de admin_fabrica/admin_general
// (antes cualquier rol de etapa podía — era justo el límite estructural
// que resolvió V23, ya que cerrar una orden es una decisión de todo el
// pedido, no de una sola etapa).
export function canCompleteOrder(role) {
  return role === 'admin_fabrica' || role === 'admin_general'
}

// true si el rol tiene AL MENOS uno de los dos permisos de arriba — para
// decidir si mostrar la sección de "cambiar estado" en el detalle de la
// orden.
export function canChangeStatus(role) {
  return canConfirmOrder(role) || canCompleteOrder(role)
}

// V49 — "Etapas de producción" (OrderEtapasCard) es la herramienta real
// de corte/bordado/sublimado/producción/terminado para avanzar SU etapa
// — no es solo informativo para ellos. Para el lado de tienda
// (ventas/contabilidad/admin_tienda/tienda) y 'lectura' es puro
// duplicado de solo lectura de lo que ya muestra el StatusStepper de
// arriba — pedido explícito del usuario de quitarlo ahí por ser ruido
// visual. admin_general lo sigue viendo (ve todo el sistema).
export function canViewEtapas(role) {
  return FABRICA_ETAPA_ROLES.includes(role) || role === 'admin_fabrica' || role === 'admin_general'
}

// V38 — "Confirmar cambios": una orden ya confirmada que se editó
// después (ver pending_reconfirmation_at) necesita que fábrica la
// revise de nuevo. Mismos roles que pueden confirmar una orden nueva —
// es la misma gente, solo que aquí no se mueve el status ni ninguna
// etapa, nada más se apaga la bandera (ver confirm_order_changes en
// schema_v38_fecha_creacion_y_reconfirmacion.sql).
export function canConfirmOrderChanges(role) {
  return canConfirmOrder(role)
}

// Avanzar UNA etapa individual (pendiente/en_proceso/completado) en
// orden_etapas — el nombre del rol dueño coincide 1:1 con el nombre de la
// etapa (rol 'corte' -> etapa 'corte', etc.); admin_fabrica/admin_general
// pueden todas. Ver update_orden_etapa en schema_v23_etapas_paralelas.sql.
export function canChangeEtapa(role, etapa) {
  return role === etapa || role === 'admin_fabrica' || role === 'admin_general'
}

// fabrica captura el tiempo estimado solo mientras sigue en_confirmacion;
// admin_fabrica/admin_general siempre.
export function canSetEstimatedDays(role, order) {
  if (role === 'admin_fabrica' || role === 'admin_general') return true
  if (FABRICA_ETAPA_ROLES.includes(role)) return order?.status === 'en_confirmacion'
  return false
}

export function canCancelOrder(role) {
  return role === 'admin_tienda' || role === 'admin_general'
}

// Gestión de usuarios: se queda como una capacidad única sin dividir,
// igual que el 'admin' original — solo admin_general.
export function canManageUsers(role) {
  return role === 'admin_general'
}

// Hard-delete de catálogos (proveedores, clientes, telas, productos) y
// soft-delete de órdenes (V24) — exclusivo admin_general, sin excepción.
export function canManageCatalogs(role) {
  return role === 'admin_general'
}

// V36 — dar de alta clientes/telas desde Catálogos: antes toda la
// pantalla era exclusiva de admin_general (mismo candado que borrar). El
// usuario pidió abrirlo específicamente para dar de alta, sin tocar quién
// puede BORRAR (eso se queda en canManageCatalogs, sin excepción). Mismo
// candado espejado del lado del servidor en create_cliente/create_tela
// (ver schema_v36_permisos_catalogos.sql) — esto de aquí solo decide qué
// se muestra, la función SQL es la que de verdad lo hace cumplir.
export function canCreateCliente(role) {
  return role === 'ventas' || role === 'admin_general'
}

export function canCreateTela(role) {
  return role === 'ventas' || role === 'admin_fabrica' || role === 'admin_general'
}

// Productos: mismo criterio que Clientes (se capturan juntos — un
// producto siempre es "de" un cliente ya elegido en la misma pantalla).
export function canCreateProducto(role) {
  return canCreateCliente(role)
}

// Quién puede ENTRAR a la pantalla de Catálogos — más amplio que quién
// puede borrar: cualquiera que pueda dar de alta algo ahí (cliente, tela
// o producto) también necesita ver la pantalla para hacerlo. Quien no
// tenga ninguno de esos permisos ni siquiera llega a la pantalla
// (RequireRole en CatalogosPage.jsx).
export function canViewCatalogos(role) {
  return canCreateCliente(role) || canCreateTela(role) || canCreateProducto(role) || canManageCatalogs(role)
}

// Bordado condicional por prenda (V25): subir/borrar fotos en
// orden_bordados es exclusivo de bordado + admin_fabrica/admin_general —
// no de ventas/admin_tienda, que sí deciden CUÁLES prendas llevan bordado
// (ver canEditOrder, mismo gate que el resto de las prendas).
export function canManageBordado(role) {
  return role === 'bordado' || role === 'admin_fabrica' || role === 'admin_general'
}

// Terminado (V26): capturar cantidad_surtida/comentario_surtido por línea
// es exclusivo de terminado + admin_fabrica/admin_general — el resto de
// la orden se queda de solo lectura para terminado (no puede tocar
// cliente, fechas, tipo, cantidades pedidas, ni otras etapas).
export function canManageSurtido(role) {
  return role === 'terminado' || role === 'admin_fabrica' || role === 'admin_general'
}

// Remisión (V26): visible/descargable por ambos dominios — tienda
// (ventas/admin_tienda) y fábrica (admin_fabrica/terminado), ninguno
// restringido a un solo lado ya que ambos necesitan confirmar qué se
// surtió realmente. No se limita a esos roles: mismo criterio de
// visibilidad total que el resto de la app (invitado incluido) — no hay
// nada aquí que no esté ya visible en el detalle de la orden.
export function canViewRemision() {
  return true
}

export function canDeleteOrder(role) {
  return role === 'admin_general'
}

// Pedidos a Proveedor: dominio contabilidad (compra a proveedor) — ver
// create_pedido_tienda en schema_v21_roles.sql. ventas y fábrica no
// participan.
export function canManagePedidosTienda(role) {
  return role === 'contabilidad' || role === 'admin_tienda' || role === 'admin_general'
}

// A diferencia del resto de la app (que un invitado sí ve en modo
// lectura desde V10), este módulo trae costos reales de proveedor —
// solo visible con sesión, cualquier rol (la tabla ya está cerrada a
// `anon` del lado de la base, esto es el espejo en el frontend). Ver
// schema_v18_pedidos_tienda.sql.
export function canViewPedidosTienda(role) {
  return !!role
}

// V36 — Estadísticas: pantalla de análisis (tiempos de producción, % a
// tiempo) para quien toma decisiones, no para operarlo día a día. Pedido
// explícito del usuario: solo los 3 roles "admin_*" (general, tienda,
// fábrica) — ni ventas/contabilidad ni ningún rol de etapa de fábrica.
export function canViewEstadisticas(role) {
  return role === 'admin_general' || role === 'admin_tienda' || role === 'admin_fabrica'
}

// Los 5 roles de etapa de fábrica solo necesitan ver Dashboard y Resumen
// (y el detalle de la orden a la que entran desde ahí) para hacer su
// trabajo — el resto de la navegación (Calendario, Pendientes, Anuncios,
// Órdenes pasadas, Pedidos a Proveedor) no les aplica. admin_fabrica NO
// entra aquí a propósito: sigue viendo todo el sistema, como el resto de
// los roles "admin_*".
export function hasRestrictedNav(role) {
  return FABRICA_ETAPA_ROLES.includes(role)
}

// V30 — rol 'tienda': nav todavía más angosto que hasRestrictedNav (ni
// Resumen, ni Calendario, ni Anuncios, ni Pedidos a Proveedor, ni Control
// rápido) — solo Dashboard (para ver órdenes) y Pendientes. Deliberadamente
// NO se junta con hasRestrictedNav porque las formas de restricción no
// coinciden (fábrica SÍ ve Resumen y NO ve Pendientes; tienda es al revés).
export function isTiendaBasica(role) {
  return role === 'tienda'
}

// V30 — Anuncios y fotos de referencia: hasta V29 cualquier cuenta con
// sesión podía hacer esto sin importar el rol (nunca se les puso un
// candado específico). Con los roles nuevos ('lectura' no debe escribir
// NADA; 'tienda' tampoco participa de esto) hizo falta ponerles uno.
const SIN_ESCRITURA_GENERAL = ['lectura', 'tienda']

export function canManageAnnouncements(role) {
  return !!role && !SIN_ESCRITURA_GENERAL.includes(role)
}

export function canManageOrderPhotos(role) {
  return !!role && !SIN_ESCRITURA_GENERAL.includes(role)
}

// Pendientes: todos menos 'lectura' pueden agregar Y resolver — 'tienda'
// incluido a propósito (V31: puede marcar en verde/listo cuando ya
// terminó una reparación, no solo agregar). 'lectura' sigue sin poder
// tocar nada, como todo lo demás.
export function canCreatePendingItems(role) {
  return !!role && role !== 'lectura'
}

export function canResolvePendingItems(role) {
  return !!role && role !== 'lectura'
}

// V51 — Notas internas de una orden: comentario libre que NUNCA sale en
// ningún PDF ni se le muestra al cliente, solo vive dentro del sistema
// (ver OrderNotesCard.jsx / generateOrderPdf.jsx, que ni la referencia).
// Mismo criterio amplio que Pendientes (canCreatePendingItems): cualquier
// rol con sesión menos 'lectura' puede escribir una nota — es una
// bitácora de comunicación interna, no un dato de la orden en sí, así
// que no se restringe al mismo candado que canEditOrder. 'lectura' sigue
// pudiendo LEER las notas (ve todo el sistema), solo no puede escribir.
export function canManageOrderNotes(role) {
  return !!role && role !== 'lectura'
}

// V57 — Pedidos Colegio (beta): módulo OCULTO, exclusivo admin_general —
// ni aparece en el menú para ningún otro rol. Espejo de lo que ya exige
// el servidor (RLS de SELECT solo admin_general, y los RPC create_colegio*/
// add_colegio_abono/etc. revisan el rol adentro) — esto solo decide qué
// se muestra. Usa el rol EFECTIVO de useAuth(), así que con "Ver como"
// (V53) el módulo desaparece igual que para cualquier otro rol.
export function canManagePedidosColegio(role) {
  return role === 'admin_general'
}

export const ROLE_LABELS = {
  ventas: 'Ventas',
  contabilidad: 'Contabilidad',
  admin_tienda: 'Admin (Tienda)',
  corte: 'Corte',
  bordado: 'Bordado',
  sublimado: 'Sublimado',
  produccion: 'Producción',
  terminado: 'Terminado',
  admin_fabrica: 'Admin (Fábrica)',
  admin_general: 'Administrador general',
  lectura: 'Solo lectura',
  tienda: 'Tienda (básico)',
}
