import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { createOrder } from '../services/ordersService'
import { uploadOrderPhotos } from '../services/photosService'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import { Loading, ErrorState } from '../components/common/States'

const initialForm = {
  orderNumber: '',
  clientName: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
  estimatedProductionDays: 3,
}

export default function NewOrderPage() {
  const { orderTypes, loading, error, refresh } = useOrderTypes()
  const [form, setForm] = useState(initialForm)
  const [photoFiles, setPhotoFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.orderNumber.trim() || !form.clientName.trim() || !form.orderTypeKey || !form.requestedDeliveryDate) {
      setSubmitError(new Error('Completa los campos requeridos: número de orden, cliente, tipo y fecha de entrega.'))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const { data, error: createError } = await createOrder({
      orderNumber: form.orderNumber.trim(),
      clientName: form.clientName.trim(),
      orderTypeKey: form.orderTypeKey,
      description: form.description.trim(),
      requestedDeliveryDate: form.requestedDeliveryDate,
      estimatedProductionDays: Number(form.estimatedProductionDays) || 1,
    })

    if (createError) {
      setSubmitting(false)
      // 23505 = violación de unique constraint (order_number duplicado)
      if (createError.code === '23505' || /duplicate/i.test(createError.message || '')) {
        setSubmitError(new Error(`Ya existe una orden con el número "${form.orderNumber}".`))
      } else {
        setSubmitError(createError)
      }
      return
    }

    // La orden ya existe (tiene id): si el usuario eligió fotos, se suben
    // ahora. Si esto falla, no se cancela la creación de la orden — se
    // puede reintentar la subida desde el detalle (PhotoGallery).
    if (photoFiles.length > 0) {
      const { error: uploadError } = await uploadOrderPhotos(data.id, photoFiles)
      setSubmitting(false)
      if (uploadError) {
        navigate(`/orden/${data.id}`, { state: { photoUploadError: uploadError.message } })
        return
      }
    } else {
      setSubmitting(false)
    }

    navigate(`/orden/${data.id}`)
  }

  if (loading) return <Loading label="Cargando tipos de orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nueva orden</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Número de orden *
            <input
              type="text"
              className="input"
              value={form.orderNumber}
              onChange={(e) => updateField('orderNumber', e.target.value)}
              placeholder="Ej. 2026-0148"
            />
          </label>
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
        </div>

        <div className="form-row">
          <label>
            Tipo de orden *
            <OrderTypeSelect
              orderTypes={orderTypes}
              value={form.orderTypeKey}
              onChange={(key) => updateField('orderTypeKey', key)}
              onTypeCreated={refresh}
            />
          </label>
          <label>
            Fecha de entrega solicitada *
            <input
              type="date"
              className="input"
              value={form.requestedDeliveryDate}
              onChange={(e) => updateField('requestedDeliveryDate', e.target.value)}
            />
          </label>
        </div>

        <label>
          Tiempo estimado de producción (días) *
          <input
            type="number"
            min={1}
            className="input input--small"
            value={form.estimatedProductionDays}
            onChange={(e) => updateField('estimatedProductionDays', e.target.value)}
          />
        </label>

        <label>
          Descripción / especificaciones
          <textarea
            className="input"
            rows={4}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Detalles del pedido, tallas, colores, cantidades, etc."
          />
        </label>

        <label>
          Fotos de referencia
          <PhotoPicker files={photoFiles} onChange={setPhotoFiles} />
        </label>

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
