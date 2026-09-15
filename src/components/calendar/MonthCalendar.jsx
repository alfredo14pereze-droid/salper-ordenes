import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { computeCalendarWindow, isWithinRange } from '../../utils/dates'
import { buildDemandMap, getLoadForDate } from '../../utils/demand'
import { getStatus } from '../../utils/status'
import { STATUSES } from '../../lib/constants'

const WEEKDAY_LABELS = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.']

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// V54 — calendario de pared común (pedido explícito del usuario: quería
// que se viera "completamente diferente" a la vista anterior, tipo
// Gantt semanal). Cada día es una celda; cada orden aparece como un chip
// de color (según su estado ACTUAL, mismo criterio de siempre) en cada
// día que cae dentro de su "ventana de calendario" — que YA incluye el
// margen de seguridad de 3 días hábiles sobre el estimado de fábrica
// (ver computeCalendarWindow en utils/dates.js), para que la fecha
// mostrada siempre esté sobrada, nunca justa.
export default function MonthCalendar({ orders, typesByKey }) {
  const navigate = useNavigate()
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))

  const gridStart = startOfWeek(monthCursor, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 0 })
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

  const ordersWithWindow = useMemo(() => {
    return orders
      .map((order) => ({ order, window: computeCalendarWindow(order) }))
      .filter(({ window }) => window)
  }, [orders])

  const hasAnyThisMonth = useMemo(
    () => ordersWithWindow.some(({ window }) => days.some((day) => isWithinRange(day, window.start, window.end))),
    [ordersWithWindow, days]
  )

  // V55/V56 — pedido del usuario: que el calendario detecte cuando hay
  // mucha demanda, tomando en cuenta tanto cuántas órdenes como cuántas
  // PRENDAS traen (una orden de 2000 prendas es más trabajo que 10
  // órdenes de 10 prendas). El umbral se calcula sobre TODAS las
  // órdenes visibles (no solo las del mes que se está viendo) para que
  // no cambie de significado con solo cambiar de mes — ver
  // utils/demand.js.
  const demand = useMemo(() => buildDemandMap(orders), [orders])

  return (
    <div className="month-calendar">
      <div className="month-calendar__nav">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setMonthCursor((m) => subMonths(m, 1))}>
          ← Mes anterior
        </button>
        <h3 className="month-calendar__title">{capitalize(format(monthCursor, 'MMMM yyyy', { locale: es }))}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isSameMonth(monthCursor, new Date()) && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setMonthCursor(startOfMonth(new Date()))}>
              Hoy
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setMonthCursor((m) => addMonths(m, 1))}>
            Mes siguiente →
          </button>
        </div>
      </div>

      {!hasAnyThisMonth && <p className="page-subtitle">Ningún pedido tiene producción programada este mes.</p>}

      <div className="month-calendar__grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="month-calendar__weekday">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const dayOrders = ordersWithWindow.filter(({ window }) => isWithinRange(day, window.start, window.end))
          const inMonth = isSameMonth(day, monthCursor)
          const { orders: orderLoad, pieces: pieceLoad } = getLoadForDate(demand, day)
          const saturated = orderLoad >= demand.orderThreshold || pieceLoad >= demand.pieceThreshold
          // V56 — la etiqueta muestra el número de piezas cuando hay
          // datos de prendas capturadas (es la señal real de trabajo,
          // pedido explícito del usuario); si esa orden todavía no tiene
          // prendas capturadas, cae de vuelta al conteo de órdenes.
          const badgeLabel = pieceLoad > 0 ? `${pieceLoad.toLocaleString('es-MX')} pz` : `${orderLoad} ord.`

          return (
            <div
              key={day.toISOString()}
              className={
                'month-calendar__day' +
                (inMonth ? '' : ' month-calendar__day--muted') +
                (isToday(day) ? ' month-calendar__day--today' : '') +
                (saturated ? ' month-calendar__day--saturated' : '')
              }
            >
              <div className="month-calendar__day-top">
                <span className="month-calendar__day-number">{format(day, 'd')}</span>
                {saturated && (
                  <span
                    className="month-calendar__day-badge"
                    title={`${orderLoad} orden${orderLoad === 1 ? '' : 'es'} · ${pieceLoad.toLocaleString('es-MX')} prenda${pieceLoad === 1 ? '' : 's'} en producción este día — más de lo normal para este taller (umbral: ${demand.orderThreshold} órdenes o ${demand.pieceThreshold.toLocaleString('es-MX')} prendas).`}
                  >
                    ⚠ {badgeLabel}
                  </span>
                )}
              </div>
              {dayOrders.length > 0 && (
                <div className="month-calendar__events">
                  {dayOrders.map(({ order, window }) => {
                    const status = getStatus(order.status)
                    const orderType = typesByKey[order.order_type_key]
                    return (
                      <button
                        key={order.id}
                        type="button"
                        className="month-calendar__event"
                        style={{ background: status.color, color: status.textColor }}
                        title={`#${order.order_number} · ${order.client_name}${orderType ? ' · ' + orderType.label : ''} · Entrega: ${format(
                          window.end,
                          'd MMM yyyy',
                          { locale: es }
                        )} · ${status.label}`}
                        onClick={() => navigate(`/orden/${order.id}`)}
                      >
                        #{order.order_number} {order.client_name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="calendar-legend">
        {STATUSES.map((s) => (
          <span key={s.key} className="calendar-legend__item">
            <span className="calendar-legend__dot" style={{ '--dot-color': s.color }} />
            {s.label}
          </span>
        ))}
        <span className="calendar-legend__item">
          <span className="month-calendar__day-badge">⚠</span>
          Día saturado — {demand.orderThreshold} o más órdenes, o {demand.pieceThreshold.toLocaleString('es-MX')} o más
          prendas encimadas ese día (más de lo normal para este taller)
        </span>
      </div>
    </div>
  )
}
