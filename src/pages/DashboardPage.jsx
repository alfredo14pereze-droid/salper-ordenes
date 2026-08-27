import { useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { isActiveStatus } from '../utils/status'
import OrderCard from '../components/orders/OrderCard'
import OrderFilters from '../components/orders/OrderFilters'
import UpcomingOrders from '../components/orders/UpcomingOrders'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

const emptyFilters = { types: [], statuses: [], search: '' }

export default function DashboardPage() {
  const { orders, loading, error, refresh } = useOrders()
  const { typesByKey, orderTypes } = useOrderTypes()
  const [filters, setFilters] = useState(emptyFilters)

  const activeOrders = useMemo(() => orders.filter((o) => isActiveStatus(o.status)), [orders])

  const upcoming = useMemo(
    () => [...activeOrders].sort((a, b) => new Date(a.requested_delivery_date) - new Date(b.requested_delivery_date)),
    [activeOrders]
  )

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (filters.types.length > 0 && !filters.types.includes(order.order_type_key)) return false
      if (filters.statuses.length > 0 && !filters.statuses.includes(order.status)) return false
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase()
        const matches =
          order.order_number.toLowerCase().includes(q) || order.client_name.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [orders, filters])

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <UpcomingOrders orders={upcoming} typesByKey={typesByKey} />

      <section className="dashboard-all-orders">
        <div className="section-header">
          <h2 className="section-title">Todas las órdenes</h2>
          <span className="section-count">{filteredOrders.length} de {orders.length}</span>
        </div>

        <OrderFilters orderTypes={orderTypes} filters={filters} onChange={setFilters} />

        {filteredOrders.length === 0 ? (
          <EmptyState>No hay órdenes que coincidan con estos filtros.</EmptyState>
        ) : (
          <div className="order-grid">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} orderType={typesByKey[order.order_type_key]} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
