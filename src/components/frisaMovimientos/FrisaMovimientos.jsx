import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loading, ErrorState } from '../common/States'
import { fetchMovimientosVista } from '../../services/frisaRestockService'
import { armarMovimientos } from '../../utils/frisaMovimientos'
import { buscadorProducto, hoyISO } from '../../utils/frisaSurtido'
import { NombreFrisa } from '../frisaNiveles/comunes'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
const fechaHora = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const haceDias = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const GRUPOS = [
  ['', 'Todos'],
  ['entrega', 'Salidas (entregas a Frisa / al taller)'],
  ['entrada', 'Entradas (taller y compras)'],
  ['ajuste', 'Ajustes'],
  ['inicial', 'Inventario inicial'],
]

// 2026-11-12 — Movimientos de Frisa (como en el inventario normal): cada entrada y salida
// con su motivo (entrega de una OC, orden de taller, compra, ajuste por conteo o por Microsip).
export default function FrisaMovimientos() {
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoyISO() })
  const [que, setQue] = useState('bodega') // bodega | lisa
  const [grupo, setGrupo] = useState('')
  const [texto, setTexto] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: e } = await fetchMovimientosVista(rango.desde, rango.hasta)
    if (e) setError(e)
    else { setError(null); setDatos(data) }
    setCargando(false)
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  const todos = useMemo(() => (datos ? armarMovimientos(datos) : []), [datos])
  const lista = useMemo(() => {
    const busca = buscadorProducto(texto)
    const t = texto.trim().toLowerCase()
    return todos.filter((m) => m.que === que && (!grupo || m.grupo === grupo)
      && (!t || (busca && busca(m.producto || { nombre: m.nombre })) || `${m.motivo} ${m.detalle} ${m.notas} ${m.quien}`.toLowerCase().includes(t)))
  }, [todos, que, grupo, texto])
  const entradas = lista.filter((m) => m.cantidad > 0).reduce((t, m) => t + m.cantidad, 0)
  const salidas = -lista.filter((m) => m.cantidad < 0).reduce((t, m) => t + m.cantidad, 0)

  return (
    <div className="page frisa frisa-surtido">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · movimientos</h1>
          <p className="page-subtitle">Cada entrada y salida del inventario con su motivo: entregas de las órdenes de compra, órdenes de taller que se subieron a bodega, compras recibidas y ajustes (por conteo o por la revisión de Microsip).</p>
        </div>
      </div>

      <div className="frisa-form__fila frisa-reportes__rango">
        <label><span className="field-label">Desde</span><input className="input" type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></label>
        <label><span className="field-label">Hasta</span><input className="input" type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></label>
        <label className="frisa-mov__buscar"><span className="field-label">Buscar</span>
          <input className="input" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Producto, OC, orden de taller, compra, quién…" /></label>
      </div>
      <div className="order-filters__chips frisa__chips">
        <button type="button" className={'chip' + (que === 'bodega' ? ' chip--active' : '')} onClick={() => setQue('bodega')}>Bodega (prendas terminadas)</button>
        <button type="button" className={'chip' + (que === 'lisa' ? ' chip--active' : '')} onClick={() => setQue('lisa')}>Playera lisa (anaquel)</button>
      </div>
      <div className="order-filters__chips frisa__chips">
        {GRUPOS.map(([k, label]) => (
          <button key={k || 'todos'} type="button" className={'chip' + (grupo === k ? ' chip--active' : '')} onClick={() => setGrupo(k)}>{label}</button>
        ))}
      </div>

      {cargando && <Loading />}
      {error && <ErrorState error={error} onRetry={cargar} />}
      {!cargando && !error && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><span className="stat-card__label">Movimientos</span><span className="stat-card__value">{num(lista.length)}</span></div>
            <div className="stat-card"><span className="stat-card__label">Entradas</span><span className="stat-card__value frisa__ok">+{num(entradas)}</span></div>
            <div className="stat-card"><span className="stat-card__label">Salidas</span><span className="stat-card__value frisa__falta">−{num(salidas)}</span></div>
          </div>
          {!lista.length
            ? <div className="card frisa__vacio"><p>No hay movimientos con esos filtros.</p></div>
            : (
              <div className="revision__tabla-wrap">
                <table className="simple-table frisa-tabla frisa-niveles__tabla">
                  <thead><tr><th>Fecha</th><th className="frisa-aviso__prod">Producto</th><th>Motivo</th><th className="num">Cantidad</th><th>Por qué / referencia</th><th>Quién</th></tr></thead>
                  <tbody>
                    {lista.slice(0, 500).map((m) => (
                      <tr key={m.que + m.id}>
                        <td data-label="Fecha" className="frisa__sub">{fechaHora(m.en)}</td>
                        <td data-label="Producto">{m.producto ? <NombreFrisa producto={m.producto} className="frisa__prod" /> : <strong className="frisa__prod">{m.nombre}</strong>}</td>
                        <td data-label="Motivo"><strong>{m.motivo}</strong></td>
                        <td data-label="Cantidad" className={'num ' + (m.cantidad < 0 ? 'frisa__falta' : 'frisa__ok')}><strong>{m.cantidad > 0 ? '+' : ''}{num(m.cantidad)}</strong></td>
                        <td data-label="Por qué">{m.detalle}{m.notas ? <div className="frisa__sub">{m.notas}</div> : null}</td>
                        <td data-label="Quién" className="frisa__sub">{m.quien}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lista.length > 500 && <p className="frisa__sub">Se muestran los 500 más recientes; acorta las fechas para ver los demás.</p>}
              </div>
            )}
          <p className="frisa__sub">Para PDF o Excel: Reportes → Movimientos del inventario.</p>
        </>
      )}
    </div>
  )
}
