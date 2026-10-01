import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { registrarEntradaModelo } from '../../services/inventarioService'
import { buscar } from '../../utils/inventarioBusqueda'
import { formatTalla } from '../../utils/inventarioTallas'

// V121 — "Dar entrada" por cuadrícula: se elige el modelo, aparecen TODAS
// sus tallas (talla | existencia) y se captura cantidad solo en las que
// llegaron. Las que se dejan vacías no se mandan al servidor, así que no
// se mueven. Un solo guardado = una transacción (inv_entrada_modelo).
export default function EntradaModeloModal({ modelos, modeloInicial = null, ubicaciones, motivos, defaultUbicacionId, onClose, onDone }) {
  const [modelo, setModelo] = useState(modeloInicial)
  const [q, setQ] = useState('')
  const [ubicacionId, setUbicacionId] = useState(defaultUbicacionId || ubicaciones[0]?.id || '')
  const [motivoId, setMotivoId] = useState(
    () => (motivos.find((m) => m.nombre === 'Entrada de producción') || motivos[0])?.id || ''
  )
  const [cantidades, setCantidades] = useState({}) // articuloId → texto
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const resultados = useMemo(() => {
    if (!q.trim()) return modelos.slice(0, 40)
    return buscar(modelos, q, { existencia: (m) => m.total, limite: 40 })
  }, [modelos, q])

  const lineas = useMemo(
    () =>
      Object.entries(cantidades)
        .map(([articuloId, v]) => ({ articuloId, cantidad: Number(v) }))
        .filter((l) => Number.isInteger(l.cantidad) && l.cantidad > 0),
    [cantidades]
  )
  const totalPiezas = lineas.reduce((sum, l) => sum + l.cantidad, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!modelo || !ubicacionId || !motivoId || lineas.length === 0) return
    setSaving(true)
    setError(null)
    const { error: err } = await registrarEntradaModelo({ modeloId: modelo.id, ubicacionId, motivoId, nota, lineas })
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  if (!modelo) {
    return (
      <Modal title="Dar entrada · elige el modelo" onClose={onClose}>
        <div className="order-form">
          <input
            type="search"
            className="input"
            placeholder="Busca el modelo… (ej. po tri)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {modelos.length === 0 ? (
            <p className="pantone-hint">
              Todavía no hay modelos. Crea uno con “Nuevo modelo”, o clasifica los artículos que ya existen.
            </p>
          ) : (
            <ul className="inv-search-results inv-search-results--alto">
              {resultados.length === 0 && <li className="inv-search-results__empty">Ningún modelo coincide.</li>}
              {resultados.map((m) => (
                <li key={m.id}>
                  <button type="button" className={m.total > 0 ? '' : 'inv-search-results__cero'} onClick={() => setModelo(m)}>
                    <span>{m.nombre}</span>
                    <span className="inv-search-results__hay">
                      {m.articulos.length} tallas · {m.total} pzas
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="pantone-hint">
            Los artículos que todavía no se clasifican en un modelo reciben entrada como siempre, con el botón + de su talla.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Dar entrada · ${modelo.nombre}`} onClose={onClose}>
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
            Motivo
            <select className="input" value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="inv-field">
          <span>Cantidad que llegó por talla (deja vacías las que no llegaron)</span>
          <div className="inv-grid">
            {modelo.articulos.map((a, i) => {
              const hay = a.porUbicacion[ubicacionId] ?? 0
              return (
                <div key={a.articuloId} className={'inv-grid__celda' + (hay === 0 ? ' inv-grid__celda--cero' : '')}>
                  <span className="inv-grid__talla">{formatTalla(a.talla)}</span>
                  <span className="inv-grid__hay">hay {hay}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className="input input--small"
                    aria-label={`Cantidad talla ${a.talla}`}
                    value={cantidades[a.articuloId] ?? ''}
                    onChange={(e) => setCantidades((cur) => ({ ...cur, [a.articuloId]: e.target.value }))}
                    autoFocus={i === 0}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <label>
          Nota (opcional)
          <input type="text" className="input" value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>

        <p className="pantone-hint">
          {lineas.length === 0
            ? 'Captura la cantidad de al menos una talla.'
            : `Entrarán ${totalPiezas} piezas en ${lineas.length} ${lineas.length === 1 ? 'talla' : 'tallas'}. Las demás no se mueven.`}
        </p>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          {!modeloInicial && (
            <button type="button" className="btn btn--ghost" onClick={() => setModelo(null)} disabled={saving}>
              ← Otro modelo
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !ubicacionId || !motivoId || lineas.length === 0}>
            {saving ? 'Guardando…' : 'Guardar entrada'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
