import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import StatusBadge from '../components/orders/StatusBadge'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../contexts/AuthContext'
import { canDeliverOrder, canForceDelivery } from '../utils/permissions'
import { entregarOrden } from '../services/ordersService'
import { resumenPrendas } from '../utils/prendas'
import { formatDate } from '../utils/dates'
import { entregarVarias, motivoBloqueo, ordenesEntregables } from '../utils/entregaMasiva'

// Entrega masiva: marcar muchas órdenes como entregadas a la vez. Cada una
// pasa por entregar_orden (V160): mismas reglas que el botón del detalle. Las
// que falten de precio/factura se listan aparte y, con permiso, se pueden
// "entregar de todos modos" con un motivo (queda registrado en cada orden).
export default function EntregaMasivaPage() {
  return (
    <RequireRole allow={canDeliverOrder}>
      <EntregaMasivaContent />
    </RequireRole>
  )
}

function EntregaMasivaContent() {
  const { role } = useAuth()
  const puedeForzar = canForceDelivery(role)
  const { orders, loading, error, refresh } = useOrders()
  const [soloListas, setSoloListas] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [progreso, setProgreso] = useState(null) // { n, total }
  const [resultado, setResultado] = useState(null)
  const [motivo, setMotivo] = useState('')

  const porId = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders])
  const lista = useMemo(() => ordenesEntregables(orders, { soloListas, busqueda }), [orders, soloListas, busqueda])
  const visiblesSeleccionadas = lista.filter((o) => seleccion.has(o.id))
  const todasMarcadas = lista.length > 0 && visiblesSeleccionadas.length === lista.length
  const ocupado = !!progreso

  function alternar(id) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function alternarTodas() {
    setSeleccion((s) => {
      const n = new Set(s)
      if (todasMarcadas) lista.forEach((o) => n.delete(o.id))
      else lista.forEach((o) => n.add(o.id))
      return n
    })
  }

  async function entregar(ids, opciones = {}) {
    setProgreso({ n: 0, total: ids.length })
    const r = await entregarVarias(ids, entregarOrden, { ...opciones, onProgreso: (n, total) => setProgreso({ n, total }) })
    setProgreso(null)
    return r
  }

  async function handleEntregar() {
    const ids = visiblesSeleccionadas.map((o) => o.id)
    if (ids.length === 0) return
    if (!window.confirm(`¿Confirmas que estas ${ids.length} órdenes ya se entregaron al cliente? Pasarán a Órdenes pasadas.`)) return
    setResultado(null)
    const r = await entregar(ids)
    setResultado(r)
    setMotivo('')
    setSeleccion(new Set())
    refresh()
  }

  async function handleForzar() {
    const ids = resultado.bloqueadas.map((b) => b.id)
    if (motivo.trim().length < 5) return
    if (!window.confirm(`¿Entregar de todos modos estas ${ids.length} órdenes? El motivo queda registrado en cada una.`)) return
    const r = await entregar(ids, { forzar: true, motivo: motivo.trim() })
    setResultado((prev) => ({
      entregadas: [...prev.entregadas, ...r.entregadas],
      bloqueadas: r.bloqueadas,
      errores: [...prev.errores, ...r.errores],
      forzadas: [...(prev.forzadas || []), ...r.entregadas],
    }))
    setMotivo('')
    refresh()
  }

  const folio = (id) => porId[id]?.order_number || id

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} />

  return (
    <div className="page">
      <h1 className="page-title">Entrega masiva</h1>
      <p className="page-subtitle">
        Marca varias órdenes como entregadas al mismo tiempo. Se revisa cada una igual que en su detalle (precios y factura).
      </p>

      {resultado && (
        <section className="card entrega-masiva__resultado">
          {resultado.entregadas.length > 0 && (
            <p className="fin-ok" style={{ marginTop: 0 }}>
              ✓ {resultado.entregadas.length} {resultado.entregadas.length === 1 ? 'orden entregada' : 'órdenes entregadas'}
              {resultado.forzadas?.length > 0 && ` (${resultado.forzadas.length} de todos modos, con motivo)`}:{' '}
              {resultado.entregadas.map(folio).join(', ')}
            </p>
          )}
          {resultado.bloqueadas.length > 0 && (
            <div className="entrega-forzar">
              <p className="fin-missing" style={{ marginTop: 0 }}>
                {resultado.bloqueadas.length} no se {resultado.bloqueadas.length === 1 ? 'pudo' : 'pudieron'} entregar por falta de
                precio o datos de factura:
              </p>
              <ul className="entrega-masiva__bloqueadas">
                {resultado.bloqueadas.map((b) => (
                  <li key={b.id}>
                    <Link to={`/orden/${b.id}`}>{folio(b.id)}</Link> · {porId[b.id]?.client_name} — {motivoBloqueo(b.mensaje)}
                  </li>
                ))}
              </ul>
              {puedeForzar ? (
                <>
                  <label className="entrega-forzar__motivo">
                    Si de todos modos ya se entregaron, escribe el motivo (queda registrado en cada orden con tu nombre):
                    <textarea
                      className="input"
                      rows={2}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ej. Órdenes entregadas en septiembre; los precios se capturan después."
                    />
                  </label>
                  <div>
                    <button type="button" className="btn btn--primary" disabled={ocupado || motivo.trim().length < 5} onClick={handleForzar}>
                      Entregar de todos modos ({resultado.bloqueadas.length})
                    </button>
                  </div>
                </>
              ) : (
                <p className="page-subtitle">Captura sus precios en el detalle de cada orden y vuelve a intentarlo.</p>
              )}
            </div>
          )}
          {resultado.errores.length > 0 && (
            <div>
              <p className="form-error">No se pudieron entregar:</p>
              <ul className="entrega-masiva__bloqueadas">
                {resultado.errores.map((e) => (
                  <li key={e.id}>
                    <Link to={`/orden/${e.id}`}>{folio(e.id)}</Link> — {e.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setResultado(null)} disabled={ocupado}>
            Cerrar resumen
          </button>
        </section>
      )}

      <section className="card">
        <div className="entrega-masiva__filtros">
          <div className="entrega-masiva__chips">
            <button type="button" className={`chip${soloListas ? ' chip--active' : ''}`} onClick={() => setSoloListas(true)}>
              Listas para entregar
            </button>
            <button type="button" className={`chip${!soloListas ? ' chip--active' : ''}`} onClick={() => setSoloListas(false)}>
              Todas sin entregar
            </button>
          </div>
          <input
            type="search"
            className="input"
            placeholder="Buscar folio, cliente o equipo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {lista.length === 0 ? (
          <EmptyState>
            {soloListas ? 'No hay órdenes listas para entregar. Prueba con "Todas sin entregar".' : 'No hay órdenes sin entregar.'}
          </EmptyState>
        ) : (
          <>
            <div className="entrega-masiva__barra">
              <label className="fin-check entrega-masiva__todas">
                <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} disabled={ocupado} aria-label="Seleccionar todas" />
                Seleccionar todas ({lista.length})
              </label>
              <button
                type="button"
                className="btn btn--primary"
                disabled={ocupado || visiblesSeleccionadas.length === 0}
                onClick={handleEntregar}
              >
                {progreso
                  ? `Entregando ${progreso.n} de ${progreso.total}…`
                  : `Marcar ${visiblesSeleccionadas.length} como entregada${visiblesSeleccionadas.length === 1 ? '' : 's'}`}
              </button>
            </div>
            <ul className="entrega-masiva__lista">
              {lista.map((o) => (
                <li key={o.id} className={seleccion.has(o.id) ? 'entrega-masiva__fila entrega-masiva__fila--sel' : 'entrega-masiva__fila'}>
                  <label className="entrega-masiva__check">
                    <input
                      type="checkbox"
                      checked={seleccion.has(o.id)}
                      onChange={() => alternar(o.id)}
                      disabled={ocupado}
                      aria-label={`Seleccionar ${o.order_number}`}
                    />
                  </label>
                  <div className="entrega-masiva__info">
                    <div className="entrega-masiva__titulo">
                      <Link to={`/orden/${o.id}`}><b>#{o.order_number}</b></Link> · {o.client_name}
                      {o.equipo ? ` · ${o.equipo}` : ''}
                    </div>
                    <div className="entrega-masiva__meta">
                      {resumenPrendas(o) || 'Sin prendas'} · Entrega {formatDate(o.requested_delivery_date)}
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
