import { useNavigate } from 'react-router-dom'
import { resumenPrendas } from '../../utils/prendas'
import { daysUntil, formatDate } from '../../utils/dates'
import { codigoProductoFrisa, etiquetaSecuencia, secuenciaDeOrden } from '../../utils/frisa'

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
// V178 — `conCambios`: la orden se modificó y fábrica no ha aceptado los
// cambios (quien la pinta decide si a esta estación ya le toca).
export default function EstacionCard({ order, children, conCambios = false }) {
  const navigate = useNavigate()
  const sev = severidad(order)
  const prendas = resumenPrendas(order)
  return (
    <button type="button" className={'estacion-card' + (sev.cls ? ` order-card--${sev.cls}` : '') + (conCambios ? ' estacion-card--cambios' : '')} onClick={() => navigate(`/orden/${order.id}`)}>
      <span className="estacion-card__folio">#{order.order_number}</span>
      <span className="estacion-card__cliente">{order.client_name}</span>
      {order.equipo && <span className="estacion-card__prendas">Equipo: <b>{order.equipo}</b></span>}
      {order.numero_corte && <span className="estacion-card__prendas">Corte: <b>{order.numero_corte}</b></span>}
      {codigoProductoFrisa(order) && (
        <span className="estacion-card__prendas">
          <b>{codigoProductoFrisa(order)}</b> · {etiquetaSecuencia(secuenciaDeOrden(order))}
        </span>
      )}
      {prendas && <span className="estacion-card__prendas">{prendas}</span>}
      {conCambios && <span className="estacion-card__cambios">✎ Se modificó: revisa los cambios</span>}
      {children}
      <span className={'estacion-card__due' + (sev.cls ? ` order-card__due--${sev.cls}` : '')}>
        {sev.label} · {formatDate(order.requested_delivery_date)}
      </span>
    </button>
  )
}
