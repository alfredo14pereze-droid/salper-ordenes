// Estados posibles de una orden, en el orden en que normalmente ocurren.
// Este orden se usa para el stepper visual y para saber qué tan "avanzada"
// va una orden. El estado en sí se guarda como texto (ver
// supabase/schema_v14_bordado_y_reparaciones.sql, columna orders.status con
// CHECK constraint) — si algún día se necesita agregar o quitar un estado,
// hay que actualizar AMBOS lugares (y la lista de p_new_status válidos
// dentro de la función update_order_status).
//
// Cada etapa de producción (confirmación, corte, sublimado, terminado)
// tiene su PROPIA familia de color, y dentro de cada una hay dos tonos: uno
// claro para "entrando a esa etapa" y uno sólido/completo para "esa etapa
// ya terminada" — así se ve de un vistazo no solo EN QUÉ etapa va una orden,
// sino si esa etapa específica ya se cerró o sigue en proceso. "Completado"
// sigue siendo la única etapa en verde (el único juicio real de "bien" en
// el sentido semántico de la marca) — el resto usa ámbar/azul/rosa/morado a
// propósito, nunca rojo (reservado para urgencia de fecha de entrega, ver
// OrderCard). `textColor` es el color de texto que da buen contraste sobre
// `color`.
export const STATUSES = [
  { key: 'en_confirmacion', label: 'En confirmación', color: '#f5d38a', textColor: '#16130f' },
  { key: 'confirmado', label: 'Confirmado', color: '#ffc93c', textColor: '#16130f' },
  { key: 'en_corte', label: 'En corte', color: '#bfe3fa', textColor: '#16130f' },
  { key: 'cortado', label: 'Cortado', color: '#1f7dc4', textColor: '#ffffff' },
  { key: 'en_sublimado', label: 'En sublimado', color: '#f8cfe3', textColor: '#16130f' },
  { key: 'sublimado', label: 'Sublimado', color: '#d6488a', textColor: '#ffffff' },
  { key: 'en_bordado', label: 'En bordado', color: '#bdeae2', textColor: '#16130f' },
  { key: 'bordado', label: 'Bordado', color: '#158a76', textColor: '#ffffff' },
  { key: 'en_terminado', label: 'En terminado', color: '#ddd0f5', textColor: '#16130f' },
  { key: 'terminado', label: 'Terminado', color: '#7c4dc4', textColor: '#ffffff' },
  { key: 'completado', label: 'Completado', color: '#2f8f4e', textColor: '#ffffff' },
]

export const STATUS_KEYS = STATUSES.map((s) => s.key)

// Para el filtro de estado del Dashboard: en vez de 11 chips (una por cada
// "entrando"/"terminada"), se agrupan por actividad — un chip "Cortado"
// filtra órdenes en "en_corte" O "cortado", así no hay que adivinar en cuál
// de las dos anda una orden para encontrarla. El badge de cada tarjeta
// sigue mostrando el estado exacto (STATUSES arriba) — esto es solo para
// filtrar, no cambia lo que se guarda ni lo que se muestra por orden.
export const STATUS_GROUPS = [
  { key: 'confirmado', label: 'Confirmado', keys: ['en_confirmacion', 'confirmado'] },
  { key: 'cortado', label: 'Cortado', keys: ['en_corte', 'cortado'] },
  { key: 'sublimado', label: 'Sublimado', keys: ['en_sublimado', 'sublimado'] },
  { key: 'bordado', label: 'Bordado', keys: ['en_bordado', 'bordado'] },
  { key: 'terminado', label: 'Terminado', keys: ['en_terminado', 'terminado'] },
  { key: 'completado', label: 'Completado', keys: ['completado'] },
]

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
