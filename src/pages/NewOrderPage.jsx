import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { useClientes } from '../hooks/useClientes'
import { useTelas } from '../hooks/useTelas'
import { useProductosByCliente } from '../hooks/useProductosByCliente'
import { createOrder } from '../services/ordersService'
import { uploadOrderPhotos } from '../services/photosService'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import ClienteSelect from '../components/orders/ClienteSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import OrderItemsEditor from '../components/orders/OrderItemsEditor'
import RequireRole from '../components/common/RequireRole'
import { canCreateOrder } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import { downloadOrderConfirmationPdf } from '../utils/generateOrderPdf'

const initialForm = {
  clientId: '',
  clientName: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
}

const emptyItem = () => ({
  garment: '',
  color: '',
  pantone: '',
  tela_id: '',
  tela_nombre: '',
  foto_url: '',
  sizes: [{ talla: '', cantidad: '' }],
})

export default function NewOrderPage() {
  return (
    <RequireRole allow={canCreateOrder}>
      <NewOrderForm />
    </RequireRole>
  )
}

function NewOrderForm() {
  const { orderTypes, loading, error, refresh } = useOrderTypes()
  const { clientes, refresh: refreshClientes } = useClientes()
  const { telas, refresh: refreshTelas } = useTelas()
  const [form, setForm] = useState(initialForm)
  const { productos, refresh: refreshProductos } = useProductosByCliente(form.clientId)
  const [items, setItems] = useState([emptyItem()])
  const [photoFiles, setPhotoFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
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
      clientId: form.clientId || null,
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

    // La orden ya existe (tiene id): subimos las fotos elegidas a mano. Si
    // esto falla, no se cancela la creación de la orden — se puede
    // reintentar desde el detalle.
    let photoError = null

    if (photoFiles.length > 0) {
      const { error: uploadError } = await uploadOrderPhotos(data.id, photoFiles)
      if (uploadError) photoError = uploadError.message
    }

    setSubmitting(false)

    // El PDF de confirmación se descarga solo al crear la orden. Si por lo
    // que sea falla generarlo, no se cancela la creación — igual queda el
    // botón "Descargar PDF" en el detalle para reintentar.
    const orderTypeLabel = orderTypes.find((t) => t.key === data.order_type_key)?.label
    // Recién creada, la orden solo tiene el registro de historial que el
    // propio create_order insertó (ver ordersService.createOrder) — se
    // sintetiza aquí en vez de pedirlo aparte a la base, ya se sabe cuál es.
    const initialHistory = [{ status: data.status, changed_at: data.created_at, notes: 'Orden creada' }]
    try {
      await downloadOrderConfirmationPdf(data, { orderTypeLabel, history: initialHistory })
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
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Cliente *
          </span>
          <ClienteSelect
            clientes={clientes}
            value={form.clientId}
            onChange={(clientId, clientName) => setForm((f) => ({ ...f, clientId, clientName }))}
            onClienteCreated={refreshClientes}
          />
        </div>

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
          <OrderItemsEditor
            items={items}
            onChange={setItems}
            orderTypeKey={form.orderTypeKey}
            telas={telas}
            onTelaCreated={refreshTelas}
            clienteId={form.clientId}
            clienteNombre={form.clientName}
            productos={productos}
            onProductoCreated={refreshProductos}
          />
        </div>

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
