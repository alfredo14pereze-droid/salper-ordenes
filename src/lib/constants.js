// Estados posibles de una orden, en el orden en que normalmente ocurren.
// Este orden se usa para el stepper visual y para saber qué tan "avanzada"
// va una orden. El estado en sí se guarda como texto (ver supabase/schema.sql,
// columna orders.status con CHECK constraint) — si algún día se necesita
// agregar o quitar un estado, hay que actualizar AMBOS lugares.
//
// El "color" de cada estado es una progresión ámbar → naranja, terminando en
// verde para "completado" (el único estado que cuenta como "bien" en el
// sentido semántico de la marca — el resto son solo etapas, no juicios de
// bien/mal, por eso nunca usan rojo). Se usa en el calendario/stepper y
// también en el badge de estado de cada tarjeta (StatusBadge) — cada etapa
// se pinta distinto para reconocerla de un vistazo. `textColor` es el color
// de texto que da buen contraste sobre `color`.
export const STATUSES = [
  { key: 'en_confirmacion', label: 'En confirmación', color: '#f5d38a', textColor: '#16130f' },
  { key: 'confirmado', label: 'Confirmado', color: '#ffc93c', textColor: '#16130f' },
  { key: 'cortado', label: 'Cortado', color: '#e8a916', textColor: '#16130f' },
  { key: 'sublimado', label: 'Sublimado', color: '#e8720c', textColor: '#ffffff' },
  { key: 'en_produccion', label: 'En producción', color: '#a24d09', textColor: '#ffffff' },
  { key: 'completado', label: 'Completado', color: '#2f8f4e', textColor: '#ffffff' },
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
