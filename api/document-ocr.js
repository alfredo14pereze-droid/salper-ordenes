import Anthropic from '@anthropic-ai/sdk'
import { verifyUser } from './_chat/auth.js'

// POST /api/document-ocr — lee una foto O un PDF y regresa datos
// sugeridos para PRELLENAR un formulario (nunca guarda nada en la base
// directamente — eso lo sigue haciendo el flujo normal de crear la
// orden/el pedido, después de que el usuario revisa/corrige lo que se
// leyó). Endpoint genérico, compartido por dos flujos distintos
// (`context` en el body decide cuál):
//   - 'pedido_proveedor': nota/remisión de un pedido a proveedor — ver
//     NewPedidoTiendaPage.jsx. Nació primero, aquí sigue igual.
//   - 'orden': documento con la info de una orden de producción — ver
//     NewOrderPage.jsx. Además de artículos/cantidades/tallas, intenta
//     leer cliente y fecha de entrega SOLO si aparecen con claridad.
// Cada contexto tiene su propia tool (mismo patrón: se fuerza una sola
// tool en vez de pedirle a Claude que conteste con JSON en texto libre,
// así la respuesta sale siempre estructurada). Igual que /api/chat:
// requiere sesión de Supabase (cuesta dinero real por llamada), la API
// key de Anthropic vive solo aquí (variable de entorno del servidor),
// nunca en el frontend.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PDF_MEDIA_TYPE = 'application/pdf'
const ALLOWED_MEDIA_TYPES = [...IMAGE_MEDIA_TYPES, PDF_MEDIA_TYPE]
// Límite generoso pero por debajo del tope de payload de las funciones
// serverless de Vercel (~4.5MB) — el frontend ya limita el archivo
// original a 3MB antes de codificarlo en base64 (ver
// documentOcrService.js, MAX_OCR_FILE_SIZE_MB), esto es un segundo
// resguardo del lado del servidor.
const MAX_FILE_BASE64_CHARS = 4_500_000

const ARTICULOS_SCHEMA = {
  type: 'array',
  description:
    'Un elemento por cada artículo/prenda distinto que se logre leer. Si no se lee nada con certeza, regresa un arreglo vacío — nunca inventes uno.',
  items: {
    type: 'object',
    properties: {
      nombre: { type: 'string', description: 'Nombre del artículo o prenda tal como aparece en el documento.' },
      cantidad: { type: 'number', description: 'Cantidad pedida de ese artículo.' },
      talla: {
        type: 'string',
        description: 'Talla si el artículo la trae (ej. "M", "9", "CH"). Cadena vacía si no aplica o no se alcanza a leer.',
      },
    },
    required: ['nombre', 'cantidad'],
  },
}

const PEDIDO_TOOL = {
  name: 'registrar_articulos',
  description:
    'Registra los artículos, cantidades y tallas que se alcanzan a leer con certeza en la nota o remisión de un proveedor.',
  input_schema: {
    type: 'object',
    properties: { articulos: ARTICULOS_SCHEMA },
    required: ['articulos'],
  },
}

// Para una orden, un documento real casi siempre trae la MISMA prenda en
// varios renglones — uno por talla (ej. "Playera M x10" y "Playera L
// x5") — y el frontend agrupa esos renglones en una sola prenda por
// nombre exacto (ver agruparArticulosPorPrenda en NewOrderPage.jsx). Para
// que ese agrupado funcione, el nombre tiene que salir IDÉNTICO entre
// renglones de la misma prenda — por eso esta variante de la tool trae
// una instrucción explícita que ARTICULOS_SCHEMA (pedido a proveedor) no
// necesita.
const ARTICULOS_SCHEMA_ORDEN = {
  ...ARTICULOS_SCHEMA,
  items: {
    ...ARTICULOS_SCHEMA.items,
    properties: {
      ...ARTICULOS_SCHEMA.items.properties,
      nombre: {
        type: 'string',
        description:
          'Nombre de la prenda tal como aparece en el documento (ej. "Playera polo"). IMPORTANTE: si la misma prenda aparece varias veces con distinta talla (ej. "Playera polo" en M y en L), usa EXACTAMENTE el mismo texto de nombre en cada renglón — no le agregues la talla ni ningún otro dato variable al nombre, para que se puedan agrupar como una sola prenda con varias tallas.',
      },
    },
  },
}

