import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePedidoTienda } from '../hooks/usePedidoTienda'
import { marcarPedidoRecibido } from '../services/pedidosTiendaService'
import PedidoEstadoBadge from '../components/pedidos/PedidoEstadoBadge'
import VerificarPedidoForm from '../components/pedidos/VerificarPedidoForm'
import { Loading, ErrorState } from '../components/common/States'
import RequireRole from '../components/common/RequireRole'
import { canViewPedidosTienda, canManagePedidosTienda } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../utils/dates'

function formatMonto(monto) {
  if (monto === null || monto === undefined) return null
  return Number(monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export default function PedidoTiendaDetailPage() {
  return (
    <RequireRole allow={canViewPedidosTienda}>
      <PedidoTiendaDetail />
    </RequireRole>
  )
}

function PedidoTiendaDetail() {
  const { id } = useParams()
  const { role } = useAuth()
  const { pedido, articulos, loading, error, refresh } = usePedidoTienda(id)
  const [verifying, setVerifying] = useState(false)
  const [marcandoRecibido, setMarcandoRecibido] = useState(false)
  const [actionError, setActionError] = useState(null)

  if (loading) return <Loading label="Cargando pedido…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  if (!pedido) return <ErrorState error={new Error('Este pedido no existe.')} />

  const costoTotal = articulos.reduce(
    (sum, a) => sum + (a.cantidad_recibida && a.precio_unitario ? a.cantidad_recibida * a.precio_unitario : 0),
    0
  )
  const mostrarCostoTotal = pedido.estado === 'verificado' || pedido.estado === 'con_problema'
  const puedeGestionar = canManagePedidosTienda(role)
  const puedeMarcarRecibido = puedeGestionar && pedido.estado === 'pedido'
  const puedeVerificar = puedeGestionar && (pedido.estado === 'pedido' || pedido.estado === 'recibido')

  async function handleMarcarRecibido() {
    setMarcandoRecibido(true)
    setActionError(null)
    const { error: marcarError } = await marcarPedidoRecibido(pedido.id)
    setMarcandoRecibido(false)
    if (marcarError) {
      setActionError(marcarError)
      return
    }
    refresh()
  }

  return (
    <div className="page page--narrow">
      <Link to="/pedidos-proveedor" className="back-link">
        ← Volver a Pedidos a Proveedor
      </Link>

      <div className="order-detail__header">
        <div>
          <h2 className="order-detail__number">{pedido.proveedor}</h2>
          <p className="order-detail__client">Pidió: {pedido.pedido_por}</p>
        </div>
        <PedidoEstadoBadge estado={pedido.estado} />
      </div>

      {(puedeMarcarRecibido || puedeVerificar) && !verifying && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {puedeMarcarRecibido && (
            <button type="button" className="btn btn--secondary" onClick={handleMarcarRecibido} disabled={marcandoRecibido}>
              {marcandoRecibido ? 'Guardando…' : 'Marcar como recibido'}
            </button>
          )}
          {puedeVerificar && (
            <button type="button" className="btn btn--primary" onClick={() => setVerifying(true)}>
              Verificar pedido
            </button>
          )}
        </div>
      )}
      {actionError && <p className="form-error">{actionError.message}</p>}

      <section className="card">
        <h3 className="section-title section-title--small">Detalles</h3>
        <dl className="detail-list">
          <div>
            <dt>Fecha del pedido</dt>
            <dd>{formatDate(pedido.fecha_pedido)}</dd>
          </div>
          {pedido.fecha_recepcion && (
            <div>
              <dt>Fecha de recepción</dt>
              <dd>{formatDate(pedido.fecha_recepcion)}</dd>
            </div>
          )}
          {pedido.verificado_por && (
            <div>
              <dt>Verificó</dt>
              <dd>{pedido.verificado_por}</dd>
            </div>
          )}
          <div>
            <dt>Notas</dt>
            <dd>{pedido.notas || '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        {verifying ? (
          <VerificarPedidoForm
            pedidoId={pedido.id}
            articulos={articulos}
            onCancel={() => setVerifying(false)}
            onDone={() => {
              setVerifying(false)
              refresh()
            }}
          />
        ) : (
          <>
            <h3 className="section-title section-title--small">Artículos</h3>
            <div className="document-list">
              {articulos.map((a) => (
                <div key={a.id} className="document-row">
                  <div>
                    <span className="document-row__label">
                      {a.nombre_articulo}
                      {a.talla && ` (talla ${a.talla})`}
                    </span>
                    <p className="document-row__empty" style={{ marginTop: 2 }}>
                      Pedido: {a.cantidad_pedida}
                      {a.cantidad_recibida !== null && ` · Recibido: ${a.cantidad_recibida}`}
                      {formatMonto(a.precio_unitario) && ` · ${formatMonto(a.precio_unitario)} c/u`}
                    </p>
                    {a.nota_problema && <p className="form-error" style={{ marginTop: 2 }}>{a.nota_problema}</p>}
                  </div>
                </div>
              ))}
            </div>

            {mostrarCostoTotal && (
              <div className="items-grand-total" style={{ marginTop: 12 }}>
                <span>Costo total del pedido</span>
                <b>{formatMonto(costoTotal)}</b>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
