// Cálculos de la pantalla de Estadísticas (V35). Todo puro (sin llamadas a
// la base) para que sea fácil de razonar y de ajustar: recibe las órdenes
// ya cargadas (useOrders) y el historial de estados agrupado por orden
// (useOrderStatusHistory) y regresa un solo objeto con todo lo que la
// página necesita pintar.
//
// Reglas generales:
// - Las órdenes canceladas (cancelled_at) se excluyen de todo — no cuentan
//   ni como "a tiempo" ni como "atrasadas", igual que en el resto de la app.
// - "A tiempo" compara por día calendario (no por hora): se completó el
//   mismo día de la fecha de entrega solicitada o antes.
// - Si por algún motivo el historial de una orden no tiene un registro
//   'completado' (no debería pasar, pero una orden vieja podría no
//   traerlo), se usa updated_at como respaldo en vez de descartarla.
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { STATUS_GROUPS } from '../lib/constants'

function toDate(value) {
  if (!value) return null
  return typeof value === 'string' ? parseISO(value) : value
}

function firstReached(history, status) {
  const row = (history || []).find((h) => h.status === status)
  return row ? toDate(row.changed_at) : null
}

export function computeOrderStats(orders, historyByOrder) {
  const nonCancelled = (orders || []).filter((o) => !o.cancelled_at)
  const completedOrders = nonCancelled.filter((o) => o.status === 'completado')

  // --- Tiempo de producción + entrega a tiempo, por orden completada ---
  const perOrder = completedOrders
    .map((o) => {
      const history = historyByOrder[o.id] || []
      const completedAt = firstReached(history, 'completado') || toDate(o.updated_at)
      const createdAt = toDate(o.created_at)
      const productionDays =
        createdAt && completedAt ? differenceInCalendarDays(completedAt, createdAt) : null
      const onTime = completedAt
        ? differenceInCalendarDays(toDate(o.requested_delivery_date), completedAt) >= 0
        : null
      return { order: o, completedAt, productionDays, onTime }
    })
    .filter((r) => r.productionDays !== null && r.productionDays >= 0)

  const totalCompleted = perOrder.length
  const onTimeCount = perOrder.filter((r) => r.onTime).length
  const onTimePct = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : null
  const avgProductionDays =
    totalCompleted > 0
      ? Math.round((perOrder.reduce((s, r) => s + r.productionDays, 0) / totalCompleted) * 10) / 10
      : null

  // --- Estimado (fábrica) vs real, solo donde fábrica capturó un estimado ---
  const withEstimate = perOrder.filter((r) => Number(r.order.estimated_production_days) > 0)
  const avgEstimatedDays =
    withEstimate.length > 0
      ? Math.round(
          (withEstimate.reduce((s, r) => s + Number(r.order.estimated_production_days), 0) /
            withEstimate.length) *
            10
        ) / 10
      : null
  const avgOverrunDays =
    withEstimate.length > 0
      ? Math.round(
          (withEstimate.reduce(
            (s, r) => s + (r.productionDays - Number(r.order.estimated_production_days)),
            0
          ) /
            withEstimate.length) *
            10
        ) / 10
      : null

  // --- Desglose por tipo de orden ---
  const byType = new Map()
  for (const r of perOrder) {
    const key = r.order.order_type_key
    if (!byType.has(key)) byType.set(key, { key, count: 0, onTime: 0, totalDays: 0 })
    const g = byType.get(key)
    g.count += 1
    if (r.onTime) g.onTime += 1
    g.totalDays += r.productionDays
  }
  const typeBreakdown = Array.from(byType.values())
    .map((g) => ({
      key: g.key,
      count: g.count,
      onTimePct: Math.round((g.onTime / g.count) * 100),
      avgDays: Math.round((g.totalDays / g.count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)

  // --- Tiempo promedio por etapa (usa la cronología real del historial,
  //     agrupado por STATUS_GROUPS para no separar "en_corte"/"cortado") ---
  const stageDurations = new Map()
  for (const o of nonCancelled) {
    const history = (historyByOrder[o.id] || [])
      .slice()
      .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
    for (let i = 0; i < history.length - 1; i++) {
      const cur = history[i]
      const next = history[i + 1]
      const days = differenceInCalendarDays(toDate(next.changed_at), toDate(cur.changed_at))
      if (days < 0) continue
      const group = STATUS_GROUPS.find((g) => g.keys.includes(cur.status))
      const groupKey = group ? group.key : cur.status
      if (!stageDurations.has(groupKey)) stageDurations.set(groupKey, { totalDays: 0, count: 0 })
      const s = stageDurations.get(groupKey)
      s.totalDays += days
      s.count += 1
    }
  }
  const stageBreakdown = STATUS_GROUPS.filter((g) => g.key !== 'completado').map((g) => {
    const s = stageDurations.get(g.key)
    return {
      key: g.key,
      label: g.label,
      avgDays: s && s.count > 0 ? Math.round((s.totalDays / s.count) * 10) / 10 : null,
      count: s ? s.count : 0,
    }
  })
  const maxStageAvgDays = Math.max(0, ...stageBreakdown.map((s) => s.avgDays || 0))

  // --- Órdenes activas ya atrasadas (pasaron su fecha de entrega y siguen sin completarse) ---
  const today = new Date()
  const activeOrders = nonCancelled.filter((o) => o.status !== 'completado')
  const overdueOrders = activeOrders
    .filter((o) => differenceInCalendarDays(toDate(o.requested_delivery_date), today) < 0)
    .sort((a, b) => new Date(a.requested_delivery_date) - new Date(b.requested_delivery_date))

  // --- Tendencia mensual (últimos 6 meses con al menos una orden completada) ---
  const monthly = new Map()
  for (const r of perOrder) {
    const d = r.completedAt
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthly.has(key)) monthly.set(key, { key, date: new Date(d.getFullYear(), d.getMonth(), 1), count: 0, onTime: 0 })
    const m = monthly.get(key)
    m.count += 1
    if (r.onTime) m.onTime += 1
  }
  const monthlyTrend = Array.from(monthly.values())
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .slice(-6)
    .map((m) => ({
      ...m,
      label: format(m.date, 'MMM yyyy', { locale: es }),
      onTimePct: Math.round((m.onTime / m.count) * 100),
    }))
  const maxMonthlyCount = Math.max(0, ...monthlyTrend.map((m) => m.count))

  return {
    totalCompleted,
    onTimeCount,
    onTimePct,
    avgProductionDays,
    avgEstimatedDays,
    avgOverrunDays,
    typeBreakdown,
    stageBreakdown,
    maxStageAvgDays,
    overdueOrders,
    activeCount: activeOrders.length,
    monthlyTrend,
    maxMonthlyCount,
  }
}
