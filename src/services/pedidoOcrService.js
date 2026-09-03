import { supabase } from '../lib/supabaseClient'

// Habla con /api/pedido-ocr (ver ese archivo) — le manda la foto de la
// nota/remisión del proveedor y regresa artículos/cantidades/tallas para
// PRELLENAR el formulario, nunca para guardar directo. Mismo patrón que
// chatService.js: token de la sesión actual, la API key de Anthropic
// nunca sale del servidor.
export const MAX_OCR_PHOTO_SIZE_MB = 3

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

// Regresa { data: { articulos: [{nombre, cantidad, talla}], warning? }, error }.
// `warning` (sin `error`) significa "la llamada funcionó pero no se pudo
// leer nada útil de la foto" — no bloquea el flujo, el formulario se
// sigue llenando a mano.
export async function recognizePedidoPhoto(file) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase no está configurado.') }
  }
  if (!file.type.startsWith('image/')) {
    return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  }
  if (file.size > MAX_OCR_PHOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`La foto pesa más de ${MAX_OCR_PHOTO_SIZE_MB}MB — intenta con una más ligera.`) }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return { data: null, error: new Error('Inicia sesión para usar el reconocimiento de fotos.') }
  }

  const imageBase64 = await fileToBase64(file)

  let res
  try {
    res = await fetch('/api/pedido-ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ imageBase64, mediaType: file.type }),
    })
  } catch (err) {
    return { data: null, error: new Error('No se pudo conectar para leer la foto. Revisa tu conexión.') }
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'No se pudo leer la foto.') }
  }

  return { data: body, error: null }
}
