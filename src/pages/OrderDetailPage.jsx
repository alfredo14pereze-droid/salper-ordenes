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
import OrderReconfirmBanner from '../components/orders/OrderReconfirmBanner'
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
import { canViewRemision, canManageSurtido, canChangeStatus, canSetEstimatedDays, canViewEtapas } from '../utils/permissions'

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
          <h2 className="order-detail__number">
            Orden #{order.order_number}
            {order.folios_externos?.length > 0 && (
              <span style={{ fontSize: '0.55em', color: 'var(--color-muted, #6b6558)', marginLeft: 10 }}>
                (folio{order.folios_externos.length === 1 ? '' : 's'} externo{order.folios_externos.length === 1 ? '' : 's'}:{' '}
                {order.folios_externos.join(', ')})
              </span>
            )}
          </h2>
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

      <OrderReconfirmBanner order={order} onUpdated={refresh} />

      <StatusStepper status={order.status} />

      <div className="order-detail__grid">
        <section className="card">
          <OrderDetailsCard order={order} orderTypes={orderTypes} onUpdated={refresh} />
        </section>

        {/* V48 — la foto de referencia se movió hasta arriba (antes vivía
            hasta abajo, después de Historial) para que no se pierda entre
            todas las demás tarjetas — pedido explícito del usuario. */}
        <section className="card">
          {location.state?.photoUploadError && (
            <p className="form-error">
              La orden se creó, pero hubo un problema subiendo las fotos: {location.state.photoUploadError}.
              Puedes intentarlo de nuevo aquí abajo.
            </p>
          )}
          <PhotoGallery order={order} onUpdated={refresh} />
        </section>

        {/* V49 — antes esta tarjeta se montaba para cualquier usuario con
            sesión, aunque StatusChanger/EstimatedDaysCard no tuvieran nada
            que mostrar para su rol (ambos regresan null solos) — se veía
            como un recuadro vacío feo. Ahora solo se monta si el rol
            actual puede hacer algo aquí. */}
        {user && !order.eliminada_en && (canChangeStatus(role) || canSetEstimatedDays(role, order)) && (
          <section className="card">
            <StatusChanger order={order} onUpdated={refresh} />
            <EstimatedDaysCard order={order} onUpdated={refresh} />
          </section>
        )}

        {/* V49 — "Etapas de producción" es la herramienta real de fábrica
            para avanzar su etapa; para tienda (ventas/contabilidad/
            admin_tienda/tienda) y lectura es puro duplicado de solo
            lectura de lo que ya muestra el stepper de arriba — pedido
            explícito del usuario de quitarlo de esa vista por ser ruido. */}
        {user && !order.eliminada_en && canViewEtapas(role) && (
          <section className="card">
            <OrderEtapasCard orderId={order.id} onUpdated={refresh} />
          </section>
        )}

        {user && (
          <section className="card">
            {location.state?.documentError && (
              <p className="form-error">
                La orden se creó, pero hubo un problema subiendo un documento: {location.state.documentError}. Puedes
                intentarlo de nuevo aquí abajo.
              </p>
            )}
            <OrderDocumentsCard order={order} onUpdated={refresh} />
          </section>
        )}

        {user && (
          <section className="card">
            {location.state?.anticipoError && (
              <p className="form-error">
                La orden se creó, pero hubo un problema guardando el anticipo: {location.state.anticipoError}. Puedes
                registrarlo de nuevo aquí abajo.
              </p>
            )}
            <OrderPaymentsCard order={order} onUpdated={refresh} />
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

        {/* V48 — "Cantidad surtida" es demasiado ruido visual para quien
            solo consulta la orden (comparación pedido/surtido por cada
            talla de cada prenda) y además no es información que le sirva a
            nadie fuera de terminado — pedido explícito del usuario: que
            solo terminado (y admin_fabrica/admin_general, mismo criterio
            que canManageSurtido) puedan siquiera VERLA, no solo editarla. */}
        {order.items?.length > 0 && canManageSurtido(role) && (
          <section className="card">
            <OrderSurtidoCard order={order} onUpdated={refresh} />
          </section>
        )}

        <section className="card">
          <h3 className="section-title section-title--small">Historial de estados</h3>
          <StatusHistoryList history={history} />
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
