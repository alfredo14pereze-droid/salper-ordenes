import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders'
import { useAllOrdenEtapas } from '../hooks/useAllOrdenEtapas'
import { useAuth } from '../contexts/AuthContext'
import { estacionDeRol } from '../config/vistasPorRol'
import { resumenPrendas } from '../utils/prendas'
import { daysUntil, formatDate } from '../utils/dates'
import { Loading, ErrorState, EmptyState } from '../components/common/States'

// V96 — "Siguientes órdenes": pantalla de inicio de cada estación de
// fábrica (corte/bordado/sublimado/produccion/terminado). Sin menú
// lateral, sin dashboard general, sin precios/saldos — solo la lista de
// lo que le toca a ESTA etapa, ordenada por fecha de entrega. Una orden
// aparece aquí mientras su fila en orden_etapas (para mi etapa) siga en
// pendiente o en_proceso — eso incluye órdenes que ni siquiera se han
// confirmado todavía (create_order ya les crea la fila en 'pendiente'):
// se muestran igual para que no se pierdan, y es EstacionOrderPage quien
// decide si el botón dice "Confirmar" o la acción de la etapa.
function severidad(order) {
  const days = daysUntil(order.requested_delivery_date)
  if (days <= 0) return { cls: 'overdue', label: days < 0 ? `Atrasada ${Math.abs(days)} d` : 'Entrega hoy' }
  if (days <= 3) return { cls: 'overdue', label: `Entrega en ${days} días` }
  if (days <= 7) return { cls: 'warning', label: `Entrega en ${days} días` }
  return { cls: null, label: `Entrega en ${days} días` }
}

export default function EstacionHomePage() {
  const { role } = useAuth()
  const estacion = estacionDeRol(role)
  const { orders, loading: loadingOrders, error: errorOrders, refresh: refreshOrders } = useOrders()
  const { etapasPorOrden, loading: loadingEtapas, error: errorEtapas, refresh: refreshEtapas } = useAllOrdenEtapas()
  const navigate = useNavigate()

  const siguientes = useMemo(() => {
    if (!estacion) return []
    return orders.filter((o) => {
      if (o.cancelled_at) return false
      const miEtapa = (etapasPorOrden[o.id] || []).find((e) => e.etapa === estacion.etapa)
      return miEtapa && (miEtapa.estado === 'pendiente' || miEtapa.estado === 'en_proceso')
    })
  }, [orders, etapasPorOrden, estacion])

  const loading = loadingOrders || loadingEtapas
  const error = errorOrders || errorEtapas
  function refresh() {
    refreshOrders()
    refreshEtapas()
  }

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page estacion-page">
      <h2 className="section-title">Siguientes órdenes</h2>
      {siguientes.length === 0 ? (
        <EmptyState>No tienes órdenes pendientes ahora mismo 🎉</EmptyState>
      ) : (
        <div className="estacion-list">
          {siguientes.map((o) => {
            const sev = severidad(o)
            const prendas = resumenPrendas(o)
            return (
              <button
                key={o.id}
                type="button"
                className={'estacion-card' + (sev.cls ? ` order-card--${sev.cls}` : '')}
                onClick={() => navigate(`/orden/${o.id}`)}
              >
                <span className="estacion-card__folio">#{o.order_number}</span>
                <span className="estacion-card__cliente">{o.client_name}</span>
                {prendas && <span className="estacion-card__prendas">{prendas}</span>}
                <span className={'estacion-card__due' + (sev.cls ? ` order-card__due--${sev.cls}` : '')}>
                  {sev.label} · {formatDate(o.requested_delivery_date)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
