import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading } from '../components/common/States'
import { canCargarAtr } from '../utils/permissions'
import { cargarInicialAtr, crearProductoAtr, fetchAtrHayCargaInicial, fetchAtrProductos } from '../services/atrService'
import { adivinarColumnas, armarRenglones, leerBata, leerCsv } from '../utils/atrCarga'
import { leerXlsx } from '../utils/xlsxLector'
import { formatDate } from '../utils/dates'
import '../components/atr/atr.css'

// V209/V210 — Carga inicial del inventario ATR desde Excel/CSV, con vista
// previa obligatoria: lo que no liga con el catálogo sale en rojo y se asigna,
// se da de alta o se omite antes de poder guardar.
export default function AtrCargaPage() {
  return (
    <RequireRole allow={canCargarAtr}>
      <AtrCarga />
    </RequireRole>
  )
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })

function AtrCarga() {
  const navigate = useNavigate()
  const [productos, setProductos] = useState(null)
  const [cargaPrevia, setCargaPrevia] = useState(undefined)
  const [error, setError] = useState(null)
  const [archivo, setArchivo] = useState('')
  const [filas, setFilas] = useState(null)
  const [cols, setCols] = useState(null)
  const [fechaCorte, setFechaCorte] = useState(hoy())
  const [asignado, setAsignado] = useState({}) // n → productoId | 'omitir'
  const [otraCarga, setOtraCarga] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errGuardar, setErrGuardar] = useState(null)

  useEffect(() => {
    Promise.all([fetchAtrProductos(), fetchAtrHayCargaInicial()]).then(([p, c]) => {
      if (p.error || c.error) return setError(p.error || c.error)
      setProductos(p.data)
      setCargaPrevia(c.data)
    })
  }, [])

  async function leerArchivo(f) {
    setError(null)
    setFilas(null)
    setAsignado({})
    if (!f) return
    setArchivo(f.name)
    try {
      const leidas = /\.xlsx$/i.test(f.name) ? await leerXlsx(await f.arrayBuffer()) : leerCsv(await f.text())
      if (leidas.length < 2) throw new Error('El archivo no tiene renglones.')
      setFilas(leidas)
      setCols(adivinarColumnas(leidas[0].map(String)))
    } catch (e) {
      setError(e)
    }
  }

  const listoCols = cols && cols.producto >= 0 && cols.talla >= 0 && cols.cantidad >= 0
  const renglones = useMemo(
    () => (filas && listoCols && productos ? armarRenglones(filas, cols, productos) : []),
    [filas, cols, listoCols, productos],
  )
  const final = renglones.map((r) => {
    const a = asignado[r.n]
    const bata = a === 'omitir' ? null : a ? productos.find((p) => p.id === a) : r.match
    return { ...r, bata, omitido: a === 'omitir' || r.error || r.cantidad === 0 }
  })
  const sinResolver = final.filter((r) => !r.omitido && !r.bata)
  const aGuardar = final.filter((r) => !r.omitido && r.bata)
  const totalPzas = aGuardar.reduce((s, r) => s + r.cantidad, 0)

  async function darDeAlta(r) {
    const { bolsa, color } = leerBata(r.producto, r.color)
    const conBolsa = bolsa ?? window.confirm(`"${r.producto} ${r.color}": ¿es CON bolsa? (Aceptar = con bolsa, Cancelar = sin bolsa)`)
    const nombreColor = window.prompt('Color de la bata nueva:', color.replace(/\b\w/g, (c) => c.toUpperCase()))
    if (!nombreColor) return
    const { data, error: e } = await crearProductoAtr(conBolsa, nombreColor)
    if (e) return setErrGuardar(e.message)
    const nuevo = { ...data, con_bolsa: !!data.especificaciones?.bolsa }
    setProductos((ps) => (ps.some((p) => p.id === nuevo.id) ? ps : [...ps, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
    setAsignado((x) => ({ ...x, [r.n]: nuevo.id }))
  }

  async function guardar() {
    setErrGuardar(null)
    if (!fechaCorte) return setErrGuardar('Captura la fecha de corte.')
    if (sinResolver.length) return setErrGuardar('Resuelve los renglones en rojo (asignar, dar de alta u omitir).')
    if (cargaPrevia && !otraCarga) return setErrGuardar('Ya hay una carga inicial: confirma abajo que quieres hacer otra.')
    setGuardando(true)
    const { error: e } = await cargarInicialAtr(
      fechaCorte,
      aGuardar.map((r) => ({ producto_id: r.bata.id, talla: r.talla, cantidad: r.cantidad })),
      !!cargaPrevia && otraCarga,
    )
    setGuardando(false)
    if (e) return setErrGuardar(e.message.replace('YA_HAY_CARGA:', '').trim())
    navigate('/atr')
  }

  if (!productos || cargaPrevia === undefined) return <div className="page">{error ? <ErrorState error={error} /> : <Loading />}</div>

  const encabezados = filas ? filas[0].map(String) : []
  const selCol = (clave, opcional) => (
    <select className="input input--small" value={cols?.[clave] ?? -1} onChange={(e) => setCols((c) => ({ ...c, [clave]: Number(e.target.value) }))}>
      <option value={-1}>{opcional ? '(sin color)' : 'Elige columna…'}</option>
      {encabezados.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
    </select>
  )

  return (
    <div className="page atr">
      <Link to="/atr" className="atr-volver">← Inventario ATR</Link>
      <div className="section-header">
        <h2 className="section-title">Carga inicial ATR</h2>
      </div>

      {cargaPrevia && (
        <div className="atr-aviso">
          Ya hay una carga inicial (corte {formatDate(cargaPrevia.fecha_corte)}, por {cargaPrevia.usuario_nombre || '—'}). Otra carga <strong>se suma</strong> a la anterior.
          <label className="atr-check"><input type="checkbox" checked={otraCarga} onChange={(e) => setOtraCarga(e.target.checked)} /> Sí, quiero hacer otra carga</label>
        </div>
      )}

      <p className="atr-muted">Excel (.xlsx) o CSV con columnas de producto, talla y cantidad (color opcional). Ej.: <em>Bata con bolsa · Blanca · CH · 10</em>.</p>
      <div className="form-row">
        <label>
          <span className="field-label">Archivo</span>
          <input className="input" type="file" accept=".xlsx,.csv,text/csv" onChange={(e) => leerArchivo(e.target.files?.[0])} />
        </label>
        <label>
          <span className="field-label">Fecha de corte</span>
          <input className="input" type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
        </label>
      </div>
      {error && <ErrorState error={error} />}

      {filas && (
        <fieldset className="atr-bloque">
          <legend className="field-label">Columnas de {archivo}</legend>
          <div className="atr-columnas">
            <label>Producto {selCol('producto')}</label>
            <label>Color {selCol('color', true)}</label>
            <label>Talla {selCol('talla')}</label>
            <label>Cantidad {selCol('cantidad')}</label>
          </div>
        </fieldset>
      )}

      {renglones.length > 0 && (
        <>
          <p className="atr-conteo">
            <strong>{aGuardar.length}</strong> líneas · <strong>{totalPzas.toLocaleString('es-MX')}</strong> batas
            {sinResolver.length > 0 && <span className="atr-negativo"> · {sinResolver.length} sin ligar</span>}
            {final.some((r) => r.omitido) && <span className="atr-muted"> · {final.filter((r) => r.omitido).length} se omiten</span>}
          </p>
          <div className="atr-tabla-wrap">
            <table className="simple-table atr-tabla">
              <thead>
                <tr><th>#</th><th>Producto</th><th>Color</th><th>Talla</th><th className="atr-num">Cant.</th><th>Bata en catálogo</th></tr>
              </thead>
              <tbody>
                {final.map((r) => (
                  <tr key={r.n} className={!r.omitido && !r.bata ? 'atr-fila--roja' : r.omitido ? 'atr-revertido' : ''}>
                    <td>{r.n}</td>
                    <td>{r.producto}</td>
                    <td>{r.color}</td>
                    <td>{r.talla}</td>
                    <td className="atr-num">{r.cantidad ?? '—'}</td>
                    <td>
                      {r.error ? (
                        <span className="atr-negativo">{r.error} (se omite)</span>
                      ) : r.cantidad === 0 ? (
                        <span className="atr-muted">En 0, se omite</span>
                      ) : (
                        <div className="atr-ligar">
                          <select
                            className="input input--small"
                            value={asignado[r.n] || r.match?.id || ''}
                            onChange={(e) => setAsignado((x) => ({ ...x, [r.n]: e.target.value }))}
                          >
                            {!r.match && <option value="">Sin ligar — elige…</option>}
                            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            <option value="omitir">Omitir este renglón</option>
                          </select>
                          {!r.bata && asignado[r.n] !== 'omitir' && (
                            <button type="button" className="btn btn--ghost btn--small" onClick={() => darDeAlta(r)}>Dar de alta</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {errGuardar && <p className="form-error">{errGuardar}</p>}
      {renglones.length > 0 && (
        <div className="atr-pie">
          <Link to="/atr" className="btn btn--ghost">Cancelar</Link>
          <button type="button" className="btn btn--primary" disabled={guardando || !aGuardar.length || sinResolver.length > 0} onClick={guardar}>
            {guardando ? 'Guardando…' : `Guardar carga inicial (${totalPzas.toLocaleString('es-MX')})`}
          </button>
        </div>
      )}
    </div>
  )
}
