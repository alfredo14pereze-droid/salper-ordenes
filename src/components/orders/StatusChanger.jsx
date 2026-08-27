import { useState } from 'react'
import { STATUSES } from '../../lib/constants'
import { updateOrderStatus } from '../../services/ordersService'

export default function StatusChanger({ order, onUpdated }) {
  const [nextStatus, setNextStatus] = useState(order.status)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (nextStatus === order.status && !notes.trim()) return

    setSaving(true)
    setError(null)
    const { error: updateError } = await updateOrderStatus(order.id, nextStatus, notes.trim() || null)
    setSaving(false)

    if (updateError) {
      setError(updateError)
      return
    }
    setNotes('')
    onUpdated?.()
  }

  return (
    <form className="status-changer" onSubmit={handleSubmit}>
      <h3 className="section-title section-title--small">Cambiar estado</h3>
      <div className="status-changer__row">
        <select className="input" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Actualizar estado'}
        </button>
      </div>
      <textarea
        className="input"
        placeholder="Nota opcional sobre este cambio…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}
