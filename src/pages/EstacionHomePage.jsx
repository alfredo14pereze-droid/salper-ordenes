import { useMemo, useState } from 'react'
import { useOrders } from '../hooks/useOrders'
import { useAllOrdenEtapas } from '../hooks/useAllOrdenEtapas'
import { useAuth } from '../contexts/AuthContext'
import { estacionDeRol, etapasDeEstacion } from '../config/vistasPorRol'
import { ETAPA_LABELS } from '../lib/constants'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import EstacionCard from '../components/orders/EstacionCard'
import SublimadoHomePage from './SublimadoHomePage'
import { coincideBusquedaOrden } from '../utils/ordenesBusqueda'

// V96 — "Siguientes órdenes": pantalla de inicio de cada estación de
// fábrica (corte/bordado/sublimado/produccion/terminado). Sin menú
// lateral, sin dashboard general, sin precios/saldos — solo la lista de
// lo que le toca a ESTA etapa, ordenada por fecha de entrega. Una orden
// aparece aquí mientras su fila en orden_etapas (para mi etapa) siga en
// pendiente o en_proceso — eso incluye órdenes que ni siquiera se han
// confirmado todavía (create_order ya les crea la fila en 'pendiente'):
// se muestran igual para que no se pierdan, y es EstacionOrderPage quien
// decide si el botón dice "Confirmar" o la acción de la etapa.
// V120 — el rol sublimado tiene su propio dashboard (todas las órdenes de
// sublimación + diseños); el branch vive en este wrapper para no romper
// las reglas de hooks.
export default function EstacionHomePage() {
  const { role } = useAuth()
  if (estacionDeRol(role)?.dashboardSublimado) return <SublimadoHomePage />
  return <SiguientesOrdenes />
}

function SiguientesOrdenes() {
  const { role } = useAuth()
  const estacion = estacionDeRol(role)
  const { orders, loading: loadingOrders, error: errorOrders, refresh: refreshOrders } = useOrders()
  const { etapasPorOrden, loading: loadingEtapas, error: errorEtapas, refresh: refreshEtapas } = useAllOrdenEtapas()
  const [busqueda, setBusqueda] = useState('')

  // V120 — una estación puede reportar más de una etapa (corte también
  // reporta sublimado): una lista por etapa, en el orden del flujo.
  const secciones = useMemo(
    () =>
      etapasDeEstacion(estacion).map((etapa) => ({
        etapa,
        ordenes: orders.filter((o) => {
          if (o.cancelled_at) return false
          const miEtapa = (etapasPorOrden[o.id] || []).find((e) => e.etapa === etapa)
          return miEtapa && (miEtapa.estado === 'pendiente' || miEtapa.estado === 'en_proceso')
        }),
      })),
    [orders, etapasPorOrden, estacion]
  )

  // V131 — buscador por folio (SALPER o anterior) o cliente en cualquier orden,
  // no solo en las pendientes de mi etapa.
  const texto = busqueda.trim()
  const encontradas = useMemo(
    () => (texto ? orders.filter((o) => !o.cancelled_at && coincideBusquedaOrden(o, texto)) : null),
    [orders, texto]
  )

  const loading = loadingOrders || loadingEtapas
  const error = errorOrders || errorEtapas
  function refresh() {
    refreshOrders()
    refreshEtapas()
  }

  if (loading) return <Loading label="Cargando órdenes…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  const variasEtapas = secciones.length > 1

  return (
    <div className="page estacion-page">
      {!variasEtapas && <h2 className="section-title">Siguientes órdenes</h2>}
      <input
        type="search"
        className="input"
        placeholder="Buscar folio, folio anterior o cliente (cualquier orden)"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {encontradas &&
        (encontradas.length === 0 ? (
          <EmptyState>Ninguna orden coincide con esa búsqueda.</EmptyState>
        ) : (
          <div className="estacion-list">
            {encontradas.map((o) => (
              <EstacionCard key={o.id} order={o} />
            ))}
          </div>
        ))}
      {!encontradas && secciones.map(({ etapa, ordenes }) => (
        <div key={etapa} className="estacion-seccion">
          {variasEtapas && (
            <h2 className="section-title">
              Pendientes de {(ETAPA_LABELS[etapa] || etapa).toLowerCase()} <span className="pf-tab__n">{ordenes.length}</span>
            </h2>
          )}
          {ordenes.length === 0 ? (
            <EmptyState>
              {variasEtapas ? `No tienes órdenes pendientes de ${(ETAPA_LABELS[etapa] || etapa).toLowerCase()}.` : 'No tienes órdenes pendientes ahora mismo 🎉'}
            </EmptyState>
          ) : (
            <div className="estacion-list">
              {ordenes.map((o) => (
                <EstacionCard key={o.id} order={o} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
