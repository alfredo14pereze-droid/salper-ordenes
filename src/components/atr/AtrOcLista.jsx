import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState, Loading, EmptyState } from '../common/States'
import { fetchAtrOcDetalle, fetchAtrOcLista } from '../../services/atrService'
import { ESTADOS_OC, calcularSurtibles, ordenarOcs, pctSurtido, urgenciaEntrega } from '../../utils/atrOc'
import { normalizar } from '../../utils/atrCarga'
import { daysUntil, formatDate } from '../../utils/dates'
import AtrBata from './AtrBata'

// V215 — Órdenes de compra de ATR, con el mismo formato que las órdenes de
// surtido de Frisa: arriba el resumen (cuántas se pueden surtir y cuántas
// piezas faltan, por bata y talla) y cada OC como tarjeta con su aviso en
// verde "Se puede surtir", naranja "Alcanza, pero la ocupa OC…" o rojo
// "Faltan piezas". El inventario se reparte de la que vence primero a la última.
const FILTROS = [
  ['activas', 'Abiertas y parciales'],
  ['abierta', 'Abiertas'],
  ['parcial', 'Parciales'],
  ['surtida', 'Surtidas'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
]
const n = (x) => Number(x || 0).toLocaleString('es-MX')
const esActiva = (o) => o.estado === 'abierta' || o.estado === 'parcial'

export default function AtrOcLista({ puedeSubir }) {
  const navigate = useNavigate()
  const [lista, setLista] = useState(null)
  const [lineasPorOc, setLineasPorOc] = useState({})
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('activas')
  const [busca, setBusca] = useState('')

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await fetchAtrOcLista()
    if (e) return setError(e)
    const activas = (data || []).filter(esActiva)
    const detalles = await Promise.all(activas.map((o) => fetchAtrOcDetalle(o.id)))
    const malo = detalles.find((d) => d.error)
    if (malo) return setError(malo.error)
    setLineasPorOc(Object.fromEntries(activas.map((o, i) => [o.id, detalles[i].data || []])))
    setLista(data || [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const surt = useMemo(() => calcularSurtibles(lista || [], lineasPorOc), [lista, lineasPorOc])

  const cuenta = useMemo(() => {
    const c = { activas: 0, todas: 0 }
    for (const o of lista || []) {
      c[o.estado] = (c[o.estado] || 0) + 1
      c.todas++
      if (esActiva(o)) c.activas++
    }
    return c
  }, [lista])

  const filas = useMemo(() => {
    const q = normalizar(busca)
    return ordenarOcs(lista)
      .filter((o) => filtro === 'todas' || (filtro === 'activas' ? esActiva(o) : o.estado === filtro))
      .filter((o) => !q || normalizar(`${o.numero_oc} ${o.notas || ''}`).includes(q))
  }, [lista, filtro, busca])

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!lista) return <Loading />

  const os = surt.ordenes
  const si = os.filter((o) => o.completa)
  const compiten = os.filter((o) => o.alcanzaSola)
  const no = os.filter((o) => !o.completa && !o.alcanzaSola)
  const pz = (l) => n(l.reduce((t, o) => t + o.piezas, 0))
  const faltan = surt.porBata.filter((x) => x.falta > 0)
  const verResumen = (filtro === 'activas' || filtro === 'abierta' || filtro === 'parcial') && os.length > 0

  return (
    <div>
      {verResumen && (
        <>
          <div className="stats-grid frisa-niveles__resumen">
            <div className="stat-card"><span className="stat-card__label">Pendientes</span><span className="stat-card__value">{os.length}</span><span className="stat-card__hint">{pz(os)} batas</span></div>
            <div className="stat-card frisa-niveles__tarjeta--ok"><span className="stat-card__label">Sí se pueden surtir</span><span className="stat-card__value">{si.length}</span><span className="stat-card__hint">{pz(si)} batas, todas juntas</span></div>
            {compiten.length > 0 && (
              <div className="stat-card frisa-niveles__tarjeta--pedir"><span className="stat-card__label">Alcanzan solas</span><span className="stat-card__value">{compiten.length}</span><span className="stat-card__hint">{pz(compiten)} batas · otra que vence antes ocupa las piezas</span></div>
            )}
            <div className="stat-card frisa-niveles__tarjeta--critico"><span className="stat-card__label">No se pueden surtir</span><span className="stat-card__value">{compiten.length + no.length}</span><span className="stat-card__hint">faltan {n(surt.piezasFaltantes)} batas en total</span></div>
          </div>
          <p className="atr-muted atr-oc-meta">
            El inventario se reparte de la OC que vence primero a la última: las {si.length} en verde se pueden surtir todas al mismo tiempo con lo que hay.
          </p>
          {faltan.length > 0 && (
            <section className="atr-oc-faltan">
              <h3 className="atr-surtidos__titulo">Lo que falta por bata y talla (todas las OC pendientes)</h3>
              <div className="atr-tabla-wrap">
                <table className="simple-table atr-tabla">
                  <thead><tr><th>Bata</th><th>Talla</th><th className="atr-num">Piden</th><th className="atr-num">Hay</th><th className="atr-num">Falta</th></tr></thead>
                  <tbody>
                    {faltan.map((x) => (
                      <tr key={x.producto_id + x.talla} className="frisa-niveles__fila--critico">
                        <td><AtrBata producto={x.producto} color={x.color} conBolsa={x.con_bolsa} /></td>
                        <td>{x.talla}</td>
                        <td className="atr-num">{n(x.pendiente)}</td>
                        <td className="atr-num">{n(x.existencia)}</td>
                        <td className="atr-num"><strong className="frisa__falta">{n(x.falta)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="atr-muted atr-oc-meta">
                Para producirlo, ve a <Link to="/atr?tab=faltan">Qué nos falta</Link> (ahí también cuenta lo que ya está en taller).
              </p>
            </section>
          )}
        </>
      )}

      <div className="atr-oc-barra">
        <div className="atr-oc-filtros" role="tablist">
          {FILTROS.map(([k, t]) => (
            <button key={k} type="button" className={'atr-oc-filtro' + (filtro === k ? ' is-activo' : '')} onClick={() => setFiltro(k)}>
              {t} <span className="atr-muted">{cuenta[k] || 0}</span>
            </button>
          ))}
        </div>
        <div className="atr-acciones">
          <input className="input atr-oc-busca" placeholder="Buscar folio o planta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {puedeSubir && <Link to="/atr/oc/nueva" className="btn btn--primary">+ Nueva OC</Link>}
        </div>
      </div>

      {filas.length === 0 ? (
        <EmptyState>
          {lista.length === 0 ? 'Todavía no hay órdenes de compra de ATR.' : 'No hay órdenes de compra con este filtro.'}
        </EmptyState>
      ) : (
        <div className="frisa-oc-lista">
          {filas.map((o) => {
            const u = surt.porId[o.id]
            const urg = urgenciaEntrega(o.estado, o.fecha_entrega ? daysUntil(o.fecha_entrega) : null)
            const clase = u ? (u.completa ? ' frisa-surtido__tarjeta--ok' : u.alcanzaSola ? '' : ' frisa-surtido__tarjeta--falta') : ''
            return (
              <button key={o.id} type="button" className={'card frisa-surtido__tarjeta' + clase} onClick={() => navigate(`/atr/oc/${o.id}`)}>
                <span className="frisa-surtido__fila1">
                  <span className="frisa-oc__num">OC {o.numero_oc}</span>
                  <span className={`atr-chip atr-chip--${o.estado}`}>{ESTADOS_OC[o.estado]}</span>
                  {u && (
                    u.completa
                      ? <span className="frisa-nivel frisa-nivel--verde">Se puede surtir</span>
                      : u.alcanzaSola
                        ? <span className="frisa-nivel frisa-nivel--naranja">Alcanza, pero la ocupa {u.compiteCon.length ? `OC ${u.compiteCon.join(', OC ')}` : 'otra OC'}</span>
                        : <span className="frisa-nivel frisa-nivel--rojo">Faltan piezas</span>
                  )}
                </span>
                {o.notas && <span className="atr-muted">{o.notas}</span>}
                <span className="atr-muted atr-oc-tarjeta-sub">
                  {formatDate(o.fecha_oc)} · {n(o.surtido)} de {n(o.pedido)} batas surtidas ({pctSurtido(o)}%)
                  {o.fecha_entrega ? <> · Entrega {formatDate(o.fecha_entrega)}</> : null}
                  {esActiva(o) && <> · <span className={urg.nivel === 'overdue' ? 'frisa__falta' : urg.nivel === 'warning' ? 'atr-oc-urg--warning' : ''}>{urg.texto}</span></>}
                </span>
                {u && !u.completa && u.faltantes.length > 0 && (
                  <span className="frisa__falta">Falta: {u.faltantes.map((f) => `${f.producto} ${f.talla} (${n(f.falta)})`).join(', ')}</span>
                )}
                {u && !u.completa && u.alcanzan > 0 && (
                  <span className="frisa-surtido__trae">Hay {n(u.alcanzan)} de {n(u.piezas)} batas para surtir parcial</span>
                )}
                {o.estado === 'cancelada' && <span className="atr-muted">Cancelada: {o.motivo_cancelacion}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
