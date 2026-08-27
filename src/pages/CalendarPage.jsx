import { useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useOrderTypes } from '../hooks/useOrderTypes'
import ProductionCalendar from '../components/calendar/ProductionCalendar'
import { Loading, ErrorState } from '../components/common/States'
import { isActiveStatus } from '../utils/status'

export default function CalendarPage() {
  const { orders, loading, error, refresh } = useOrders()
  const { typesByKey } = useOrderTypes()
  const [showCompleted, setShowCompleted] = useState(false)

  const visibleOrders = useMemo(
    () => (showCompleted ? orders : orders.filter((o) => isActiveStatus(o.status))),
    [orders, showCompleted]
  )

  if (loading) return <Loading label="Cargando calendario…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Calendario de producción</h2>
        <label className="checkbox-label">
          <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
          Incluir completadas
        </label>
      </div>
      <ProductionCalendar orders={visibleOrders} typesByKey={typesByKey} />
    </div>
  )
}
