import { useState } from 'react'
import { resolverNotaOrden, setOrderNotasInternas } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { formatDateTime } from '../../utils/dates'
import { canManageOrderNotes, canResolverNotas } from '../../utils/permissions'

// V51 — bitácora interna de la orden: comunicación entre áreas que NUNCA
// sale en el PDF de cliente ni en el interno (generateOrderPdf.jsx ni
// OrderConfirmationPdf.jsx la referencian) — pedido explícito del
// usuario. Mismo patrón resumen+Editar que OrderDetailsCard/
// OrderItemsCard: de solo lectura por default, un botón "Editar" abre el
// textarea. Visible para cualquiera con sesión (hasta 'lectura', que ve
// todo el sistema); solo puede escribir quien pase canManageOrderNotes
// (cualquier rol menos 'lectura' — es una bitácora de comunicación, no
// un dato de la orden que necesite el candado de canEditOrder).
export default function OrderNotesCard({ order, onUpdated }) {
  const { role } = useAuth()
  const editable = canManageOrderNotes(role) && !order.eliminada_en
  const puedeResolver = canResolverNotas(role) && !order.eliminada_en
  const resuelta = !!order.nota_resuelta_en
  const [resolviendo, setResolviendo] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notas, setNotas] = useState(order.notas_internas || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startEditing() {
    setNotas(order.notas_internas || '')
    setError(null)
    setEditing(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: saveError } = await setOrderNotasInternas(order.id, notas.trim())
    setSaving(false)

    if (saveError) {
      setError(saveError)
      return
    }
    setEditing(false)
    onUpdated?.()
  }

  // V130 — Resolver / Reabrir.
  async function handleResolver(resolver) {
    setResolviendo(true)
    setError(null)
    const { error: resError } = await resolverNotaOrden(order.id, resolver)
    setResolviendo(false)
    if (resError) {
      setError(resError)
      return
    }
    onUpdated?.()
  }

  if (editing) {
    return (
      <form className="order-form" onSubmit={handleSave}>
        <h3 className="section-title section-title--small">Notas internas</h3>
        <p className="pantone-hint">Esto no lo ve el cliente — es solo para comunicación entre áreas.</p>
        <textarea
          className="input"
          rows={4}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder='Ej. "Cliente pidió que se apure", "confirmar entrega por WhatsApp"…'
          autoFocus
        />
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Notas internas
        </h3>
        {editable && (
          <button type="button" className="btn btn--ghost" onClick={startEditing}>
            {order.notas_internas ? 'Editar' : '+ Agregar nota'}
          </button>
        )}
      </div>
      <p className="pantone-hint" style={{ marginBottom: 8 }}>
        Esto no lo ve el cliente — es solo para comunicación entre áreas.
      </p>
      {order.notas_internas ? (
        <>
          <p
            style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14 }}
            className={resuelta ? 'nota-resuelta__texto' : undefined}
          >
            {order.notas_internas}
          </p>
          {resuelta ? (
            <p className="nota-resuelta__estado">
              ✓ Resuelta{order.nota_resuelta_por_nombre ? ` por ${order.nota_resuelta_por_nombre}` : ''} · {formatDateTime(order.nota_resuelta_en)}
              {puedeResolver && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleResolver(false)} disabled={resolviendo}>
                  Reabrir
                </button>
              )}
            </p>
          ) : (
            puedeResolver && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn--secondary btn--small" onClick={() => handleResolver(true)} disabled={resolviendo}>
                  {resolviendo ? 'Guardando…' : '✓ Resolver'}
                </button>
              </div>
            )
          )}
          {error && <p className="form-error">{error.message}</p>}
        </>
      ) : (
        <p className="pantone-hint">Sin notas todavía.</p>
      )}
    </>
  )
}
