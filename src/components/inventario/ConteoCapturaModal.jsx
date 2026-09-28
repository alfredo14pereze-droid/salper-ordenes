import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { Loading, ErrorState } from '../common/States'
import { fetchConteoLineas, confirmarConteo } from '../../services/inventarioService'
import { formatTalla } from '../../utils/inventarioTallas'

// Captura de un conteo físico ya impreso (V89): muestra Sistema vs Conteo
// (input) por línea; al confirmar solo se mandan las líneas que sí se
// llenaron — inv_confirmar_conteo crea un ajuste únicamente donde hay
// diferencia. Si el conteo ya estaba confirmado, se muestra en solo lectura.
export default function ConteoCapturaModal({ conteo, seccionNombre, ubicacionNombre, onClose, onDone }) {
  const readOnly = !!conteo.confirmado_en
  const [lineas, setLineas] = useState([])
  const [valores, setValores] = useState({}) // linea_id -> string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchConteoLineas(conteo.id).then(({ data, error: fetchError }) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError)
      } else {
        setLineas(data || [])
        const initial = {}
        for (const l of data || []) {
          if (l.conteo !== null && l.conteo !== undefined) initial[l.linea_id] = String(l.conteo)
        }
        setValores(initial)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [conteo.id])

  function setValor(lineaId, value) {
    setValores((cur) => ({ ...cur, [lineaId]: value }))
  }

  const capturadas = Object.values(valores).filter((v) => v !== '').length
  const diferencias = lineas.filter((l) => {
    const v = valores[l.linea_id]
    return v !== undefined && v !== '' && Number(v) !== l.sistema
  }).length

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const lineasCapturadas = lineas
      .filter((l) => valores[l.linea_id] !== undefined && valores[l.linea_id] !== '')
      .map((l) => ({ lineaId: l.linea_id, conteo: Number(valores[l.linea_id]) }))
    const { error: err } = await confirmarConteo({ conteoId: conteo.id, lineas: lineasCapturadas })
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title={`${readOnly ? 'Conteo' : 'Capturar conteo'} · ${seccionNombre} · ${ubicacionNombre}`} onClose={onClose}>
      {loading && <Loading label="Cargando líneas…" />}
      {error && <ErrorState error={error} />}
      {!loading && !error && (
        <>
          {!readOnly && (
            <p className="pantone-hint">
              {capturadas} de {lineas.length} capturadas
              {diferencias > 0 && ` · ${diferencias} con diferencia`}
            </p>
          )}
          <div className="table-scroll">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Prenda</th>
                  <th>Talla</th>
                  <th>Sistema</th>
                  <th>Conteo</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const v = valores[l.linea_id] ?? ''
                  const dif = v !== '' && Number(v) !== l.sistema
                  return (
                    <tr key={l.linea_id}>
                      <td>{l.prenda}</td>
                      <td>{formatTalla(l.talla)}</td>
                      <td>{l.sistema}</td>
                      <td>
                        {readOnly ? (
                          l.conteo ?? '—'
                        ) : (
                          <input
                            type="number"
                            className="input input--small"
                            style={{ width: 70, color: dif ? 'var(--color-danger)' : undefined }}
                            value={v}
                            onChange={(e) => setValor(l.linea_id, e.target.value)}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {error && <p className="form-error">{error.message}</p>}
          <div className="order-form__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
              {readOnly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!readOnly && (
              <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={saving || capturadas === 0}>
                {saving ? 'Confirmando…' : 'Confirmar conteo'}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
