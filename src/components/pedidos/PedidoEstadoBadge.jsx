import { PEDIDO_TIENDA_ESTADOS } from '../../lib/constants'

// Mismo patrón que StatusBadge.jsx (órdenes de producción), pero para los
// 4 estados de Pedidos a Proveedor — misma paleta ya aprobada, ver
// PEDIDO_TIENDA_ESTADOS en constants.js.
export default function PedidoEstadoBadge({ estado }) {
  const e = PEDIDO_TIENDA_ESTADOS.find((x) => x.key === estado) || PEDIDO_TIENDA_ESTADOS[0]

  return (
    <span className="badge badge--status" style={{ background: e.color, color: e.textColor }}>
      {e.label}
    </span>
  )
}
