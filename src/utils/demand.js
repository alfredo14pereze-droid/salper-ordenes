import { eachDayOfInterval, format } from 'date-fns'
import { computeCalendarWindow } from './dates'

// V55 — pedido del usuario: "¿hay alguna manera de que la página
// detecte cuando hay mucha demanda, y que ajuste el calendario acorde a
// eso?". "Carga" de un día = cuántas órdenes tienen ese día dentro de su
// ventana de calendario (la de V54, que ya incluye el margen de +3 días
// hábiles sobre el estimado de fábrica — ver computeCalendarWindow en
// dates.js). El umbral de "saturado" es RELATIVO a la propia carga
// reciente del taller (decisión confirmada con el usuario vía
// AskUserQuestion, en vez de un número fijo que alguien tendría que ir
// actualizando a mano): se dispara a partir de 1.5x el promedio de carga
// de los días que sí tienen algo programado — así no se dispara por
// variación normal en temporada baja — con un piso de 3 para que en un
// taller con muy pocas órdenes encimadas no se marque "saturado" un día
// con solo 1 o 2.
const SATURATION_MULTIPLIER = 1.5
const MIN_SATURATION_THRESHOLD = 3

// Recibe la MISMA lista de órdenes que ya se le pasa al calendario
// (respeta cualquier filtro que ya se le haya aplicado, ej. "Incluir
// completadas") y regresa un mapa de carga por día + el umbral
// calculado — para usar tanto en el calendario (marcar días saturados)
// como en "Nueva orden" (avisar si la fecha elegida ya está saturada).
export function buildDemandMap(orders) {
  const loadByDate = new Map()

  for (const order of orders) {
    const window = computeCalendarWindow(order)
    if (!window) continue
    for (const day of eachDayOfInterval({ start: window.start, end: window.end })) {
      const key = format(day, 'yyyy-MM-dd')
      loadByDate.set(key, (loadByDate.get(key) || 0) + 1)
    }
  }

  const loads = Array.from(loadByDate.values())
  const avgLoad = loads.length ? loads.reduce((sum, v) => sum + v, 0) / loads.length : 0
  const threshold = Math.max(MIN_SATURATION_THRESHOLD, Math.ceil(avgLoad * SATURATION_MULTIPLIER))

  return { loadByDate, threshold }
}

export function getLoadForDate(demandMap, date) {
  return demandMap.loadByDate.get(format(date, 'yyyy-MM-dd')) || 0
}

export function isSaturated(demandMap, date) {
  return getLoadForDate(demandMap, date) >= demandMap.threshold
}
