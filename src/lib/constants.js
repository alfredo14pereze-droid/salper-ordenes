// Estados posibles de una orden, en el orden en que normalmente ocurren.
// Este orden se usa para el stepper visual y para saber qué tan "avanzada"
// va una orden. El estado en sí se guarda como texto (ver supabase/schema.sql,
// columna orders.status con CHECK constraint) — si algún día se necesita
// agregar o quitar un estado, hay que actualizar AMBOS lugares.
export const STATUSES = [
  { key: 'en_confirmacion', label: 'En confirmación', color: '#f59e0b' },
  { key: 'confirmado', label: 'Confirmado', color: '#3b82f6' },
  { key: 'cortado', label: 'Cortado', color: '#8b5cf6' },
  { key: 'sublimado', label: 'Sublimado', color: '#ec4899' },
  { key: 'en_produccion', label: 'En producción', color: '#0ea5e9' },
  { key: 'completado', label: 'Completado', color: '#22c55e' },
]

export const STATUS_KEYS = STATUSES.map((s) => s.key)

export const DEFAULT_ORDER_TYPE_COLOR = '#64748b'

// Cuántas semanas hacia adelante se muestran en el calendario de producción.
export const CALENDAR_WEEKS_AHEAD = 8
