import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { Loading } from '../common/States'
import { crearTraspaso } from '../../services/inventarioService'
import ArticuloBuscador from './ArticuloBuscador'

// Alta de traspaso (V89, addendum C): origen/destino + varias líneas
// (artículo + cantidad), todo o nada del lado del servidor.
// V121 — el buscador es el flexible compartido (ArticuloBuscador): encuentra
// "po tri 12" / "tri polo 12" sin escribir el nombre exacto, y ordena
// primero lo que sí tiene existencia en el origen. `articulos` ya viene
// armado del catálogo completo (useInventarioCatalogo en la página).
export default function TraspasoFormModal({ ubicaciones, articulos, loadingArticulos, onClose, onDone }) {
  const [origenId, setOrigenId] = useState(ubicaciones[0]?.id || '')
  const [destinoId, setDestinoId] = useState(ubicaciones[1]?.id || '')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState([]) // { articuloId, nombre, prenda, talla, cantidad, existenciaOrigen }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const existenciaEnOrigen = useCallback((a) => a.porUbicacion[origenId] ?? 0, [origenId])
  const idsEnLineas = useMemo(() => new Set(lineas.map((l) => l.articuloId)), [lineas])

  function addLinea(a) {
    setLineas((cur) => [
      ...cur,
      {
        articuloId: a.articuloId,
        nombre: a.nombre,
        prenda: a.prenda,
        talla: a.talla,
        cantidad: 1,
        existenciaOrigen: a.porUbicacion[origenId] ?? 0,
      },
    ])
  }

  function removeLinea(articuloId) {
    setLineas((cur) => cur.filter((l) => l.articuloId !== articuloId))
  }

  function setCantidad(articuloId, value) {
    setLineas((cur) => cur.map((l) => (l.articuloId === articuloId ? { ...l, cantidad: value } : l)))
  }

  // Al cambiar el origen, refresca la existencia mostrada por línea (solo
  // informativo — el servidor valida la existencia real al confirmar).
  useEffect(() => {
    setLineas((cur) =>
      cur.map((l) => {
        const a = articulos.find((x) => x.articuloId === l.articuloId)
        return a ? { ...l, existenciaOrigen: a.porUbicacion[origenId] ?? 0 } : l
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId])

  const lineasValidas = lineas.filter((l) => Number(l.cantidad) > 0)
  const hayExceso = lineas.some((l) => Number(l.cantidad) > l.existenciaOrigen)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!origenId || !destinoId || origenId === destinoId || lineasValidas.length === 0) return
    setSaving(true)
    setError(null)
    const { data, error: err } = await crearTraspaso({
      origenId,
      destinoId,
      nota,
      lineas: lineasValidas.map((l) => ({ articuloId: l.articuloId, cantidad: Number(l.cantidad) })),
    })
    setSaving(false)
    if (err) return setError(err)
    onDone(data, lineasValidas)
  }

  return (
    <Modal title="Nuevo traspaso" onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Origen
            <select className="input" value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Destino
            <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {origenId === destinoId && <p className="form-error">Elige un origen y un destino distintos.</p>}

        <div className="inv-field">
          <span>Agregar prenda</span>
          <ArticuloBuscador
            articulos={articulos}
            existencia={existenciaEnOrigen}
            etiquetaExistencia="en origen"
            excluirIds={idsEnLineas}
            onSelect={addLinea}
            placeholder={loadingArticulos ? 'Cargando artículos…' : 'Busca la prenda… (ej. po tri 12)'}
            disabled={loadingArticulos}
          />
        </div>

        {lineas.length > 0 && (
          <div className="document-list">
            {lineas.map((l) => (
              <div key={l.articuloId} className="document-row">
                <div>
                  <span className="document-row__label">{l.nombre}</span>
                  <p className="pantone-hint" style={{ margin: '2px 0 0' }}>
                    Hay {l.existenciaOrigen} en origen
                    {Number(l.cantidad) > l.existenciaOrigen && (
                      <span style={{ color: 'var(--color-danger)' }}> — no alcanza</span>
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    className="input input--small"
                    style={{ width: 70 }}
                    value={l.cantidad}
                    onChange={(e) => setCantidad(l.articuloId, e.target.value)}
                  />
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => removeLinea(l.articuloId)}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <label>
          Nota (opcional)
          <input type="text" className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>

        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving || !origenId || !destinoId || origenId === destinoId || lineasValidas.length === 0}
          >
            {saving ? 'Guardando…' : hayExceso ? 'Confirmar traspaso' : 'Crear traspaso'}
          </button>
        </div>
        {loadingArticulos && <Loading label="Cargando catálogo de artículos…" />}
      </form>
    </Modal>
  )
}
