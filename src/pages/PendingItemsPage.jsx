import { useMemo, useState } from 'react'
import { usePendingItems } from '../hooks/usePendingItems'
import { updatePendingItemStatus } from '../services/pendingItemsService'
import PendingItemCard from '../components/pending/PendingItemCard'
import PendingItemForm from '../components/pending/PendingItemForm'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

export default function PendingItemsPage() {
  const { items, loading, error, refresh } = usePendingItems()
  const [showResolved, setShowResolved] = useState(false)

  const visibleItems = useMemo(
    () => (showResolved ? items : items.filter((i) => i.status === 'pendiente')),
    [items, showResolved]
  )

  async function handleToggle(item) {
    const nextStatus = item.status === 'resuelto' ? 'pendiente' : 'resuelto'
    await updatePendingItemStatus(item.id, nextStatus)
    refresh()
  }

  if (loading) return <Loading label="Cargando pendientes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <div className="section-header">
        <h2 className="section-title">Pendientes</h2>
        <label className="checkbox-label">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Incluir resueltos
        </label>
      </div>
      <p className="page-subtitle">
        Cosas fuera del flujo de órdenes: reparaciones externas, trámites, compras, etc.
      </p>

      <PendingItemForm onCreated={refresh} />

      {visibleItems.length === 0 ? (
        <EmptyState>No hay pendientes {showResolved ? '' : 'abiertos'}.</EmptyState>
      ) : (
        <div className="pending-list">
          {visibleItems.map((item) => (
            <PendingItemCard key={item.id} item={item} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  )
}
