import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import TypeBadge from './TypeBadge'
import { formatDate, daysUntil } from '../../utils/dates'
import { isCompleted } from '../../utils/status'
import { resumenPrendas } from '../../utils/prendas'
import { useAuth } from '../../contexts/AuthContext'
import { canConfirmOrderChanges } from '../../utils/permissions'

export default function OrderCard({ order, orderType }) {
  const navigate = useNavigate()
  const { role } = useAuth()
  const days = daysUntil(order.requested_delivery_date)
  const completed = isCompleted(order.status)
  const prendas = resumenPrendas(order)
  // V38: una orden ya confirmada que se editó después queda marcada con
  // pending_reconfirmation_at — solo fábrica ve el cuadro completo en
  // azul (pedido explícito del usuario: "a los usuarios de la fábrica
  // les salga en color azul todo el cuadro"). Gana sobre la urgencia de
  // fecha (rojo/ámbar) porque es una señal más importante ahora mismo;
  // no aplica a canceladas/completadas (ver update_order_details).
  const needsReconfirm = !!order.pending_reconfirmation_at && !order.cancelled_at && !completed && canConfirmOrderChanges(role)

  let cardClass = 'order-card'
  let dueClass = 'order-card__due'
  let dueLabel = `Entrega en ${days} días`

  // Urgencia de fecha de entrega, en 3 escalones (nunca decorativo, solo
  // estado): vencida o ≤3 días → rojo (misma clase --overdue, ya sea que ya
  // haya pasado o esté a punto); 4-7 días → ámbar (--warning); más de 7,
  // neutro. "Completado"/"cancelada" van antes y ganan siempre.
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
    cardClass += ' order-card--overdue'
    dueClass += ' order-card__due--overdue'
    dueLabel = 'Entrega hoy'
  } else if (days <= 3) {
    cardClass += ' order-card--overdue'
    dueClass += ' order-card__due--overdue'
  } else if (days <= 7) {
    cardClass += ' order-card--warning'
    dueClass += ' order-card__due--warning'
  }

  // Gana sobre cualquier color de urgencia calculado arriba (pero no
  // sobre cancelada/completada, ya excluidas de needsReconfirm) — el
  // texto de la fecha de entrega se queda como estaba, solo cambia el
  // cuadro.
  if (needsReconfirm) {
    cardClass = 'order-card order-card--needs-reconfirm'
  }

  return (
    <article className={cardClass} onClick={() => navigate(`/orden/${order.id}`)} role="button" tabIndex={0}>
      <div className="order-card__top">
        <span className="order-card__number">#{order.order_number}</span>
        {order.cancelled_at ? <span className="badge badge--danger">Cancelada</span> : <StatusBadge status={order.status} />}
      </div>
      <h3 className="order-card__client">{order.client_name}</h3>
      {prendas && <p className="order-card__prendas">{prendas}</p>}
      {needsReconfirm && <p className="order-card__reconfirm-notice">✎ Se modificó después de confirmarse</p>}
      <div className="order-card__meta">
        <TypeBadge type={orderType} />
        <span className={dueClass}>{dueLabel}</span>
      </div>
      <div className="order-card__footer">
        <span>Entrega: {formatDate(order.requested_delivery_date)}</span>
        <span> · Creada: {formatDate(order.created_at)}</span>
      </div>
    </article>
  )
}
