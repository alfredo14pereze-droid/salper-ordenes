// Estados posibles de una orden, en el orden en que normalmente ocurren.
// Este orden se usa para el stepper visual y para saber qué tan "avanzada"
// va una orden. El estado en sí se guarda como texto (ver supabase/schema.sql,
// columna orders.status con CHECK constraint) — si algún día se necesita
// agregar o quitar un estado, hay que actualizar AMBOS lugares.
//
// El "color" de cada estado se usa solo en el calendario y el stepper (para
// distinguir de un vistazo en qué etapa va cada semana) — es una progresión
// ámbar → naranja, terminando en verde para "completado" (el único estado
// que cuenta como "bien" en el sentido semántico de la marca). Las etiquetas
// (badges) de estado en las tarjetas NO usan este color: son negro+ámbar de
// forma uniforme, salvo "completado" que sí se pinta de verde — ver
// utils/status.js → isGoodStatus().
export const STATUSES = [
  { key: 'en_confirmacion', label: 'En confirmación', color: '#f5d38a' },
  { key: 'confirmado', label: 'Confirmado', color: '#ffc93c' },
  { key: 'cortado', label: 'Cortado', color: '#e8a916' },
  { key: 'sublimado', label: 'Sublimado', color: '#e8720c' },
  { key: 'en_produccion', label: 'En producción', color: '#a24d09' },
  { key: 'completado', label: 'Completado', color: '#2f8f4e' },
]

export const STATUS_KEYS = STATUSES.map((s) => s.key)

export const DEFAULT_ORDER_TYPE_COLOR = '#e8720c'

// Cuántas semanas hacia adelante se muestran en el calendario de producción.
export const CALENDAR_WEEKS_AHEAD = 8

// Colores predefinidos para las prendas de una orden (ver OrderItemsEditor).
// Lista fija por ahora — si más adelante se necesita que cualquiera pueda
// agregar colores nuevos sin pedírselo a un programador, se puede migrar a
// una tabla en Supabase igual que order_types.
export const GARMENT_COLORS = [
  'Blanco',
  'Negro',
  'Gris',
  'Azul marino',
  'Azul rey',
  'Rojo',
  'Verde bandera',
  'Amarillo',
  'Naranja',
  'Vino',
]

// Tipos de orden cuyas prendas necesitan especificar el Pantone exacto
// (ej. sublimación). El resto de los tipos solo piden el color general.
export const ORDER_TYPES_REQUIRING_PANTONE = ['sublimacion']
