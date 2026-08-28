import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildWeekColumns, computeProductionWindow, rangesOverlap } from '../../utils/dates'
import { getStatusColor, getStatusLabel } from '../../utils/status'
import { STATUSES, CALENDAR_WEEKS_AHEAD } from '../../lib/constants'
import { EmptyState } from '../common/States'

// Vista tipo Gantt semanal: cada fila es una orden, cada columna una semana.
// La barra de cada orden cubre su "ventana de producción estimada"
// (fecha de entrega - días estimados, hasta la fecha de entrega) y se
// colorea según el estado ACTUAL de la orden, para ver de un vistazo
// qué debería estar pasando cada semana.
export default function ProductionCalendar({ orders, typesByKey }) {
  const weeks = useMemo(() => buildWeekColumns(CALENDAR_WEEKS_AHEAD), [])
  const navigate = useNavigate()

  const rangeStart = weeks[0].start
  const rangeEnd = weeks[weeks.length - 1].end

  const rows = useMemo(() => {
    return orders
      .map((order) => ({ order, window: computeProductionWindow(order) }))
      .filter(({ window }) => rangesOverlap(window.start, window.end, rangeStart, rangeEnd))
      .sort((a, b) => a.window.start - b.window.start)
  }, [orders, rangeStart, rangeEnd])

  if (rows.length === 0) {
    return <EmptyState>No hay órdenes con ventana de producción en las próximas {CALENDAR_WEEKS_AHEAD} semanas.</EmptyState>
  }

  return (
    <div className="calendar-wrapper">
      <div className="calendar-grid" style={{ '--week-count': weeks.length }}>
        <div className="calendar-grid__corner">Orden</div>
        {weeks.map((week) => (
          <div key={week.label} className="calendar-grid__week-header">
            {week.label}
          </div>
        ))}

        {rows.map(({ order, window }) => (
          <RowCells
            key={order.id}
            order={order}
            orderType={typesByKey[order.order_type_key]}
            window={window}
            weeks={weeks}
            onClick={() => navigate(`/orden/${order.id}`)}
          />
        ))}
      </div>

      <div className="calendar-legend">
        {STATUSES.map((s) => (
          <span key={s.key} className="calendar-legend__item">
            <span className="calendar-legend__dot" style={{ '--dot-color': s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function RowCells({ order, orderType, window, weeks, onClick }) {
  return (
    <>
      <div className="calendar-grid__row-label" onClick={onClick} role="button" tabIndex={0}>
        <strong>#{order.order_number}</strong>
        <span>{order.client_name}</span>
        {orderType && <span className="calendar-grid__row-type">{orderType.label}</span>}
      </div>
      {weeks.map((week) => {
        const active = rangesOverlap(window.start, window.end, week.start, week.end)
        return (
          <div
            key={week.label}
            className={'calendar-grid__cell' + (active ? ' calendar-grid__cell--active' : '')}
            style={active ? { '--cell-color': getStatusColor(order.status) } : undefined}
            title={active ? `${order.order_number} · ${getStatusLabel(order.status)}` : undefined}
            onClick={active ? onClick : undefined}
          />
        )
      })}
    </>
  )
}
