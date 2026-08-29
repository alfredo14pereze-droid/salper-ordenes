import { useState } from 'react'
import OrderSheetEditor from './OrderSheetEditor'
import { setOrderSheet } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrder } from '../../utils/permissions'
import { emptyOrderSheet } from '../../lib/constants'

// Hoja de orden de una orden ya creada — los mismos datos exactos de la
// hoja física de taller, editables con las mismas reglas que las prendas
// (tienda/admin, ver canEditOrder). Alimenta el PDF de confirmación.
export default function OrderSheetCard({ order, onUpdated }) {
  const { role } = useAuth()
  const readOnly = !canEditOrder(role, order)
  const [sheet, setSheet] = useState({
    ...emptyOrderSheet(),
    ...order.order_sheet,
    sections: {
      playera: { ...emptyOrderSheet().sections.playera, ...order.order_sheet?.sections?.playera },
      short: { ...emptyOrderSheet().sections.short, ...order.order_sheet?.sections?.short },
    },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: saveError } = await setOrderSheet(order.id, sheet)
    setSaving(false)

    if (saveError) {
      setError(saveError)
      return
    }
    setSaved(true)
    onUpdated?.()
  }

  return (
    <div>
      <h3 className="section-title section-title--small">Hoja de orden de taller</h3>

      <fieldset disabled={readOnly} className="items-editor-fieldset">
        <OrderSheetEditor sheet={sheet} onChange={setSheet} defaultExpanded />
      </fieldset>

      {error && <p className="form-error">{error.message}</p>}
      {saved && <p className="template-hint">✓ Hoja de orden guardada.</p>}

      {!readOnly && (
        <div className="order-form__actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar hoja de orden'}
          </button>
        </div>
      )}
    </div>
  )
}
