import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { isActiveStatus, matchesStatusGroups } from '../utils/status'
import { STATUS_GROUPS } from '../lib/constants'
import OrderCard from '../components/orders/OrderCard'
import OrderFilters from '../components/orders/OrderFilters'
import UpcomingOrders from '../components/orders/UpcomingOrders'
import AnnouncementBanner from '../components/announcements/AnnouncementBanner'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

const emptyFilters = { types: [], statuses: [], search: '' }

// Grupos de filtro para el Dashboard: sin "Completado" — esas órdenes ya
// no viven aquí, viven en /pasadas (ver PastOrdersPage.jsx). Filtrar por
// "Completado" en este tablero siempre daría cero resultados, así que ni
// se ofrece como chip.
const DASHBOARD_STATUS_GROUPS = STATUS_GROUPS.filter((g) => g.key !== 'completado')

export default function DashboardPage() {
  const { orders, loading, error, refresh } = useOrders()
  const { typesByKey, orderTypes } = useOrderTypes()
  const [filters, setFilters] = useState(emptyFilters)

  const activeOrders = useMemo(
    () => orders.filter((o) => isActiveStatus(o.status) && !o.cancelled_at),
    [orders]
  )

  const upcoming = useMemo(
    () => [...activeOrders].sort((a, b) => new Date(a.requested_delivery_date) - new Date(b.requested_delivery_date)),
    [activeOrders]
  )

  // Las completadas se van a "Órdenes pasadas" (no se borran, solo dejan
  // de mezclarse aquí con lo que sigue en proceso).
  const currentOrders = useMemo(() => orders.filter((o) => o.status !== 'completado'), [orders])
  const completedCount = orders.length - currentOrders.length

  const filteredOrders = useMemo(() => {
    return currentOrders.filter((order) => {
      if (filters.types.length > 0 && !filters.types.includes(order.order_type_key)) return false
      if (!matchesStatusGroups(order.status, filters.statuses)) return false
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase()
        const matches =
          order.order_number.toLowerCase().includes(q) || order.client_name.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [currentOrders, filters])

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <AnnouncementBanner />

      <UpcomingOrders orders={upcoming} typesByKey={typesByKey} />

      <section className="dashboard-all-orders">
        <div className="section-header">
          <h2 className="section-title">Todas las órdenes</h2>
          <span className="section-count">{filteredOrders.length} de {currentOrders.length}</span>
        </div>

        <OrderFilters orderTypes={orderTypes} filters={filters} onChange={setFilters} statuses={DASHBOARD_STATUS_GROUPS} />

        {completedCount > 0 && (
          <p className="page-subtitle" style={{ marginTop: -8 }}>
            {completedCount} orden{completedCount === 1 ? '' : 'es'} completada{completedCount === 1 ? '' : 's'} — están
            en <Link to="/pasadas">Órdenes pasadas</Link>.
          </p>
        )}

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
