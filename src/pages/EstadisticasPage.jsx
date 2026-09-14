import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { useOrderStatusHistory } from '../hooks/useOrderStatusHistory'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { computeOrderStats } from '../utils/orderStats'
import { formatDate, daysUntil } from '../utils/dates'
import TypeBadge from '../components/orders/TypeBadge'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// V35: pantalla de estadísticas de producción — cuánto nos tardamos, qué
// tan seguido entregamos a tiempo y en qué etapa se atora más una orden.
// Pedido explícito del usuario ("todo lo que se te ocurra que nos pueda
// servir"); ver computeOrderStats (utils/orderStats.js) para el detalle de
// cada cálculo. Es de solo lectura — no tiene ninguna escritura, así que no
// necesita ningún RPC nuevo, solo los mismos datos que ya usa el resto de
// la app (orders + order_status_history) leídos en un par de pedidos.
function statColor(value, { good, bad }) {
  if (value === null || value === undefined) return 'var(--color-text-muted)'
  if (value >= good) return 'var(--color-good)'
  if (value <= bad) return 'var(--color-danger)'
  return 'var(--color-warning)'
}

function StatCard({ label, value, hint, color }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value" style={color ? { color } : undefined}>
        {value}
      </span>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}

export default function EstadisticasPage() {
  const { orders, loading: loadingOrders, error: errorOrders, refresh: refreshOrders } = useOrders()
  const {
    historyByOrder,
    loading: loadingHistory,
    error: errorHistory,
    refresh: refreshHistory,
  } = useOrderStatusHistory()
  const { typesByKey } = useOrderTypes()

  const stats = useMemo(() => computeOrderStats(orders, historyByOrder), [orders, historyByOrder])

  const loading = loadingOrders || loadingHistory
  const error = errorOrders || errorHistory

  function refresh() {
    refreshOrders()
    refreshHistory()
  }

  if (loading) return <Loading label="Calculando estadísticas…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  const onTimeHint =
    stats.totalCompleted > 0 ? `${stats.onTimeCount} de ${stats.totalCompleted} completadas` : 'Sin órdenes completadas todavía'

  const overrunHint =
    stats.avgOverrunDays === null
      ? 'Sin estimados capturados todavía'
      : stats.avgOverrunDays <= 0
        ? `Vs. estimado de ${stats.avgEstimatedDays} días — dentro de tiempo`
        : `Vs. estimado de ${stats.avgEstimatedDays} días — nos pasamos`

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Estadísticas</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={refresh}>
          Actualizar
        </button>
      </div>
      <p className="page-subtitle">
        Cómo vamos con los tiempos: solo cuenta lo ya completado (o ya atrasado) — no afecta ni escribe nada,
        es puro análisis de lo que ya pasó.
      </p>

      <div className="stats-grid">
        <StatCard label="Órdenes completadas" value={stats.totalCompleted} hint="con datos suficientes para medir" />
        <StatCard
          label="Entregadas a tiempo"
          value={stats.onTimePct === null ? '—' : `${stats.onTimePct}%`}
          hint={onTimeHint}
          color={statColor(stats.onTimePct, { good: 80, bad: 60 })}
        />
        <StatCard
          label="Tiempo promedio de producción"
          value={stats.avgProductionDays === null ? '—' : `${stats.avgProductionDays} días`}
          hint="desde que se crea hasta que se completa"
        />
        <StatCard
          label="Estimado vs. real"
          value={
            stats.avgOverrunDays === null
              ? '—'
              : `${stats.avgOverrunDays > 0 ? '+' : ''}${stats.avgOverrunDays} días`
          }
          hint={overrunHint}
          color={
            stats.avgOverrunDays === null
              ? undefined
              : stats.avgOverrunDays <= 0
                ? 'var(--color-good)'
                : 'var(--color-danger)'
          }
        />
        <StatCard
          label="Atrasadas ahora mismo"
          value={stats.overdueOrders.length}
          hint={`de ${stats.activeCount} órdenes activas`}
          color={stats.overdueOrders.length > 0 ? 'var(--color-danger)' : 'var(--color-good)'}
        />
      </div>

      <section className="dashboard-all-orders">
        <div className="section-header">
          <h2 className="section-title">Tiempo promedio por etapa</h2>
        </div>
        {stats.maxStageAvgDays === 0 ? (
          <EmptyState>Todavía no hay suficiente historial de cambios de estado para medir esto.</EmptyState>
        ) : (
          <div className="stage-bars">
            {stats.stageBreakdown.map((s) => (
              <div key={s.key} className="stage-bar-row">
                <span className="stage-bar-row__label">{s.label}</span>
                <div className="stage-bar-row__track">
                  <div
                    className="stage-bar-row__fill"
                    style={{ width: `${s.avgDays ? Math.max((s.avgDays / stats.maxStageAvgDays) * 100, 4) : 0}%` }}
                  />
                </div>
                <span className="stage-bar-row__value">{s.avgDays === null ? '—' : `${s.avgDays} d`}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-all-orders">
        <div className="section-header">
          <h2 className="section-title">Desglose por tipo de orden</h2>
        </div>
        {stats.typeBreakdown.length === 0 ? (
          <EmptyState>Todavía no hay órdenes completadas para desglosar por tipo.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Completadas</th>
                  <th>% a tiempo</th>
                  <th>Promedio días</th>
                </tr>
              </thead>
              <tbody>
                {stats.typeBreakdown.map((t) => (
                  <tr key={t.key}>
                    <td><TypeBadge type={typesByKey[t.key]} /></td>
                    <td>{t.count}</td>
                    <td style={{ color: statColor(t.onTimePct, { good: 80, bad: 60 }) }}>{t.onTimePct}%</td>
                    <td>{t.avgDays} días</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stats.monthlyTrend.length > 0 && (
        <section className="dashboard-all-orders">
          <div className="section-header">
            <h2 className="section-title">Tendencia mensual (completadas)</h2>
          </div>
          <div className="month-bars">
            {stats.monthlyTrend.map((m) => (
              <div key={m.key} className="month-bar">
                <div className="month-bar__track">
                  <div
                    className="month-bar__fill"
                    style={{ height: `${Math.max((m.count / stats.maxMonthlyCount) * 100, 6)}%` }}
                  />
                </div>
                <span className="month-bar__count">{m.count}</span>
                <span className="month-bar__label">{m.label}</span>
                <span className="month-bar__pct" style={{ color: statColor(m.onTimePct, { good: 80, bad: 60 }) }}>
                  {m.onTimePct}% a tiempo
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-all-orders">
        <div className="section-header">
          <h2 className="section-title">Órdenes atrasadas ahora mismo</h2>
          <span className="section-count">{stats.overdueOrders.length}</span>
        </div>
        {stats.overdueOrders.length === 0 ? (
          <EmptyState>Ninguna orden activa está atrasada en este momento 🎉</EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.overdueOrders.map((o) => {
              const days = Math.abs(daysUntil(o.requested_delivery_date))
              return (
                <Link
                  key={o.id}
                  to={`/orden/${o.id}`}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <b>#{o.order_number}</b>
                    <span style={{ color: 'var(--color-text-muted)' }}>{o.client_name}</span>
                    <TypeBadge type={typesByKey[o.order_type_key]} />
                  </div>
                  <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                    Atrasada {days} día{days === 1 ? '' : 's'} · entrega {formatDate(o.requested_delivery_date)}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
