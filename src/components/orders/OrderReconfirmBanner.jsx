import { useState } from 'react'
import { confirmOrderChanges } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canConfirmOrderChanges } from '../../utils/permissions'
import { formatDateTime } from '../../utils/dates'

// V38: se muestra en el detalle de una orden que YA fue confirmada y
// después se le editó algo (ver order.pending_reconfirmation_at,
// marcado por update_order_details/set_order_items). Visible para
// cualquiera con sesión (para que tienda sepa que fábrica todavía no
// revisó su cambio) — el botón para apagarlo es exclusivo de fábrica
// (mismo criterio que confirmar una orden nueva, ver
// canConfirmOrderChanges). El cuadro azul en las tarjetas del Dashboard
// (OrderCard.jsx) es la señal rápida; esto es el detalle + la acción.
export default function OrderReconfirmBanner({ order, onUpdated }) {
  const { role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!order.pending_reconfirmation_at) return null

  const canConfirm = canConfirmOrderChanges(role)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const { error: confirmError } = await confirmOrderChanges(order.id)
    setSaving(false)
    if (confirmError) {
      setError(confirmError)
      return
    }
    onUpdated?.()
  }

  return (
    <div className="reconfirm-banner">
      <div>
        <p className="reconfirm-banner__title">✎ Esta orden se modificó después de haber sido confirmada</p>
        <p className="reconfirm-banner__hint">
          {canConfirm
            ? 'Revisa los datos y prendas de abajo — si todo está bien, confirma los cambios para que se quite el aviso.'
            : `Fábrica todavía no revisó este cambio (${formatDateTime(order.pending_reconfirmation_at)}).`}
        </p>
        {error && <p className="form-error">{error.message}</p>}
      </div>
      {canConfirm && (
        <button type="button" className="btn btn--primary btn--small" onClick={handleConfirm} disabled={saving}>
          {saving ? 'Confirmando…' : 'Confirmar cambios'}
        </button>
      )}
    </div>
  )
}
