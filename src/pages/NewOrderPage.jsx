import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { useClientes } from '../hooks/useClientes'
import { useTelas } from '../hooks/useTelas'
import { useProductosByCliente } from '../hooks/useProductosByCliente'
import { useOrders } from '../hooks/useOrders'
import { buildDemandMap, getLoadForDate } from '../utils/demand'
import { parseDate } from '../utils/dates'
import { isActiveStatus } from '../utils/status'
import { createOrder } from '../services/ordersService'
import { uploadOrderPhotos } from '../services/photosService'
import { uploadOrderDocument } from '../services/documentsService'
import { createAnticipo, METODOS_PAGO } from '../services/anticiposService'
import { recognizeDocument, MAX_OCR_FILE_SIZE_MB } from '../services/documentOcrService'
import { similarity } from '../utils/similarity'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import ClienteSelect from '../components/orders/ClienteSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import OrderItemsEditor from '../components/orders/OrderItemsEditor'
import FoliosExternosField from '../components/orders/FoliosExternosField'
import RequireRole from '../components/common/RequireRole'
import FileDropLabel from '../components/common/FileDropLabel'
import { canCreateOrder } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import { Loading, ErrorState } from '../components/common/States'
import { buildOrderConfirmationPdfBlob, orderConfirmationPdfFileName } from '../utils/generateOrderPdf'
import { CAPTURA_FECHA_CREACION_HABILITADA } from '../utils/featureFlags'

const initialForm = {
  clientId: '',
  clientName: '',
  clientTelefono: '',
  clientCorreo: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
  foliosExternos: [],
  createdAt: '',
  totalOrden: '',
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
  lleva_bolsas: false,
  manga: '',
  vivos: '',
  cuello: '',
  punos: '',
  logotipos: '',
  numeros: '',
  tiene_roster: false,
  roster: [],
  sizes: [{ talla: '', cantidad: '' }],
})

function isItemVacio(item) {
  return !item.garment.trim() && !item.sizes.some((s) => s.talla.trim())
}

