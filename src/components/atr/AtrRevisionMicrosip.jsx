import { useEffect, useMemo, useState } from 'react'
import { ErrorState, Loading } from '../common/States'
import { fetchAtrExistencias, fetchAtrProductos } from '../../services/atrService'
import { leerXlsxHojas } from '../../utils/xlsxLector'
import { compararMicrosip, leerReporteMicrosip } from '../../utils/atrMicrosip'
import { ordenBatas } from '../../utils/atrColores'
import { ordenTalla } from '../../utils/atrCarga'
import AtrBata from './AtrBata'

// V220 — Revisión Microsip: subes el reporte "Existencia y valor del
// inventario" de Microsip (Excel) y se compara contra la existencia de la
// página por bata y talla, para ver que todo cuadre. Solo lee: no cambia nada.
const n = (x) => Number(x || 0).toLocaleString('es-MX')

// ¿Qué reporte trae la hoja? Se ve en los títulos de los primeros renglones.
function tipoDeHoja(filas) {
  const t = (filas || []).slice(0, 8).flat().filter((v) => typeof v === 'string').join(' ').toLowerCase()
  if (t.includes('existencia y valor')) return 'existencia'
  if (t.includes('pendientes de surtir')) return 'pendientes'
  return 'otra'
}

export default function AtrRevisionMicrosip() {
  const [productos, setProductos] = useState(null)
  const [existencias, setExistencias] = useState(null)
  const [error, setError] = useState(null)
  const [archivo, setArchivo] = useState(null) // { nombre, hojas: [{nombre, articulos}] }
  const [hoja, setHoja] = useState('')
  const [soloDif, setSoloDif] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [errArchivo, setErrArchivo] = useState(null)

  useEffect(() => {
    Promise.all([fetchAtrProductos(), fetchAtrExistencias()]).then(([p, e]) => {
      if (p.error || e.error) return setError(p.error || e.error)
      setProductos(p.data)
      setExistencias(e.data)
    })
  }, [])

  async function leer(f) {
    if (!f) return
    setErrArchivo(null)
    setLeyendo(true)
    try {
      const hojas = (await leerXlsxHojas(await f.arrayBuffer()))
        .map((h) => ({ nombre: h.nombre, articulos: leerReporteMicrosip([h]), tipo: tipoDeHoja(h.filas) }))
        .filter((h) => h.articulos.length > 0)
      if (!hojas.length) throw new Error('No encontré artículos de batas ("BATA C/BOLSA ATR … T-M") en el archivo.')
      // Primero la hoja de "Existencia y valor del inventario"; nunca por gusto
      // una de "Pendientes de surtir" (esas son lo que falta entregar, no existencia).
      const peso = { existencia: 0, otra: 1, pendientes: 2 }
      const mejor = [...hojas].sort((a, b) => peso[a.tipo] - peso[b.tipo] || b.articulos.length - a.articulos.length)[0]
      setArchivo({ nombre: f.name, hojas })
      setHoja(mejor.nombre)
    } catch (e) {
      setArchivo(null)
      setErrArchivo(e.message || 'No se pudo leer el archivo.')
    }
    setLeyendo(false)
  }

  const res = useMemo(() => {
    if (!archivo || !productos) return null
    const h = archivo.hojas.find((x) => x.nombre === hoja) || archivo.hojas[0]
    const r = compararMicrosip(h.articulos, productos, existencias)
    const orden = ordenBatas(productos)
    r.filas.sort((a, b) => orden(a.producto) - orden(b.producto) || ordenTalla(a.talla) - ordenTalla(b.talla))
    return { ...r, articulos: h.articulos }
  }, [archivo, hoja, productos, existencias])

  if (error) return <ErrorState error={error} />
  if (!productos || !existencias) return <Loading />

  const conDif = res ? res.filas.filter((f) => f.diferencia !== 0) : []
  const vista = res ? (soloDif ? conDif : res.filas) : []
  const totM = res ? res.filas.reduce((t, f) => t + f.microsip, 0) : 0
  const totP = res ? res.filas.reduce((t, f) => t + f.pagina, 0) : 0

  return (
    <div>
      <p className="atr-muted atr-oc-meta">
        Sube el reporte de Microsip <strong>"Existencia y valor del inventario"</strong> (Excel). Se compara contra la existencia de
        la página (lo apartado por facturar todavía cuenta, igual que en Microsip). Solo revisa: no cambia nada.
      </p>
      <label className="atr-campo">
        <span className="field-label">Reporte de Microsip (.xlsx)</span>
        <input type="file" accept=".xlsx" disabled={leyendo} onChange={(e) => leer(e.target.files?.[0])} />
        {leyendo && <span className="atr-muted"> Leyendo…</span>}
      </label>
      {errArchivo && <p className="form-error">{errArchivo}</p>}

      {res && (
        <>
          {archivo.hojas.length > 1 && (
            <label className="atr-campo">
              <span className="field-label">Hoja</span>
              <select className="input" value={hoja} onChange={(e) => setHoja(e.target.value)}>
                {archivo.hojas.map((h) => (
                  <option key={h.nombre} value={h.nombre}>
                    {h.nombre} ({h.articulos.length} artículos){h.tipo === 'existencia' ? ' · existencia' : h.tipo === 'pendientes' ? ' · pendientes de surtir (no es existencia)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="stats-grid frisa-niveles__resumen">
            <div className="stat-card"><span className="stat-card__label">Microsip</span><span className="stat-card__value">{n(totM)}</span><span className="stat-card__hint">{res.articulos.length} artículos</span></div>
            <div className="stat-card"><span className="stat-card__label">Página</span><span className="stat-card__value">{n(totP)}</span><span className="stat-card__hint">existencia</span></div>
            <div className="stat-card frisa-niveles__tarjeta--ok"><span className="stat-card__label">Cuadran</span><span className="stat-card__value">{res.filas.length - conDif.length}</span><span className="stat-card__hint">bata y talla</span></div>
            <div className="stat-card frisa-niveles__tarjeta--critico"><span className="stat-card__label">Con diferencia</span><span className="stat-card__value">{conDif.length}</span><span className="stat-card__hint">diferencia total {n(totP - totM)}</span></div>
          </div>

          {res.sinLigar.length > 0 && (
            <div className="atr-aviso">
              <span><strong>{res.sinLigar.length} artículo{res.sinLigar.length === 1 ? '' : 's'} de Microsip no ligaron</strong> con una bata del catálogo: {res.sinLigar.map((a) => `${a.texto} (${n(a.cantidad)})`).join('; ')}.</span>
            </div>
          )}

          <label className="atr-check">
            <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> Solo con diferencia
          </label>
          {vista.length === 0 ? (
            <p className="atr-ok">✓ Todo cuadra: la página y Microsip tienen la misma existencia en cada bata y talla.</p>
          ) : (
            <div className="atr-tabla-wrap">
              <table className="simple-table atr-tabla">
                <thead>
                  <tr><th>Bata</th><th>Talla</th><th className="atr-num">Microsip</th><th className="atr-num">Página</th><th className="atr-num">Diferencia</th></tr>
                </thead>
                <tbody>
                  {vista.map((f) => (
                    <tr key={f.producto.id + f.talla} className={f.diferencia !== 0 ? 'frisa-niveles__fila--critico' : ''}>
                      <td><AtrBata producto={f.producto.nombre} color={f.producto.color} conBolsa={!!f.producto.con_bolsa} /></td>
                      <td>{f.talla}</td>
                      <td className="atr-num">{n(f.microsip)}</td>
                      <td className="atr-num">{n(f.pagina)}</td>
                      <td className="atr-num">
                        {f.diferencia === 0
                          ? <span className="atr-dif--ok">✓</span>
                          : <span className={f.diferencia > 0 ? 'atr-dif--mas' : 'atr-dif--menos'}>{f.diferencia > 0 ? '+' : ''}{n(f.diferencia)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="atr-muted atr-oc-meta">Diferencia = página − Microsip. Positiva: la página tiene más. Negativa: Microsip tiene más.</p>
        </>
      )}
    </div>
  )
}
