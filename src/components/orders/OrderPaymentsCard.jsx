import { useCallback, useEffect, useState } from 'react'
import { fetchAnticipos, createAnticipo, deleteAnticipo, METODOS_PAGO } from '../../services/anticiposService'
import { formatDateTime } from '../../utils/dates'
import { useAuth } from '../../contexts/AuthContext'

function formatMonto(monto) {
  return Number(monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

// Anticipos de una orden: puede haber ninguno, uno o varios (un anticipo
// inicial y luego un abono, por ejemplo) — se listan todos, más recientes
// primero, con el total sumado arriba. Solo visible con sesión (ver
// OrderDetailPage): es información financiera, la tabla ni siquiera se
// abre a lectura de invitado (ver schema_v16_anticipos.sql).
export default function OrderPaymentsCard({ orderId }) {
  const { role, profile } = useAuth()
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

  const canRegister = role === 'ventas' || role === 'contabilidad' || role === 'admin_tienda' || role === 'admin_general'
  const canDelete = role === 'admin_tienda' || role === 'admin_general'

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchAnticipos(orderId)
    if (fetchError) {
      setError(fetchError)
    } else {
      setAnticipos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const total = anticipos.reduce((sum, a) => sum + Number(a.monto), 0)

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
      orderId,
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

  if (loading) return null

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small">Anticipos</h3>
        {total > 0 && <span className="section-count">{formatMonto(total)} recibido{anticipos.length === 1 ? '' : 's'}</span>}
      </div>

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
