import { supabase } from '../lib/supabaseClient'

// Habla con /api/document-ocr (ver ese archivo) — le manda una foto o un
// PDF y regresa datos para PRELLENAR un formulario, nunca para guardar
// directo. Endpoint genérico compartido por dos flujos (`context`):
// 'pedido_proveedor' (NewPedidoTiendaPage) y 'orden' (NewOrderPage).
// Mismo patrón que chatService.js: token de la sesión actual, la API key
// de Anthropic nunca sale del servidor.
export const MAX_OCR_FILE_SIZE_MB = 3
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const commaIndex = result.indexOf(',')
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1))
    }
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

// `context`: 'pedido_proveedor' | 'orden' — decide qué tool/prompt usa
// el endpoint y qué trae la respuesta:
//   - 'pedido_proveedor' -> { articulos: [{nombre, cantidad, talla}], warning? }
//   - 'orden'            -> { articulos: [...], cliente, fechaEntrega, warning? }
//     (`cliente`/`fechaEntrega` vienen en null si el documento no los
//     indica con claridad — nunca inventados).
// `warning` (sin `error`) significa "la llamada funcionó pero no se pudo
// leer nada útil del archivo" — no bloquea el flujo, el formulario se
// sigue llenando a mano.
export async function recognizeDocument(file, context) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase no está configurado.') }
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { data: null, error: new Error(`"${file.name}" no es una imagen ni un PDF.`) }
  }
  if (file.size > MAX_OCR_FILE_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`El archivo pesa más de ${MAX_OCR_FILE_SIZE_MB}MB — intenta con uno más ligero.`) }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return { data: null, error: new Error('Inicia sesión para usar el reconocimiento automático.') }
  }

  const fileBase64 = await fileToBase64(file)

  let res
  try {
    res = await fetch('/api/document-ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ fileBase64, mediaType: file.type, context }),
    })
  } catch (err) {
    return { data: null, error: new Error('No se pudo conectar para leer el archivo. Revisa tu conexión.') }
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'No se pudo leer el archivo.') }
  }

  return { data: body, error: null }
}
