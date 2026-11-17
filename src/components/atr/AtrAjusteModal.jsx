import { useState } from 'react'
import Modal from '../talleros/Modal'
import { registrarAjusteAtr } from '../../services/atrService'
import { existenciaDe, tallasDe } from './AtrEntregaModal'

// Ajuste (+ o −) con nota obligatoria. inicial: {} o una fila de existencias.
export default function AtrAjusteModal({ productos, existencias, inicial, onClose, onListo }) {
  const [productoId, setProductoId] = useState(inicial.producto_id || '')
  const [talla, setTalla] = useState(inicial.talla || '')
  const [sentido, setSentido] = useState('sale')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const producto = productos.find((p) => p.id === productoId)
  const hay = producto && talla ? existenciaDe(existencias, productoId, talla) : null
  const n = Number(cantidad) || 0
  const queda = hay === null ? null : hay + (sentido === 'entra' ? n : -n)

  async function guardar(ev) {
    ev.preventDefault()
    setError(null)
    if (!productoId || !talla) return setError('Elige producto y talla.')
    if (!n) return setError('Escribe la cantidad.')
    if (!nota.trim()) return setError('Escribe por qué se hace el ajuste.')
    setGuardando(true)
    const { error: e } = await registrarAjusteAtr(productoId, talla, sentido === 'entra' ? n : -n, nota)
    setGuardando(false)
    if (e) return setError(e.message)
    onListo()
  }

  return (
    <Modal title="Ajuste de inventario ATR" onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="form-row">
          <label>
            <span className="field-label">Producto</span>
            <select className="input" value={productoId} onChange={(e) => { setProductoId(e.target.value); setTalla('') }}>
              <option value="">Elige…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Talla</span>
            <select className="input" value={talla} onChange={(e) => setTalla(e.target.value)} disabled={!producto}>
              <option value="">Elige…</option>
              {producto && tallasDe(producto, existencias).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="atr-sentido" role="radiogroup" aria-label="Sentido del ajuste">
          {[['entra', '+ Entran'], ['sale', '− Salen']].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={sentido === k} className={'chip' + (sentido === k ? ' chip--active' : '')} onClick={() => setSentido(k)}>{l}</button>
          ))}
          <input className="input input--small atr-sentido__cant" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} placeholder="Cantidad" />
        </div>
        {hay !== null && (
          <p className="atr-muted">Hay {hay} → quedarían <strong className={queda < 0 ? 'atr-negativo' : ''}>{queda}</strong></p>
        )}
        <label className="atr-campo">
          <span className="field-label">Nota (obligatoria)</span>
          <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Conteo físico del 20-nov" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="atr-pie">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajuste'}</button>
        </div>
      </form>
    </Modal>
  )
}
