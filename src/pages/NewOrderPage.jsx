import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { createOrder } from '../services/ordersService'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
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

    setSubmitting(false)

    if (createError) {
      // 23505 = violación de unique constraint (order_number duplicado)
      if (createError.code === '23505' || /duplicate/i.test(createError.message || '')) {
        setSubmitError(new Error(`Ya existe una orden con el número "${form.orderNumber}".`))
      } else {
        setSubmitError(createError)
      }
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

        {/*
          Preparado para el futuro: fotos de referencia. El campo
          orders.reference_photos (jsonb) ya existe en la base de datos;
          solo falta agregar aquí un input de subida de archivos y
          guardarlas ahí cuando se implemente.
        */}

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
