import { useEffect, useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { Loading } from '../common/States'
import { fetchExistencias, crearTraspaso } from '../../services/inventarioService'
import { formatTalla } from '../../utils/inventarioTallas'

// Alta de traspaso (V89, addendum C): origen/destino + varias líneas
// (artículo + cantidad), todo o nada del lado del servidor. El buscador de
// artículos es global (todas las secciones) — se carga una vez al abrir.
export default function TraspasoFormModal({ ubicaciones, secciones, onClose, onDone }) {
  const [origenId, setOrigenId] = useState(ubicaciones[0]?.id || '')
  const [destinoId, setDestinoId] = useState(ubicaciones[1]?.id || '')
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState([]) // { articuloId, prenda, talla, seccion, cantidad, existenciaOrigen }
  const [q, setQ] = useState('')
  const [articulos, setArticulos] = useState([])
  const [loadingArticulos, setLoadingArticulos] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const seccionNombre = useMemo(() => {
    const map = new Map(secciones.map((s) => [s.id, s.nombre]))
    return (id) => map.get(id) || ''
  }, [secciones])

  useEffect(() => {
    fetchExistencias(null).then(({ data }) => {
      const map = new Map()
      for (const f of data || []) {
        let a = map.get(f.articulo_id)
        if (!a) {
          a = { articuloId: f.articulo_id, prenda: f.prenda, talla: f.talla, seccionId: f.seccion_id, porUbicacion: {} }
          map.set(f.articulo_id, a)
        }
        a.porUbicacion[f.ubicacion_id] = f.existencia
      }
      setArticulos([...map.values()])
      setLoadingArticulos(false)
    })
  }, [])

  const resultados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return articulos
      .filter((a) => a.prenda.toLowerCase().includes(needle) && !lineas.some((l) => l.articuloId === a.articuloId))
      .slice(0, 20)
  }, [articulos, q, lineas])

  function addLinea(a) {
    setLineas((cur) => [
      ...cur,
      {
        articuloId: a.articuloId,
        prenda: a.prenda,
        talla: a.talla,
        seccion: seccionNombre(a.seccionId),
        cantidad: 1,
        existenciaOrigen: a.porUbicacion[origenId] ?? 0,
      },
    ])
    setQ('')
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

        <label>
          Agregar prenda
          <input
            type="text"
            className="input"
            placeholder={loadingArticulos ? 'Cargando artículos…' : 'Escribe el nombre de la prenda…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loadingArticulos}
          />
        </label>
        {resultados.length > 0 && (
          <ul className="inv-search-results">
            {resultados.map((a) => (
              <li key={a.articuloId}>
                <button type="button" onClick={() => addLinea(a)}>
                  {a.prenda} · {formatTalla(a.talla)} · {seccionNombre(a.seccionId)}
                  <span className="pantone-hint" style={{ marginLeft: 6 }}>
                    (hay {a.porUbicacion[origenId] ?? 0} en origen)
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {lineas.length > 0 && (
          <div className="document-list">
            {lineas.map((l) => (
              <div key={l.articuloId} className="document-row">
                <div>
                  <span className="document-row__label">
                    {l.prenda} · {formatTalla(l.talla)} · {l.seccion}
                  </span>
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
