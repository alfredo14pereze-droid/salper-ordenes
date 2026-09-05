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
import OrderDocumentsCard from '../components/orders/OrderDocumentsCard'
import OrderPaymentsCard from '../components/orders/OrderPaymentsCard'
import OrderDetailsCard from '../components/orders/OrderDetailsCard'
import EstimatedDaysCard from '../components/orders/EstimatedDaysCard'
import CancelOrderCard from '../components/orders/CancelOrderCard'
import OrderEtapasCard from '../components/orders/OrderEtapasCard'
import OrderBordadosCard from '../components/orders/OrderBordadosCard'
import OrderSurtidoCard from '../components/orders/OrderSurtidoCard'
import ComingSoonCard from '../components/orders/ComingSoonCard'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { Loading, ErrorState } from '../components/common/States'
import {
  buildOrderConfirmationPdfBlob,
  buildRemisionPdfBlob,
  orderConfirmationPdfFileName,
  remisionPdfFileName,
} from '../utils/generateOrderPdf'
import { useAuth } from '../contexts/AuthContext'
import { canViewRemision } from '../utils/permissions'

export default function OrderDetailPage() {
  const { user, role } = useAuth()
  const { id } = useParams()
  const location = useLocation()
  const { order, history, loading, error, refresh } = useOrder(id)
  const { orderTypes, typesByKey } = useOrderTypes()
  const [generatingPdf, setGeneratingPdf] = useState(null) // null | 'interno' | 'cliente' | 'remision'
  const [pdfError, setPdfError] = useState(null)
  // Si venimos de crear la orden (NewOrderPage.jsx), el PDF de confirmación
  // ya se generó allá y viaja en location.state — se abre en vista previa
  // aquí en vez de descargarse solo, igual que cualquier otro PDF del
  // sistema. Lazy init: solo se lee una vez al montar, así que cerrarlo
  // (setPreview(null)) no lo vuelve a abrir aunque location.state persista.
  const [preview, setPreview] = useState(() => location.state?.pdfPreview || null) // { blob, fileName } | null

  if (loading) return <Loading label="Cargando orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  if (!order) return <ErrorState error={new Error('Esta orden no existe.')} />

  // Vista previa antes de descargar (V26, Parte 4) — aplica tanto a la
  // confirmación de orden como a la remisión: se genera el blob y se abre
  // PdfPreviewModal; la descarga real solo pasa si el usuario le da al
  // botón de adentro del modal.
  async function handlePreviewPdf(variant) {
    setGeneratingPdf(variant)
    setPdfError(null)
    try {
      const blob = await buildOrderConfirmationPdfBlob(order, {
        orderTypeLabel: typesByKey[order.order_type_key]?.label,
        variant,
        history,
      })
      setPreview({ blob, fileName: orderConfirmationPdfFileName(order, variant) })
    } catch (err) {
      setPdfError(err)
    } finally {
      setGeneratingPdf(null)
    }
  }

  async function handlePreviewRemision() {
    setGeneratingPdf('remision')
    setPdfError(null)
    try {
      const blob = await buildRemisionPdfBlob(order, { orderTypeLabel: typesByKey[order.order_type_key]?.label })
      setPreview({ blob, fileName: remisionPdfFileName(order) })
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
          {order.eliminada_en && <span className="badge badge--danger">Eliminada</span>}
          {order.cancelled_at && <span className="badge badge--danger">Cancelada</span>}
          <TypeBadge type={typesByKey[order.order_type_key]} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => handlePreviewPdf('interno')}
            disabled={!!generatingPdf}
          >
            {generatingPdf === 'interno' ? 'Generando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => handlePreviewPdf('cliente')}
            disabled={!!generatingPdf}
          >
            {generatingPdf === 'cliente' ? 'Generando…' : 'PDF para cliente'}
          </button>
          {order.status === 'completado' && canViewRemision(role) && (
            <button type="button" className="btn btn--secondary" onClick={handlePreviewRemision} disabled={!!generatingPdf}>
              {generatingPdf === 'remision' ? 'Generando…' : 'Descargar remisión'}
            </button>
          )}
        </div>
      </div>
      {pdfError && <p className="form-error">No se pudo generar el PDF: {pdfError.message}</p>}
      {order.eliminada_en && (
        <p className="form-error">Esta orden fue eliminada — ya no admite cambios de ningún rol.</p>
      )}
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}

      <StatusStepper status={order.status} />

      <div className="order-detail__grid">
        <section className="card">
          <OrderDetailsCard order={order} orderTypes={orderTypes} onUpdated={refresh} />
        </section>

        {user && !order.eliminada_en && (
          <section className="card">
            <StatusChanger order={order} onUpdated={refresh} />
            <EstimatedDaysCard order={order} onUpdated={refresh} />
          </section>
        )}

        {user && !order.eliminada_en && (
          <section className="card">
            <OrderEtapasCard orderId={order.id} onUpdated={refresh} />
          </section>
        )}

        {user && (
          <section className="card">
            <OrderDocumentsCard order={order} onUpdated={refresh} />
          </section>
        )}

        {user && (
          <section className="card">
            <OrderPaymentsCard orderId={order.id} disabled={!!order.eliminada_en} />
          </section>
        )}

        <section className="card card--placeholders">
          <OrderItemsCard order={order} onUpdated={refresh} />
        </section>

        {order.items?.some((it) => it.lleva_bordado) && (
          <section className="card">
            <OrderBordadosCard order={order} onUpdated={refresh} />
          </section>
        )}

        {order.items?.length > 0 && (
          <section className="card">
            <OrderSurtidoCard order={order} onUpdated={refresh} />
          </section>
        )}

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
