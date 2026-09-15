import { subDays, subBusinessDays, differenceInCalendarDays, isWithinInterval, parseISO, format } from 'date-fns'
import { es } from 'date-fns/locale'

// Las fechas que vienen de Supabase (columnas "date") llegan como string
// "YYYY-MM-DD"; las timestamptz llegan como ISO completo. parseISO cubre
// ambos casos.
export function parseDate(value) {
  if (!value) return null
  return typeof value === 'string' ? parseISO(value) : value
}

export function formatDate(value, pattern = 'd MMM yyyy') {
  const date = parseDate(value)
  if (!date) return '—'
  return format(date, pattern, { locale: es })
}

export function formatDateTime(value) {
  return formatDate(value, "d MMM yyyy, HH:mm 'h'")
}

// Días que faltan para la fecha de entrega. Negativo = ya se pasó la fecha.
export function daysUntil(deliveryDate) {
  const date = parseDate(deliveryDate)
  if (!date) return null
  return differenceInCalendarDays(date, new Date())
}

// Ventana de producción estimada de una orden: desde
// (fecha de entrega - días estimados) hasta la fecha de entrega.
export function computeProductionWindow(order) {
  const end = parseDate(order.requested_delivery_date)
  const days = Math.max(Number(order.estimated_production_days) || 1, 1)
  const start = subDays(end, days - 1)
  return { start, end }
}

export function isWithinRange(date, start, end) {
  return isWithinInterval(date, { start, end })
}

// V54 — ventana que se pinta en el calendario de producción (distinta de
// computeProductionWindow: esa muestra el estimado REAL de fábrica en el
// detalle de la orden, sin tocar). Aquí, a pedido explícito del usuario,
// se le suma un margen fijo de 3 días hábiles al estimado — "si dice que
// va a tomar 5 días, ponla en 7 u 8 para que esté sobrado" — y el inicio
// se cuenta en días hábiles de lunes a viernes (subBusinessDays de
// date-fns ya salta sábado/domingo). La barra en sí se pinta continua
// entre inicio y fin (incluye fines de semana de por medio si los hay),
// solo el CONTEO de los días hacia atrás salta fin de semana.
const CALENDAR_BUFFER_BUSINESS_DAYS = 3

export function computeCalendarWindow(order) {
  const end = parseDate(order.requested_delivery_date)
  if (!end) return null
  const rawDays = Math.max(Number(order.estimated_production_days) || 1, 1)
  const totalDays = rawDays + CALENDAR_BUFFER_BUSINESS_DAYS
  const start = subBusinessDays(end, totalDays - 1)
  return { start, end }
}
