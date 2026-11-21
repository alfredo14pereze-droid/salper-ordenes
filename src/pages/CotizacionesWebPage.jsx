import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { canVerCotizacionesWeb } from '../utils/permissions'
import { formatDateTime, formatDate } from '../utils/dates'
import {
  ESTADOS_COTIZACION_WEB,
  EVENTO_COTIZACIONES_WEB,
  cambiarEstadoCotizacionWeb,
  fetchCotizacionesWeb,
} from '../services/cotizacionesWebService'
import '../components/cotizaciones/cotizaciones.css'
import AyudaModulo from '../components/common/AyudaModulo'

// V213 — Cotizaciones web: lo que llega del formulario de salperdeportes.com.
// Vista simple (fecha, nombre, empresa, productos, estado); luego se integra al CRM.
export default function CotizacionesWebPage() {
  return (
    <RequireRole allow={canVerCotizacionesWeb}>
      <CotizacionesWeb />
    </RequireRole>
  )
}

const TODAS = 'todas'

function CotizacionesWeb() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState(TODAS)
  const [abierta, setAbierta] = useState(null)
  const [guardando, setGuardando] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: err } = await fetchCotizacionesWeb()
    setError(err || null)
    setFilas(data || [])
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuenta = useMemo(() => {
    const c = { [TODAS]: filas.length }
    ESTADOS_COTIZACION_WEB.forEach((e) => (c[e.key] = filas.filter((f) => f.estado === e.key).length))
    return c
  }, [filas])

  const visibles = filtro === TODAS ? filas : filas.filter((f) => f.estado === filtro)

  async function cambiar(fila, estado) {
    setGuardando(fila.id)
    setErrorAccion(null)
    const { error: err } = await cambiarEstadoCotizacionWeb(fila.id, estado)
    setGuardando(null)
    if (err) return setErrorAccion(err)
    setFilas((fs) => fs.map((f) => (f.id === fila.id ? { ...f, estado } : f)))
    window.dispatchEvent(new Event(EVENTO_COTIZACIONES_WEB))
  }

  return (
    <div className="page cotweb">
      <div className="section-header">
        <h2 className="section-title">Cotizaciones web <AyudaModulo id="cotizaciones-web" /></h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={cargar}>
          Actualizar
        </button>
      </div>
      <p className="cotweb__ayuda">Solicitudes del formulario de cotización de salperdeportes.com.</p>

      <div className="cotweb__filtros" role="tablist" aria-label="Filtrar por estado">
        {[{ key: TODAS, label: 'Todas' }, ...ESTADOS_COTIZACION_WEB].map((e) => (
          <button
            key={e.key}
            type="button"
            role="tab"
            aria-selected={filtro === e.key}
            className={'chip' + (filtro === e.key ? ' chip--active' : '')}
            onClick={() => setFiltro(e.key)}
          >
            {e.label} <span className="cotweb__n">{cuenta[e.key] || 0}</span>
          </button>
        ))}
      </div>

      {errorAccion && <ErrorState error={errorAccion} />}
      {cargando ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={cargar} />
      ) : visibles.length === 0 ? (
        <EmptyState>{filas.length === 0 ? 'Todavía no llegan cotizaciones de la página.' : 'No hay cotizaciones con este estado.'}</EmptyState>
      ) : (
        <div className="cotweb__tabla-wrap">
          <table className="simple-table cotweb__tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>Productos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <Fragment key={f.id}>
                  <tr className={'cotweb__fila' + (f.estado === 'nueva' ? ' is-nueva' : '')} onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                    <td data-label="Fecha">{formatDateTime(f.created_at)}</td>
                    <td data-label="Nombre">
                      <strong>{f.nombre}</strong>
                      <span className="cotweb__muted">
                        {f.telefono} · {f.correo}
                      </span>
                    </td>
                    <td data-label="Empresa">{f.empresa || <span className="cotweb__muted">—</span>}</td>
                    <td data-label="Productos">
                      {f.productos?.length ? f.productos.join(', ') : <span className="cotweb__muted">—</span>}
                    </td>
                    <td data-label="Estado" onClick={(ev) => ev.stopPropagation()}>
                      <select
                        className={`input input--small cotweb__estado cotweb__estado--${f.estado}`}
                        value={f.estado}
                        disabled={guardando === f.id}
                        onChange={(ev) => cambiar(f, ev.target.value)}
                        aria-label={`Estado de la cotización de ${f.nombre}`}
                      >
                        {ESTADOS_COTIZACION_WEB.map((e) => (
                          <option key={e.key} value={e.key}>
                            {e.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {abierta === f.id && (
                    <tr className="cotweb__detalle">
                      <td colSpan={5}>
                        <dl>
                          <Dato k="Teléfono" v={<a href={`tel:${f.telefono.replace(/[^\d+]/g, '')}`}>{f.telefono}</a>} />
                          <Dato k="Correo" v={<a href={`mailto:${f.correo}`}>{f.correo}</a>} />
                          <Dato k="Sector" v={f.sector} />
                          <Dato k="Cantidad aproximada" v={f.cantidad_aprox} />
                          <Dato k="Personalización" v={f.personalizacion?.join(', ')} />
                          <Dato k="Fecha deseada" v={f.fecha_deseada && formatDate(f.fecha_deseada)} />
                          <Dato k="Mensaje" v={f.mensaje} ancho />
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Dato({ k, v, ancho }) {
  if (!v) return null
  return (
    <div className={ancho ? 'cotweb__dato--ancho' : undefined}>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}
