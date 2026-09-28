import { useState } from 'react'
import Modal from '../talleros/Modal'
import { registrarMovimiento } from '../../services/inventarioService'

// Modal rápido de +/- (V89, punto de la pantalla principal): cantidad
// default 1, motivo obligatorio, ubicación editable (default la vista
// activa), nota opcional. `tipo` ('entrada' | 'salida') lo decide el botón
// que se apretó, no se elige aquí.
export default function MovimientoModal({ articulo, tipo, ubicaciones, motivos, defaultUbicacionId, onClose, onDone }) {
  const [ubicacionId, setUbicacionId] = useState(defaultUbicacionId || ubicaciones[0]?.id || '')
  const [cantidad, setCantidad] = useState(1)
  const [motivoId, setMotivoId] = useState(motivos[0]?.id || '')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const titulo = tipo === 'entrada' ? 'Entrada' : 'Salida'
  const existenciaEnUbicacion = articulo.porUbicacion[ubicacionId] ?? 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ubicacionId || !motivoId || !cantidad || cantidad <= 0) return
    setSaving(true)
    setError(null)
    const { error: err } = await registrarMovimiento({
      articuloId: articulo.articuloId,
      ubicacionId,
      tipo,
      cantidad: Number(cantidad),
      motivoId,
      nota,
    })
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title={`${titulo} · ${articulo.prenda} (${articulo.talla})`} onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Ubicación
            <select className="input" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              className="input"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <p className="pantone-hint">
          Existencia actual en esa ubicación: <b>{existenciaEnUbicacion}</b>
          {tipo === 'salida' && Number(cantidad) > existenciaEnUbicacion && (
            <span style={{ color: 'var(--color-danger)' }}> — no alcanza para esta salida.</span>
          )}
        </p>
        <label>
          Motivo
          <select className="input" value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nota (opcional)
          <input type="text" className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !ubicacionId || !motivoId}>
            {saving ? 'Guardando…' : `Registrar ${titulo.toLowerCase()}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
