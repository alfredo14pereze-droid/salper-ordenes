import { useState } from 'react'
import { cancelOrder, uncancelOrder } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canCancelOrder } from '../../utils/permissions'
import { formatDateTime } from '../../utils/dates'

// Cancelar (y reactivar) una orden es exclusivo de admin — no es una
// etapa más de producción, es una excepción que puede pasar desde
// cualquier etapa, así que va aparte del selector de estado.
export default function CancelOrderCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!canCancelOrder(role)) return null

  async function handleCancel() {
    if (!confirm(`¿Cancelar la orden #${order.order_number}? Esto no se puede deshacer desde aquí sin reactivarla.`)) return
    setSaving(true)
    setError(null)
    const { error: cancelError } = await cancelOrder(order.id)
    setSaving(false)
    if (cancelError) {
      setError(cancelError)
      return
    }
    onUpdated?.()
  }

  async function handleUncancel() {
    setSaving(true)
    setError(null)
    const { error: uncancelError } = await uncancelOrder(order.id)
    setSaving(false)
    if (uncancelError) {
      setError(uncancelError)
      return
    }
    onUpdated?.()
  }

  return (
    <div>
      <h3 className="section-title section-title--small">Zona de administrador</h3>
      {order.cancelled_at ? (
        <>
          <p className="pantone-hint">Esta orden está cancelada desde el {formatDateTime(order.cancelled_at)}.</p>
          <button type="button" className="btn btn--outline" onClick={handleUncancel} disabled={saving}>
            {saving ? 'Reactivando…' : 'Reactivar orden'}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn--outline" onClick={handleCancel} disabled={saving}>
          {saving ? 'Cancelando…' : 'Cancelar orden'}
        </button>
      )}
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
