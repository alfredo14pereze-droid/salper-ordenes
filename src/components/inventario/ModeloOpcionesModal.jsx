import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import {
  agregarTallaModelo,
  guardarAlias,
  quitarAlias,
  desvincularArticulos,
} from '../../services/inventarioService'
import { formatTalla } from '../../utils/inventarioTallas'

// V121 — opciones de un modelo (solo quien puede editar catálogos):
//   - agregar una talla extra (ej. T.18) sin rehacer el modelo,
//   - alias: otros nombres con los que se debe encontrar en el buscador
//     (clave de Microsip, nombre del proveedor, apodo interno),
//   - deshacer la clasificación (los artículos vuelven a "sin clasificar";
//     no se borra nada ni se toca la existencia).
const ORIGENES = [
  { key: 'interno', label: 'Apodo interno' },
  { key: 'microsip', label: 'Microsip' },
  { key: 'proveedor', label: 'Proveedor' },
]

export default function ModeloOpcionesModal({ modelo, tallas, onClose, onChanged }) {
  const [tallaId, setTallaId] = useState('')
  const [alias, setAlias] = useState('')
  const [origen, setOrigen] = useState('interno')
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const tallasDisponibles = useMemo(() => {
    const usadas = new Set(modelo.articulos.map((a) => a.tallaId))
    return tallas.filter((t) => !usadas.has(t.id))
  }, [modelo, tallas])

  async function run(fn, { cerrar = false } = {}) {
    setSaving(true)
    setError(null)
    const { error: err } = await fn()
    setSaving(false)
    if (err) return setError(err)
    await onChanged()
    if (cerrar) onClose()
  }

  return (
    <Modal title={modelo.nombre} onClose={onClose}>
      <div className="order-form">
        <div className="inv-field">
          <span>Tallas de este modelo</span>
          <p className="pantone-hint">{modelo.articulos.map((a) => formatTalla(a.talla)).join(' · ')}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select className="input" style={{ flex: 1, minWidth: 140 }} value={tallaId} onChange={(e) => setTallaId(e.target.value)}>
              <option value="">Agregar talla…</option>
              {tallasDisponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTalla(t.nombre)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={saving || !tallaId}
              onClick={() => run(() => agregarTallaModelo({ modeloId: modelo.id, tallaId }).then((r) => (setTallaId(''), r)))}
            >
              Agregar
            </button>
          </div>
          <p className="pantone-hint">
            Entra con existencia 0. Si la talla no está en la lista, primero dala de alta en Administración → Tallas y juegos.
          </p>
        </div>

        <div className="inv-field">
          <span>Alias (también se encuentra en el buscador con estos nombres)</span>
          {modelo.alias.length === 0 && <p className="pantone-hint">Sin alias todavía.</p>}
          {modelo.alias.map((al) => (
            <div key={al.id} className="document-row">
              <span className="document-row__label">
                {al.alias} <span className="pantone-hint">· {ORIGENES.find((o) => o.key === al.origen)?.label || al.origen}</span>
              </span>
              <button type="button" className="btn btn--ghost btn--small" disabled={saving} onClick={() => run(() => quitarAlias(al.id))}>
                Quitar
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              style={{ flex: 2, minWidth: 140 }}
              placeholder="Ej. PLY-TRC-BCA"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
            <select className="input" style={{ flex: 1, minWidth: 120 }} value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {ORIGENES.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={saving || !alias.trim()}
              onClick={() => run(() => guardarAlias({ modeloId: modelo.id, alias: alias.trim(), origen }).then((r) => (setAlias(''), r)))}
            >
              Agregar
            </button>
          </div>
        </div>

        <div className="inv-field">
          <span>Clasificación</span>
          {!confirmarDeshacer ? (
            <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmarDeshacer(true)}>
              Deshacer clasificación…
            </button>
          ) : (
            <div className="inv-aviso">
              <p>
                Los {modelo.articulos.length} artículos de este modelo vuelven a “sin clasificar” con su nombre original. No se borra nada ni
                cambia la existencia.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  disabled={saving}
                  onClick={() => run(() => desvincularArticulos(modelo.articulos.map((a) => a.articuloId)), { cerrar: true })}
                >
                  Sí, deshacer
                </button>
                <button type="button" className="btn btn--ghost btn--small" disabled={saving} onClick={() => setConfirmarDeshacer(false)}>
                  No
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--primary" onClick={onClose} disabled={saving}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  )
}
