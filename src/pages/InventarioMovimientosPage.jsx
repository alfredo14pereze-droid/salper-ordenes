import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useInventarioCatalogos } from '../hooks/useInventario'
import { fetchReporteMovimientos } from '../services/inventarioService'
import { formatTalla } from '../utils/inventarioTallas'

// V119 — Reporte global de movimientos: a diferencia del historial por
// artículo (HistorialModal, un folio/talla a la vez), esta pantalla junta
// TODOS los movimientos (entradas/salidas/ajustes/conteos, cualquier
// sección) en un rango de fechas, para revisar de un vistazo qué pasó hoy,
// esta semana, este mes, etc. Mismo público que ya ve Inventario — no es
// información nueva, solo la junta y filtra (ver schema_v119).

const TIPO_LABEL = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', conteo: 'Conteo' }

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function toInputValue(d) {
  const x = startOfDay(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function fromInputValue(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function formatFecha(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function InventarioMovimientosPage() {
  return (
    <RequireInventarioAccess>
      <InventarioMovimientosContent />
    </RequireInventarioAccess>
  )
}

function InventarioMovimientosContent() {
  const { secciones, ubicaciones, loading: loadingCatalogos } = useInventarioCatalogos()
  const [rangoModo, setRangoModo] = useState('hoy') // 'hoy' | 'semana' | 'mes' | 'custom'
  const hoy = useMemo(() => new Date(), [])
  const [customDesde, setCustomDesde] = useState(toInputValue(hoy))
  const [customHasta, setCustomHasta] = useState(toInputValue(hoy))
  const [seccionId, setSeccionId] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [tipo, setTipo] = useState('')

  const { desde, hasta } = useMemo(() => {
    if (rangoModo === 'hoy') {
      const d = startOfDay(hoy)
      return { desde: d, hasta: addDays(d, 1) }
    }
    if (rangoModo === 'semana') {
      const d = startOfDay(hoy)
      return { desde: addDays(d, -6), hasta: addDays(d, 1) }
    }
    if (rangoModo === 'mes') {
      const d = startOfDay(hoy)
      return { desde: new Date(d.getFullYear(), d.getMonth(), 1), hasta: addDays(d, 1) }
    }
    return { desde: startOfDay(fromInputValue(customDesde)), hasta: addDays(startOfDay(fromInputValue(customHasta)), 1) }
  }, [rangoModo, hoy, customDesde, customHasta])

  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await fetchReporteMovimientos({
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      seccionId: seccionId || null,
      ubicacionId: ubicacionId || null,
      tipo: tipo || null,
    })
    if (fetchError) setError(fetchError)
    else {
      setFilas(data || [])
      setError(null)
    }
    setLoading(false)
  }, [desde, hasta, seccionId, ubicacionId, tipo])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totalEntradas = useMemo(() => filas.filter((f) => f.cantidad > 0).reduce((s, f) => s + f.cantidad, 0), [filas])
  const totalSalidas = useMemo(() => filas.filter((f) => f.cantidad < 0).reduce((s, f) => s + f.cantidad, 0), [filas])

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Movimientos de inventario</h2>
        <Link to="/inventario" className="btn btn--ghost btn--small">
          ← Inventario
        </Link>
      </div>
      <p className="page-subtitle">Entradas, salidas, ajustes y conteos de todas las secciones, en un rango de fechas.</p>

      <div className="order-filters">
        <div className="order-filters__group">
          <span className="order-filters__label">Rango</span>
          <div className="order-filters__chips">
            {[
              ['hoy', 'Hoy'],
              ['semana', 'Esta semana'],
              ['mes', 'Este mes'],
              ['custom', 'Personalizado'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={'chip' + (rangoModo === key ? ' chip--active' : '')}
                onClick={() => setRangoModo(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {rangoModo === 'custom' && (
          <div className="order-filters__group">
            <span className="order-filters__label">Del — al</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" className="input" value={customDesde} max={customHasta} onChange={(e) => setCustomDesde(e.target.value)} />
              <input type="date" className="input" value={customHasta} min={customDesde} max={toInputValue(hoy)} onChange={(e) => setCustomHasta(e.target.value)} />
            </div>
          </div>
        )}

        <div className="order-filters__group">
          <span className="order-filters__label">Tipo</span>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajuste</option>
            <option value="conteo">Conteo</option>
          </select>
        </div>

        <div className="order-filters__group">
          <span className="order-filters__label">Sección</span>
          <select className="input" value={seccionId} onChange={(e) => setSeccionId(e.target.value)} disabled={loadingCatalogos}>
            <option value="">Todas</option>
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="order-filters__group">
          <span className="order-filters__label">Ubicación</span>
          <select className="input" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} disabled={loadingCatalogos}>
            <option value="">Todas</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && !error && filas.length > 0 && (
        <p className="page-subtitle" style={{ marginTop: -8 }}>
          {filas.length} movimiento{filas.length === 1 ? '' : 's'} · entradas +{totalEntradas} · salidas {totalSalidas}
        </p>
      )}

      {loading && <Loading label="Cargando movimientos…" />}
      {error && <ErrorState error={error} onRetry={cargar} />}
      {!loading && !error && filas.length === 0 && <EmptyState>No hay movimientos en este rango.</EmptyState>}
      {!loading && !error && filas.length > 0 && (
        <div className="revision__tabla-wrap">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Prenda</th>
                <th>Sección</th>
                <th>Ubicación</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Motivo</th>
                <th>Nota</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{formatFecha(f.creado_en)}</td>
                  <td>
                    {f.prenda} · {formatTalla(f.talla)}
                  </td>
                  <td>{f.seccion}</td>
                  <td>{f.ubicacion}</td>
                  <td>{TIPO_LABEL[f.tipo] || f.tipo}</td>
                  <td style={{ color: f.cantidad < 0 ? 'var(--color-danger)' : 'var(--color-good)', fontWeight: 700 }}>
                    {f.cantidad > 0 ? `+${f.cantidad}` : f.cantidad}
                  </td>
                  <td>{f.motivo}</td>
                  <td>
                    {f.nota || '—'}
                    {f.traspaso_folio && ` (${f.traspaso_folio})`}
                  </td>
                  <td>{f.usuario || 'Sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
