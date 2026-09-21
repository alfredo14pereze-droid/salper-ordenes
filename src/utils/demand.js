import { eachDayOfInterval, format } from 'date-fns'
import { computeCalendarWindow } from './dates'

// V55 — pedido del usuario: "¿hay alguna manera de que la página
// detecte cuando hay mucha demanda, y que ajuste el calendario acorde a
// eso?". V56 — pedido explícito de ajuste: NO basarse solo en cuántas
// órdenes hay ese día, sino también en cuántas PRENDAS traen — "si hay
// una orden de 2000 prendas, es más trabajo que 10 órdenes de 10 prendas
// cada una". Un día se marca saturado si CUALQUIERA de los dos supera su
// propio umbral (una sola orden gigante satura por piezas aunque sea la
// única orden ese día; muchas órdenes chiquitas saturan por cantidad
// aunque cada una traiga pocas piezas).
//
// Ambos umbrales son RELATIVOS a la propia carga reciente del taller
// (decisión confirmada con el usuario vía AskUserQuestion, en vez de un
// número fijo que alguien tendría que ir actualizando a mano):
//   - Órdenes: 1.5x el promedio de órdenes/día (de los días que sí
//     tienen algo programado), con un piso de 3.
//   - Prendas: 1.5x el promedio de prendas/día, con un piso de "3
//     órdenes típicas de este taller" (3x el tamaño promedio real de una
//     orden) — así el piso tampoco es un número inventado, sale de los
//     propios datos.
const SATURATION_MULTIPLIER = 1.5
const MIN_ORDER_THRESHOLD = 3

// V59 — tolerante a datos raros (una talla `null` suelta ya rompió la
// pantalla completa en producción): nunca asume que un item o una talla
// existen. ordersService ya limpia esto al leer; aquí es defensa extra.
export function getOrderPieceCount(order) {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.reduce((sum, item) => {
    const sizes = Array.isArray(item?.sizes) ? item.sizes : []
    return sum + sizes.reduce((s, sz) => s + (Number(sz?.cantidad) || 0), 0)
  }, 0)
}

// Recibe la MISMA lista de órdenes que ya se le pasa al calendario
// (respeta cualquier filtro que ya se le haya aplicado, ej. "Incluir
// completadas") y regresa un mapa de carga por día (órdenes + prendas) +
// los umbrales calculados — para usar tanto en el calendario (marcar
// días saturados) como en "Nueva orden" (avisar si la fecha elegida ya
// está saturada).
export function buildDemandMap(orders) {
  const orderCountByDate = new Map()
  const pieceCountByDate = new Map()
  let totalPieces = 0
  let ordersWithWindowCount = 0

  for (const order of orders) {
    const window = computeCalendarWindow(order)
    if (!window) continue
    ordersWithWindowCount += 1
    const pieces = getOrderPieceCount(order)
    totalPieces += pieces
    for (const day of eachDayOfInterval({ start: window.start, end: window.end })) {
      const key = format(day, 'yyyy-MM-dd')
      orderCountByDate.set(key, (orderCountByDate.get(key) || 0) + 1)
      pieceCountByDate.set(key, (pieceCountByDate.get(key) || 0) + pieces)
    }
  }

  const orderCounts = Array.from(orderCountByDate.values())
  const pieceCounts = Array.from(pieceCountByDate.values())
  const avgOrdersPerDay = orderCounts.length ? orderCounts.reduce((sum, v) => sum + v, 0) / orderCounts.length : 0
  const avgPiecesPerDay = pieceCounts.length ? pieceCounts.reduce((sum, v) => sum + v, 0) / pieceCounts.length : 0
  const avgPiecesPerOrder = ordersWithWindowCount ? totalPieces / ordersWithWindowCount : 0

  const orderThreshold = Math.max(MIN_ORDER_THRESHOLD, Math.ceil(avgOrdersPerDay * SATURATION_MULTIPLIER))
  const pieceThreshold = Math.max(
    Math.ceil(avgPiecesPerOrder * MIN_ORDER_THRESHOLD),
    Math.ceil(avgPiecesPerDay * SATURATION_MULTIPLIER)
  )

  return { orderCountByDate, pieceCountByDate, orderThreshold, pieceThreshold }
}

export function getLoadForDate(demandMap, date) {
  const key = format(date, 'yyyy-MM-dd')
  return {
    orders: demandMap.orderCountByDate.get(key) || 0,
    pieces: demandMap.pieceCountByDate.get(key) || 0,
  }
}

export function isSaturated(demandMap, date) {
  const { orders, pieces } = getLoadForDate(demandMap, date)
  return orders >= demandMap.orderThreshold || pieces >= demandMap.pieceThreshold
}
