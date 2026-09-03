// Reglas de permisos por rol, centralizadas en un solo lugar para que
// los componentes no dupliquen la lógica de "quién puede qué" — cada
// regla de aquí tiene su espejo validado del lado del servidor (ver los
// RPC en supabase/schema_v4_auth.sql), así que estos helpers son solo
// para decidir qué mostrar/ocultar en la UI, no la única línea de
// defensa: si alguien se salta la UI, el servidor igual lo rechaza.

export function canCreateOrder(role) {
  return role === 'tienda' || role === 'admin'
}

// tienda solo mientras la orden sigue "en_confirmacion"; admin siempre.
export function canEditOrder(role, order) {
  if (role === 'admin') return true
  if (role === 'tienda') return order?.status === 'en_confirmacion'
  return false
}

// Documentos de la orden (cotización/orden de compra/factura): mismo
// espejo que set_order_document en schema_v15_factura.sql. La factura es
// la excepción a propósito — casi siempre se sube DESPUÉS de que fábrica
// ya confirmó (cuando se entrega o se está por entregar), así que para
// 'factura' tienda no queda limitado a "en_confirmacion" como sí pasa con
// cotización/orden de compra.
export function canEditOrderDocument(role, order, kind) {
  if (role === 'admin') return true
  if (role === 'tienda') return kind === 'factura' || order?.status === 'en_confirmacion'
  return false
}

// fabrica/admin cambian el estado (incluye "confirmar"); tienda nunca.
export function canChangeStatus(role) {
  return role === 'fabrica' || role === 'admin'
}

// fabrica captura el tiempo estimado solo mientras sigue en_confirmacion;
// admin siempre.
export function canSetEstimatedDays(role, order) {
  if (role === 'admin') return true
  if (role === 'fabrica') return order?.status === 'en_confirmacion'
  return false
}

export function canCancelOrder(role) {
  return role === 'admin'
}

export function canManageUsers(role) {
  return role === 'admin'
}

export const ROLE_LABELS = {
  admin: 'Administrador',
  tienda: 'Tienda',
  fabrica: 'Fábrica',
}
