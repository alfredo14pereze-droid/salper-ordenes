import { useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useOrderTypes } from '../hooks/useOrderTypes'
import OrderCard from '../components/orders/OrderCard'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// Órdenes ya completadas — nunca se borran, solo se sacan de "Todas las
// órdenes" del Dashboard (ver DashboardPage.jsx) para que no se mezclen
// con lo que sigue en proceso. Aquí sigue estando toda la información:
// prendas, fotos, documentos, historial, PDF — nada cambia salvo dónde se
// ven.
export default function PastOrdersPage() {
  const { orders, loading, error, refresh } = useOrders()
  const { typesByKey, orderTypes } = useOrderTypes()
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  const pastOrders = useMemo(() => orders.filter((o) => o.status === 'completado'), [orders])

  const filteredOrders = useMemo(() => {
    return pastOrders
      .filter((order) => {
        if (typeFilter && order.order_type_key !== typeFilter) return false
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          const matches =
            order.order_number.toLowerCase().includes(q) || order.client_name.toLowerCase().includes(q)
          if (!matches) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [pastOrders, typeFilter, search])

  if (loading) return <Loading label="Cargando órdenes pasadas…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Órdenes pasadas</h2>
        <span className="section-count">{filteredOrders.length} de {pastOrders.length}</span>
      </div>
      <p className="page-subtitle">Órdenes ya completadas — se archivan aquí, nunca se borran.</p>

      <div className="order-filters">
        <div className="order-filters__group">
          <span className="order-filters__label">Tipo</span>
          <div className="order-filters__chips">
            {orderTypes.map((type) => (
              <button
                key={type.key}
                type="button"
                className={'chip' + (typeFilter === type.key ? ' chip--active' : '')}
                onClick={() => setTypeFilter((current) => (current === type.key ? '' : type.key))}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div className="order-filters__group">
          <span className="order-filters__label">Buscar</span>
          <input
            type="text"
            className="input"
            placeholder="Número de orden o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState>
          {pastOrders.length === 0 ? 'Todavía no hay órdenes completadas.' : 'No hay órdenes que coincidan con estos filtros.'}
        </EmptyState>
      ) : (
        <div className="order-grid">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} orderType={typesByKey[order.order_type_key]} />
          ))}
        </div>
      )}
    </div>
  )
}
