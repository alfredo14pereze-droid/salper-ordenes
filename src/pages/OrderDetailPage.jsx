import { useParams, useLocation, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { useOrderTypes } from '../hooks/useOrderTypes'
import StatusStepper from '../components/orders/StatusStepper'
import StatusChanger from '../components/orders/StatusChanger'
import StatusHistoryList from '../components/orders/StatusHistoryList'
import TypeBadge from '../components/orders/TypeBadge'
import PhotoGallery from '../components/orders/PhotoGallery'
import ComingSoonCard from '../components/orders/ComingSoonCard'
import { Loading, ErrorState } from '../components/common/States'
import { formatDate, computeProductionWindow } from '../utils/dates'

export default function OrderDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { order, history, loading, error, refresh } = useOrder(id)
  const { typesByKey } = useOrderTypes()

  if (loading) return <Loading label="Cargando orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  if (!order) return <ErrorState error={new Error('Esta orden no existe.')} />

  const productionWindow = computeProductionWindow(order)

  return (
    <div className="page page--narrow">
      <Link to="/" className="back-link">
        ← Volver al dashboard
      </Link>

      <div className="order-detail__header">
        <div>
          <h2 className="order-detail__number">Orden #{order.order_number}</h2>
          <p className="order-detail__client">{order.client_name}</p>
        </div>
        <TypeBadge type={typesByKey[order.order_type_key]} />
      </div>

      <StatusStepper status={order.status} />

      <div className="order-detail__grid">
        <section className="card">
          <h3 className="section-title section-title--small">Detalles</h3>
          <dl className="detail-list">
            <div>
              <dt>Descripción / especificaciones</dt>
              <dd>{order.description || '—'}</dd>
            </div>
            <div>
              <dt>Fecha de entrega solicitada</dt>
              <dd>{formatDate(order.requested_delivery_date)}</dd>
            </div>
            <div>
              <dt>Tiempo estimado de producción</dt>
              <dd>{order.estimated_production_days} día{order.estimated_production_days === 1 ? '' : 's'}</dd>
            </div>
            <div>
              <dt>Ventana de producción estimada</dt>
              <dd>
                {formatDate(productionWindow.start)} → {formatDate(productionWindow.end)}
              </dd>
            </div>
            <div>
              <dt>Creada</dt>
              <dd>{formatDate(order.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <StatusChanger order={order} onUpdated={refresh} />
        </section>

        <section className="card">
          <h3 className="section-title section-title--small">Historial de estados</h3>
          <StatusHistoryList history={history} />
        </section>

        <section className="card">
          {location.state?.photoUploadError && (
            <p className="form-error">
              La orden se creó, pero hubo un problema subiendo las fotos: {location.state.photoUploadError}.
              Puedes intentarlo de nuevo aquí abajo.
            </p>
          )}
          <PhotoGallery order={order} onUpdated={refresh} />
        </section>

        <section className="card card--placeholders">
          <ComingSoonCard
            title="Link compartible"
            description="Cada orden ya tiene un token único listo para generar un link de solo lectura sin necesidad de iniciar sesión."
          />
        </section>
      </div>
    </div>
  )
}
