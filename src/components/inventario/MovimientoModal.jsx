import { useState } from 'react'
import Modal from '../talleros/Modal'
import { registrarMovimiento, guardarArticulo } from '../../services/inventarioService'
import { formatTalla } from '../../utils/inventarioTallas'

// Modal rápido de +/- (V89, punto de la pantalla principal): cantidad
// default 1, motivo obligatorio, ubicación editable (default la vista
// activa), nota opcional. `tipo` ('entrada' | 'salida') lo decide el botón
// que se apretó, no se elige aquí.
//
// V92 — `articulo` puede ser "virtual" (talla que el colegio no tenía
// dada de alta todavía, rellenada por fillTallaGaps en InventarioPage:
// articuloId es null). En ese caso, antes de registrar el movimiento se
// da de alta el artículo real (existencia 0) y se usa su id — así una
// talla que hoy no existe en el catálogo pasa a existir en cuanto se le
// hace el primer movimiento, sin que el usuario tenga que ir a
// Administración primero.
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

    let articuloId = articulo.articuloId
    if (!articuloId) {
      const { data: nuevo, error: createErr } = await guardarArticulo({
        id: null,
        seccionId: articulo.seccionId,
        prenda: articulo.prenda,
        tallaId: articulo.tallaId,
        minimo: null,
        activo: true,
      })
      if (createErr) {
        setSaving(false)
        return setError(createErr)
      }
      articuloId = nuevo.id
    }

    const { error: err } = await registrarMovimiento({
      articuloId,
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
    <Modal title={`${titulo} · ${articulo.prenda} (${formatTalla(articulo.talla)})`} onClose={onClose}>
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
