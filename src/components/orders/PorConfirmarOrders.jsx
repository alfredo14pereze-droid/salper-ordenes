import OrderCard from './OrderCard'

// Órdenes "Por confirmar" (en_confirmacion) hasta arriba del
// Dashboard de admin_fabrica, para que no se le pasen. Todas (sin límite),
// la de entrega más cercana primero. Sin pendientes, solo una línea verde.
export default function PorConfirmarOrders({ orders, typesByKey, onUpdated }) {
  const pendientes = orders
    .filter((o) => o.status === 'en_confirmacion' && !o.cancelled_at && !o.eliminada_en)
    .sort((a, b) => new Date(a.requested_delivery_date || 0) - new Date(b.requested_delivery_date || 0))

  if (pendientes.length === 0) {
    return <p className="por-confirmar__vacio">✓ No hay órdenes por confirmar.</p>
  }

  const n = pendientes.length
  return (
    <section className="por-confirmar">
      <h2 className="section-title por-confirmar__titulo">
        Por confirmar <span className="por-confirmar__n">{n}</span>
      </h2>
      <p className="por-confirmar__ayuda">
        {n === 1 ? 'Esta orden espera' : 'Estas órdenes esperan'} que fábrica {n === 1 ? 'la' : 'las'} confirme. La de entrega más cercana va primero.
      </p>
      <div className="order-grid order-grid--scroll">
        {pendientes.map((order) => (
          <OrderCard key={order.id} order={order} orderType={typesByKey[order.order_type_key]} onUpdated={onUpdated} />
        ))}
      </div>
    </section>
  )
}
