import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrders } from '../hooks/useOrders'
import { fetchTareas, marcarTarea } from '../services/tareasService'
import { fetchPendientes, ESTADOS } from '../services/pendientesService'
import { ordenesParaEntregar, pendientesPorLlevar, piezasDeOrden, tareasPendientes } from '../utils/chofer'
import { hoyLocal } from '../utils/tareas'
import { daysUntil, formatDate } from '../utils/dates'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// V169 — pantalla de inicio del chofer: sus tareas, las órdenes listas para
// entregar (solo consulta, sin precios) y los pendientes tienda ↔ fábrica
// que van en camino. Ver schema_v169_rol_chofer.sql.

function entregaTexto(fecha) {
  if (!fecha) return 'Sin fecha de entrega'
  const d = daysUntil(fecha)
  const cuando = d < 0 ? `atrasada ${Math.abs(d)} d` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`
  return `Entrega ${cuando} · ${formatDate(fecha)}`
}

function MisTareas() {
  const { user, role } = useAuth()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchTareas()
    if (err) return setError(err)
    setError(null)
    setLista(tareasPendientes(data.tareas, data.completadas, { userId: user?.id, role }))
  }, [user?.id, role])

  useEffect(() => {
    load()
  }, [load])

  async function hecha(id) {
    setBusy(id)
    const { error: err } = await marcarTarea(id, true)
    setBusy(null)
    if (err) return setError(err)
    load()
  }

  const hoy = hoyLocal()
  return (
    <section className="chofer-seccion">
      <div className="section-header">
        <h2 className="section-title">Mis tareas {lista && <span className="section-count">{lista.length}</span>}</h2>
        <Link to="/tareas" className="btn btn--ghost btn--small">
          Ver todas
        </Link>
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!error && !lista && <Loading label="Cargando tareas…" />}
      {lista && lista.length === 0 && <p className="chofer-vacio">✓ No tienes tareas pendientes.</p>}
      {lista && lista.length > 0 && (
        <div className="estacion-list">
          {lista.map((t) => {
            const vencida = t.fecha_limite && t.fecha_limite < hoy
            return (
              <article key={t.id} className={'chofer-card' + (vencida ? ' chofer-card--alerta' : '')}>
                <b className="chofer-card__titulo">{t.titulo}</b>
                {t.descripcion && <span className="chofer-card__texto">{t.descripcion}</span>}
                {t.fecha_limite && (
                  <span className={'chofer-card__fecha' + (vencida ? ' chofer-card__fecha--alerta' : '')}>
                    {vencida ? 'Venció' : 'Para'} el {formatDate(t.fecha_limite)}
                  </span>
                )}
                <button type="button" className="btn btn--small estacion-btn--iniciar chofer-card__accion" disabled={busy === t.id} onClick={() => hecha(t.id)}>
                  {busy === t.id ? 'Guardando…' : '✓ Hecha'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function OrdenParaEntregar({ order }) {
  const [abierta, setAbierta] = useState(false)
  const { lineas, total } = piezasDeOrden(order)
  const atrasada = order.requested_delivery_date && daysUntil(order.requested_delivery_date) < 0
  const tel = String(order.client_telefono || '').trim()
  return (
    <article className={'chofer-card' + (atrasada ? ' chofer-card--alerta' : '')}>
      <span className="estacion-card__folio">#{order.order_number}</span>
      <b className="chofer-card__titulo">{order.client_name}</b>
      {order.equipo && <span className="chofer-card__texto">Equipo: {order.equipo}</span>}
      {tel && (
        <a className="chofer-card__tel" href={`tel:${tel.replace(/[^\d+]/g, '')}`}>
          📞 {tel}
        </a>
      )}
      <span className={'chofer-card__fecha' + (atrasada ? ' chofer-card__fecha--alerta' : '')}>{entregaTexto(order.requested_delivery_date)}</span>
      <button type="button" className="chofer-card__toggle" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
        {abierta ? '▾' : '▸'} {total} {total === 1 ? 'pieza' : 'piezas'}
        {lineas.length > 0 && !abierta ? ` · ${lineas.map((l) => l.prenda).join(', ')}` : ''}
      </button>
      {abierta && (
        <ul className="chofer-piezas">
          {lineas.map((l, i) => (
            <li key={i}>
              <b>{l.prenda}</b>
              {l.color ? ` · ${l.color}` : ''} — {l.total}
              <span className="chofer-card__texto">{l.tallas}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function ParaEntregar() {
  const { orders, loading, error, refresh } = useOrders()
  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  const lista = ordenesParaEntregar(orders)
  return (
    <section className="chofer-seccion">
      <div className="section-header">
        <h2 className="section-title">
          Listas para entregar <span className="section-count">{lista.length}</span>
        </h2>
      </div>
      {lista.length === 0 ? (
        <EmptyState>No hay órdenes listas para entregar.</EmptyState>
      ) : (
        <div className="estacion-list">
          {lista.map((o) => (
            <OrdenParaEntregar key={o.id} order={o} />
          ))}
        </div>
      )}
    </section>
  )
}

function ListaPendientes({ titulo, items }) {
  return (
    <>
      <h3 className="section-title section-title--small">
        {titulo} <span className="section-count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="chofer-vacio chofer-vacio--neutro">Nada por ahora.</p>
      ) : (
        <div className="estacion-list">
          {items.map((p) => (
            <Link key={p.id} to={`/pendientes/${p.id}`} className="chofer-card chofer-card--link">
              <span className="estacion-card__folio">{p.folio}</span>
              <b className="chofer-card__titulo">{p.descripcion}</b>
              <span className="chofer-card__texto">
                {p.cantidad} {p.cantidad === 1 ? 'pieza' : 'piezas'}
                {p.tipo?.nombre ? ` · ${p.tipo.nombre}` : ''}
                {p.cliente?.nombre || p.cliente_nombre ? ` · ${p.cliente?.nombre || p.cliente_nombre}` : ''}
              </span>
              <span className="chofer-card__fecha">{ESTADOS[p.estado]?.short || p.estado}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function PendientesEnCamino() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const load = useCallback(async () => {
    const { data, error: err } = await fetchPendientes()
    if (err) return setError(err)
    setError(null)
    setItems(data || [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!items) return <Loading label="Cargando pendientes…" />
  const { aFabrica, aTienda } = pendientesPorLlevar(items)
  return (
    <section className="chofer-seccion">
      <div className="section-header">
        <h2 className="section-title">Pendientes tienda ↔ fábrica</h2>
        <Link to="/pendientes" className="btn btn--ghost btn--small">
          Ver todos
        </Link>
      </div>
      <ListaPendientes titulo="Llevar a fábrica" items={aFabrica} />
      <ListaPendientes titulo="Llevar a tienda" items={aTienda} />
    </section>
  )
}

export default function ChoferHomePage() {
  return (
    <div className="page estacion-page">
      <MisTareas />
      <ParaEntregar />
      <PendientesEnCamino />
    </div>
  )
}
