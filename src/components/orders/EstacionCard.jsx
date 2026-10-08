import { useNavigate } from 'react-router-dom'
import { resumenPrendas } from '../../utils/prendas'
import { daysUntil, formatDate } from '../../utils/dates'

// Mismos colores de urgencia que OrderCard.jsx (clases order-card--*).
function severidad(order) {
  const days = daysUntil(order.requested_delivery_date)
  if (days <= 0) return { cls: 'overdue', label: days < 0 ? `Atrasada ${Math.abs(days)} d` : 'Entrega hoy' }
  if (days <= 3) return { cls: 'overdue', label: `Entrega en ${days} días` }
  if (days <= 7) return { cls: 'warning', label: `Entrega en ${days} días` }
  return { cls: null, label: `Entrega en ${days} días` }
}

// Tarjeta de una orden en la lista de una estación. `children` va entre
// las prendas y la fecha (el dashboard de sublimado pone ahí sus chips).
export default function EstacionCard({ order, children }) {
  const navigate = useNavigate()
  const sev = severidad(order)
  const prendas = resumenPrendas(order)
  return (
    <button type="button" className={'estacion-card' + (sev.cls ? ` order-card--${sev.cls}` : '')} onClick={() => navigate(`/orden/${order.id}`)}>
      <span className="estacion-card__folio">#{order.order_number}</span>
      <span className="estacion-card__cliente">{order.client_name}</span>
      {order.numero_corte && <span className="estacion-card__prendas">Corte: <b>{order.numero_corte}</b></span>}
      {prendas && <span className="estacion-card__prendas">{prendas}</span>}
      {children}
      <span className={'estacion-card__due' + (sev.cls ? ` order-card__due--${sev.cls}` : '')}>
        {sev.label} · {formatDate(order.requested_delivery_date)}
      </span>
    </button>
  )
}
