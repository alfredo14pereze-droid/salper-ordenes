import { useState } from 'react'
import { cancelOrder, uncancelOrder, getOrderDeleteImpact, softDeleteOrder } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canCancelOrder, canDeleteOrder } from '../../utils/permissions'
import { formatDateTime } from '../../utils/dates'

// Cancelar (y reactivar) una orden es exclusivo de admin_tienda/admin_general
// — no es una etapa más de producción, es una excepción que puede pasar
// desde cualquier etapa, así que va aparte del selector de estado.
// Eliminar (soft-delete, V24) es exclusivo de admin_general: la orden
// nunca se borra físicamente, se marca con eliminada_en y desaparece de
// las vistas normales — ver schema_v24_soft_delete.sql. Antes de
// confirmar, se consulta cuántos registros relacionados existen
// (anticipos, historial, etapas, documentos) para que quede claro que
// esos NO se borran, solo quedan ligados a una orden que ya no aparece
// en el flujo normal.
export default function CancelOrderCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [impact, setImpact] = useState(null)

  const showCancel = canCancelOrder(role) && !order.eliminada_en
  const showDelete = canDeleteOrder(role) && !order.eliminada_en

  if (!showCancel && !showDelete) return null

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

  async function startDeleteConfirm() {
    setError(null)
    setSaving(true)
    const { data, error: impactError } = await getOrderDeleteImpact(order.id)
    setSaving(false)
    if (impactError) {
      setError(impactError)
      return
    }
    setImpact(data)
    setConfirmingDelete(true)
  }

  async function handleDelete() {
    setSaving(true)
    setError(null)
    const { error: deleteError } = await softDeleteOrder(order.id)
    setSaving(false)
    if (deleteError) {
      setError(deleteError)
      return
    }
    onUpdated?.()
  }

  return (
    <div>
      <h3 className="section-title section-title--small">Zona de administrador</h3>

      {showCancel &&
        (order.cancelled_at ? (
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
        ))}

      {showDelete && (
        <div style={{ marginTop: showCancel ? 12 : 0 }}>
          {!confirmingDelete ? (
            <button type="button" className="btn btn--outline" onClick={startDeleteConfirm} disabled={saving}>
              {saving ? 'Consultando…' : 'Eliminar orden'}
            </button>
          ) : (
            <div>
              <p className="form-error">
                Esta orden tiene {impact?.anticipos_count ?? 0} anticipo(s), {impact?.historial_count ?? 0} registro(s)
                de historial y {impact?.etapas_count ?? 0} etapa(s) de producción — ninguno se borra, quedan ligados a
                la orden eliminada.{' '}
                {(impact?.tiene_cotizacion || impact?.tiene_orden_compra || impact?.tiene_factura) &&
                  'También tiene documentos subidos (cotización/orden de compra/factura) que se conservan.'}{' '}
                La orden dejará de aparecer en Dashboard/Resumen/Calendario y ningún rol podrá volver a editarla.
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {saving ? 'Eliminando…' : '¿Seguro? Confirmar eliminación'}
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
