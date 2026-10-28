import { useState } from 'react'
import { STATUSES } from '../../lib/constants'
import { entregarOrden, updateOrderStatus } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canChangeStatus, canCompleteOrder, canConfirmOrder, canDeliverOrder, canForceDelivery } from '../../utils/permissions'

// Desde V23 (etapas paralelas) esta tarjeta se angostó a los dos
// "bookends" de todo el pedido — confirmar un pedido nuevo y marcar la
// orden como completada. El avance normal por etapa (corte, sublimado,
// producción, bordado, terminado) vive en OrderEtapasCard, no aquí.
export default function StatusChanger({ order, onUpdated }) {
  const { role } = useAuth()
  const [overrideStatus, setOverrideStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // V160 — la entrega se bloqueó (falta precio/factura): quien tenga permiso
  // puede entregar de todos modos con un motivo, que queda registrado.
  const [bloqueo, setBloqueo] = useState(null)
  const [motivo, setMotivo] = useState('')

  // tienda no cambia estados; y aunque fábrica/admin_fabrica pueden, una
  // orden cancelada solo la puede reactivar admin_general (el servidor ya
  // lo valida — esto solo evita mostrar un botón que va a fallar).
  if (!canChangeStatus(role)) return null
  if (order.cancelled_at && role !== 'admin_general') return null

  const canConfirm = canConfirmOrder(role) && order.status === 'en_confirmacion'
  const canComplete = canDeliverOrder(role) && order.status !== 'completado'
  const canOverride = canCompleteOrder(role) // admin_fabrica/admin_general: corrección manual

  if (!canConfirm && !canComplete && !canOverride) return null

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

  // Entregada = la orden se cierra y pasa a Órdenes pasadas. Se pide confirmar
  // para que nadie la cierre por accidente.
  async function handleDeliver() {
    if (!window.confirm('¿Confirmas que esta orden ya se entregó al cliente? Pasará a Órdenes pasadas.')) return
    setSaving(true)
    setError(null)
    setBloqueo(null)
    const { error: entregaError } = await entregarOrden(order.id)
    setSaving(false)
    if (entregaError) {
      // Bloqueo por requisitos (precio/factura): se ofrece entregar de todos modos.
      if (/^No se puede marcar como entregada/.test(entregaError.message) && canForceDelivery(role)) {
        setBloqueo(entregaError.message)
        setMotivo('')
      } else {
        setError(entregaError)
      }
      return
    }
    onUpdated?.()
  }

  async function handleForzar() {
    if (motivo.trim().length < 5) {
      setError(new Error('Escribe el motivo para entregar de todos modos.'))
      return
    }
    setSaving(true)
    setError(null)
    const { error: entregaError } = await entregarOrden(order.id, { forzar: true, motivo: motivo.trim() })
    setSaving(false)
    if (entregaError) {
      setError(entregaError)
      return
    }
    setBloqueo(null)
    onUpdated?.()
  }

  return (
    <div className="status-changer">
      <h3 className="section-title section-title--small">Estado de la orden</h3>
      {order.status === 'terminado' && (
        <p className="ready-note">
          ✓ Lista para entregar. Cuando se entregue al cliente, confirma la entrega para cerrarla.
        </p>
      )}

      <div className="status-changer__row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {canConfirm && (
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => handleChange('confirmado')}>
            {saving ? 'Guardando…' : 'Confirmar pedido'}
          </button>
        )}
        {canComplete && (
          <button type="button" className="btn btn--primary" disabled={saving} onClick={handleDeliver}>
            {saving ? 'Guardando…' : 'Confirmar entrega al cliente'}
          </button>
        )}
      </div>

      {bloqueo && (
        <div className="entrega-forzar">
          <p className="fin-missing" style={{ marginTop: 0 }}>{bloqueo}</p>
          <label className="entrega-forzar__motivo">
            Si de todos modos ya se entregó, escribe el motivo (queda registrado con tu nombre):
            <textarea
              className="input"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. El cliente pagó en efectivo; el precio se captura después."
            />
          </label>
          <div className="status-changer__row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" disabled={saving || motivo.trim().length < 5} onClick={handleForzar}>
              {saving ? 'Guardando…' : 'Entregar de todos modos'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setBloqueo(null)}>
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
    </div>
  )
}
