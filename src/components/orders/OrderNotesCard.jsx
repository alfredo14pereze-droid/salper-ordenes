import { useState } from 'react'
import { setOrderNotasInternas } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canManageOrderNotes } from '../../utils/permissions'

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
        <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 14 }}>{order.notas_internas}</p>
      ) : (
        <p className="pantone-hint">Sin notas todavía.</p>
      )}
    </>
  )
}
