import { useState } from 'react'
import { STATUSES } from '../../lib/constants'
import { updateOrderStatus } from '../../services/ordersService'
import { useEntregarOrden } from '../../hooks/useEntregarOrden'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeStatus, canCompleteOrder, canConfirmOrder, canDeliverOrder } from '../../utils/permissions'

// Desde V23 (etapas paralelas) esta tarjeta se angostó a los dos
// "bookends" de todo el pedido — confirmar un pedido nuevo y marcar la
// orden como completada. El avance normal por etapa (corte, sublimado,
// producción, bordado, terminado) vive en OrderEtapasCard, no aquí.
// Qué puede hacer este rol en la tarjeta de estado. En "Lista para entregar"
// la entrega ya no vive aquí: tiene su propio botón grande (EntregaRapida).
function accionesDeEstado(role, order) {
  if (!canChangeStatus(role)) return null
  // Una orden cancelada solo la puede reactivar admin_general (el servidor ya
  // lo valida; esto solo evita mostrar un botón que va a fallar).
  if (order.cancelled_at && role !== 'admin_general') return null
  const canConfirm = canConfirmOrder(role) && order.status === 'en_confirmacion'
  const canComplete = canDeliverOrder(role) && order.status !== 'completado' && order.status !== 'terminado'
  const canOverride = canCompleteOrder(role) // admin_fabrica/admin_general: corrección manual
  if (!canConfirm && !canComplete && !canOverride) return null
  return { canConfirm, canComplete, canOverride }
}

export function tieneAccionesDeEstado(role, order) {
  return !!accionesDeEstado(role, order)
}

export default function StatusChanger({ order, onUpdated }) {
  const { role } = useAuth()
  const [overrideStatus, setOverrideStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const entrega = useEntregarOrden(order, onUpdated)

  const acciones = accionesDeEstado(role, order)
  if (!acciones) return null
  const { canConfirm, canComplete, canOverride } = acciones

  async function handleChange(newStatus) {
    setSaving(true)
    setError(null)
    const { error: updateError } = await updateOrderStatus(order.id, newStatus, null)
    setSaving(false)

    if (updateError) {
      setError(updateError)
      return
    }
    onUpdated?.()
  }

  return (
    <div className="status-changer">
      <h3 className="section-title section-title--small">Estado de la orden</h3>
      <div className="status-changer__row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {canConfirm && (
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => handleChange('confirmado')}>
            {saving ? 'Guardando…' : 'Confirmar pedido'}
          </button>
        )}
        {canComplete && (
          <button type="button" className="btn btn--primary" disabled={entrega.saving} onClick={entrega.entregar}>
            {entrega.saving ? 'Guardando…' : 'Confirmar entrega al cliente'}
          </button>
        )}
      </div>

      {entrega.bloqueo && (
        <div className="entrega-forzar">
          <p className="fin-missing" style={{ marginTop: 0 }}>{entrega.bloqueo}</p>
          <label className="entrega-forzar__motivo">
            Si de todos modos ya se entregó, escribe el motivo (queda registrado con tu nombre):
            <textarea
              className="input"
              rows={2}
              value={entrega.motivo}
              onChange={(e) => entrega.setMotivo(e.target.value)}
              placeholder="Ej. El cliente pagó en efectivo; el precio se captura después."
            />
          </label>
          <div className="status-changer__row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" disabled={entrega.saving || entrega.motivo.trim().length < 5} onClick={entrega.forzar}>
              {entrega.saving ? 'Guardando…' : 'Entregar de todos modos'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={entrega.saving} onClick={entrega.cancelarBloqueo}>
              Cancelar
            </button>
          </div>
        </div>
      )}

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
      {entrega.error && <p className="form-error">{entrega.error.message}</p>}
    </div>
  )
}
