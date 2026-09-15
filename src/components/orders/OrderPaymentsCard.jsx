import { useCallback, useEffect, useState } from 'react'
import { fetchAnticipos, createAnticipo, deleteAnticipo, METODOS_PAGO } from '../../services/anticiposService'
import { setOrderTotal } from '../../services/ordersService'
import { formatDateTime } from '../../utils/dates'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrder } from '../../utils/permissions'

function formatMonto(monto) {
  return Number(monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

// Anticipos de una orden: puede haber ninguno, uno o varios (un anticipo
// inicial y luego un abono, por ejemplo) — se listan todos, más recientes
// primero, con el total sumado arriba. Solo visible con sesión (ver
// OrderDetailPage): es información financiera, la tabla ni siquiera se
// abre a lectura de invitado (ver schema_v16_anticipos.sql).
//
// V42 — se agrega "Total de la orden" (editable, opcional) y "Restante"
// (total - recibido, calculado aquí mismo, nunca guardado — así nunca se
// puede desincronizar). El total se edita con set_order_total, aparte de
// update_order_details a propósito (no dispara pending_reconfirmation_at:
// no es algo que fábrica necesite reconfirmar).
export default function OrderPaymentsCard({ order, onUpdated }) {
  const { role, profile } = useAuth()
  const disabled = !!order.eliminada_en
  const [anticipos, setAnticipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [recibidoPor, setRecibidoPor] = useState('')
  const [notas, setNotas] = useState('')

  const [editingTotal, setEditingTotal] = useState(false)
  const [totalInput, setTotalInput] = useState(order.total_orden ?? '')
  const [savingTotal, setSavingTotal] = useState(false)
  const [totalError, setTotalError] = useState(null)

  // disabled: la orden fue eliminada (soft-delete) — ya no admite más
  // anticipos de ningún rol (ver schema_v24_soft_delete.sql).
  const canRegister = !disabled && (role === 'ventas' || role === 'contabilidad' || role === 'admin_tienda' || role === 'admin_general')
  const canDelete = !disabled && (role === 'admin_tienda' || role === 'admin_general')
  const canEditTotal = !disabled && canEditOrder(role, order)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchAnticipos(order.id)
    if (fetchError) {
      setError(fetchError)
    } else {
      setAnticipos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [order.id])

  useEffect(() => {
    load()
  }, [load])

  const recibido = anticipos.reduce((sum, a) => sum + Number(a.monto), 0)
  const restante = order.total_orden != null ? Number(order.total_orden) - recibido : null

  function openForm() {
    setRecibidoPor(profile?.full_name || '')
    setOpen(true)
  }

  function resetForm() {
    setMonto('')
    setMetodoPago('efectivo')
    setRecibidoPor('')
    setNotas('')
    setOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      setError(new Error('El monto debe ser mayor a cero.'))
      return
    }
    if (!recibidoPor.trim()) {
      setError(new Error('Falta indicar quién recibió el anticipo.'))
      return
    }

    setSaving(true)
    setError(null)
    const { error: createError } = await createAnticipo({
      orderId: order.id,
      monto: montoNum,
      metodoPago,
      recibidoPor: recibidoPor.trim(),
      notas: notas.trim(),
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }

    resetForm()
    load()
  }

  async function handleDelete(id) {
    setDeletingId(id)
    setError(null)
    const { error: deleteError } = await deleteAnticipo(id)
    setDeletingId(null)

    if (deleteError) {
      setError(deleteError)
      return
    }
    load()
  }

  async function handleSaveTotal(e) {
    e.preventDefault()
    const totalNum = totalInput === '' ? null : Number(totalInput)
    if (totalInput !== '' && (!totalNum || totalNum <= 0)) {
      setTotalError(new Error('El total debe ser mayor a cero (o déjalo vacío para quitarlo).'))
      return
    }
    setSavingTotal(true)
    setTotalError(null)
    const { error: totalErr } = await setOrderTotal(order.id, totalNum)
    setSavingTotal(false)
    if (totalErr) {
      setTotalError(totalErr)
      return
    }
    setEditingTotal(false)
    onUpdated?.()
  }

  if (loading) return null

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small">Pagos</h3>
      </div>

      {/* V49 — antes "Total de la orden"/"Restante" vivían mezclados
          adentro de la lista de documentos, y "Restante" ni aparecía si
          no había total capturado — pedido explícito del usuario: un
          solo lugar donde se vea junto Total/Recibido/Restante, siempre
          los 3, para no tener que buscar el dinero entre varias filas. */}
      <div className="payments-summary">
        <div className="payments-summary__stat">
          <span className="payments-summary__label">Total de la orden</span>
          <span className="payments-summary__value">{order.total_orden != null ? formatMonto(order.total_orden) : '—'}</span>
          {canEditTotal && !editingTotal && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              style={{ marginTop: 6 }}
              onClick={() => {
                setTotalInput(order.total_orden ?? '')
                setTotalError(null)
                setEditingTotal(true)
              }}
            >
              Editar
            </button>
          )}
        </div>
        <div className="payments-summary__stat">
          <span className="payments-summary__label">Anticipo recibido</span>
          <span className="payments-summary__value">{formatMonto(recibido)}</span>
        </div>
        <div className="payments-summary__stat">
          <span className="payments-summary__label">Restante</span>
          <span
            className="payments-summary__value"
            style={restante != null ? { color: restante > 0 ? 'var(--color-danger)' : 'var(--color-good)' } : undefined}
          >
            {restante != null ? formatMonto(restante) : '—'}
          </span>
        </div>
      </div>

      {editingTotal && (
        <form className="order-form" onSubmit={handleSaveTotal} style={{ marginTop: 10 }}>
          <div className="form-row">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              value={totalInput}
              onChange={(e) => setTotalInput(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditingTotal(false)} disabled={savingTotal}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={savingTotal}>
                {savingTotal ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
          {totalError && <p className="form-error">{totalError.message}</p>}
        </form>
      )}

      <p className="field-label" style={{ margin: '16px 0 8px' }}>
        Anticipos registrados
      </p>
      {anticipos.length === 0 ? (
        <p className="page-subtitle">Todavía no se ha recibido ningún anticipo.</p>
      ) : (
        <div className="document-list">
          {anticipos.map((a) => (
            <div key={a.id} className="document-row">
              <div>
                <span className="document-row__label">{formatMonto(a.monto)}</span>
                <p className="pending-card__garment" style={{ marginTop: 2 }}>
                  {METODOS_PAGO.find((m) => m.key === a.metodo_pago)?.label || a.metodo_pago} · Recibió: {a.recibido_por}
                </p>
                <p className="document-row__empty" style={{ marginTop: 2 }}>
                  {formatDateTime(a.created_at)}
                  {a.notas ? ` · ${a.notas}` : ''}
                </p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={deletingId === a.id}
                  onClick={() => handleDelete(a.id)}
                >
                  {deletingId === a.id ? 'Borrando…' : 'Borrar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canRegister && !open && (
        <button type="button" className="btn btn--secondary btn--small" style={{ marginTop: 10 }} onClick={openForm}>
          + Registrar anticipo
        </button>
      )}

      {canRegister && open && (
        <form className="order-form" onSubmit={handleSubmit} style={{ marginTop: 10 }}>
          <div className="form-row">
            <label>
              Monto *
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              Método de pago
              <select className="input" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Quién lo recibió *
            <input
              type="text"
              className="input"
              value={recibidoPor}
              onChange={(e) => setRecibidoPor(e.target.value)}
              placeholder="Nombre de quién cobró"
            />
          </label>
          <label>
            Notas
            <input
              type="text"
              className="input"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </label>

          {error && <p className="form-error">{error.message}</p>}

          <div className="order-form__actions">
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar anticipo'}
            </button>
          </div>
        </form>
      )}

      {!open && error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
