import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { useOrderTemplates } from '../hooks/useOrderTemplates'
import { createOrder } from '../services/ordersService'
import { uploadOrderPhotos, attachExistingPhotos } from '../services/photosService'
import { copyTemplatePhotosToOrder } from '../services/templatesService'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import OrderItemsEditor from '../components/orders/OrderItemsEditor'
import TemplatePicker from '../components/orders/TemplatePicker'
import RequireRole from '../components/common/RequireRole'
import { canCreateOrder } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import { downloadOrderConfirmationPdf } from '../utils/generateOrderPdf'

const initialForm = {
  clientName: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
}

const emptyItem = () => ({ garment: '', color: '', pantone: '', sizes: [{ talla: '', cantidad: '' }] })

export default function NewOrderPage() {
  return (
    <RequireRole allow={canCreateOrder}>
      <NewOrderForm />
    </RequireRole>
  )
}

function NewOrderForm() {
  const { orderTypes, loading, error, refresh } = useOrderTypes()
  const { templates } = useOrderTemplates()
  const [form, setForm] = useState(initialForm)
  const [items, setItems] = useState([emptyItem()])
  const [photoFiles, setPhotoFiles] = useState([])
  const [templatePhotos, setTemplatePhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleApplyTemplate(template) {
    setForm((f) => ({
      ...f,
      orderTypeKey: template.order_type_key,
      description: template.description || '',
    }))
    setItems(
      template.items && template.items.length > 0
        ? template.items.map((item) => ({ ...item, sizes: item.sizes.map((s) => ({ ...s, cantidad: '' })) }))
        : [emptyItem()]
    )
    setTemplatePhotos(template.reference_photos || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.clientName.trim() || !form.orderTypeKey || !form.requestedDeliveryDate) {
      setSubmitError(new Error('Completa los campos requeridos: cliente, tipo y fecha de entrega.'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const cleanItems = items
      .filter((item) => item.garment.trim() || item.sizes.some((s) => s.talla.trim()))
      .map((item) => ({
        ...item,
        sizes: item.sizes
          .filter((s) => s.talla.trim() && Number(s.cantidad) > 0)
          .map((s) => ({ talla: s.talla.trim(), cantidad: Number(s.cantidad) })),
      }))

    const { data, error: createError } = await createOrder({
      clientName: form.clientName.trim(),
      orderTypeKey: form.orderTypeKey,
      description: form.description.trim(),
      requestedDeliveryDate: form.requestedDeliveryDate,
      items: cleanItems,
    })

    if (createError) {
      setSubmitting(false)
      setSubmitError(createError)
      return
    }

    // La orden ya existe (tiene id): fotos elegidas a mano + fotos heredadas
    // de la plantilla (si se usó una). Si algo de esto falla, no se cancela
    // la creación de la orden — se puede reintentar desde el detalle.
    let photoError = null

    if (photoFiles.length > 0) {
      const { error: uploadError } = await uploadOrderPhotos(data.id, photoFiles)
      if (uploadError) photoError = uploadError.message
    }

    if (!photoError && templatePhotos.length > 0) {
      const { data: copied, error: copyError } = await copyTemplatePhotosToOrder(data.id, templatePhotos)
      if (copyError) {
        photoError = copyError.message
      } else if (copied.length > 0) {
        const { error: attachError } = await attachExistingPhotos(data.id, copied)
        if (attachError) photoError = attachError.message
      }
    }

    setSubmitting(false)

    // El PDF de confirmación se descarga solo al crear la orden. Si por lo
    // que sea falla generarlo, no se cancela la creación — igual queda el
    // botón "Descargar PDF" en el detalle para reintentar.
    const orderTypeLabel = orderTypes.find((t) => t.key === data.order_type_key)?.label
    try {
      await downloadOrderConfirmationPdf(data, { orderTypeLabel })
    } catch (pdfErr) {
      console.error('No se pudo generar el PDF de confirmación:', pdfErr)
    }

    if (photoError) {
      navigate(`/orden/${data.id}`, { state: { photoUploadError: photoError } })
      return
    }

    navigate(`/orden/${data.id}`)
  }

  if (loading) return <Loading label="Cargando tipos de orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nueva orden</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <TemplatePicker templates={templates} onApply={handleApplyTemplate} />

        <label>
          Cliente *
          <input
            type="text"
            className="input"
            value={form.clientName}
            onChange={(e) => updateField('clientName', e.target.value)}
            placeholder="Nombre del cliente"
          />
        </label>

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Tipo de orden *
          </span>
          <OrderTypeSelect
            orderTypes={orderTypes}
            value={form.orderTypeKey}
            onChange={(key) => updateField('orderTypeKey', key)}
            onTypeCreated={refresh}
          />
        </div>

        <label>
          Fecha de entrega solicitada *
          <input
            type="date"
            className="input"
            value={form.requestedDeliveryDate}
            onChange={(e) => updateField('requestedDeliveryDate', e.target.value)}
          />
        </label>

        <label>
          Descripción / especificaciones generales
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Notas del pedido que no son de una prenda en particular…"
          />
        </label>

        <div>
          <span className="field-label" style={{ marginBottom: 8, display: 'block' }}>
            Prendas, tallas y colores
          </span>
          <OrderItemsEditor items={items} onChange={setItems} orderTypeKey={form.orderTypeKey} />
        </div>

        <label>
          Fotos de referencia
          <PhotoPicker files={photoFiles} onChange={setPhotoFiles} />
        </label>
        {templatePhotos.length > 0 && (
          <p className="pantone-hint">
            + {templatePhotos.length} foto{templatePhotos.length === 1 ? '' : 's'} de la plantilla se copiarán a esta orden.
          </p>
        )}

        {submitError && <p className="form-error">{submitError.message}</p>}

        <div className="order-form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear orden'}
          </button>
        </div>
      </form>
    </div>
  )
}
