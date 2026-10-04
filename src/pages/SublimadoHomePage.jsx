import { coincideBusquedaOrden } from '../utils/ordenesBusqueda'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useAllOrdenEtapas } from '../hooks/useAllOrdenEtapas'
import { fetchResumenDisenos } from '../services/disenosService'
import { ETAPA_ESTADO_COLORS } from '../lib/constants'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import EstacionCard from '../components/orders/EstacionCard'

// V120 — pantalla de inicio del rol sublimado (Samuel): dashboard de las
// órdenes de sublimación con el estado de su impresión, su sublimada (V131) y
// su diseño. Bandejas: lo que falta imprimir, lo que falta sublimar, lo que
// todavía no tiene diseño final, y todas las de sublimación que siguen vivas. El buscador de
// folio abarca TODAS las órdenes (cualquier tipo), porque también sube
// diseños a órdenes que no son de sublimación.
const IMPRESION_LABELS = { pendiente: 'Por imprimir', en_proceso: 'Imprimiendo', completado: 'Impresa' }
// V131 — Samuel también reporta la sublimada (antes la reportaba corte).
const SUBLIMADO_LABELS = { pendiente: 'Por sublimar', en_proceso: 'Sublimando', completado: 'Sublimada' }

function estadoDiseno(tipos) {
  if (tipos?.has('final')) return { label: 'Diseño final', estado: 'completado' }
  if (tipos?.has('propuesta')) return { label: 'Propuesta subida', estado: 'en_proceso' }
  return { label: 'Sin diseño', estado: 'pendiente' }
}

function Chip({ estado, children }) {
  const c = ETAPA_ESTADO_COLORS[estado] || ETAPA_ESTADO_COLORS.pendiente
  return (
    <span className="badge" style={{ background: c.color, color: c.textColor }}>
      {children}
    </span>
  )
}

export default function SublimadoHomePage() {
  const { orders, loading: loadingOrders, error: errorOrders, refresh: refreshOrders } = useOrders()
  const { etapasPorOrden, loading: loadingEtapas, error: errorEtapas, refresh: refreshEtapas } = useAllOrdenEtapas()
  const [disenosPorOrden, setDisenosPorOrden] = useState({})
  const [tab, setTab] = useState('imprimir')
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

  const impresionDe = useCallback((o) => (etapasPorOrden[o.id] || []).find((e) => e.etapa === 'impresion'), [etapasPorOrden])
  const sublimadoDe = useCallback((o) => (etapasPorOrden[o.id] || []).find((e) => e.etapa === 'sublimado'), [etapasPorOrden])

  const bandejas = useMemo(() => {
    const vivas = orders.filter((o) => o.order_type_key === 'sublimacion' && !o.cancelled_at && o.status !== 'completado')
    return [
      { key: 'imprimir', label: 'Pendientes de impresión', ordenes: vivas.filter((o) => ['pendiente', 'en_proceso'].includes(impresionDe(o)?.estado)) },
      { key: 'sublimar', label: 'Pendientes de sublimado', ordenes: vivas.filter((o) => ['pendiente', 'en_proceso'].includes(sublimadoDe(o)?.estado)) },
      { key: 'diseno', label: 'Diseño pendiente', ordenes: vivas.filter((o) => !disenosPorOrden[o.id]?.has('final')) },
      { key: 'todas', label: 'Todas', ordenes: vivas },
    ]
  }, [orders, disenosPorOrden, impresionDe, sublimadoDe])

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
            const impresion = impresionDe(o)
            const sublimado = sublimadoDe(o)
            const diseno = estadoDiseno(disenosPorOrden[o.id])
            return (
              <EstacionCard key={o.id} order={o}>
                <span className="estacion-card__chips">
                  {impresion && <Chip estado={impresion.estado}>{IMPRESION_LABELS[impresion.estado]}</Chip>}
                  {sublimado && <Chip estado={sublimado.estado}>{SUBLIMADO_LABELS[sublimado.estado]}</Chip>}
                  <Chip estado={diseno.estado}>{diseno.label}</Chip>
                </span>
              </EstacionCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