const ORDEN_TOOL = {
  name: 'registrar_orden',
  description:
    'Registra los datos de una orden de producción que se alcancen a leer con certeza: cliente y fecha de entrega SOLO si aparecen explícitos y sin ambigüedad, más las prendas con cantidad y talla.',
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'string',
        description: 'Nombre del cliente, SOLO si aparece con claridad en el documento. Cadena vacía si no se indica o no es clara.',
      },
      fecha_entrega: {
        type: 'string',
        description:
          'Fecha de entrega solicitada, en formato YYYY-MM-DD, SOLO si aparece explícita y sin ambigüedad en el documento. Cadena vacía si no se indica o no es clara — nunca calcules ni asumas una fecha.',
      },
      articulos: ARTICULOS_SCHEMA_ORDEN,
    },
    required: ['articulos'],
  },
}

// V181 — orden de compra de Frisa (PDF por correo). Una OC es de una sola
// planta y trae fecha límite; cada renglón es un material con su talla.
const FRISA_OC_TOOL = {
  name: 'registrar_oc_frisa',
  description:
    'Registra los datos de una orden de compra de Frisa que se alcancen a leer con certeza: número de la orden, planta, fechas y los renglones con descripción, talla y cantidad.',
  input_schema: {
    type: 'object',
    properties: {
      numero: { type: 'string', description: 'Número de la orden de compra (pedido), p. ej. "4500659851". Cadena vacía si no se lee.' },
      planta: { type: 'string', description: 'Planta, sociedad o lugar de entrega de Frisa tal como aparece (p. ej. "FRISA ACERIA"). Cadena vacía si no se lee.' },
      fecha_oc: { type: 'string', description: 'Fecha del documento en YYYY-MM-DD, solo si es explícita. Cadena vacía si no.' },
      fecha_limite: { type: 'string', description: 'Fecha de entrega / fecha límite en YYYY-MM-DD, solo si es explícita. Si cada renglón trae su fecha, la más temprana. Cadena vacía si no.' },
      articulos: {
        type: 'array',
        description: 'Un elemento por renglón de la orden. Nunca inventes renglones.',
        items: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'Descripción del material SIN la talla (quita "T-M", "TALLA 32", etc.). Misma prenda en varias tallas = mismo texto exacto.' },
            talla: { type: 'string', description: 'Talla del renglón (p. ej. "M", "2XL", "32"). Cadena vacía si no trae.' },
            cantidad: { type: 'number', description: 'Cantidad pedida.' },
            codigo: { type: 'string', description: 'Código o número de material de Frisa si aparece. Cadena vacía si no.' },
          },
          required: ['nombre', 'cantidad'],
        },
      },
    },
    required: ['articulos'],
  },
}

// V191 — hoja de operaciones impresa desde la página (Cotizador). Cada
// renglón trae folio, operación y tiempo en segundos, agrupados por parte.
// El folio es lo que importa: con él se liga al catálogo.
const HOJA_OPERACIONES_TOOL = {
  name: 'registrar_hoja_operaciones',
  description:
    'Registra el título de la hoja de operaciones y cada renglón de la tabla con su folio, parte, operación y tiempo en segundos, tal como se leen.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Título grande de la hoja (p. ej. "BULSA DICKIES"). Cadena vacía si no se lee.' },
      operaciones: {
        type: 'array',
        description: 'Un elemento por renglón de operación, de TODAS las páginas, en el orden en que aparecen. No incluyas los renglones de encabezado de parte. Nunca inventes renglones.',
        items: {
          type: 'object',
          properties: {
            folio: { type: 'integer', description: 'Número de folio de la operación (columna "Folio"). Si no se lee con certeza, usa -1.' },
            parte: { type: 'string', description: 'Parte a la que pertenece (el encabezado gris de arriba, p. ej. "PUÑO", "ENSAMBLE"). Cadena vacía si no hay.' },
            operacion: { type: 'string', description: 'Descripción de la operación tal como aparece.' },
            segundos: { type: 'number', description: 'Tiempo en segundos (columna "Tiempo (seg)"). Usa -1 si no se lee.' },
          },
          required: ['folio', 'operacion'],
        },
      },
    },
    required: ['operaciones'],
  },
}

