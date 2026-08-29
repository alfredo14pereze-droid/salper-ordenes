import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import TypeBadge from './TypeBadge'
import { formatDate, daysUntil } from '../../utils/dates'
import { isCompleted } from '../../utils/status'

export default function OrderCard({ order, orderType }) {
  const navigate = useNavigate()
  const days = daysUntil(order.requested_delivery_date)
  const completed = isCompleted(order.status)

  let cardClass = 'order-card'
  let dueClass = 'order-card__due'
  let dueLabel = `Entrega en ${days} días`

  if (order.cancelled_at) {
    cardClass += ' order-card--cancelled'
  } else if (completed) {
    // Ya se completó: no tiene caso alarmar con "atrasada" — es un
    // indicador de "bien" (verde), no de urgencia.
    cardClass += ' order-card--good'
    dueClass += ' order-card__due--good'
    dueLabel = '✓ Completada'
  } else if (days < 0) {
    cardClass += ' order-card--overdue'
    dueClass += ' order-card__due--overdue'
    dueLabel = `Atrasada ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`
  } else if (days === 0) {
    dueClass += ' order-card__due--today'
    dueLabel = 'Entrega hoy'
  } else if (days <= 2) {
    dueClass += ' order-card__due--soon'
  }

  return (
    <article className={cardClass} onClick={() => navigate(`/orden/${order.id}`)} role="button" tabIndex={0}>
      <div className="order-card__top">
        <span className="order-card__number">#{order.order_number}</span>
        {order.cancelled_at ? <span className="badge badge--danger">Cancelada</span> : <StatusBadge status={order.status} />}
      </div>
      <h3 className="order-card__client">{order.client_name}</h3>
      <div className="order-card__meta">
        <TypeBadge type={orderType} />
        <span className={dueClass}>{dueLabel}</span>
      </div>
      <div className="order-card__footer">
        <span>Entrega: {formatDate(order.requested_delivery_date)}</span>
      </div>
    </article>
  )
}
