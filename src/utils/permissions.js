// Reglas de permisos por rol, centralizadas en un solo lugar para que
// los componentes no dupliquen la lógica de "quién puede qué" — cada
// regla de aquí tiene su espejo validado del lado del servidor (ver los
// RPC en supabase/schema_v21_roles.sql), así que estos helpers son solo
// para decidir qué mostrar/ocultar en la UI, no la única línea de
// defensa: si alguien se salta la UI, el servidor igual lo rechaza.
//
// Desde V21 el modelo plano de 3 roles (admin/tienda/fabrica) se
// reemplazó por 10 roles granulares:
//   Tienda:  ventas, contabilidad, admin_tienda
//   Fábrica: corte, bordado, sublimado, produccion, terminado, admin_fabrica
//   General: admin_general (acceso total a los dos dominios + usuarios)
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

// Bordado condicional por prenda (V25): subir/borrar fotos en
// orden_bordados es exclusivo de bordado + admin_fabrica/admin_general —
// no de ventas/admin_tienda, que sí deciden CUÁLES prendas llevan bordado
// (ver canEditOrder, mismo gate que el resto de las prendas).
export function canManageBordado(role) {
  return role === 'bordado' || role === 'admin_fabrica' || role === 'admin_general'
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

// Los 5 roles de etapa de fábrica solo necesitan ver Dashboard y Resumen
// (y el detalle de la orden a la que entran desde ahí) para hacer su
// trabajo — el resto de la navegación (Calendario, Pendientes, Anuncios,
// Órdenes pasadas, Pedidos a Proveedor) no les aplica. admin_fabrica NO
// entra aquí a propósito: sigue viendo todo el sistema, como el resto de
// los roles "admin_*".
export function hasRestrictedNav(role) {
  return FABRICA_ETAPA_ROLES.includes(role)
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
}