const PROMPTS = {
  hoja_operaciones:
    'Esta es una hoja de operaciones de costura de una fábrica de uniformes (foto o PDF, puede tener varias páginas). Tiene un título, y una tabla con columnas Folio, Operación y Tiempo (seg), agrupada por partes (renglones grises como "PUÑO" o "ENSAMBLE"). Usa la herramienta para registrar el título y CADA renglón de operación de todas las páginas con su folio, parte, operación y segundos. Copia los números exactamente; si uno no se lee con certeza, pon -1 en vez de adivinar.',
  pedido_proveedor:
    'Este es un pedido a un proveedor (foto o PDF de la nota/remisión). Usa la herramienta disponible para registrar los artículos, cantidades y tallas que se alcancen a leer con certeza. No inventes ni adivines datos que no se vean con claridad — omite ese artículo en vez de inventarlo.',
  frisa_oc:
    'Esta es una orden de compra (PDF) que el cliente Frisa le manda a SALPER, fabricante de uniformes. Usa la herramienta para registrar el número de la orden, la planta de Frisa, la fecha del documento, la fecha de entrega y cada renglón con su descripción (sin la talla), talla y cantidad. No inventes ni adivines nada que no se vea con claridad: deja vacío lo que no se lea.',
  orden:
    'Este es un documento (foto o PDF) con información de una orden de producción para un taller de uniformes/sublimación. Usa la herramienta disponible para registrar el cliente y la fecha de entrega SOLO si aparecen explícitos y sin ambigüedad, más las prendas con cantidad y talla que se alcancen a leer con certeza. Si la misma prenda aparece en varias tallas (renglones separados para M, L, etc.), regístrala como un artículo por cada talla pero con el nombre IDÉNTICO en todos — no repitas la talla dentro del nombre, va en su propio campo. No inventes ni adivines nada que no se vea con claridad — deja cliente/fecha_entrega vacíos y omite cualquier prenda que no puedas leer bien.',
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(d.getTime())
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' })
    return
  }

  const user = await verifyUser(req.headers.authorization)
  if (!user) {
    res.status(401).json({ error: 'Inicia sesión para usar el reconocimiento automático.' })
    return
  }

  const { fileBase64, mediaType, context } = req.body || {}
  const mode = ['orden', 'frisa_oc', 'hoja_operaciones'].includes(context) ? context : 'pedido_proveedor'

  if (typeof fileBase64 !== 'string' || !fileBase64) {
    res.status(400).json({ error: 'Falta el archivo.' })
    return
  }
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: 'Formato no soportado. Usa JPG, PNG, WEBP, GIF o PDF.' })
    return
  }
  if (fileBase64.length > MAX_FILE_BASE64_CHARS) {
    res.status(400).json({ error: 'El archivo pesa demasiado. Intenta con uno más ligero.' })
    return
  }

  // Un PDF se manda como bloque "document"; una foto, como bloque
  // "image" — es la única diferencia real entre los dos tipos de
  // archivo, el resto del prompt/tool es idéntico.
  const fileContentBlock =
    mediaType === PDF_MEDIA_TYPE
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }

  const tool = { orden: ORDEN_TOOL, frisa_oc: FRISA_OC_TOOL, hoja_operaciones: HOJA_OPERACIONES_TOOL }[mode] || PEDIDO_TOOL

  // La extracción de una nota manuscrita, un PDF escaneado o de mala
  // calidad nunca va a ser perfecta — cualquier tropiezo aquí (API
  // caída, respuesta sin la tool, etc.) regresa 200 con datos vacíos +
  // warning en vez de un error duro, para que el formulario de creación
  // NUNCA se bloquee: el usuario simplemente llena los campos a mano.
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: mode === 'frisa_oc' || mode === 'hoja_operaciones' ? 8192 : MAX_TOKENS, // muchos renglones
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [
        {
          role: 'user',
          content: [fileContentBlock, { type: 'text', text: PROMPTS[mode] }],
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === tool.name)
    const raw = toolUse?.input || {}

    if (mode === 'hoja_operaciones') {
      const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
      const ops = (Array.isArray(raw.operaciones) ? raw.operaciones : [])
        .filter((o) => o && (texto(o.operacion) || Number.isInteger(Number(o.folio))))
        .map((o) => {
          const folio = Number(o.folio)
          const seg = Number(o.segundos)
          return {
            folio: Number.isInteger(folio) && folio >= 0 ? folio : null,
            parte: texto(o.parte),
            operacion: texto(o.operacion) || '',
            segundos: Number.isFinite(seg) && seg > 0 ? seg : null,
          }
        })
      const out = { titulo: texto(raw.titulo), operaciones: ops }
      if (!ops.length) out.warning = 'No se reconocieron operaciones en la hoja — agrégalas a mano por folio.'
      res.status(200).json(out)
      return
    }
    const articulosRaw = Array.isArray(raw.articulos) ? raw.articulos : []

    const articulos = articulosRaw
      .filter((a) => a && typeof a.nombre === 'string' && a.nombre.trim() && Number(a.cantidad) > 0)
      .map((a) => ({
        nombre: a.nombre.trim(),
        cantidad: Math.round(Number(a.cantidad)),
        talla: typeof a.talla === 'string' && a.talla.trim() ? a.talla.trim() : null,
      }))

    if (mode === 'frisa_oc') {
      const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
      const lineas = articulosRaw
        .filter((a) => a && typeof a.nombre === 'string' && a.nombre.trim() && Number(a.cantidad) > 0)
        .map((a) => ({ nombre: a.nombre.trim(), talla: texto(a.talla), cantidad: Math.round(Number(a.cantidad)), codigo: texto(a.codigo) }))
      const out = {
        numero: texto(raw.numero),
        planta: texto(raw.planta),
        fechaOc: isValidIsoDate(raw.fecha_oc) ? raw.fecha_oc : null,
        fechaLimite: isValidIsoDate(raw.fecha_limite) ? raw.fecha_limite : null,
        articulos: lineas,
      }
      if (!lineas.length && !out.numero) out.warning = 'No se reconoció la orden de compra — llena los campos a mano.'
      res.status(200).json(out)
      return
    }

    if (mode === 'orden') {
      const cliente = typeof raw.cliente === 'string' && raw.cliente.trim() ? raw.cliente.trim() : null
      const fechaEntrega = isValidIsoDate(raw.fecha_entrega) ? raw.fecha_entrega : null

      if (articulos.length === 0 && !cliente && !fechaEntrega) {
        res.status(200).json({
          articulos: [],
          cliente: null,
          fechaEntrega: null,
          warning: 'No se reconoció información en el archivo — llena los campos a mano.',
        })
        return
      }

      res.status(200).json({ articulos, cliente, fechaEntrega })
      return
    }

    if (articulos.length === 0) {
      res.status(200).json({
        articulos: [],
        warning: 'No se reconoció ningún artículo en el archivo — llena los campos a mano.',
      })
      return
    }

    res.status(200).json({ articulos })
  } catch (err) {
    console.error('[api/document-ocr] error:', err)
    const fallback = { articulos: [], warning: 'No se pudo leer el archivo automáticamente — llena los campos a mano.' }
    if (mode === 'frisa_oc') Object.assign(fallback, { numero: null, planta: null, fechaOc: null, fechaLimite: null })
    if (mode === 'hoja_operaciones') Object.assign(fallback, { titulo: null, operaciones: [] })
    if (mode === 'orden') {
      fallback.cliente = null
      fallback.fechaEntrega = null
    }
    res.status(200).json(fallback)
  }
}
