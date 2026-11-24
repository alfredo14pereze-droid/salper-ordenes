import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canEditFolioExternoFrisa } from '../../utils/permissions'
import { limpiarFolioExterno } from '../../utils/folioExterno'
import { setFolioExternoFrisa, buscarOrdenSalperPorFolio } from '../../services/frisaService'

// V218 — "Folio externo" de las órdenes de taller de Frisa (orders.folio_externo):
// el folio de nuestro control interno de órdenes. Texto libre, opcional.

// Aviso (no bloquea): el folio escrito es el folio de una orden de SALPER.
export function AvisoFolioSalper({ folio, excluirId }) {
  const [orden, setOrden] = useState(null)
  useEffect(() => {
    let vivo = true
    setOrden(null)
    const t = setTimeout(async () => {
      const { data } = await buscarOrdenSalperPorFolio(folio, excluirId)
      if (vivo) setOrden(data)
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [folio, excluirId])
  if (!orden) return null
  return (
    <p className="pantone-hint folio-externo__aviso" style={{ color: 'var(--color-orange-strong)' }}>
      ⚠ Ese folio es de una orden de SALPER:{' '}
      <Link to={`/orden/${orden.id}`} target="_blank" rel="noreferrer">
        {orden.order_number}{orden.client_name ? ` · ${orden.client_name}` : ''}
      </Link>
      {orden.eliminada_en ? ' (eliminada)' : orden.cancelled_at ? ' (cancelada)' : ''}. Revisa que sea el folio correcto; sí se puede guardar.
    </p>
  )
}

// Campo para formularios (Nueva orden, Restock).
export function FolioExternoInput({ value, onChange, excluirId = null, disabled = false, id = 'folio-externo-frisa', autoFocus = false }) {
  return (
    <div className="folio-externo">
      <label htmlFor={id} className="field-label" style={{ display: 'block', marginBottom: 6 }}>
        Folio externo <span className="frisa__sub">(opcional · folio de nuestro control interno)</span>
      </label>
      <input id={id} className="input" type="text" maxLength={60} value={value} disabled={disabled} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(e.target.value.trim())}
        placeholder="Cualquier folio, ej. ORD3310" autoComplete="off" />
      <AvisoFolioSalper folio={value} excluirId={excluirId} />
    </div>
  )
}

// Tarjeta del detalle de la orden: ver y, con permiso, agregar o editar.
export function FolioExternoFrisaCard({ order, onUpdated }) {
  const { user, role } = useAuth()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(order.folio_externo || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  if (order.order_type_key !== 'frisa') return null
  const puede = !!user && !order.eliminada_en && canEditFolioExternoFrisa(role)

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const { error: err } = await setFolioExternoFrisa(order.id, valor)
    setGuardando(false)
    if (err) return setError(err.message)
    setEditando(false)
    onUpdated?.()
  }

  return (
    <div className="folio-externo-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 className="section-title section-title--small" style={{ margin: 0 }}>Folio externo</h3>
        {puede && !editando && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => { setValor(order.folio_externo || ''); setEditando(true) }}>
            {order.folio_externo ? 'Editar' : '+ Agregar'}
          </button>
        )}
      </div>
      {!editando ? (
        <p style={{ margin: '6px 0 0' }}>
          {order.folio_externo ? <strong>{order.folio_externo}</strong> : <span className="frisa__sub">Sin folio externo.</span>}
        </p>
      ) : (
        <form onSubmit={guardar} style={{ marginTop: 8 }}>
          <FolioExternoInput value={valor} onChange={setValor} excluirId={order.id} id={`folio-externo-${order.id}`} autoFocus />
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn--primary btn--small"
              disabled={guardando || limpiarFolioExterno(valor) === limpiarFolioExterno(order.folio_externo)}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => { setEditando(false); setError(null) }}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  )
}
