import { useCallback, useEffect, useMemo, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { useAuth } from '../../contexts/AuthContext'
import { Loading, ErrorState } from '../common/States'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import FrisaReportePdf from '../pdf/FrisaReportePdf'
import { canImportarPlantasFrisa } from '../../utils/permissions'
import { fetchPlantasTodo, importarDiarios } from '../../services/frisaPlantasService'
import { leerXlsxHojas } from '../../utils/xlsxLector'
import { leerDiarios, ligarDocs, separarNuevos, calcularPlantas, resumenArchivo, docsParaImportar, reportePlantasMatriz, reportePlantasResumen } from '../../utils/frisaPlantas'
import { reporteCSV, nombreArchivo } from '../../utils/frisaReportes'
import { NombreFrisa, fechaCorta } from '../frisaNiveles/comunes'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// V189 — Inventario en las plantas de Frisa (aparte de la bodega de la fábrica).
// Stock en planta = remisiones − facturas. Se alimenta subiendo los "Diarios del
// inventario" de Microsip; cada folio cuenta una sola vez.
export default function FrisaPlantas() {
  const { role } = useAuth()
  const puede = canImportarPlantasFrisa(role)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [planta, setPlanta] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [errArchivo, setErrArchivo] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [notas, setNotas] = useState('')
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [trabajando, setTrabajando] = useState(null)

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchPlantasTodo()
    if (e) setError(e)
    else { setError(null); setDatos(data) }
    setCargando(false)
  }, [])
  useEffect(() => { recargar() }, [recargar])

  const calc = useMemo(() => (datos ? calcularPlantas(datos.movimientos, datos.plantas, datos.productos) : null), [datos])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const idxPlanta = planta === 'todas' ? -1 : calc.plantas.findIndex((p) => p.id === planta)
  const q = buscar.trim().toUpperCase()
  const filas = calc.claves.filter((c) => (idxPlanta < 0 ? c.stock !== 0 || c.remitido : c.plantas[idxPlanta].stock !== 0 || c.plantas[idxPlanta].remitido)
    && (!q || c.producto.clave.toUpperCase().includes(q) || c.producto.nombre.toUpperCase().includes(q)))
  const ultimaFecha = datos.movimientos.reduce((m, x) => (x.fecha && x.fecha > m ? x.fecha : m), '')

  async function elegir(file) {
    if (!file) return
    setLeyendo(true); setErrArchivo(null); setAviso(null)
    try {
      const hojas = await leerXlsxHojas(await file.arrayBuffer())
      const leido = leerDiarios(hojas)
      if (!leido.hojas.length) throw new Error('No encontré remisiones ni facturas. Sube el reporte "Diarios del inventario" de Microsip (Concepto: Remisión o Venta).')
      if (!leido.docs.length) throw new Error('El archivo no trae documentos.')
      const ligado = ligarDocs(leido.docs, datos.productos)
      const sep = separarNuevos(ligado.docs, datos.folios)
      setArchivo({ nombre: file.name, leido, ligado, sep, res: resumenArchivo(sep.nuevos, datos.plantas) })
    } catch (e) {
      setArchivo(null)
      setErrArchivo(e.message)
    }
    setLeyendo(false)
  }

  async function subir() {
    setSubiendo(true); setErrArchivo(null)
    const docs = docsParaImportar(archivo.res.validos)
    const sinClave = archivo.res.validos.reduce((t, d) => t + d.lineas.filter((l) => !l.producto).length, 0)
    const { data, error: e } = await importarDiarios({ archivo: archivo.nombre, docs, sinClave, notas })
    setSubiendo(false)
    if (e) return setErrArchivo(e.message)
    setArchivo(null); setNotas('')
    setAviso(`Listo: ${data.documentos} documentos nuevos (${num(data.piezas_remitidas)} pzas remitidas, ${num(data.piezas_facturadas)} facturadas)${data.repetidos ? `, ${data.repetidos} ya estaban` : ''}.`)
    recargar()
  }

  async function exportar(cual, formato) {
    const rep = cual === 'matriz' ? reportePlantasMatriz(calc) : reportePlantasResumen(calc)
    setTrabajando(`${cual}-${formato}`)
    try {
      if (formato === 'csv') {
        const url = URL.createObjectURL(new Blob([reporteCSV(rep)], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url; a.download = nombreArchivo(rep, 'csv'); a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        setPdfNombre(nombreArchivo(rep, 'pdf'))
        setPdfBlob(await pdf(<FrisaReportePdf rep={rep} generado={new Date().toLocaleString('es-MX')} />).toBlob())
      }
    } catch (e) { setErrArchivo(e.message) }
    setTrabajando(null)
  }

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · inventario en plantas</h1>
          <p className="page-subtitle">
            Lo que hay en cada planta de Frisa = lo remitido − lo facturado. Va aparte del inventario de nuestra bodega.
            {ultimaFecha && ` Movimientos hasta el ${fechaCorta(ultimaFecha)}.`}
          </p>
        </div>
      </div>

      <div className="stats-grid frisa-niveles__resumen">
        <button type="button" className={'stat-card frisa-niveles__tarjeta' + (planta === 'todas' ? ' is-activa' : '')} onClick={() => setPlanta('todas')}>
          <span className="stat-card__label">Todas las plantas</span>
          <span className="stat-card__value">{num(calc.totales.stock)}</span>
          <span className="stat-card__hint">{num(calc.totales.remitido)} remitidas − {num(calc.totales.facturado)} facturadas</span>
        </button>
        {calc.porPlanta.map((p) => (
          <button key={p.planta.id} type="button" className={'stat-card frisa-niveles__tarjeta' + (planta === p.planta.id ? ' is-activa' : '')} onClick={() => setPlanta(p.planta.id)}>
            <span className="stat-card__label">{p.planta.nombre}</span>
            <span className="stat-card__value">{num(p.stock)}</span>
            <span className="stat-card__hint">{num(p.remitido)} − {num(p.facturado)}{p.ajuste ? ` ${p.ajuste > 0 ? '+' : ''}${num(p.ajuste)} aj.` : ''}</span>
          </button>
        ))}
      </div>

      {calc.negativos.length > 0 && (
        <p className="frisa__nota">
          <strong>Ojo, stock negativo</strong> (se facturó más de lo remitido):{' '}
          {calc.negativos.map((n) => `${n.planta.nombre} ${n.producto.clave} ${num(n.stock)}`).join(' · ')}
        </p>
      )}
      {aviso && <p className="frisa__ok">{aviso}</p>}

      {puede && (
        <section className="frisa-restock__seccion">
          <h2 className="section-title section-title--small">Subir remisiones y facturas</h2>
          <p className="frisa__sub">
            En Microsip saca "Diarios del inventario" (Concepto: Remisión para lo entregado, Concepto: Venta para lo facturado) y sube el Excel tal cual.
            Puede traer las dos hojas. Los folios que ya se contaron se saltan solos, así que no pasa nada si un archivo se repite.
          </p>
          <label className="frisa-niveles__archivo">
            <span className="field-label">Excel de Microsip (.xlsx)</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={leyendo}
              onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = '' }} />
            {leyendo && <span className="frisa__sub">Leyendo…</span>}
          </label>
          {errArchivo && <p className="form-error">{errArchivo}</p>}

          {archivo && (
            <div className="card frisa-restock__propuesta">
              <p><strong>{archivo.nombre}</strong>: {archivo.leido.hojas.map((h) => `${h.nombre} (${h.tipo === 'remision' ? 'remisiones' : 'facturas'})`).join(', ')} · {archivo.leido.docs.length} documentos.</p>
              <ul className="frisa-niveles__historial">
                <li><span><strong>Nuevos:</strong> {archivo.res.remisiones} remisiones ({num(archivo.res.piezasRemitidas)} pzas) y {archivo.res.facturas} facturas ({num(archivo.res.piezasFacturadas)} pzas)
                  {archivo.res.desde && `, del ${fechaCorta(archivo.res.desde)} al ${fechaCorta(archivo.res.hasta)}`}.</span></li>
                <li><span><strong>Ya contados (se saltan):</strong> {archivo.sep.repetidos.length}</span></li>
                {archivo.res.plantasDesconocidas.length > 0 && <li><span className="frisa__falta">Plantas que no conozco (esos documentos no se suben): {archivo.res.plantasDesconocidas.join(', ')}</span></li>}
                {archivo.ligado.sinClave.length > 0 && <li><span className="frisa__falta">Artículos sin clave (no se cuentan): {archivo.ligado.sinClave.map((s) => `${s.descripcion} (${num(s.piezas)})`).join(' · ')}</span></li>}
                {archivo.leido.avisos.slice(0, 5).map((a) => <li key={a}><span className="frisa__sub">{a}</span></li>)}
              </ul>
              {archivo.res.validos.length > 0 ? (
                <>
                  <label><span className="field-label">Notas (opcional)</span><input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
                  <div className="frisa__botones">
                    <button type="button" className="btn btn--primary" disabled={subiendo} onClick={subir}>{subiendo ? 'Subiendo…' : `Subir ${archivo.res.validos.length} documentos`}</button>
                    <button type="button" className="btn btn--ghost" onClick={() => setArchivo(null)}>Cancelar</button>
                  </div>
                </>
              ) : <p className="frisa__ok">No hay nada nuevo: todos esos folios ya estaban contados.</p>}
            </div>
          )}
        </section>
      )}

      <section className="frisa-restock__seccion">
        <div className="frisa__botones">
          <input className="input" placeholder="Buscar clave o prenda" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <button type="button" className="btn btn--primary btn--small" disabled={!!trabajando} onClick={() => exportar('matriz', 'pdf')}>{trabajando === 'matriz-pdf' ? 'Armando…' : 'Ver PDF'}</button>
          <button type="button" className="btn btn--secondary btn--small" disabled={!!trabajando} onClick={() => exportar('matriz', 'csv')}>Descargar CSV</button>
          <button type="button" className="btn btn--ghost btn--small" disabled={!!trabajando} onClick={() => exportar('resumen', 'pdf')}>PDF por planta</button>
        </div>
        <div className="revision__tabla-wrap">
          <table className="simple-table frisa-tabla frisa-niveles__tabla">
            <thead>
              <tr>
                <th>Clave</th><th>Talla</th>
                {idxPlanta < 0
                  ? <>{calc.plantas.map((p) => <th key={p.id} className="num">{p.nombre}</th>)}<th className="num">Total</th></>
                  : <><th className="num">Remitido</th><th className="num">Facturado</th><th className="num">En planta</th></>}
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.producto.id} className={(idxPlanta < 0 ? c.stock : c.plantas[idxPlanta].stock) < 0 ? 'frisa-niveles__fila--critico' : ''}>
                  <td data-label="Clave"><strong>{c.producto.clave}</strong><NombreFrisa producto={c.producto} /></td>
                  <td data-label="Talla">{c.talla}</td>
                  {idxPlanta < 0
                    ? <>{calc.plantas.map((p, i) => <td key={p.id} data-label={p.nombre} className="num">{c.plantas[i].stock ? num(c.plantas[i].stock) : '—'}</td>)}
                      <td data-label="Total" className="num"><strong>{num(c.stock)}</strong></td></>
                    : <><td data-label="Remitido" className="num">{num(c.plantas[idxPlanta].remitido)}</td>
                      <td data-label="Facturado" className="num">{num(c.plantas[idxPlanta].facturado)}</td>
                      <td data-label="En planta" className="num"><strong>{num(c.plantas[idxPlanta].stock)}</strong></td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filas.length && <p className="frisa__sub">No hay piezas{planta !== 'todas' ? ' en esta planta' : ''}.</p>}
      </section>

      <section className="frisa-restock__seccion">
        <h2 className="section-title section-title--small">Archivos subidos</h2>
        {!datos.importaciones.length && <p className="frisa__sub">Ninguno todavía (lo de antes del 15/10/2026 entró como carga inicial).</p>}
        <div className="frisa-oc-lista">
          {datos.importaciones.map((im) => (
            <div key={im.id} className="card frisa-surtido__tarjeta frisa-restock__compra">
              <span className="frisa-surtido__fila1"><span className="frisa-oc__num">{im.archivo || 'Sin nombre'}</span><span className="frisa__sub">{new Date(im.creado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span></span>
              <span className="frisa__sub">{im.remisiones} remisiones ({num(im.piezas_remitidas)} pzas) · {im.facturas} facturas ({num(im.piezas_facturadas)} pzas){im.repetidos ? ` · ${im.repetidos} repetidos` : ''}{im.desde ? ` · ${fechaCorta(im.desde)} a ${fechaCorta(im.hasta)}` : ''}</span>
              <span className="frisa__sub">{im.creado_por_nombre}{im.notas ? ` · ${im.notas}` : ''}</span>
            </div>
          ))}
        </div>
      </section>
      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfNombre} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
