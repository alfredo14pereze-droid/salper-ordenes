import { verifyUser } from './_chat/auth.js'
import { runChat } from './_chat/anthropic.js'

// POST /api/chat — único endpoint del módulo de chat. Recibe el mensaje
// nuevo + el historial de la sesión (texto plano), valida que quien
// llama tiene sesión de Supabase (el chat cuesta dinero real por
// mensaje, así que a diferencia del resto de la app pública, esto SÍ
// requiere login — cualquier rol), corre el ciclo de tool use contra
// Anthropic y regresa solo el texto final. La API key de Anthropic vive
// únicamente aquí (variable de entorno del servidor), nunca en el
// frontend.
const MAX_HISTORY = 20
const MAX_MESSAGE_LENGTH = 2000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' })
    return
  }

  const user = await verifyUser(req.headers.authorization)
  if (!user) {
    res.status(401).json({ error: 'Inicia sesión para usar el chat.' })
    return
  }

  const { message, history } = req.body || {}

  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Falta el mensaje.' })
    return
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres).` })
    return
  }

  const safeHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY)
    : []

  try {
    const reply = await runChat({ message: message.trim(), history: safeHistory })
    res.status(200).json({ reply })
  } catch (err) {
    console.error('[api/chat] error:', err)
    res.status(500).json({ error: 'No se pudo procesar tu mensaje. Intenta de nuevo en un momento.' })
  }
}
