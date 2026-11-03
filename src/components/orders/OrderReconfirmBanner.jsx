import { useState } from 'react'
import { confirmOrderChanges } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canConfirmOrderChanges } from '../../utils/permissions'
import { formatDateTime } from '../../utils/dates'
import { cambiosPendientes } from '../../utils/cambiosOrden'
import CambioDetalle from './CambioDetalle'

// V38: se muestra en una orden que YA fue confirmada y después se le editó
// algo (order.pending_reconfirmation_at, marcado por update_order_details/
// set_order_items). Visible para cualquiera con sesión; el botón es de
// fábrica (canConfirmOrderChanges). El cuadro azul de las tarjetas
// (OrderCard.jsx) es la señal rápida; esto es el detalle + la acción.
// V178: muestra QUÉ cambió, quién y cuándo (orden_cambios). Al aceptar, la
// base deja los cambios como aceptados por quien pulsó el botón.
// `cambios` viene de useOrdenCambios; si la orden se modificó antes de V178
// no hay detalle y se ve el aviso de antes.
export default function OrderReconfirmBanner({ order, cambios = [], tiposPorClave, onUpdated }) {
  const { role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  if (!order.pending_reconfirmation_at) return null

  const canConfirm = canConfirmOrderChanges(role)
  const pendientes = cambiosPendientes(cambios)

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
    <div className="reconfirm-banner reconfirm-banner--cambios">
      <div className="reconfirm-banner__cuerpo">
        <p className="reconfirm-banner__title">
          ✎ Esta orden se modificó después de haber sido confirmada
          {pendientes.length > 1 && ` (${pendientes.length} cambios)`}
        </p>
        {pendientes.length > 0 ? (
          pendientes.map((c) => <CambioDetalle key={c.id} cambio={c} tiposPorClave={tiposPorClave} />)
        ) : (
          <p className="reconfirm-banner__hint">Cambio del {formatDateTime(order.pending_reconfirmation_at)} (de antes de que se guardara el detalle).</p>
        )}
        <p className="reconfirm-banner__hint">
          {canConfirm
            ? 'Revisa los cambios; si todo está bien, acéptalos para que se quite el aviso.'
            : 'Fábrica todavía no acepta estos cambios.'}
        </p>
        {error && <p className="form-error">{error.message}</p>}
      </div>
      {canConfirm && (
        <button type="button" className="btn btn--primary btn--small" onClick={handleConfirm} disabled={saving}>
          {saving ? 'Aceptando…' : '✓ Aceptar cambios'}
        </button>
      )}
    </div>
  )
}
