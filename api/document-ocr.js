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
      articulos: ARTICULOS_SCHEMA,
    },
    required: ['articulos'],
  },
}

const PROMPTS = {
  pedido_proveedor:
    'Este es un pedido a un proveedor (foto o PDF de la nota/remisión). Usa la herramienta disponible para registrar los artículos, cantidades y tallas que se alcancen a leer con certeza. No inventes ni adivines datos que no se vean con claridad — omite ese artículo en vez de inventarlo.',
  orden:
    'Este es un documento (foto o PDF) con información de una orden de producción para un taller de uniformes/sublimación. Usa la herramienta disponible para registrar el cliente y la fecha de entrega SOLO si aparecen explícitos y sin ambigüedad, más las prendas con cantidad y talla que se alcancen a leer con certeza. No inventes ni adivines nada que no se vea con claridad — deja cliente/fecha_entrega vacíos y omite cualquier prenda que no puedas leer bien.',
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
  const mode = context === 'orden' ? 'orden' : 'pedido_proveedor'

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

  const tool = mode === 'orden' ? ORDEN_TOOL : PEDIDO_TOOL

  // La extracción de una nota manuscrita, un PDF escaneado o de mala
  // calidad nunca va a ser perfecta — cualquier tropiezo aquí (API
  // caída, respuesta sin la tool, etc.) regresa 200 con datos vacíos +
  // warning en vez de un error duro, para que el formulario de creación
  // NUNCA se bloquee: el usuario simplemente llena los campos a mano.
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
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
    const articulosRaw = Array.isArray(raw.articulos) ? raw.articulos : []

    const articulos = articulosRaw
      .filter((a) => a && typeof a.nombre === 'string' && a.nombre.trim() && Number(a.cantidad) > 0)
      .map((a) => ({
        nombre: a.nombre.trim(),
        cantidad: Math.round(Number(a.cantidad)),
        talla: typeof a.talla === 'string' && a.talla.trim() ? a.talla.trim() : null,
      }))

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
    if (mode === 'orden') {
      fallback.cliente = null
      fallback.fechaEntrega = null
    }
    res.status(200).json(fallback)
  }
}
