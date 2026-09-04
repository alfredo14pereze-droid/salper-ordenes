import { useState } from 'react'
import { STATUSES } from '../../lib/constants'
import { updateOrderStatus } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeStatus, canCompleteOrder, canConfirmOrder } from '../../utils/permissions'

// Desde V23 (etapas paralelas) esta tarjeta se angostó a los dos
// "bookends" de todo el pedido — confirmar un pedido nuevo y marcar la
// orden como completada. El avance normal por etapa (corte, sublimado,
// producción, bordado, terminado) vive en OrderEtapasCard, no aquí.
export default function StatusChanger({ order, onUpdated }) {
  const { role } = useAuth()
  const [notes, setNotes] = useState('')
  const [overrideStatus, setOverrideStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // tienda no cambia estados; y aunque fábrica/admin_fabrica pueden, una
  // orden cancelada solo la puede reactivar admin_general (el servidor ya
  // lo valida — esto solo evita mostrar un botón que va a fallar).
  if (!canChangeStatus(role)) return null
  if (order.cancelled_at && role !== 'admin_general') return null

  const canConfirm = canConfirmOrder(role) && order.status === 'en_confirmacion'
  const canComplete = canCompleteOrder(role) && order.status !== 'completado'
  const canOverride = canCompleteOrder(role) // admin_fabrica/admin_general: corrección manual

  if (!canConfirm && !canComplete && !canOverride) return null

  async function handleChange(newStatus) {
    setSaving(true)
    setError(null)
    const { error: updateError } = await updateOrderStatus(order.id, newStatus, notes.trim() || null)
    setSaving(false)

    if (updateError) {
      setError(updateError)
      return
    }
    setNotes('')
    onUpdated?.()
  }

  return (
    <div className="status-changer">
      <h3 className="section-title section-title--small">Estado de la orden</h3>

      <textarea
        className="input"
        placeholder="Nota opcional sobre este cambio…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />

      <div className="status-changer__row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {canConfirm && (
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => handleChange('confirmado')}>
            {saving ? 'Guardando…' : 'Confirmar pedido'}
          </button>
        )}
        {canComplete && (
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => handleChange('completado')}>
            {saving ? 'Guardando…' : 'Marcar como completada'}
          </button>
        )}
      </div>

      {canOverride && (
        <div className="status-changer__row" style={{ marginTop: 8 }}>
          <select className="input" value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving || overrideStatus === order.status}
            onClick={() => handleChange(overrideStatus)}
          >
            Corregir estado manualmente
          </button>
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
