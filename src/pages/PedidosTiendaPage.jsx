import { Link } from 'react-router-dom'
import { usePedidosTienda } from '../hooks/usePedidosTienda'
import PedidoTiendaCard from '../components/pedidos/PedidoTiendaCard'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import RequireRole from '../components/common/RequireRole'
import { canManagePedidosTienda, canViewPedidosTienda } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'

// A diferencia del resto de la app, este módulo NO tiene modo invitado —
// trae costos reales de proveedor (ver canViewPedidosTienda).
export default function PedidosTiendaPage() {
  return (
    <RequireRole allow={canViewPedidosTienda}>
      <PedidosTiendaList />
    </RequireRole>
  )
}

function PedidosTiendaList() {
  const { role } = useAuth()
  const { pedidos, loading, error, refresh } = usePedidosTienda()

  if (loading) return <Loading label="Cargando pedidos…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Pedidos a Proveedor</h2>
        <span className="section-count">{pedidos.length}</span>
      </div>
      <p className="page-subtitle">
        Registro centralizado de qué se pidió, a quién, y qué llegó realmente al verificarlo.
      </p>

      {canManagePedidosTienda(role) && (
        <Link to="/pedidos-proveedor/nuevo" className="btn btn--primary">
          + Nuevo pedido
        </Link>
      )}

      {pedidos.length === 0 ? (
        <EmptyState>Todavía no hay pedidos a proveedor registrados.</EmptyState>
      ) : (
        <div className="order-grid" style={{ marginTop: 16 }}>
          {pedidos.map((pedido) => (
            <PedidoTiendaCard key={pedido.id} pedido={pedido} />
          ))}
        </div>
      )}
    </div>
  )
}
