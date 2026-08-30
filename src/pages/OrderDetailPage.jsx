import { useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useOrder } from '../hooks/useOrder'
import { useOrderTypes } from '../hooks/useOrderTypes'
import StatusStepper from '../components/orders/StatusStepper'
import StatusChanger from '../components/orders/StatusChanger'
import StatusHistoryList from '../components/orders/StatusHistoryList'
import TypeBadge from '../components/orders/TypeBadge'
import PhotoGallery from '../components/orders/PhotoGallery'
import OrderItemsCard from '../components/orders/OrderItemsCard'
import OrderDetailsCard from '../components/orders/OrderDetailsCard'
import EstimatedDaysCard from '../components/orders/EstimatedDaysCard'
import CancelOrderCard from '../components/orders/CancelOrderCard'
import ComingSoonCard from '../components/orders/ComingSoonCard'
import { Loading, ErrorState } from '../components/common/States'
import { downloadOrderConfirmationPdf } from '../utils/generateOrderPdf'
import { useAuth } from '../contexts/AuthContext'

export default function OrderDetailPage() {
  const { user } = useAuth()
  const { id } = useParams()
  const location = useLocation()
  const { order, history, loading, error, refresh } = useOrder(id)
  const { orderTypes, typesByKey } = useOrderTypes()
  const [generatingPdf, setGeneratingPdf] = useState(null) // null | 'interno' | 'cliente'
  const [pdfError, setPdfError] = useState(null)

  if (loading) return <Loading label="Cargando orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  if (!order) return <ErrorState error={new Error('Esta orden no existe.')} />

  async function handleDownloadPdf(variant) {
    setGeneratingPdf(variant)
    setPdfError(null)
    try {
      await downloadOrderConfirmationPdf(order, {
        orderTypeLabel: typesByKey[order.order_type_key]?.label,
        variant,
      })
    } catch (err) {
      setPdfError(err)
    } finally {
      setGeneratingPdf(null)
    }
  }

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {order.cancelled_at && <span className="badge badge--danger">Cancelada</span>}
          <TypeBadge type={typesByKey[order.order_type_key]} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => handleDownloadPdf('interno')}
            disabled={!!generatingPdf}
          >
            {generatingPdf === 'interno' ? 'Generando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => handleDownloadPdf('cliente')}
            disabled={!!generatingPdf}
          >
            {generatingPdf === 'cliente' ? 'Generando…' : 'PDF para cliente'}
          </button>
        </div>
      </div>
      {pdfError && <p className="form-error">No se pudo generar el PDF: {pdfError.message}</p>}

      <StatusStepper status={order.status} />

      <div className="order-detail__grid">
        <section className="card">
          <OrderDetailsCard order={order} orderTypes={orderTypes} onUpdated={refresh} />
        </section>

        {user && (
          <section className="card">
            <StatusChanger order={order} onUpdated={refresh} />
            <EstimatedDaysCard order={order} onUpdated={refresh} />
          </section>
        )}

        <section className="card card--placeholders">
          <OrderItemsCard order={order} onUpdated={refresh} />
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
          <CancelOrderCard order={order} onUpdated={refresh} />
        </section>
      </div>
    </div>
  )
}
