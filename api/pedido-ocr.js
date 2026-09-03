import Anthropic from '@anthropic-ai/sdk'
import { verifyUser } from './_chat/auth.js'

// POST /api/pedido-ocr — lee la foto de una nota/remisión de proveedor y
// regresa artículos/cantidades/tallas sugeridos para PRELLENAR el
// formulario de "Nuevo pedido a proveedor" (nunca guarda nada en la base
// — eso lo sigue haciendo create_pedido_tienda cuando el usuario confirma
// el pedido, después de revisar/corregir lo que se leyó). Igual que
// /api/chat: requiere sesión de Supabase (cuesta dinero real por
// llamada), la API key de Anthropic vive solo aquí (variable de entorno
// del servidor), nunca en el frontend.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// Límite generoso pero por debajo del tope de payload de las funciones
// serverless de Vercel (~4.5MB) — el frontend ya limita el archivo
// original a 3MB antes de codificarlo en base64 (ver
// pedidoOcrService.js, MAX_OCR_PHOTO_SIZE_MB), esto es un segundo
// resguardo del lado del servidor.
const MAX_IMAGE_BASE64_CHARS = 4_500_000

// Se fuerza una sola tool (en vez de pedirle a Claude que "conteste solo
// con JSON" en texto libre) para que la respuesta salga siempre
// estructurada y válida — nada de parsear texto ni de que se le cuele
// una explicación antes/después del JSON.
const EXTRACT_TOOL = {
  name: 'registrar_articulos',
  description:
    'Registra los artículos, cantidades y tallas que se alcanzan a leer con certeza en la foto de la nota o remisión de un proveedor.',
  input_schema: {
    type: 'object',
    properties: {
      articulos: {
        type: 'array',
        description: 'Un elemento por cada artículo distinto que se logre leer. Si no se lee nada con certeza, regresa un arreglo vacío — nunca inventes un artículo.',
        items: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'Nombre del artículo tal como aparece en la nota.' },
            cantidad: { type: 'number', description: 'Cantidad pedida de ese artículo.' },
            talla: {
              type: 'string',
              description: 'Talla si el artículo la trae (ej. "M", "9", "CH"). Cadena vacía si no aplica o no se alcanza a leer.',
            },
          },
          required: ['nombre', 'cantidad'],
        },
      },
    },
    required: ['articulos'],
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' })
    return
  }

  const user = await verifyUser(req.headers.authorization)
  if (!user) {
    res.status(401).json({ error: 'Inicia sesión para usar el reconocimiento de fotos.' })
    return
  }

  const { imageBase64, mediaType } = req.body || {}

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    res.status(400).json({ error: 'Falta la imagen.' })
    return
  }
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    res.status(400).json({ error: 'Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF.' })
    return
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    res.status(400).json({ error: 'La foto pesa demasiado. Intenta con una más ligera.' })
    return
  }

  // La extracción de una foto manuscrita o de mala calidad nunca va a
  // ser perfecta — cualquier tropiezo aquí (API caída, respuesta sin la
  // tool, etc.) regresa 200 con articulos:[] + warning en vez de un
  // error duro, para que el formulario de creación NUNCA se bloquee: el
  // usuario simplemente llena los campos a mano.
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'registrar_articulos' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            {
              type: 'text',
              text: 'Esta es la foto de una nota o remisión de un pedido a un proveedor. Usa la herramienta disponible para registrar los artículos, cantidades y tallas que se alcancen a leer con certeza. No inventes ni adivines datos que no se vean con claridad — omite ese artículo en vez de inventarlo.',
            },
          ],
        },
      ],
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'registrar_articulos')
    const articulosRaw = Array.isArray(toolUse?.input?.articulos) ? toolUse.input.articulos : []

    const articulos = articulosRaw
      .filter((a) => a && typeof a.nombre === 'string' && a.nombre.trim() && Number(a.cantidad) > 0)
      .map((a) => ({
        nombre: a.nombre.trim(),
        cantidad: Math.round(Number(a.cantidad)),
        talla: typeof a.talla === 'string' && a.talla.trim() ? a.talla.trim() : null,
      }))

    if (articulos.length === 0) {
      res.status(200).json({
        articulos: [],
        warning: 'No se reconoció ningún artículo en la foto — llena los campos a mano.',
      })
      return
    }

    res.status(200).json({ articulos })
  } catch (err) {
    console.error('[api/pedido-ocr] error:', err)
    res.status(200).json({
      articulos: [],
      warning: 'No se pudo leer la foto automáticamente — llena los campos a mano.',
    })
  }
}
