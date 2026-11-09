import { esOrdenBordado, normalizarItemsBordado, validarItemsBordado } from '../utils/bordadoOrden'
import { limpiarRoster } from '../utils/roster'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useOrderTypes } from '../hooks/useOrderTypes'
import { useClientes } from '../hooks/useClientes'
import { useTelas } from '../hooks/useTelas'
import { validarFotosBordado, validarImpresiones } from '../utils/productoCatalogo'
import { useProductosByCliente } from '../hooks/useProductosByCliente'
import { useOrders } from '../hooks/useOrders'
import { buildDemandMap, getLoadForDate } from '../utils/demand'
import { parseDate } from '../utils/dates'
import { isActiveStatus } from '../utils/status'
import { createOrder, createOrderMaquila, fetchOrdenPorNumeroCorte, setOrdenEquipo } from '../services/ordersService'
import { fetchPlantillasEtapas } from '../services/orderTypesService'
import { TIPO_VENTA_MOSTRADOR, CLIENTE_SALPER_NOMBRE } from '../lib/constants'
import { uploadOrderPhotos, attachExistingPhotos } from '../services/photosService'
import { copyTemplatePhotosToOrder } from '../services/templatesService'
import { uploadOrderDocument } from '../services/documentsService'
import { createAnticipo } from '../services/anticiposService'
import { fetchAltaRequierePrecio, formatMxn } from '../services/finanzasService'
import { filasDeFormulario, lineasParaGuardar, mensajeFaltanPrecios, resumenPago, tipoLlevaPrecio } from '../utils/preciosLineas'
import { aplicarPrecios, estadoDeItem, sinDatosDePrecio, tallasDeItem } from '../utils/preciosPrenda'
import PreciosPrendaEditor from '../components/orders/PreciosPrendaEditor'
import VentaMostradorToggle from '../components/orders/VentaMostradorToggle'
import ResumenPagoAlta from '../components/orders/ResumenPagoAlta'
import { recognizeDocument } from '../services/documentOcrService'
import { similarity } from '../utils/similarity'
import { filtrarClientesPorTipo } from '../utils/clientes'
import OrderTypeSelect from '../components/orders/OrderTypeSelect'
import ClienteSelect from '../components/orders/ClienteSelect'
import PhotoPicker from '../components/orders/PhotoPicker'
import OrderItemsEditor from '../components/orders/OrderItemsEditor'
import { usePrendasOperaciones } from '../hooks/usePrendasOperaciones'
import { fijarPrendasOperaciones } from '../utils/operacionesOrden'
import MaquilaItemsEditor from '../components/orders/MaquilaItemsEditor'
import { esOrdenMaquila, etiquetaProcesos, fotosDeProducto, nuevaPrendaMaquila, prendaMaquila, procesosDeLaOrden, productoBorda, validarOrdenMaquila } from '../utils/maquila'
import FoliosExternosField from '../components/orders/FoliosExternosField'
import { admiteBordadoPorOrden, esOrdenFrisa, etiquetaSecuencia, expandirTallas, prendaFrisa, procesosDeLaOrdenFrisa, validarOrdenFrisa } from '../utils/frisa'
import { createOrderFrisa, fetchProductosFrisa } from '../services/frisaService'
import { CLIENTE_FRISA_NOMBRE } from '../lib/constants'
import RequireRole from '../components/common/RequireRole'
import FileDropLabel from '../components/common/FileDropLabel'
import { canCreateOrder } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import { Loading, ErrorState } from '../components/common/States'
import { buildOrderConfirmationPdfBlob, fetchPagosParaPdf, orderConfirmationPdfFileName } from '../utils/generateOrderPdf'
import { canEditFinanzas, canViewFinanzas } from '../utils/permissions'
import { AGRUPACIONES, PEDIDO_VACIO, datosParaGuardar, errorPedido, ordenarPedidosParaCliente } from '../utils/pedidos'
import { agregarOrdenAPedido, crearPedido, fetchPedidosLista } from '../services/pedidosService'
import PedidoDatosForm from '../components/pedidos/PedidoDatosForm'
import { faltaTela, tipoLlevaCorte } from '../utils/telaObligatoria'
import { CAPTURA_FECHA_CREACION_HABILITADA } from '../utils/featureFlags'
import Miniatura from '../components/common/Miniatura'
import { ACEPTA_FOTO_O_PDF } from '../utils/archivos'

const initialForm = {
  // Fase 1A — toda la orden es venta de mostrador: sin precio, anticipo ni factura.
  ventaMostrador: false,
  // V176 — 'suelta' | 'nuevo' (pedido nuevo con esta orden) | 'existente'.
  agrupacion: 'suelta',
  pedidoExistenteId: '',
  clientId: '',
  // V60 — true = "Otro cliente (no registrado)": nombre/teléfono/correo
  // capturados a mano solo para esta orden, sin guardarse en el catálogo.
  clienteIncidental: false,
  clientName: '',
  clientTelefono: '',
  clientCorreo: '',
  orderTypeKey: '',
  description: '',
  requestedDeliveryDate: '',
  foliosExternos: [],
  createdAt: '',
  // V143 — solo órdenes de maquila.
  productoId: '',
  numeroCorte: '',
  // V145 — solo sublimación: nombre del equipo (opcional).
  equipo: '',
  // V155 — solo órdenes de Frisa: producto, cantidades por talla y bordado por orden.
  productoFrisaId: '',
  cantidadesFrisa: {},
  bordadoFrisa: false,
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
  bordado_ubicacion: '',
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

// V58 — selector de PDFs de un tipo (cotización / orden de compra) para el
// formulario de "Nueva orden": pueden ser VARIOS; la subida real ocurre
// después de crear la orden.
function DocumentosPicker({ label, files, onChange }) {
  return (
    <div>
      <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
        {label}
      </span>
      <FileDropLabel
        className="btn btn--secondary btn--small"
        style={{ display: 'inline-flex' }}
        accept={ACEPTA_FOTO_O_PDF}
        multiple
        onFiles={(nuevos) => onChange([...files, ...nuevos])}
      >
        {files.length > 0 ? '+ Agregar otro' : 'Subir PDF o foto (o arrastra aquí)'}
      </FileDropLabel>
      {files.map((file, i) => (
        <div key={`${file.name}-${i}`} style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="template-hint">{file.name}</span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onChange(files.filter((_, j) => j !== i))}
          >
            Quitar
          </button>
        </div>
      ))}
    </div>
  )
}

