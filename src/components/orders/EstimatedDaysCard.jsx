import { useState } from 'react'
import { setEstimatedProductionDays } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canSetEstimatedDays } from '../../utils/permissions'

// Fábrica captura/ajusta el tiempo estimado de producción — solo
// mientras la orden sigue "en_confirmacion" (admin no tiene esa
// restricción). Si el rol actual no puede tocarlo, no se muestra nada
// (el dato ya aparece en la tarjeta de Detalles, de solo lectura).
export default function EstimatedDaysCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [days, setDays] = useState(order.estimated_production_days ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!canSetEstimatedDays(role, order)) return null

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: saveError } = await setEstimatedProductionDays(order.id, Number(days))
    setSaving(false)

    if (saveError) {
      setError(saveError)
      return
    }
    onUpdated?.()
  }

  return (
    <form className="order-form" onSubmit={handleSave}>
      <h3 className="section-title section-title--small">Tiempo estimado de producción</h3>
      <div className="status-changer__row">
        <input
          type="number"
          min={1}
          className="input"
          placeholder="Días"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={saving || !days}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}
