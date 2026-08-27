import { STATUSES } from '../lib/constants'

export function getStatus(key) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0]
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