function NewOrderForm() {
  const { profile, role } = useAuth()
  const prendasOps = usePrendasOperaciones()
  const { orderTypes, loading, error, refresh } = useOrderTypes()
  const { clientes } = useClientes()
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

  // V176 — "+ Nueva orden" desde un pedido: la orden entra a ese pedido.
  const pedidoDesdeRuta = useLocation().state?.pedidoId || ''
  const [form, setForm] = useState(() => {
    const base = initialDraft?.form ? { ...initialForm, ...initialDraft.form } : initialForm
    return pedidoDesdeRuta ? { ...base, agrupacion: 'existente', pedidoExistenteId: pedidoDesdeRuta } : base
  })
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
  const [cotizacionFiles, setCotizacionFiles] = useState([])
  const [ordenCompraFiles, setOrdenCompraFiles] = useState([])
  const [anticipoMonto, setAnticipoMonto] = useState(() => initialDraft?.anticipoMonto || '')
  const [anticipoMetodo, setAnticipoMetodo] = useState(() => initialDraft?.anticipoMetodo || 'efectivo')
  const [anticipoRecibidoPor, setAnticipoRecibidoPor] = useState(
    () => initialDraft?.anticipoRecibidoPor || profile?.full_name || ''
  )
  const [anticipoNotas, setAnticipoNotas] = useState(() => initialDraft?.anticipoNotas || '')
  // V176 — datos del pedido nuevo (anticipo y factura van en el pedido).
  const [pedidoForm, setPedidoForm] = useState(() => ({
    ...PEDIDO_VACIO,
    anticipoRecibidoPor: profile?.full_name || '',
    ...(initialDraft?.pedidoForm || {}),
  }))

  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrWarning, setOcrWarning] = useState(null)
  const [ocrError, setOcrError] = useState(null)

  // Guarda el borrador en cada cambio — barato, y así sobrevive tanto a
  // un cambio de pestaña como a que el celular recargue la página sola.
  useEffect(() => {
    saveDraft({ form, items, anticipoMonto, anticipoMetodo, anticipoRecibidoPor, anticipoNotas, pedidoForm })
  }, [form, items, anticipoMonto, anticipoMetodo, anticipoRecibidoPor, anticipoNotas, pedidoForm])

  // V136 — "Venta Mostrador": el cliente es siempre Salper (se asigna solo y
  // el selector queda bloqueado). El servidor lo fuerza igual.
  const esVentaMostrador = form.orderTypeKey === TIPO_VENTA_MOSTRADOR
  const clienteSalper = useMemo(
    () => clientes.find((c) => c.nombre.trim().toLowerCase() === CLIENTE_SALPER_NOMBRE.toLowerCase()) || null,
    [clientes]
  )
  useEffect(() => {
    if (!esVentaMostrador || !clienteSalper) return
    setForm((f) =>
      f.clientId === clienteSalper.id && !f.clienteIncidental
        ? f
        : { ...f, clientId: clienteSalper.id, clienteIncidental: false, clientName: clienteSalper.nombre, clientTelefono: '', clientCorreo: '' }
    )
  }, [esVentaMostrador, clienteSalper])

  // V143 — Maquila: un producto del catálogo del cliente + número de corte.
  const esMaquila = esOrdenMaquila(form.orderTypeKey)
  const productoMaquila = esMaquila ? productos.find((p) => p.id === form.productoId) || null : null
  const llevaBordadoMaquila = !!items[0]?.lleva_bordado || productoBorda(productoMaquila)

  // V155 — Frisa: sin cliente del catálogo, un producto del catálogo Frisa,
  // cantidades por talla (el rango del producto) y sin precio.
  const esFrisa = esOrdenFrisa(form.orderTypeKey)
  const [productosFrisa, setProductosFrisa] = useState([])
  const [productosFrisaError, setProductosFrisaError] = useState(null)
  useEffect(() => {
    if (!esFrisa) return
    fetchProductosFrisa().then(({ data, error: err }) => {
      setProductosFrisa((data || []).filter((p) => p.activo))
      setProductosFrisaError(err)
    })
  }, [esFrisa])
  const productoFrisa = esFrisa ? productosFrisa.find((p) => p.id === form.productoFrisaId) || null : null
  const bordadoFrisa = !!form.bordadoFrisa && admiteBordadoPorOrden(productoFrisa)

  // V159 — precio por línea (prenda + talla). Fase 1B: se captura por prenda
  // ("Mismo precio" o "Precios por talla", en `item.precios`) y de ahí sale el
  // precio de cada talla; ni uno ni otro van a orders.items.
  // Frisa y el tipo Venta Mostrador no llevan precio.
  const llevaPrecio = !!form.orderTypeKey && !esFrisa && tipoLlevaPrecio(form.orderTypeKey)
  // Fase 1A — venta de mostrador de toda la orden: no se cobra nada.
  const ventaMostrador = !!form.ventaMostrador
  const cobra = llevaPrecio && !ventaMostrador
  const itemsDePrecio = esMaquila ? items.slice(0, 1) : items
  const filasPrecio = useMemo(() => filasDeFormulario((esMaquila ? items.slice(0, 1) : items).map(aplicarPrecios)), [items, esMaquila])
  const resumen = resumenPago(filasPrecio, anticipoMonto)
  const prendasPrecio = itemsDePrecio.map((item, i) => {
    const tallas = tallasDeItem(item).map((talla) => ({
      talla,
      cantidad: (item.sizes || []).filter((s) => String(s.talla ?? '').trim() === talla).reduce((n, s) => n + (Number(s.cantidad) || 0), 0),
    }))
    const nombre = (esMaquila ? productoMaquila?.nombre : null) || String(item.garment || '').trim() || `Prenda ${i + 1}`
    return { key: i, nombre, tallas }
  }).filter((p) => p.tallas.length > 0)
  const estadosPrecio = Object.fromEntries(itemsDePrecio.map((item, i) => [i, estadoDeItem(item)]))
  function cambiarPrecioPrenda(indice, estado) {
    setItems((current) => current.map((item, i) => (i === indice ? { ...item, precios: estado } : item)))
  }
  // V161 — mientras se acostumbran, el precio puede ser opcional al crear
  // (interruptor fin_config.alta_requiere_precio, se cambia solo en la base).
  const [precioObligatorio, setPrecioObligatorio] = useState(true)
  useEffect(() => {
    fetchAltaRequierePrecio().then(setPrecioObligatorio)
  }, [])
  // V176 — pedidos: solo quien edita precios (ventas y administradores de
  // tienda), y no en Frisa (no lleva cliente ni precio).
  const puedePedidos = canEditFinanzas(role) && !esFrisa
  const agrupacion = puedePedidos ? form.agrupacion || 'suelta' : 'suelta'
  const enPedido = agrupacion !== 'suelta'
  const [pedidosLista, setPedidosLista] = useState([])
  const [pedidosError, setPedidosError] = useState(null)
  useEffect(() => {
    if (agrupacion !== 'existente') return
    fetchPedidosLista().then(({ data, error: err }) => {
      setPedidosLista(data || [])
      setPedidosError(err)
    })
  }, [agrupacion])
  const pedidosOrdenados = ordenarPedidosParaCliente(pedidosLista, { clientId: form.clientId, cliente: form.clientName })
  const pedidoExistente = agrupacion === 'existente' ? pedidosLista.find((p) => p.id === form.pedidoExistenteId) || null : null
  // Un pedido de mostrador hace de mostrador a todas sus órdenes.
  const mostradorPorPedido = !!pedidoExistente?.es_mostrador
  useEffect(() => {
    if (mostradorPorPedido && !form.ventaMostrador) setForm((f) => ({ ...f, ventaMostrador: true }))
  }, [mostradorPorPedido, form.ventaMostrador])

  function cambiarAnticipo({ monto, metodo, recibidoPor, notas }) {
    setAnticipoMonto(monto)
    setAnticipoMetodo(metodo)
    setAnticipoRecibidoPor(recibidoPor)
    setAnticipoNotas(notas)
  }

  function discardDraft() {
    clearDraft()
    setForm(initialForm)
    setItems([emptyItem()])
    setAnticipoMonto('')
    setAnticipoMetodo('efectivo')
    setAnticipoRecibidoPor(profile?.full_name || '')
    setAnticipoNotas('')
    setPedidoForm({ ...PEDIDO_VACIO, anticipoRecibidoPor: profile?.full_name || '' })
    setDraftDismissed(true)
  }

  async function handleOcrFiles(files) {
    const file = files[0]
    if (!file) return

    setOcrLoading(true)
    setOcrWarning(null)
    setOcrError(null)

    const { data, error: ocrErr } = await recognizeDocument(file, 'orden')
    setOcrLoading(false)

    if (ocrErr) {
      setOcrError(ocrErr)
      return
    }
    if (data.warning) {
      setOcrWarning(data.warning)
    }

    // Cliente (V60): solo si ya se eligió el tipo de orden y todavía no hay
    // cliente. Si el nombre reconocido coincide exacto con uno del catálogo
    // de ese tipo, se selecciona; si no, se deja como "Otro cliente" con el
    // nombre reconocido (revisable) — nunca se da de alta en el catálogo.
    if (data.cliente && !form.clientId && !form.clienteIncidental) {
      if (!form.orderTypeKey) {
        setOcrWarning('Elige primero el tipo de orden para que también se prellene el cliente.')
      } else {
        const exact = filtrarClientesPorTipo(clientes, form.orderTypeKey).find((c) => similarity(c.nombre, data.cliente) === 1)
        if (exact) {
          setForm((f) => ({
            ...f,
            clientId: exact.id,
            clienteIncidental: false,
            clientName: exact.nombre,
            clientTelefono: exact.telefono || '',
            clientCorreo: exact.correo || '',
          }))
        } else {
          setForm((f) => ({ ...f, clientId: '', clienteIncidental: true, clientName: data.cliente }))
        }
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

  // V60 — el tipo de orden manda: filtra los clientes. Si el cliente ya
  // elegido no pertenece al nuevo tipo, se limpia (un "otro cliente" a mano
  // se conserva, no depende del catálogo).
  function handleTypeChange(key) {
    // V143 — la prenda de maquila tiene otra forma: al entrar o salir de
    // Maquila se empieza con la prenda en blanco.
    if (esOrdenMaquila(key) !== esOrdenMaquila(form.orderTypeKey)) {
      setItems([esOrdenMaquila(key) ? nuevaPrendaMaquila() : emptyItem()])
    }
    setForm((f) => {
      // V155 — Frisa no usa el catálogo de clientes: al entrar o salir se limpia.
      if (esOrdenFrisa(key) !== esOrdenFrisa(f.orderTypeKey)) {
        return {
          ...f,
          orderTypeKey: key,
          clientId: '',
          clienteIncidental: false,
          clientName: esOrdenFrisa(key) ? CLIENTE_FRISA_NOMBRE : '',
          clientTelefono: '',
          clientCorreo: '',
          productoFrisaId: '',
          cantidadesFrisa: {},
          bordadoFrisa: false,
        }
      }
      if (esOrdenMaquila(key) !== esOrdenMaquila(f.orderTypeKey)) {
        // Los clientes de maquila son otros: se vuelve a elegir.
        return { ...f, orderTypeKey: key, clientId: '', clienteIncidental: false, clientName: '', clientTelefono: '', clientCorreo: '', productoId: '', numeroCorte: '' }
      }
      // Al salir de Venta Mostrador se suelta el cliente Salper puesto a la fuerza.
      if (f.orderTypeKey === TIPO_VENTA_MOSTRADOR && key !== TIPO_VENTA_MOSTRADOR) {
        return { ...f, orderTypeKey: key, clientId: '', clienteIncidental: false, clientName: '', clientTelefono: '', clientCorreo: '' }
      }
      const sigueValido = !f.clientId || filtrarClientesPorTipo(clientes, key).some((c) => c.id === f.clientId)
      return sigueValido
        ? { ...f, orderTypeKey: key }
        : { ...f, orderTypeKey: key, clientId: '', clientName: '', clientTelefono: '', clientCorreo: '' }
    })
  }

  function handleSelectCliente(c) {
    setForm((f) => ({
      ...f,
      clientId: c?.id || '',
      clienteIncidental: false,
      clientName: c?.nombre || '',
      clientTelefono: c?.telefono || '',
      clientCorreo: c?.correo || '',
      // El producto es del catálogo del cliente: cambia el cliente, se vuelve a elegir.
      productoId: c?.id === f.clientId ? f.productoId : '',
    }))
  }

  function handleSelectIncidental() {
    setForm((f) =>
      f.clienteIncidental ? f : { ...f, clientId: '', clienteIncidental: true, clientName: '', clientTelefono: '', clientCorreo: '' }
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.orderTypeKey) {
      setSubmitError(new Error('Elige el tipo de orden.'))
      return
    }
    if (esFrisa) {
      if (!form.requestedDeliveryDate) {
        setSubmitError(new Error('Falta la fecha de entrega.'))
        return
      }
      await handleSubmitFrisa()
      return
    }
    if (esVentaMostrador && form.clientId !== clienteSalper?.id) {
      setSubmitError(new Error('Las órdenes de Venta Mostrador van al cliente "Salper", y no lo encontré en el catálogo de clientes. Avisa a un administrador.'))
      return
    }
    if (!form.clientName.trim()) {
      setSubmitError(new Error(form.clienteIncidental ? 'Escribe el nombre del cliente.' : 'Elige un cliente.'))
      return
    }
    if (!form.requestedDeliveryDate) {
      setSubmitError(new Error('Falta la fecha de entrega.'))
      return
    }
    // V159 — sin nada que cobrar (tipo sin precio o venta de mostrador) no hay anticipo.
    // V176 — en un pedido, el anticipo se captura en el pedido (no en la orden).
    const anticipoAplica = cobra && resumen.hayCobro && !enPedido
    const anticipoMontoNum = anticipoAplica ? Number(anticipoMonto) : 0
    if (anticipoAplica && anticipoMonto && (!anticipoMontoNum || anticipoMontoNum <= 0)) {
      setSubmitError(new Error('El monto del anticipo debe ser mayor a cero.'))
      return
    }
    if (anticipoMontoNum > 0 && !anticipoRecibidoPor.trim()) {
      setSubmitError(new Error('Falta indicar quién recibió el anticipo.'))
      return
    }

    if (agrupacion === 'existente' && !pedidoExistente) {
      setSubmitError(new Error('Elige el pedido al que se agrega la orden.'))
      return
    }
    if (agrupacion === 'nuevo') {
      const faltaPedido = errorPedido({ ...pedidoForm, cliente: form.clientName, esMostrador: ventaMostrador })
      if (faltaPedido) {
        setSubmitError(new Error(faltaPedido))
        return
      }
    }

    if (esMaquila) {
      await handleSubmitMaquila(anticipoMontoNum)
      return
    }

    // Prendas que se guardan (mismo filtro de siempre). Las líneas de precio
    // se cuentan sobre ESTA lista para que sus índices coincidan en la base.
    const itemsFiltrados = items
      .filter((item) => item.garment.trim() || item.sizes.some((s) => s.talla.trim()))
      .map(aplicarPrecios)
    const faltaPrecio = cobra && precioObligatorio ? mensajeFaltanPrecios(filasDeFormulario(itemsFiltrados), form.orderTypeKey) : null
    if (faltaPrecio) {
      setSubmitError(new Error(faltaPrecio))
      return
    }

    // V132/V133 — foto de bordado obligatoria: en una orden de bordado, cada prenda necesita
    // la foto de su bordado (y su "dónde va" si no es cachucha); en las demás, solo las
    // prendas que llevan bordado (sublimación nunca).
    const faltaFotoBordado = esOrdenBordado(form.orderTypeKey)
      ? validarItemsBordado(items)
      : form.orderTypeKey === 'sublimacion'
        ? null
        : validarFotosBordado(items)
    if (faltaFotoBordado) {
      setSubmitError(new Error(faltaFotoBordado))
      return
    }
    // V134 — y una que lleva impresión, la foto y el lugar de cada impresión.
    const faltaImpresion = esOrdenBordado(form.orderTypeKey) || form.orderTypeKey === 'sublimacion' ? null : validarImpresiones(items)
    if (faltaImpresion) {
      setSubmitError(new Error(faltaImpresion))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    // Solo talla y cantidad: el precio y la bandera de mostrador NO van en orders.items.
    const cleanItemsBase = itemsFiltrados
      .map((item) => limpiarRoster({
        ...sinDatosDePrecio(item),
        sizes: item.sizes
          .filter((s) => s.talla.trim() && Number(s.cantidad) > 0)
          .map((s) => ({ talla: s.talla.trim(), cantidad: Number(s.cantidad) })),
      }))
    const cleanItems = esOrdenBordado(form.orderTypeKey) ? normalizarItemsBordado(cleanItemsBase) : fijarPrendasOperaciones(cleanItemsBase, form.clientName, prendasOps)

    // V136 — si el tipo no tiene etapas, la orden nacería sin orden_etapas y
    // no le aparecería a ninguna estación de fábrica: no se guarda. (El
    // servidor tiene el mismo candado; aquí se avisa antes de subir nada.)
    const { data: plantillas, error: plantillasError } = await fetchPlantillasEtapas()
    if (!plantillasError) {
      const generaEtapas =
        (plantillas || []).some((p) => p.order_type_key === form.orderTypeKey && p.etapa !== 'bordado') ||
        cleanItems.some((item) => item.lleva_bordado)
      // V154 — tela obligatoria si la orden pasa por corte.
      const sinTela = tipoLlevaCorte(form.orderTypeKey, plantillas || []) ? faltaTela(cleanItems) : null
      if (sinTela) {
        setSubmitError(new Error(sinTela))
        setSubmitting(false)
        return
      }
      if (!generaEtapas) {
        const tipoLabel = orderTypes.find((t) => t.key === form.orderTypeKey)?.label || form.orderTypeKey
        setSubmitError(
          new Error(
            `No se puede crear la orden: el tipo "${tipoLabel}" no tiene etapas de producción configuradas, así que no le aparecería a corte, costura ni terminado. Pide a un administrador que le asigne etapas en Catálogos → Tipos de orden.`
          )
        )
        setSubmitting(false)
        return
      }
    }

    const { data, error: createError } = await createOrder({
      clientName: form.clientName.trim(),
      clientId: form.clienteIncidental ? null : form.clientId || null,
      clientTelefono: form.clientTelefono.trim(),
      clientCorreo: form.clientCorreo.trim(),
      orderTypeKey: form.orderTypeKey,
      description: form.description.trim(),
      requestedDeliveryDate: form.requestedDeliveryDate,
      items: cleanItems,
      lineas: llevaPrecio ? lineasParaGuardar(itemsFiltrados, { ventaMostrador }) : [],
      foliosExternos: form.foliosExternos,
      createdAt: CAPTURA_FECHA_CREACION_HABILITADA ? form.createdAt || null : null,
    })

    if (createError) {
      setSubmitting(false)
      setSubmitError(createError)
      return
    }

    await terminarCreacion(data, anticipoMontoNum)
  }

  // V143 — orden de maquila: cliente de maquila → producto → número de corte
  // (único por cliente) → tallas → bordado. Las etapas las arma el servidor
  // con los procesos del producto.
  async function handleSubmitMaquila(anticipoMontoNum) {
    const cliente = clientes.find((c) => c.id === form.clientId) || null
    const faltaMaquila = validarOrdenMaquila({
      cliente,
      producto: productoMaquila,
      numeroCorte: form.numeroCorte,
      item: items[0],
      llevaBordado: llevaBordadoMaquila,
    })
    if (faltaMaquila) {
      setSubmitError(new Error(faltaMaquila))
      return
    }
    const faltaPrecio =
      !ventaMostrador && precioObligatorio ? mensajeFaltanPrecios(filasDeFormulario([aplicarPrecios(items[0])]), form.orderTypeKey) : null
    if (faltaPrecio) {
      setSubmitError(new Error(faltaPrecio))
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    const numeroCorte = form.numeroCorte.trim()
    const { data: repetida, error: repetidaError } = await fetchOrdenPorNumeroCorte(cliente.id, numeroCorte)
    if (repetidaError || repetida) {
      setSubmitting(false)
      setSubmitError(
        repetidaError || new Error(`${cliente.nombre} ya tiene una orden con el número de corte "${repetida.numero_corte}" (${repetida.order_number}).`)
      )
      return
    }

    const { data, error: createError } = await createOrderMaquila({
      clientId: cliente.id,
      productoId: productoMaquila.id,
      numeroCorte,
      requestedDeliveryDate: form.requestedDeliveryDate,
      items: [prendaMaquila(items[0], productoMaquila, llevaBordadoMaquila)],
      // Mismo filtro de tallas que prendaMaquila: los índices coinciden.
      lineas: lineasParaGuardar([aplicarPrecios(items[0])], { ventaMostrador }),
      description: form.description.trim(),
      foliosExternos: form.foliosExternos,
    })

    if (createError) {
      setSubmitting(false)
      setSubmitError(createError)
      return
    }

    // Las fotos del producto pasan a ser fotos de referencia de la orden (se
    // COPIAN, como las de una plantilla: borrar una en la orden no la quita
    // del catálogo). Así las ven las estaciones y salen en el PDF.
    let conFotosDelProducto = data
    let fotoProductoError = null
    const fotosProducto = fotosDeProducto(productoMaquila)
    if (fotosProducto.length > 0) {
      const { data: copiadas, error: copiaError } = await copyTemplatePhotosToOrder(data.id, fotosProducto)
      const { data: orden, error: adjuntarError } = copiaError ? { data: null, error: copiaError } : await attachExistingPhotos(data.id, copiadas)
      if (adjuntarError) fotoProductoError = adjuntarError.message
      else if (orden?.reference_photos) conFotosDelProducto = { ...data, reference_photos: orden.reference_photos }
    }

    await terminarCreacion(conFotosDelProducto, anticipoMontoNum, fotoProductoError)
  }

  // V155 — orden Frisa: producto → cantidades por talla. El servidor copia
  // la secuencia del producto a la orden; no lleva cliente ni precio.
  async function handleSubmitFrisa() {
    const falta = validarOrdenFrisa({ producto: productoFrisa, cantidades: form.cantidadesFrisa })
    if (falta) {
      setSubmitError(new Error(falta))
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const { data, error: createError } = await createOrderFrisa({
      productoId: productoFrisa.id,
      requestedDeliveryDate: form.requestedDeliveryDate,
      items: [prendaFrisa(productoFrisa, form.cantidadesFrisa)],
      description: form.description.trim(),
      foliosExternos: form.foliosExternos,
      llevaBordado: bordadoFrisa,
    })
    if (createError) {
      setSubmitting(false)
      setSubmitError(createError)
      return
    }
    // Sin precio: no se registra anticipo.
    await terminarCreacion(data, 0)
  }

  // Lo que sigue a crear la orden, igual para todos los tipos: fotos,
  // documentos, anticipo y la vista previa del PDF.
  async function terminarCreacion(creada, anticipoMontoNum, fotoProductoError = null) {
    let data = creada
    // V176 — la orden ya existe: se crea su pedido o se agrega al elegido. Si
    // falla, la orden se queda suelta y se avisa (se puede agregar desde el detalle).
    let pedidoError = null
    if (agrupacion === 'nuevo') {
      const datos = datosParaGuardar({
        ...pedidoForm,
        cliente: form.clientName.trim() || data.client_name,
        clientId: form.clienteIncidental ? '' : form.clientId,
        esMostrador: ventaMostrador,
      })
      const { data: nuevoPedido, error: pErr } = await crearPedido(datos, [data.id])
      if (pErr) pedidoError = `La orden se creó, pero no se pudo crear el pedido: ${pErr.message}`
      else data = { ...data, pedido_id: nuevoPedido.id } // para el PDF de abajo
    } else if (agrupacion === 'existente' && pedidoExistente) {
      const { error: pErr } = await agregarOrdenAPedido(pedidoExistente.id, data.id)
      if (pErr) pedidoError = `La orden se creó, pero no se pudo agregar al pedido ${pedidoExistente.folio}: ${pErr.message}`
      else data = { ...data, pedido_id: pedidoExistente.id }
    }
    // La orden ya existe (tiene id): subimos las fotos elegidas a mano. Si
    // esto falla, no se cancela la creación de la orden — se puede
    // reintentar desde el detalle.
    let photoError = fotoProductoError

    // V145 — el equipo se guarda aparte (create_order no lo recibe). Si
    // falla, la orden ya existe: se avisa y se captura desde el detalle.
    let equipoError = null
    if (form.orderTypeKey === 'sublimacion' && form.equipo.trim()) {
      const { data: conEquipo, error: eqErr } = await setOrdenEquipo(data.id, form.equipo.trim())
      if (eqErr) equipoError = eqErr.message
      else data = { ...data, equipo: conEquipo.equipo }
    }

    if (photoFiles.length > 0) {
      const { data: conFotos, error: uploadError } = await uploadOrderPhotos(data.id, photoFiles)
      if (uploadError) photoError = uploadError.message
      // Para que el PDF de abajo ya traiga las fotos recién subidas.
      else if (conFotos?.reference_photos) data = { ...data, reference_photos: conFotos.reference_photos }
    }

    // V41 — mismo criterio que las fotos: cotización/orden de compra/
    // anticipo son opcionales y, si algo falla aquí, la orden YA se creó
    // — no se cancela nada, solo se avisa para reintentar desde el
    // detalle (OrderDocumentsCard/OrderPaymentsCard).
    // V58 — pueden ser varias de cada tipo. Se sube una por una y se juntan
    // los errores (los que sí se subieron quedan registrados).
    const documentErrors = []
    for (const [kind, label, files] of [
      ['cotizacion', 'Cotización', cotizacionFiles],
      ['orden_compra', 'Orden de compra', ordenCompraFiles],
    ]) {
      for (const file of files) {
        const { error: docError } = await uploadOrderDocument(data.id, kind, file)
        if (docError) documentErrors.push(`${label}: ${docError.message}`)
      }
    }
    const documentError = documentErrors.length > 0 ? documentErrors.join(' · ') : null

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
      // El anticipo (si hubo) ya se registró arriba: sale en el PDF.
      const pagos = canViewFinanzas(role) ? await fetchPagosParaPdf(data) : null
      const blob = await buildOrderConfirmationPdfBlob(data, { orderTypeLabel, history: initialHistory, pagos })
      pdfPreview = { blob, fileName: orderConfirmationPdfFileName(data, 'interno') }
    } catch (pdfErr) {
      console.error('No se pudo generar el PDF de confirmación:', pdfErr)
    }

    navigate(`/orden/${data.id}`, { state: { photoUploadError: photoError, documentError, anticipoError, equipoError, pedidoError, pdfPreview } })
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
  const deliverySaturated =
    deliveryLoad.orders > 0 &&
    (deliveryLoad.orders >= demand.orderThreshold || deliveryLoad.pieces >= demand.pieceThreshold)

  return (
    <div className="page page--narrow">
      <div className="new-order-header">
        <h2 className="section-title">Nueva orden</h2>
        <FileDropLabel
          className="btn btn--ghost btn--small"
          style={{ display: 'inline-flex' }}
          accept="image/*,application/pdf"
          disabled={ocrLoading}
          onFiles={handleOcrFiles}
        >
          {ocrLoading ? 'Leyendo…' : 'Prellenar con foto o PDF'}
        </FileDropLabel>
      </div>
      {ocrWarning && <p className="pantone-hint">{ocrWarning}</p>}
      {ocrError && <p className="form-error">{ocrError.message}</p>}

      {hasDraft && !draftDismissed && (
        <p className="pantone-hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Se recuperó un borrador sin terminar (las fotos y PDFs no se guardan).</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={discardDraft}>
            Empezar de cero
          </button>
        </p>
      )}

      <form className="order-form" onSubmit={handleSubmit}>
        {/* Fase 1A — primer paso: ¿toda la orden es venta de mostrador? */}
        <VentaMostradorToggle
          checked={ventaMostrador}
          onChange={(v) => updateField('ventaMostrador', v)}
          disabled={mostradorPorPedido}
          nota={
            mostradorPorPedido
              ? `El pedido ${pedidoExistente.folio} es de venta de mostrador: esta orden también.`
              : form.orderTypeKey && !llevaPrecio
                ? 'Este tipo de orden ya no lleva precio ni anticipo.'
                : enPedido && ventaMostrador && agrupacion === 'nuevo'
                  ? 'Todo el pedido será de mostrador: sin precio, anticipo ni factura.'
                  : null
          }
        />

        {/* V176 — ¿la orden va sola o en un pedido? */}
        {puedePedidos && (
          <div className="agrupacion">
            <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
              Pedido
            </span>
            <div className="seg" role="group" aria-label="Orden suelta o en un pedido">
              {AGRUPACIONES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={'seg__btn' + (agrupacion === a.key ? ' seg__btn--on' : '')}
                  aria-pressed={agrupacion === a.key}
                  onClick={() => updateField('agrupacion', a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {agrupacion === 'nuevo' && (
              <p className="pantone-hint" style={{ margin: '6px 0 0' }}>
                Se crea un pedido con esta orden. Su anticipo y su factura se capturan abajo, en "Pedido".
              </p>
            )}
            {agrupacion === 'existente' && (
              <div style={{ marginTop: 8 }}>
                {pedidosError && <p className="form-error">{pedidosError.message}</p>}
                <select
                  className="input"
                  value={form.pedidoExistenteId}
                  onChange={(e) => updateField('pedidoExistenteId', e.target.value)}
                  aria-label="Pedido existente"
                >
                  <option value="">Elige el pedido…</option>
                  {pedidosOrdenados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.folio} · {p.cliente} · {p.ordenes} {p.ordenes === 1 ? 'orden' : 'órdenes'}
                      {p.es_mostrador ? ' · mostrador' : ` · saldo ${formatMxn(p.saldo)}`}
                    </option>
                  ))}
                </select>
                {pedidosLista.length === 0 && !pedidosError && <p className="pantone-hint">Todavía no hay pedidos.</p>}
              </div>
            )}
          </div>
        )}

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Tipo de orden *
          </span>
          {/* 2026-11-09: las órdenes de Frisa ya no se crean aquí, solo desde Frisa → Restock. */}
          <OrderTypeSelect
            orderTypes={orderTypes.filter((t) => !esOrdenFrisa(t.key))}
            value={form.orderTypeKey}
            onChange={handleTypeChange}
            onTypeCreated={refresh}
          />
        </div>

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Cliente *
          </span>
          {esFrisa ? (
            <p className="pantone-hint" style={{ margin: 0 }}>
              <b>{CLIENTE_FRISA_NOMBRE}</b> — las órdenes de Frisa no usan el catálogo de clientes.
            </p>
          ) : (
          <ClienteSelect
            clientes={clientes}
            orderTypeKey={form.orderTypeKey}
            clientId={form.clientId}
            incidental={form.clienteIncidental}
            nombre={form.clientName}
            telefono={form.clientTelefono}
            correo={form.clientCorreo}
            onSelectCliente={handleSelectCliente}
            onSelectIncidental={handleSelectIncidental}
            onField={updateField}
            bloqueado={esVentaMostrador}
            soloCatalogo={esMaquila}
          />
          )}
        </div>

        {esFrisa && (
          <>
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Producto *
              </span>
              {productosFrisaError && <p className="form-error">{productosFrisaError.message}</p>}
              <div className="producto-picker__grid">
                {productosFrisa.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={'producto-card' + (p.id === form.productoFrisaId ? ' producto-card--activo' : '')}
                    aria-pressed={p.id === form.productoFrisaId}
                    onClick={() => setForm((f) => (f.productoFrisaId === p.id ? f : { ...f, productoFrisaId: p.id, cantidadesFrisa: {}, bordadoFrisa: false }))}
                  >
                    <span className="producto-card__nombre">{p.codigo}</span>
                    <span className="producto-card__prenda">{p.nombre}</span>
                    <span className="producto-card__prenda">{etiquetaSecuencia(p.procesos) || '⚠️ Sin procesos'}</span>
                  </button>
                ))}
              </div>
              {!productosFrisaError && productosFrisa.length === 0 && <p className="pantone-hint">No hay productos de Frisa activos. Agrégalos en Catálogos → Frisa.</p>}
            </div>
            {productoFrisa && (
              <>
                <p className="pantone-hint">
                  {[productoFrisa.origen === 'comprada' ? 'Comprada' : 'Confeccionada', productoFrisa.color, productoFrisa.tela, productoFrisa.proveedor].filter(Boolean).join(' · ')}
                  <br />
                  Procesos de esta orden: <b>{etiquetaSecuencia(procesosDeLaOrdenFrisa(productoFrisa, bordadoFrisa))}</b>
                </p>
                <div>
                  <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                    Cantidades por talla * {productoFrisa.tallas_rango && <span className="pantone-hint">({productoFrisa.tallas_rango})</span>}
                  </span>
                  <div className="frisa-tallas">
                    {(expandirTallas(productoFrisa.tallas_rango).length > 0 ? expandirTallas(productoFrisa.tallas_rango) : ['Unitalla']).map((t) => (
                      <label key={t}>
                        {t}
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          className="input"
                          placeholder="0"
                          value={form.cantidadesFrisa[t] ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, cantidadesFrisa: { ...f.cantidadesFrisa, [t]: e.target.value } }))}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="pantone-hint">
                    Total de piezas: <b>{Object.values(form.cantidadesFrisa).reduce((n, c) => n + (Number(c) || 0), 0)}</b>
                  </p>
                </div>
                {admiteBordadoPorOrden(productoFrisa) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.bordadoFrisa} onChange={(e) => updateField('bordadoFrisa', e.target.checked)} />
                    Lleva bordado (va antes de terminado)
                  </label>
                )}
              </>
            )}
          </>
        )}

        {form.orderTypeKey === 'sublimacion' && (
          <label>
            Equipo
            <input
              type="text"
              className="input"
              value={form.equipo}
              onChange={(e) => updateField('equipo', e.target.value)}
              placeholder="Opcional — nombre del equipo"
            />
          </label>
        )}

        {esMaquila && (
          <>
            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Producto *
              </span>
              {!form.clientId ? (
                <p className="pantone-hint">Primero elige el cliente.</p>
              ) : (
                // Tarjetas con la foto del catálogo (igual que en el catálogo del cliente).
                <div className="producto-picker__grid">
                  {productos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={'producto-card' + (p.id === form.productoId ? ' producto-card--activo' : '')}
                      aria-pressed={p.id === form.productoId}
                      onClick={() => updateField('productoId', p.id)}
                    >
                      {p.foto_url ? <Miniatura src={p.foto_url} alt="" loading="lazy" /> : <span className="producto-card__sin-foto">Sin foto</span>}
                      <span className="producto-card__nombre">{p.nombre}</span>
                      <span className="producto-card__prenda">{etiquetaProcesos(p.procesos) || '⚠️ Sin procesos'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.clientId && productos.length === 0 && (
              <p className="pantone-hint">Agrega sus productos en Catálogos → Clientes → "Ver catálogo de prendas".</p>
            )}
            {productoMaquila && (
              <p className="pantone-hint">
                {procesosDeLaOrden(productoMaquila, llevaBordadoMaquila).length > 0
                  ? `Procesos de esta orden: ${etiquetaProcesos(procesosDeLaOrden(productoMaquila, llevaBordadoMaquila))}`
                  : '⚠️ Este producto no tiene procesos marcados: márcalos en el catálogo del cliente.'}
              </p>
            )}

            <label>
              Número de corte *
              <input
                type="text"
                className="input"
                value={form.numeroCorte}
                onChange={(e) => updateField('numeroCorte', e.target.value)}
                placeholder="El número de corte del cliente"
              />
            </label>
          </>
        )}

        {CAPTURA_FECHA_CREACION_HABILITADA && (
          <label>
            Fecha de creación (orden anterior)
            <input
              type="date"
              className="input"
              value={form.createdAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => updateField('createdAt', e.target.value)}
            />
          </label>
        )}

        <label>
          Fecha de entrega *
          <input
            type="date"
            className="input"
            value={form.requestedDeliveryDate}
            onChange={(e) => updateField('requestedDeliveryDate', e.target.value)}
          />
        </label>
        {deliverySaturated && (
          <p className="pantone-hint" style={{ color: 'var(--color-orange-strong)' }}>
            ⚠ Fecha muy cargada: ya hay {deliveryLoad.orders} orden{deliveryLoad.orders === 1 ? '' : 'es'} y{' '}
            {deliveryLoad.pieces.toLocaleString('es-MX')} prenda{deliveryLoad.pieces === 1 ? '' : 's'} esos días.
          </p>
        )}

        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Folios del control anterior
          </span>
          <FoliosExternosField value={form.foliosExternos} onChange={(v) => updateField('foliosExternos', v)} />
        </div>

        {!esFrisa && (
        <div>
          <span className="field-label" style={{ marginBottom: 8, display: 'block' }}>
            {esMaquila ? 'Cantidades' : 'Prendas'}
          </span>
          {esMaquila ? (
            <MaquilaItemsEditor items={items} onChange={setItems} bordadoObligado={productoBorda(productoMaquila)} />
          ) : (
            <OrderItemsEditor
              items={items}
              onChange={setItems}
              orderTypeKey={form.orderTypeKey}
              telas={telas}
              onTelaCreated={refreshTelas}
              clienteId={form.clienteIncidental ? '' : form.clientId}
              clienteNombre={form.clientName}
              productos={productos}
              onProductoCreated={refreshProductos}
            />
          )}
        </div>
        )}

        <details className="form-optional">
          <summary>Notas y fotos (opcional)</summary>
          <div className="form-optional__body">
            <label>
              Notas de la orden
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </label>

            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Fotos de referencia
              </span>
              <PhotoPicker files={photoFiles} onChange={setPhotoFiles} />
            </div>
          </div>
        </details>

        {/* V159 — Precios y pago: visible (no plegable). Fase 1B: precio por prenda
            ("Mismo precio" / "Precios por talla"); debajo total, anticipo y saldo.
            Fase 1A: con venta de mostrador no se muestra. */}
        {cobra && (
          <div className="precios-alta">
            <span className="field-label" style={{ marginBottom: 8, display: 'block' }}>
              Precios y pago
            </span>
            {!precioObligatorio && (
              <p className="pantone-hint" style={{ marginTop: 0 }}>
                El precio es opcional por ahora: puedes crear la orden sin precio y capturarlo después en el detalle.
              </p>
            )}
            <PreciosPrendaEditor
              prendas={prendasPrecio}
              estados={estadosPrecio}
              onChange={cambiarPrecioPrenda}
              marcarFaltantes={precioObligatorio}
            />
            <ResumenPagoAlta
              resumen={resumen}
              anticipo={{ monto: anticipoMonto, metodo: anticipoMetodo, recibidoPor: anticipoRecibidoPor, notas: anticipoNotas }}
              onAnticipo={cambiarAnticipo}
              obligatorio={precioObligatorio}
              sinAnticipo={enPedido}
            />
          </div>
        )}

        {agrupacion === 'nuevo' && (
          <div className="precios-alta">
            <span className="field-label" style={{ marginBottom: 8, display: 'block' }}>
              Pedido nuevo · {form.clientName.trim() || 'cliente de la orden'}
            </span>
            <PedidoDatosForm
              value={{ ...pedidoForm, esMostrador: ventaMostrador }}
              onChange={(v) => setPedidoForm({ ...v, esMostrador: false })}
              conCliente={false}
              conMostrador={false}
            />
            {ventaMostrador && (
              <p className="pantone-hint" style={{ margin: 0 }}>
                Venta de mostrador: el pedido no lleva anticipo ni factura.
              </p>
            )}
          </div>
        )}

        <details className="form-optional">
          <summary>Cotización y orden de compra (opcional)</summary>
          <div className="form-optional__body">
            <div className="form-row">
              <DocumentosPicker label="Cotización (PDF o foto)" files={cotizacionFiles} onChange={setCotizacionFiles} />
              <DocumentosPicker label="Orden de compra (PDF o foto)" files={ordenCompraFiles} onChange={setOrdenCompraFiles} />
            </div>
          </div>
        </details>

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
