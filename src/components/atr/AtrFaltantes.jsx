import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState, Loading, EmptyState } from '../common/States'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { fetchAtrClienteId, fetchAtrFaltantes, fetchAtrProductos } from '../../services/atrService'
import { faltantesCSV, nivelFaltante, prendasParaOrden, seleccionInicial } from '../../utils/atrOc'
import { normalizar, ordenTalla } from '../../utils/atrCarga'
import { ordenBatas } from '../../utils/atrColores'
import { atrFaltantesFileName, buildAtrFaltantesBlob } from '../../utils/generateAtrPdf'
import AtrBata from './AtrBata'

// V215 — "Qué nos falta": por bata y talla, solo OC abiertas o parciales.
// Faltante = max(0, pendiente − existencia − en taller). Rojo = falta
// producir; amarillo = alcanza solo contando lo que está en taller.
// Parte 5: se eligen líneas (por defecto las que tienen faltante) y "Crear
// orden de taller" abre el formulario normal de Nueva orden prellenado.
const n = (x) => Number(x || 0).toLocaleString('es-MX')
const clave = (f) => `${f.producto_id}|${f.talla}`
// Tipo de orden con el que se capturan las órdenes de ATR (no hay tipo "ATR").
const TIPO_ORDEN_ATR = 'industrial'

// puedeTaller = atr.taller (admin_general, admin_fabrica, contabilidad): la
// orden se crea con atr_crear_orden_taller (V216) aunque su rol no cree
// órdenes normales.
export default function AtrFaltantes({ puedeTaller = false }) {
  const navigate = useNavigate()
  const [sel, setSel] = useState(null) // Set de claves elegidas
  const [creando, setCreando] = useState(false)
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
    setSel((x) => x || seleccionInicial(data || []))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const vista = useMemo(() => {
    const q = normalizar(busca)
    // Mismo orden que el inventario: por color, con bolsa y luego sin bolsa.
    const orden = ordenBatas(filas || [])
    return (filas || [])
      .filter((f) => !soloFaltante || f.faltante > 0)
      .filter((f) => !q || normalizar(`${f.producto} ${f.talla}`).includes(q))
      .sort((a, b) => orden(a) - orden(b) || ordenTalla(a.talla) - ordenTalla(b.talla))
  }, [filas, soloFaltante, busca])

  const tot = vista.reduce(
    (t, f) => ({ pendiente: t.pendiente + f.pendiente, taller: t.taller + f.en_taller, faltante: t.faltante + f.faltante }),
    { pendiente: 0, taller: 0, faltante: 0 },
  )

  const elegidas = (filas || []).filter((f) => sel?.has(clave(f)))
  const piezasElegidas = elegidas.reduce((t, f) => t + f.faltante, 0)
  const toggle = (f) => setSel((x) => { const y = new Set(x); y.has(clave(f)) ? y.delete(clave(f)) : y.add(clave(f)); return y })
  const todasVisibles = vista.length > 0 && vista.every((f) => sel?.has(clave(f)))
  const toggleTodas = () => setSel((x) => {
    const y = new Set(x)
    for (const f of vista) todasVisibles ? y.delete(clave(f)) : y.add(clave(f))
    return y
  })

  async function crearOrden() {
    setCreando(true)
    const [p, c] = await Promise.all([fetchAtrProductos(), fetchAtrClienteId()])
    setCreando(false)
    if (p.error || c.error) return setError(p.error || c.error)
    const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    navigate('/nueva', {
      state: {
        atrPrefill: {
          orderTypeKey: TIPO_ORDEN_ATR,
          clientId: c.data,
          clientName: 'ATR',
          description: `Producción para inventario ATR (Qué nos falta del ${hoy}).`,
          prendas: prendasParaOrden(elegidas, p.data),
        },
      },
    })
  }

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
          {puedeTaller && (
            <button type="button" className="btn btn--primary" onClick={crearOrden} disabled={!elegidas.length || creando}>
              {creando ? 'Abriendo…' : `Crear orden de taller${elegidas.length ? ` (${n(piezasElegidas)} batas)` : ''}`}
            </button>
          )}
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
                  {puedeTaller && (
                    <th className="atr-falta-sel">
                      <input type="checkbox" checked={todasVisibles} onChange={toggleTodas} aria-label="Elegir todas" />
                    </th>
                  )}
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
                      {puedeTaller && (
                        <td className="atr-falta-sel">
                          <input type="checkbox" checked={!!sel?.has(clave(f))} onChange={() => toggle(f)} aria-label={`Elegir ${f.producto} ${f.talla}`} />
                        </td>
                      )}
                      <td><AtrBata producto={f.producto} color={f.color} conBolsa={f.con_bolsa} /></td>
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
          {puedeTaller && (
            <p className="atr-muted atr-falta-leyenda">
              La orden de taller se abre en el formulario normal (tipo Industrial, cliente ATR, sin precio) con cantidad =
              faltante; ahí se ajusta. No se liga a una OC: produce para el inventario y, mientras no se termine, cuenta en
              "En taller".
            </p>
          )}
        </>
      )}

      {blob && <PdfPreviewModal blob={blob} fileName={atrFaltantesFileName('pdf')} onClose={() => setBlob(null)} />}
    </div>
  )
}
