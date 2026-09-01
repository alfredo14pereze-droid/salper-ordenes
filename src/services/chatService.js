import { supabase } from '../lib/supabaseClient'

// Habla con /api/chat (el endpoint serverless — ver api/chat.js). Manda
// el token de la sesión actual de Supabase; el backend lo valida y
// corre el ciclo de tool use contra Anthropic. No hay lógica de negocio
// aquí, solo la llamada HTTP — el módulo de chat vive aparte del resto
// de los services de órdenes.
export async function sendChatMessage(message, history) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase no está configurado.') }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { data: null, error: new Error('Inicia sesión para usar el chat.') }
  }

  let res
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message, history }),
    })
  } catch (err) {
    return { data: null, error: new Error('No se pudo conectar con el chat. Revisa tu conexión.') }
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'No se pudo enviar el mensaje.') }
  }

  return { data: body.reply, error: null }
}
