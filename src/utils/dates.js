import {
  addDays,
  subDays,
  addWeeks,
  startOfWeek,
  differenceInCalendarDays,
  isWithinInterval,
  parseISO,
  format,
} from 'date-fns'
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

// Genera columnas semanales (lunes a domingo) para el calendario de
// producción, empezando en la semana actual.
export function buildWeekColumns(numWeeks, from = new Date()) {
  const firstWeekStart = startOfWeek(from, { weekStartsOn: 1 })
  return Array.from({ length: numWeeks }).map((_, i) => {
    const start = addWeeks(firstWeekStart, i)
    const end = addDays(start, 6)
    return {
      start,
      end,
      label: `${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM', { locale: es })}`,
    }
  })
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd
}

export function isWithinRange(date, start, end) {
  return isWithinInterval(date, { start, end })
}
