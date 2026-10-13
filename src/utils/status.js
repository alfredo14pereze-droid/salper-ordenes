import { STATUSES, STATUS_GROUPS } from '../lib/constants'

// Un estado que esta versión de la app no conoce (uno nuevo que todavía no
// llega a este dispositivo) se muestra en gris con su nombre tal cual. Antes
// caía en el primero de la lista y se pintaba como "Por Confirmar" en rojo.
export function getStatus(key) {
  const conocido = STATUSES.find((s) => s.key === key)
  if (conocido) return conocido
  if (!key) return STATUSES[0]
  const label = String(key).replace(/_/g, ' ')
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1), color: '#64748b', textColor: '#ffffff' }
}

export function getStatusLabel(key) {
  return getStatus(key).label
}

export function getStatusColor(key) {
  return getStatus(key).color
}

export function getStatusIndex(key) {
  const idx = STATUSES.findIndex((s) => s.key === key)
  return idx === -1 ? 0 : idx
}

export function isCompleted(key) {
  return key === 'completado'
}

// "Activa" = todavía no se entregó / terminó. Se usa para el dashboard
// (vista general de órdenes activas) y para "próximas a surtir".
export function isActiveStatus(key) {
  return key !== 'completado'
}

// ¿El estado exacto de una orden (ej. "en_corte") cae dentro de alguno de
// estos grupos de filtro (ej. "cortado" = en_corte + cortado)? Ver
// STATUS_GROUPS en lib/constants.js.
export function matchesStatusGroups(orderStatus, groupKeys) {
  if (!groupKeys || groupKeys.length === 0) return true
  return groupKeys.some((groupKey) => {
    const group = STATUS_GROUPS.find((g) => g.key === groupKey)
    return group ? group.keys.includes(orderStatus) : groupKey === orderStatus
  })
}
