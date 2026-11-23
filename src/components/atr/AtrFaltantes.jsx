import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading, EmptyState } from '../common/States'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { fetchAtrFaltantes } from '../../services/atrService'
import { faltantesCSV, nivelFaltante } from '../../utils/atrOc'
import { normalizar } from '../../utils/atrCarga'
import { atrFaltantesFileName, buildAtrFaltantesBlob } from '../../utils/generateAtrPdf'

// V215 — "Qué nos falta": por bata y talla, solo OC abiertas o parciales.
// Faltante = max(0, pendiente − existencia − en taller). Rojo = falta
// producir; amarillo = alcanza solo contando lo que está en taller.
const n = (x) => Number(x || 0).toLocaleString('es-MX')

export default function AtrFaltantes() {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  const [soloFaltante, setSoloFaltante] = useState(false)
  const [busca, setBusca] = useState('')
  const [blob, setBlob] = useState(null)
  const [generando, setGenerando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await fetchAtrFaltantes()
    if (e) return setError(e)
    setFilas(data || [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const vista = useMemo(() => {
    const q = normalizar(busca)
    return (filas || [])
      .filter((f) => !soloFaltante || f.faltante > 0)
      .filter((f) => !q || normalizar(`${f.producto} ${f.talla}`).includes(q))
  }, [filas, soloFaltante, busca])

  const tot = vista.reduce(
    (t, f) => ({ pendiente: t.pendiente + f.pendiente, taller: t.taller + f.en_taller, faltante: t.faltante + f.faltante }),
    { pendiente: 0, taller: 0, faltante: 0 },
  )

  function bajarCsv() {
    const url = URL.createObjectURL(new Blob([faltantesCSV(vista)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = atrFaltantesFileName('csv')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function verPdf() {
    setGenerando(true)
    try {
      setBlob(await buildAtrFaltantesBlob(vista))
    } catch (e) {
      setError(e)
    }
    setGenerando(false)
  }

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!filas) return <Loading />

  return (
    <div>
      <div className="atr-oc-barra">
        <div className="atr-acciones">
          <input className="input atr-oc-busca" placeholder="Buscar color, talla…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <label className="atr-check">
            <input type="checkbox" checked={soloFaltante} onChange={(e) => setSoloFaltante(e.target.checked)} /> Solo con faltante
          </label>
        </div>
        <div className="atr-acciones">
          <button type="button" className="btn btn--ghost btn--small" onClick={bajarCsv} disabled={!vista.length}>CSV</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={verPdf} disabled={!vista.length || generando}>
            {generando ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>

      {filas.length === 0 ? (
        <EmptyState>
          No hay nada pendiente: todas las OC abiertas están surtidas. <Link to="/atr?tab=oc">Ver órdenes de compra</Link>
        </EmptyState>
      ) : (
        <>
          <p className="atr-muted atr-conteo">
            {vista.length} líneas · pendiente <strong>{n(tot.pendiente)}</strong> · en taller <strong>{n(tot.taller)}</strong> ·
            faltan <strong className={tot.faltante ? 'atr-negativo' : ''}>{n(tot.faltante)}</strong>
          </p>
          <div className="atr-tabla-wrap">
            <table className="simple-table atr-tabla">
              <thead>
                <tr>
                  <th>Bata</th><th>Talla</th>
                  <th className="atr-num">Pendiente</th><th className="atr-num">Existencia</th>
                  <th className="atr-num">En taller</th><th className="atr-num">Faltante</th>
                </tr>
              </thead>
              <tbody>
                {vista.map((f) => {
                  const nivel = nivelFaltante(f)
                  return (
                    <tr key={f.producto_id + f.talla} className={nivel ? `atr-falta--${nivel}` : ''}>
                      <td>{f.producto}</td>
                      <td>{f.talla}</td>
                      <td className="atr-num">{n(f.pendiente)}</td>
                      <td className={'atr-num' + (f.existencia < 0 ? ' atr-negativo' : '')}>{n(f.existencia)}</td>
                      <td className="atr-num">
                        {n(f.en_taller)}
                        {f.en_taller_ordenes?.length > 0 && (
                          <div className="atr-muted atr-falta-ordenes">
                            {f.en_taller_ordenes.map((o, i) => (
                              <span key={o.order_id}>
                                {i > 0 && ', '}
                                <Link to={`/orden/${o.order_id}`}>{o.order_number || 'orden'}</Link> ({o.cantidad})
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="atr-num"><strong>{n(f.faltante)}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="atr-muted atr-falta-leyenda">
            <span className="atr-falta-muestra atr-falta-muestra--rojo" /> Falta producir ·{' '}
            <span className="atr-falta-muestra atr-falta-muestra--amarillo" /> Alcanza solo con lo que está en taller
          </p>
        </>
      )}

      {blob && <PdfPreviewModal blob={blob} fileName={atrFaltantesFileName('pdf')} onClose={() => setBlob(null)} />}
    </div>
  )
}