// V42 — "no quiero que se borre el progreso" al cambiar de pestaña o de
// app (pedido explícito del usuario: buscan información en muchas otras
// pestañas mientras capturan). En escritorio cambiar de pestaña no borra
// nada por sí solo (React sigue vivo en memoria) — el caso real es
// celular: el sistema puede descargar la pestaña en segundo plano para
// liberar memoria, y al volver el navegador la recarga desde cero. La
// solución robusta para AMBOS casos es guardar un borrador en
// localStorage en cada cambio y recuperarlo al entrar — sobrevive tanto
// a un cambio de pestaña normal como a una recarga completa. Los
// ARCHIVOS (fotos, PDFs de cotización/orden de compra) no se pueden
// guardar así — un File no es serializable — así que esos sí se pierden
// si de verdad hay una recarga; todo lo demás (cliente, tipo, fechas,
// prendas, tallas, roster, folios, anticipo) sí se recupera.
const DRAFT_KEY = 'salper:nueva-orden:draft:v1'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // localStorage puede fallar (modo privado, cupo lleno...) — no es
    // grave, el usuario simplemente no recupera el borrador si eso pasa.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ver saveDraft
  }
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
  const { profile } = useAuth()
  const { orderTypes, loading, error, refresh } = useOrderTypes()
  const { clientes, refresh: refreshClientes } = useClientes()
  const { telas, refresh: refreshTelas } = useTelas()
  // V55 — para avisar si la fecha de entrega elegida ya cae en un
  // periodo saturado (ver utils/demand.js). Mismo criterio de "activas"
  // que usa el calendario por default (sin "Incluir completadas").
  const { orders: allOrders } = useOrders()
  const demand = useMemo(() => buildDemandMap(allOrders.filter((o) => isActiveStatus(o.status))), [allOrders])

  // V42: el borrador se lee UNA sola vez (lazy init) — no en cada
  // render, si no reabriría localStorage con cada tecla.
  const [initialDraft] = useState(() => loadDraft())
  const hasDraft = !!(
    initialDraft &&
    (initialDraft.form?.clientName?.trim() ||
      initialDraft.form?.orderTypeKey ||
      (initialDraft.items || []).some((it) => it.garment?.trim() || it.sizes?.some((s) => s.talla?.trim())))
  )
  const [draftDismissed, setDraftDismissed] = useState(false)

  const [form, setForm] = useState(() => initialDraft?.form || initialForm)
  const { productos, refresh: refreshProductos } = useProductosByCliente(form.clientId)
  const [items, setItems] = useState(() => (initialDraft?.items?.length > 0 ? initialDraft.items : [emptyItem()]))
  const [photoFiles, setPhotoFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const navigate = useNavigate()

  // V41 — cotización, orden de compra y anticipo se pueden capturar desde
  // aquí mismo, sin tener que entrar después al detalle de la orden
  // (pedido explícito del usuario). La factura queda fuera a propósito:
  // "eso ya hasta después" — se sigue subiendo solo desde el detalle
  // (OrderDocumentsCard.jsx), igual que siempre. Los archivos viven en
  // memoria hasta que la orden ya existe (necesitan su id) — mismo
  // patrón que las fotos de referencia, un poco más abajo. Los archivos
  // NO se recuperan del borrador (ver nota de DRAFT_KEY); los datos del
  // anticipo sí.
  const [cotizacionFile, setCotizacionFile] = useState(null)
  const [ordenCompraFile, setOrdenCompraFile] = useState(null)
  const [anticipoMonto, setAnticipoMonto] = useState(() => initialDraft?.anticipoMonto || '')
  const [anticipoMetodo, setAnticipoMetodo] = useState(() => initialDraft?.anticipoMetodo || 'efectivo')
  const [anticipoRecibidoPor, setAnticipoRecibidoPor] = useState(
    () => initialDraft?.anticipoRecibidoPor || profile?.full_name || ''
  )
  const [anticipoNotas, setAnticipoNotas] = useState(() => initialDraft?.anticipoNotas || '')

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrWarning, setOcrWarning] = useState(null)
  const [ocrError, setOcrError] = useState(null)
  const [ocrClienteHint, setOcrClienteHint] = useState(null)

  // Guarda el borrador en cada cambio — barato, y así sobrevive tanto a
  // un cambio de pestaña como a que el celular recargue la página sola.
  useEffect(() => {
    saveDraft({ form, items, anticipoMonto, anticipoMetodo, anticipoRecibidoPor, anticipoNotas })
  }, [form, items, anticipoMonto, anticipoMetodo, anticipoRecibidoPor, anticipoNotas])

  function discardDraft() {
    clearDraft()
    setForm(initialForm)
    setItems([emptyItem()])
    setAnticipoMonto('')
    setAnticipoMetodo('efectivo')
    setAnticipoRecibidoPor(profile?.full_name || '')
    setAnticipoNotas('')
    setDraftDismissed(true)
  }

  async function handleOcrFiles(files) {
    const file = files[0]
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
    const anticipoMontoNum = Number(anticipoMonto)
    if (anticipoMonto && (!anticipoMontoNum || anticipoMontoNum <= 0)) {
      setSubmitError(new Error('El monto del anticipo debe ser mayor a cero.'))
      return
    }
    if (anticipoMontoNum > 0 && !anticipoRecibidoPor.trim()) {
      setSubmitError(new Error('Falta indicar quién recibió el anticipo.'))
      return
    }
    const totalOrdenNum = Number(form.totalOrden)
    if (form.totalOrden && (!totalOrdenNum || totalOrdenNum <= 0)) {
      setSubmitError(new Error('El total de la orden debe ser mayor a cero.'))
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
      clientTelefono: form.clientTelefono.trim(),
      clientCorreo: form.clientCorreo.trim(),
      orderTypeKey: form.orderTypeKey,
      description: form.description.trim(),
      requestedDeliveryDate: form.requestedDeliveryDate,
      items: cleanItems,
      foliosExternos: form.foliosExternos,
      createdAt: CAPTURA_FECHA_CREACION_HABILITADA ? form.createdAt || null : null,
      totalOrden: totalOrdenNum > 0 ? totalOrdenNum : null,
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

    // V41 — mismo criterio que las fotos: cotización/orden de compra/
    // anticipo son opcionales y, si algo falla aquí, la orden YA se creó
    // — no se cancela nada, solo se avisa para reintentar desde el
    // detalle (OrderDocumentsCard/OrderPaymentsCard).
    let documentError = null
    if (cotizacionFile) {
      const { error: docError } = await uploadOrderDocument(data.id, 'cotizacion', cotizacionFile)
      if (docError) documentError = `Cotización: ${docError.message}`
    }
    if (ordenCompraFile) {
      const { error: docError } = await uploadOrderDocument(data.id, 'orden_compra', ordenCompraFile)
      if (docError) documentError = documentError ? `${documentError} · Orden de compra: ${docError.message}` : `Orden de compra: ${docError.message}`
    }

    let anticipoError = null
    if (anticipoMontoNum > 0) {
      const { error: anticipoErr } = await createAnticipo({
        orderId: data.id,
        monto: anticipoMontoNum,
        metodoPago: anticipoMetodo,
        recibidoPor: anticipoRecibidoPor.trim(),
        notas: anticipoNotas.trim(),
      })
      if (anticipoErr) anticipoError = anticipoErr.message
    }

    setSubmitting(false)
    clearDraft()

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

    navigate(`/orden/${data.id}`, { state: { photoUploadError: photoError, documentError, anticipoError, pdfPreview } })
  }

  if (loading) return <Loading label="Cargando tipos de orden…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  // V55/V56 — carga de esa fecha ANTES de agregar esta orden nueva (así
  // se avisa si ya está saturada, no después de que esta orden ya
  // cuenta) — tanto en órdenes como en prendas (una orden grande también
  // debe disparar el aviso, no solo muchas órdenes chiquitas).
  const deliveryLoad = form.requestedDeliveryDate
    ? getLoadForDate(demand, parseDate(form.requestedDeliveryDate))
    : { orders: 0, pieces: 0 }
  const deliverySaturated = deliveryLoad.orders >= demand.orderThreshold || deliveryLoad.pieces >= demand.pieceThreshold

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Nueva orden</h2>

      {hasDraft && !draftDismissed && (
        <p className="pantone-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>📝 Se recuperó un borrador sin terminar de esta orden — las fotos y PDFs elegidos no se pudieron guardar, solo el resto.</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={discardDraft}>
            Descartar y empezar de cero
          </button>
        </p>
      )}

      <form className="order-form" onSubmit={handleSubmit}>
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Foto o PDF de la orden (opcional)
          </span>
          <FileDropLabel
            className="photo-picker__add"
            style={{ display: 'inline-flex' }}
            accept="image/*,application/pdf"
            disabled={ocrLoading}
            onFiles={handleOcrFiles}
          >
            {ocrLoading ? 'Leyendo el archivo…' : '+ Subir foto o PDF y prellenar la orden (o arrastra aquí)'}
          </FileDropLabel>
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
            Tipo de orden *
          </span>
          <OrderTypeSelect
            orderTypes={orderTypes}
            value={form.orderTypeKey}
            onChange={(key) => updateField('orderTypeKey', key)}
            onTypeCreated={refresh}
          />
          <p className="pantone-hint">Elige el tipo de orden primero — la lista de clientes de abajo se filtra según esto.</p>
        </div>

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Cliente *
          </span>
          <ClienteSelect
            clientes={clientes}
            value={form.clientId}
            orderTypeKey={form.orderTypeKey}
            onChange={(clientId, clientName, telefono, correo) => {
              // V42: ClienteSelect ya manda teléfono/correo directo (tanto al
              // crear un cliente nuevo como al elegir uno existente) — se
              // acabó la condición de carrera de buscarlo en `clientes` (la
              // lista recién refrescada no le ganaba a este onChange). Se
              // asignan tal cual, sin fallback: si el cliente elegido no
              // tiene teléfono/correo guardado, el campo se vacía en vez de
              // quedarse con el del cliente anterior.
              setForm((f) => ({ ...f, clientId, clientName, clientTelefono: telefono, clientCorreo: correo }))
            }}
            onClienteCreated={refreshClientes}
          />
        </div>

        <div className="form-row">
          <label>
            Teléfono del cliente
            <input
              type="tel"
              className="input"
              value={form.clientTelefono}
              onChange={(e) => updateField('clientTelefono', e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label>
            Correo del cliente
            <input
              type="email"
              className="input"
              value={form.clientCorreo}
              onChange={(e) => updateField('clientCorreo', e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>
        <p className="pantone-hint">
          Si el cliente ya está en el catálogo, esto se guarda para prellenarse solo la próxima vez que le hagan un
          pedido.
        </p>

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Folios externos (control anterior)
          </span>
          <FoliosExternosField value={form.foliosExternos} onChange={(v) => updateField('foliosExternos', v)} />
        </div>
        <p className="pantone-hint">
          Si esta orden ya tenía uno o varios folios en su control anterior, agrégalos aquí — un mismo cliente a
          veces pedía cosas distintas que quedaron en varias órdenes de taller separadas. Solo pon los 4 números,
          el "ORD" se agrega solo. Es independiente del folio que asigna SALPER (SUB-001, ESC-001, etc.), y también
          se puede buscar por ellos en el Dashboard.
        </p>

        {CAPTURA_FECHA_CREACION_HABILITADA && (
          <>
            <label>
              Fecha de creación (temporal — para subir el historial)
              <input
                type="date"
                className="input"
                value={form.createdAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => updateField('createdAt', e.target.value)}
              />
            </label>
            <p className="pantone-hint">
              Solo úsalo si esta orden ya existía antes de hoy y la estás subiendo al sistema — déjalo vacío en
              cualquier orden nueva de verdad y se le pone la fecha de hoy automáticamente, como siempre.
            </p>
          </>
        )}

        <label>
          Fecha de entrega solicitada *
          <input
            type="date"
            className="input"
            value={form.requestedDeliveryDate}
            onChange={(e) => updateField('requestedDeliveryDate', e.target.value)}
          />
        </label>
        {deliverySaturated && (
          <p className="pantone-hint" style={{ color: 'var(--color-orange-strong)' }}>
            ⚠ Esta fecha ya tiene {deliveryLoad.orders} orden{deliveryLoad.orders === 1 ? '' : 'es'} (
            {deliveryLoad.pieces.toLocaleString('es-MX')} prenda{deliveryLoad.pieces === 1 ? '' : 's'}) en producción
            encimadas — más de lo normal para este taller. Si se puede, considera platicar con el cliente para
            correr la fecha.
          </p>
        )}

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

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Documentos, total y anticipo (opcional)
          </span>
          <p className="pantone-hint" style={{ marginTop: 0 }}>
            La factura no va aquí — esa se sube después, desde el detalle de la orden.
          </p>

          <div className="form-row">
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Cotización (PDF)
              </span>
              <FileDropLabel
                className="btn btn--secondary btn--small"
                style={{ display: 'inline-flex' }}
                accept="application/pdf"
                onFiles={(files) => setCotizacionFile(files[0] || null)}
              >
                {cotizacionFile ? 'Reemplazar' : 'Subir PDF (o arrastra aquí)'}
              </FileDropLabel>
              {cotizacionFile && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="template-hint">{cotizacionFile.name}</span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setCotizacionFile(null)}>
                    Quitar
                  </button>
                </div>
              )}
            </div>
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Orden de compra (PDF)
              </span>
              <FileDropLabel
                className="btn btn--secondary btn--small"
                style={{ display: 'inline-flex' }}
                accept="application/pdf"
                onFiles={(files) => setOrdenCompraFile(files[0] || null)}
              >
                {ordenCompraFile ? 'Reemplazar' : 'Subir PDF (o arrastra aquí)'}
              </FileDropLabel>
              {ordenCompraFile && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="template-hint">{ordenCompraFile.name}</span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setOrdenCompraFile(null)}>
                    Quitar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <label>
              Total de la orden
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={form.totalOrden}
                onChange={(e) => updateField('totalOrden', e.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              Anticipo recibido
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input"
                value={anticipoMonto}
                onChange={(e) => setAnticipoMonto(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          {form.totalOrden && anticipoMonto && (
            <p className="pantone-hint">
              Restante: {(Number(form.totalOrden) - Number(anticipoMonto)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
            </p>
          )}

          <div className="form-row" style={{ marginTop: 12 }}>
            <label>
              Método de pago del anticipo
              <select className="input" value={anticipoMetodo} onChange={(e) => setAnticipoMetodo(e.target.value)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {anticipoMonto && (
              <label>
                Quién lo recibió *
                <input
                  type="text"
                  className="input"
                  value={anticipoRecibidoPor}
                  onChange={(e) => setAnticipoRecibidoPor(e.target.value)}
                  placeholder="Nombre de quién cobró"
                />
              </label>
            )}
          </div>

          {anticipoMonto && (
            <label style={{ marginTop: 12, display: 'block' }}>
              Notas del anticipo
              <input
                type="text"
                className="input"
                value={anticipoNotas}
                onChange={(e) => setAnticipoNotas(e.target.value)}
                placeholder="Opcional"
              />
            </label>
          )}
        </div>

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
