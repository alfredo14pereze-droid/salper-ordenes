import { useCallback, useEffect, useMemo, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { Loading, ErrorState } from '../common/States'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import FrisaReportePdf from '../pdf/FrisaReportePdf'
import { fetchRestockTodo, fetchMovimientos } from '../../services/frisaRestockService'
import { conInventario, calcularUrgente, hoyISO } from '../../utils/frisaSurtido'
import { CONFIG_INICIAL, conNiveles } from '../../utils/frisaNiveles'
import { calcularRestock } from '../../utils/frisaRestock'
import { calcularLisas } from '../../utils/frisaLisas'
import {
  reporteInventario, reportePorSurtir, reporteMovimientos, reporteSurtidos, reporteRestock, reporteLisas, reporteCompras, reporteCSV, nombreArchivo,
} from '../../utils/frisaReportes'

const primeroDeMes = () => `${hoyISO().slice(0, 8)}01`

// Reportes de Frisa para exportar en cualquier momento (CSV o PDF con vista previa).
export default function FrisaReportes() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [rango, setRango] = useState({ desde: primeroDeMes(), hasta: hoyISO(), estado: 'todos' })
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfNombre, setPdfNombre] = useState('')
  const [trabajando, setTrabajando] = useState(null)
  const [aviso, setAviso] = useState(null)

  const recargar = useCallback(async () => {
    const { data, error: e } = await fetchRestockTodo()
    if (e) setError(e)
    else { setError(null); setDatos(data) }
    setCargando(false)
  }, [])
  useEffect(() => { recargar() }, [recargar])

  const calc = useMemo(() => {
    if (!datos) return null
    const cfg = datos.config || CONFIG_INICIAL
    const inv = conInventario(datos.productos, datos.surtidos, datos.lineas)
    const restock = calcularRestock({ ...datos, productosInv: inv, cfg })
    return { niveles: conNiveles(inv, cfg), urgente: calcularUrgente(inv, datos.surtidos, datos.lineas), restock, lisas: calcularLisas({ ...datos, talleresPropuestos: restock.talleresPropuestos }) }
  }, [datos])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  async function armar(tipo) {
    if (tipo === 'inventario') return reporteInventario(calc.niveles)
    if (tipo === 'porsurtir') return reportePorSurtir(calc.urgente)
    if (tipo === 'restock') return reporteRestock(calc.restock.filas)
    if (tipo === 'lisas') return reporteLisas(calc.lisas.filas)
    if (tipo === 'compras') return reporteCompras(datos.compras, datos.compraLineas, datos.compraLineasLisa, datos)
    if (tipo === 'surtidos') return reporteSurtidos(datos.surtidos, datos.lineas, { ...datos, ...rango })
    if (tipo === 'movimientos') {
      const { data, error: e } = await fetchMovimientos(rango.desde, rango.hasta)
      if (e) throw e
      return reporteMovimientos(data.movs, data.lisaMovs, { ...datos, ...rango })
    }
    throw new Error('Reporte desconocido')
  }

  async function exportar(tipo, formato) {
    setTrabajando(`${tipo}-${formato}`)
    setAviso(null)
    try {
      const rep = await armar(tipo)
      if (formato === 'csv') {
        const url = URL.createObjectURL(new Blob([reporteCSV(rep)], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = nombreArchivo(rep, 'csv')
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        setAviso(`Se descargó ${nombreArchivo(rep, 'csv')} (${rep.filas.length} renglones).`)
      } else {
        const generado = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
        setPdfNombre(nombreArchivo(rep, 'pdf'))
        setPdfBlob(await pdf(<FrisaReportePdf rep={rep} generado={generado} />).toBlob())
      }
    } catch (e) {
      setAviso(null)
      window.alert(e.message || 'No se pudo armar el reporte.')
    }
    setTrabajando(null)
  }

  const REPORTES = [
    ['porsurtir', 'Por surtir contra inventario', 'Todas las órdenes pendientes: por clave, cuánto piden, cuánto hay y cuánto falta producir, con los totales.'],
    ['inventario', 'Inventario de la fábrica', 'Cada clave con real, apartado, disponible, niveles y A PEDIR, en este momento.'],
    ['movimientos', 'Movimientos del inventario', 'Entradas y salidas (entregas, ingresos a bodega, compras, ajustes y playera lisa) en las fechas de abajo.', true],
    ['surtidos', 'Órdenes de surtido', 'OC, planta, estado, quién surtió, remisión y piezas por clave, creadas en las fechas de abajo.', true],
    ['restock', 'Restock', 'Disponible, en proceso, por entrar y A PEDIR de cada clave.'],
    ['lisas', 'Playera lisa', 'Stock, comprometidas, libres y a comprar por color, manga y talla.'],
    ['compras', 'Pedidos de compra', 'Todos los pedidos de compra (pantalón y playera lisa) con lo que llegó.'],
  ]

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · reportes</h1>
          <p className="page-subtitle">Exporta en cualquier momento: CSV (para Excel) o PDF con vista previa antes de descargar.</p>
        </div>
      </div>
      {aviso && <p className="frisa__ok">{aviso}</p>}

      <div className="frisa-form__fila frisa-reportes__rango">
        <label><span className="field-label">Desde</span><input className="input" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
        <label><span className="field-label">Hasta</span><input className="input" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
        <label><span className="field-label">Órdenes de surtido</span>
          <select className="input" value={rango.estado} onChange={(e) => setRango({ ...rango, estado: e.target.value })}>
            <option value="todos">Todas</option><option value="pendiente">Pendientes</option><option value="surtida">Surtidas</option>
            <option value="entregada">Entregadas</option><option value="cancelada">Canceladas</option>
          </select>
        </label>
      </div>

      <div className="frisa-reportes__lista">
        {REPORTES.map(([k, titulo, desc, usaFechas]) => (
          <div key={k} className="card frisa-reportes__item">
            <div>
              <h3 className="section-title section-title--small">{titulo}</h3>
              <p className="frisa__sub">{desc}{usaFechas ? ` (${rango.desde || 'inicio'} a ${rango.hasta || 'hoy'})` : ''}</p>
            </div>
            <div className="frisa__botones">
              <button type="button" className="btn btn--primary btn--small" disabled={!!trabajando} onClick={() => exportar(k, 'pdf')}>
                {trabajando === `${k}-pdf` ? 'Armando…' : 'Ver PDF'}
              </button>
              <button type="button" className="btn btn--secondary btn--small" disabled={!!trabajando} onClick={() => exportar(k, 'csv')}>
                {trabajando === `${k}-csv` ? 'Armando…' : 'Descargar CSV'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfNombre} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
