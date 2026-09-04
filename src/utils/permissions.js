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
// espejo que set_order_document en schema_v21_roles.sql — dominio
// contabilidad (antes era tienda a secas). La factura es la excepción a
// propósito — casi siempre se sube DESPUÉS de que fábrica ya confirmó
// (cuando se entrega o se está por entregar), así que para 'factura'
// contabilidad no queda limitado a "en_confirmacion" como sí pasa con
// cotización/orden de compra. ventas no tiene acceso a documentos.
export function canEditOrderDocument(role, order, kind) {
  if (role === 'admin_tienda' || role === 'admin_general') return true
  if (role === 'contabilidad') return kind === 'factura' || order?.status === 'en_confirmacion'
  return false
}

// Los 5 roles de etapa de fábrica + admin_fabrica cambian el estado
// (incluye "confirmar"); admin_general también. Tienda nunca.
// LÍMITE ESTRUCTURAL (documentado en schema_v21_roles.sql y
// SALPER_Contexto.md): hoy los 5 roles de etapa comparten permiso de
// escritura sobre TODO el estado de la orden — no hay todavía una fila
// por etapa (orden_etapas llega en la Parte 2) para restringir a cada
// quien a "solo su etapa".
export function canChangeStatus(role) {
  return FABRICA_ETAPA_ROLES.includes(role) || role === 'admin_fabrica' || role === 'admin_general'
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
