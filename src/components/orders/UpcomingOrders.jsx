import OrderCard from './OrderCard'
import { EmptyState } from '../common/States'

// "Próximas a surtir": las N órdenes activas ordenadas por fecha de entrega
// más cercana. Vive como sección destacada arriba del dashboard.
export default function UpcomingOrders({ orders, typesByKey, limit = 5 }) {
  const upcoming = orders.slice(0, limit)

  return (
    <section className="upcoming-orders">
      <h2 className="section-title">Próximas a surtir</h2>
      {upcoming.length === 0 ? (
        <EmptyState>No hay órdenes activas pendientes de entrega.</EmptyState>
      ) : (
        <div className="order-grid order-grid--scroll">
          {upcoming.map((order) => (
            <OrderCard key={order.id} order={order} orderType={typesByKey[order.order_type_key]} />
          ))}
        </div>
      )}
    </section>
  )
}
