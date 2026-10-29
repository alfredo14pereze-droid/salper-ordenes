import { coincideBusquedaOrden } from '../utils/ordenesBusqueda'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useAllOrdenEtapas } from '../hooks/useAllOrdenEtapas'
import { fetchResumenDisenos } from '../services/disenosService'
import { ETAPA_ESTADO_COLORS } from '../lib/constants'
import { autorizarDiseno } from '../services/ordersService'
import { canAutorizarDiseno } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import { badgesSublimado, bandejasSublimado } from '../utils/flujoSublimado'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import EstacionCard from '../components/orders/EstacionCard'

// V120 — pantalla de inicio del rol sublimado (Samuel). El buscador de
// folio abarca TODAS las órdenes (cualquier tipo), porque también sube
// diseños a órdenes que no son de sublimación.
// V165 — las órdenes van en secuencia, en tres listas de pendientes:
// diseño (sin autorizar) → impresión → sublimado. Ya sublimadas pasan a
// "Todas" (historial). Ver utils/flujoSublimado.js. Cada tarjeta lleva los
// chips de los tres pasos (verdes al cumplirse) y, en "Pendientes de diseño",
// el botón "Diseño autorizado".
function Chip({ estado, children }) {
  const c = ETAPA_ESTADO_COLORS[estado] || ETAPA_ESTADO_COLORS.pendiente
  return (
    <span className="badge" style={{ background: c.color, color: c.textColor }}>
      {estado === 'completado' ? '✓ ' : ''}
      {children}
    </span>
  )
}

function BotonAutorizar({ order, sinDisenoFinal, onHecho }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function autorizar() {
    setBusy(true)
    setError(null)
    const { error: err } = await autorizarDiseno(order.id, true)
    setBusy(false)
    if (err) return setError(err)
    onHecho()
  }
  return (
    <div className="sub-card__accion">
      {sinDisenoFinal && <span className="pantone-hint">Sin diseño final subido</span>}
      <button type="button" className="btn btn--small estacion-btn--iniciar" disabled={busy} onClick={autorizar}>
        {busy ? 'Guardando…' : 'Diseño autorizado'}
      </button>
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

export default function SublimadoHomePage() {
  const { orders, loading: loadingOrders, error: errorOrders, refresh: refreshOrders } = useOrders()
  const { etapasPorOrden, loading: loadingEtapas, error: errorEtapas, refresh: refreshEtapas } = useAllOrdenEtapas()
  const [disenosPorOrden, setDisenosPorOrden] = useState({})
  const { role } = useAuth()
  const puedeAutorizar = canAutorizarDiseno(role)
  const [tab, setTab] = useState('diseno')
  const [busqueda, setBusqueda] = useState('')

  const loadDisenos = useCallback(async () => {
    const { data, error } = await fetchResumenDisenos()
    if (error) {
      // El dashboard sigue siendo útil sin los chips de diseño.
      console.error('No se pudieron cargar los diseños:', error.message)
      return
    }
    const grouped = {}
    for (const d of data || []) {
      if (!grouped[d.order_id]) grouped[d.order_id] = new Set()
      grouped[d.order_id].add(d.tipo)
    }
    setDisenosPorOrden(grouped)
  }, [])

  useEffect(() => {
    loadDisenos()
  }, [loadDisenos, orders])

  const bandejas = useMemo(() => bandejasSublimado(orders, etapasPorOrden), [orders, etapasPorOrden])

  const texto = busqueda.trim().toLowerCase()
  const encontradas = useMemo(
    () => (texto ? orders.filter((o) => coincideBusquedaOrden(o, texto)) : null),
    [orders, texto]
  )

  const loading = loadingOrders || loadingEtapas
  const error = errorOrders || errorEtapas
  function refresh() {
    refreshOrders()
    refreshEtapas()
    loadDisenos()
  }

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  const actual = bandejas.find((b) => b.key === tab) || bandejas[0]
  const lista = encontradas || actual.ordenes

  return (
    <div className="page estacion-page">
      <h2 className="section-title">Órdenes de sublimado</h2>

      <input
        type="search"
        className="input"
        placeholder="Buscar folio, folio anterior o cliente (cualquier orden)"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {!encontradas && (
        <div className="pf-tabs" role="tablist">
          {bandejas.map((b) => (
            <button key={b.key} type="button" role="tab" aria-selected={b.key === actual.key} className={'pf-tab' + (b.key === actual.key ? ' pf-tab--on' : '')} onClick={() => setTab(b.key)}>
              {b.label} <span className="pf-tab__n">{b.ordenes.length}</span>
            </button>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <EmptyState>{encontradas ? 'Ninguna orden coincide con esa búsqueda.' : `No hay órdenes en “${actual.label}”.`}</EmptyState>
      ) : (
        <div className="estacion-list">
          {lista.map((o) => {
            const sinDisenoFinal = !disenosPorOrden[o.id]?.has('final')
            const card = (
              <EstacionCard key={o.id} order={o}>
                <span className="estacion-card__chips">
                  {o.order_type_key === 'sublimacion' &&
                    badgesSublimado(o, etapasPorOrden[o.id]).map((b) => (
                      <Chip key={b.key} estado={b.estado}>
                        {b.label}
                      </Chip>
                    ))}
                </span>
              </EstacionCard>
            )
            // El botón va fuera de la tarjeta (la tarjeta entera es un botón que abre la orden).
            if (!encontradas && actual.key === 'diseno' && puedeAutorizar) {
              return (
                <div key={o.id} className="sub-card">
                  {card}
                  <BotonAutorizar order={o} sinDisenoFinal={sinDisenoFinal} onHecho={refresh} />
                </div>
              )
            }
            return card
          })}
        </div>
      )}
    </div>
  )
}
