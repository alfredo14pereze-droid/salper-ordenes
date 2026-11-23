import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState, Loading, EmptyState } from '../common/States'
import { fetchAtrOcLista } from '../../services/atrService'
import { ESTADOS_OC, ordenarOcs, pctSurtido, urgenciaEntrega } from '../../utils/atrOc'
import { normalizar } from '../../utils/atrCarga'
import { daysUntil, formatDate } from '../../utils/dates'

// V215 — Lista de OC de ATR. Abiertas y parciales primero (por fecha de
// entrega); filtro por estado; clic → detalle.
const FILTROS = [
  ['activas', 'Abiertas y parciales'],
  ['abierta', 'Abiertas'],
  ['parcial', 'Parciales'],
  ['surtida', 'Surtidas'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
]

export default function AtrOcLista({ puedeSubir }) {
  const navigate = useNavigate()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('activas')
  const [busca, setBusca] = useState('')

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await fetchAtrOcLista()
    if (e) return setError(e)
    setLista(data || [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cuenta = useMemo(() => {
    const c = { activas: 0, todas: 0 }
    for (const o of lista || []) {
      c[o.estado] = (c[o.estado] || 0) + 1
      c.todas++
      if (o.estado === 'abierta' || o.estado === 'parcial') c.activas++
    }
    return c
  }, [lista])

  const filas = useMemo(() => {
    const q = normalizar(busca)
    return ordenarOcs(lista)
      .filter((o) => filtro === 'todas' || (filtro === 'activas' ? o.estado === 'abierta' || o.estado === 'parcial' : o.estado === filtro))
      .filter((o) => !q || normalizar(o.numero_oc).includes(q))
  }, [lista, filtro, busca])

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!lista) return <Loading />

  return (
    <div>
      <div className="atr-oc-barra">
        <div className="atr-oc-filtros" role="tablist">
          {FILTROS.map(([k, t]) => (
            <button key={k} type="button" className={'atr-oc-filtro' + (filtro === k ? ' is-activo' : '')} onClick={() => setFiltro(k)}>
              {t} <span className="atr-muted">{cuenta[k] || 0}</span>
            </button>
          ))}
        </div>
        <div className="atr-acciones">
          <input className="input atr-oc-busca" placeholder="Buscar folio…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {puedeSubir && <Link to="/atr/oc/nueva" className="btn btn--primary">+ Nueva OC</Link>}
        </div>
      </div>

      {filas.length === 0 ? (
        <EmptyState>
          {lista.length === 0 ? 'Todavía no hay órdenes de compra de ATR.' : 'No hay órdenes de compra con este filtro.'}
        </EmptyState>
      ) : (
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-tabla">
            <thead>
              <tr><th>Folio</th><th>Fecha</th><th>Entrega</th><th>Estado</th><th className="atr-oc-col-pct">% surtido</th></tr>
            </thead>
            <tbody>
              {filas.map((o) => {
                const urg = urgenciaEntrega(o.estado, o.fecha_entrega ? daysUntil(o.fecha_entrega) : null)
                const pct = pctSurtido(o)
                return (
                  <tr key={o.id} className="atr-tabla__fila" onClick={() => navigate(`/atr/oc/${o.id}`)}>
                    <td><strong>{o.numero_oc}</strong></td>
                    <td>{formatDate(o.fecha_oc)}</td>
                    <td>
                      {o.fecha_entrega ? formatDate(o.fecha_entrega) : '—'}
                      {o.estado !== 'cancelada' && o.estado !== 'surtida' && (
                        <div className={'order-card__due atr-oc-urg' + (urg.nivel ? ` order-card__due--${urg.nivel}` : '')}>{urg.texto}</div>
                      )}
                    </td>
                    <td><span className={`atr-chip atr-chip--${o.estado}`}>{ESTADOS_OC[o.estado]}</span></td>
                    <td>
                      <div className="atr-oc-pct" aria-label={`${pct}% surtido`}>
                        <div className="atr-oc-pct__barra"><span style={{ width: `${pct}%` }} /></div>
                        <span className="atr-num">{pct}%</span>
                      </div>
                      <div className="atr-muted atr-oc-pzas">{o.surtido.toLocaleString('es-MX')} / {o.pedido.toLocaleString('es-MX')} batas</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
