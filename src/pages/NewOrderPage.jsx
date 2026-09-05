import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { useClientes } from '../hooks/useClientes'
import { useTelas } from '../hooks/useTelas'
import { useProductosByCliente } from '../hooks/useProductosByCliente'
import { createOrder } from '../services/ordersService'
import { uploadOrderPhotos } from '../services/photosService'
import { recognizeDocument, MAX_OCR_FILE_SIZE_MB } from '../services/documentOcrService'
import { similarity } from '../utils/similarity'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import ClienteSelect from '../components/orders/ClienteSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import OrderItemsEditor from '../components/orders/OrderItemsEditor'
import RequireRole from '../components/common/RequireRole'
import { canCreateOrder } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import { buildOrderConfirmationPdfBlob, orderConfirmationPdfFileName } from '../utils/generateOrderPdf'

const initialForm = {
  clientId: '',
  clientName: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
}

const emptyItem = () => ({
  id: crypto.randomUUID(),
  garment: '',
  color: '',
  pantone: '',
  tela_id: '',
  tela_nombre: '',
  foto_url: '',
  lleva_bordado: false,
  sizes: [{ talla: '', cantidad: '' }],
})

function isItemVacio(item) {
  return !item.garment.trim() && !item.sizes.some((s) => s.talla.trim())
}

// Un documento real casi siempre trae varias tallas de la MISMA prenda en
// renglones separados (ej. "Playera M x10" y "Playera L x5") — el
// reconocimiento las regresa como artículos sueltos (una fila por
// talla/cantidad, igual que en Pedidos a Proveedor, donde sí es correcto
// así porque cada renglón es su propio artículo). Para una orden hay que
// agruparlas por nombre de prenda ANTES de crear los `items`, si no cada
// talla termina siendo una prenda distinta. Agrupa sin distinguir
// mayúsculas/espacios sobrantes, pero conserva el texto tal como lo trajo
// el reconocimiento la primera vez que aparece ese nombre.
function agruparArticulosPorPrenda(articulos) {
  const grupos = new Map()
  for (const a of articulos) {
    const key = a.nombre.trim().toLowerCase()
    if (!grupos.has(key)) {
      grupos.set(key, { garment: a.nombre.trim(), sizes: [] })
    }
    grupos.get(key).sizes.push({ talla: a.talla || '', cantidad: String(a.cantidad) })
  }
  return Array.from(grupos.values())
}

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

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrWarning, setOcrWarning] = useState(null)
  const [ocrError, setOcrError] = useState(null)
  const [ocrClienteHint, setOcrClienteHint] = useState(null)

  async function handleOcrFileInput(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setOcrLoading(true)
    setOcrWarning(null)
    setOcrError(null)
    setOcrClienteHint(null)

    const { data, error: ocrErr } = await recognizeDocument(file, 'orden')
    setOcrLoading(false)

    if (ocrErr) {
      setOcrError(ocrErr)
      return
    }
    if (data.warning) {
      setOcrWarning(data.warning)
    }

    // Cliente: si ya hay uno elegido, no se toca. Si el nombre reconocido
    // coincide exacto con uno del catálogo, se selecciona solo; si no,
    // se muestra como sugerencia (el usuario decide si lo agrega con
    // "+ Cliente nuevo") — nunca se mete un clientName suelto sin pasar
    // por ClienteSelect, para que la UI no quede en un estado a medias.
    if (data.cliente && !form.clientId) {
      const exact = clientes.find((c) => similarity(c.nombre, data.cliente) === 1)
      if (exact) {
        setForm((f) => ({ ...f, clientId: exact.id, clientName: exact.nombre }))
      } else {
        setOcrClienteHint(data.cliente)
      }
    }

    // Fecha de entrega: solo si el documento la indicó con claridad y
    // el campo sigue vacío (no pisa una fecha ya elegida a mano).
    if (data.fechaEntrega && !form.requestedDeliveryDate) {
      setForm((f) => ({ ...f, requestedDeliveryDate: data.fechaEntrega }))
    }

    if (data.articulos.length > 0) {
      // Nunca pisa lo que ya se haya tecleado a mano: conserva las
      // prendas con contenido y agrega las reconocidas después, más una
      // fila vacía nueva al final para seguir capturando (mismo patrón
      // de auto-agregar). El usuario revisa/corrige todo antes de crear
      // la orden — esto solo prellena. Las tallas de una misma prenda se
      // agrupan en un solo item (ver agruparArticulosPorPrenda) — si no,
      // cada talla del documento terminaba siendo una prenda distinta.
      setItems((current) => {
        const conContenido = current.filter((it) => !isItemVacio(it))
        const reconocidos = agruparArticulosPorPrenda(data.articulos).map((grupo) => ({
          ...emptyItem(),
          garment: grupo.garment,
          sizes: grupo.sizes,
        }))
        return [...conContenido, ...reconocidos, emptyItem()]
      })
    }
  }

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

    // El PDF de confirmación se genera solo al crear la orden, pero ya no
    // se descarga automático — se manda en vista previa al detalle (mismo
    // criterio que cualquier otro PDF del sistema: primero se ve, y solo
    // se descarga si el usuario le da al botón de adentro del modal). Si
    // por lo que sea falla generarlo, no se cancela la creación — igual
    // queda el botón "Descargar PDF" en el detalle para reintentar.
    const orderTypeLabel = orderTypes.find((t) => t.key === data.order_type_key)?.label
    // Recién creada, la orden solo tiene el registro de historial que el
    // propio create_order insertó (ver ordersService.createOrder) — se
    // sintetiza aquí en vez de pedirlo aparte a la base, ya se sabe cuál es.
    const initialHistory = [{ status: data.status, changed_at: data.created_at, notes: 'Orden creada' }]
    let pdfPreview = null
    try {
      const blob = await buildOrderConfirmationPdfBlob(data, { orderTypeLabel, history: initialHistory })
      pdfPreview = { blob, fileName: orderConfirmationPdfFileName(data, 'interno') }
    } catch (pdfErr) {
      console.error('No se pudo generar el PDF de confirmación:', pdfErr)
    }

    navigate(`/orden/${data.id}`, { state: { photoUploadError: photoError, pdfPreview } })
  }

  if (loading) return <Loading label="Cargando tipos de orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nueva orden</h2>

      <form className="order-form" onSubmit={handleSubmit}>
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Foto o PDF de la orden (opcional)
          </span>
          <label className="photo-picker__add" style={{ display: 'inline-flex' }}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleOcrFileInput}
              hidden
              disabled={ocrLoading}
            />
            {ocrLoading ? 'Leyendo el archivo…' : '+ Subir foto o PDF y prellenar la orden'}
          </label>
          <p className="pantone-hint">
            Foto o PDF, máximo {MAX_OCR_FILE_SIZE_MB}MB. Prellena cliente, fecha de entrega y prendas cuando se
            alcancen a leer con claridad — el reconocimiento automático no es perfecto, revisa y corrige todo antes
            de crear la orden.
          </p>
          {ocrWarning && <p className="pantone-hint">{ocrWarning}</p>}
          {ocrClienteHint && (
            <p className="pantone-hint">
              Se reconoció el cliente "{ocrClienteHint}" — no está en el catálogo. Usa "+ Cliente nuevo" abajo si
              quieres agregarlo.
            </p>
          )}
          {ocrError && <p className="form-error">{ocrError.message}</p>}
        </div>

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
