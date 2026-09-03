import { useNavigate } from 'react-router-dom'
import PedidoEstadoBadge from './PedidoEstadoBadge'
import { formatDate } from '../../utils/dates'

// Mismo patrón visual que OrderCard.jsx, para la lista de Pedidos a
// Proveedor.
export default function PedidoTiendaCard({ pedido }) {
  const navigate = useNavigate()

  return (
    <article
      className="order-card"
      onClick={() => navigate(`/pedidos-proveedor/${pedido.id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="order-card__top">
        <span className="order-card__number">{pedido.proveedor}</span>
        <PedidoEstadoBadge estado={pedido.estado} />
      </div>
      <h3 className="order-card__client">Pidió: {pedido.pedido_por}</h3>
      <div className="order-card__footer">
        <span>Pedido: {formatDate(pedido.fecha_pedido)}</span>
        {pedido.fecha_recepcion && <span> · Recibido: {formatDate(pedido.fecha_recepcion)}</span>}
      </div>
    </article>
  )
}
