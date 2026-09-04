import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllOrdersForControl, fetchAllOrdenEtapas, subscribeToOrderChanges } from '../services/ordersService'
import { getStatus } from '../utils/status'
import { ETAPA_LABELS } from '../lib/constants'
import { Loading, ErrorState } from '../components/common/States'

// "Control rápido de órdenes" (V24, tarea 9 de Roles y permisos): tabla de
// solo lectura — folio, cliente, estado — visible para TODOS los roles
// (y para invitados, mismo criterio de visibilidad total que el resto de
// la app). A diferencia del Dashboard, esta SÍ incluye las órdenes
// eliminadas (eliminada_en no nulo), mostrando "Eliminada" en vez de la
// etapa — es la única pantalla donde una orden eliminada sigue siendo
// visible.
function estadoParaOrden(order, etapasPorOrden) {
  if (order.eliminada_en) return { label: 'Eliminada', color: '#e5e1d8', textColor: '#16130f' }

  const etapas = etapasPorOrden[order.id] || []
  const activas = etapas.filter((e) => e.estado === 'en_proceso')
  if (activas.length > 0) {
    const label = activas.map((e) => ETAPA_LABELS[e.etapa] || e.etapa).join(' + ')
    return { label, color: '#fde6b8', textColor: '#16130f' }
  }
  const s = getStatus(order.status)
  return { label: s.label, color: s.color, textColor: s.textColor }
}

export default function ControlRapidoPage() {
  const [orders, setOrders] = useState([])
  const [etapasPorOrden, setEtapasPorOrden] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [{ data: ordersData, error: ordersError }, { data: etapasData, error: etapasError }] = await Promise.all([
      fetchAllOrdersForControl(),
      fetchAllOrdenEtapas(),
    ])

    if (ordersError || etapasError) {
      setError(ordersError || etapasError)
      setLoading(false)
      return
    }

    const grouped = {}
    for (const et of etapasData || []) {
      if (!grouped[et.order_id]) grouped[et.order_id] = []
      grouped[et.order_id].push(et)
    }

    setOrders(ordersData || [])
    setEtapasPorOrden(grouped)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToOrderChanges(() => load())
    return unsubscribe
  }, [load])

  if (loading) return <Loading label="Cargando…" />
  if (error) return <ErrorState error={error} onRetry={load} />

  return (
    <div className="page">
      <h2 className="section-title">Control rápido de órdenes</h2>
      <p className="page-subtitle">Folio, cliente y estado de todas las órdenes — incluidas las eliminadas.</p>

      <div style={{ overflowX: 'auto' }}>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const estado = estadoParaOrden(o, etapasPorOrden)
              return (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orden/${o.id}`}>{o.order_number}</Link>
                  </td>
                  <td>{o.client_name}</td>
                  <td>
                    <span className="badge" style={{ background: estado.color, color: estado.textColor }}>
                      {estado.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
