import { createClient } from '@supabase/supabase-js'

// Rate limiting del chat (auditoría de seguridad V28) — cada mensaje
// cuesta dinero real en la API de Anthropic, así que una cuenta
// comprometida o un loop de cliente descontrolado no debe poder mandar
// mensajes sin límite. Política: máximo MAX_MESSAGES mensajes por
// usuario en WINDOW_MINUTES minutos.
//
// Usa el propio token de quien llama (no la service role key) — así RLS
// (ver schema_v28_security_hardening.sql) garantiza que cada quien solo
// puede ver/insertar sus propias filas, igual que el resto del sistema.
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const MAX_MESSAGES = 15
const WINDOW_MINUTES = 5

export async function checkRateLimit(authHeader, userId) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count, error: countError } = await supabase
    .from('chat_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)

  if (countError) {
    // Si falla el chequeo (ej. la tabla no existe todavía en algún
    // ambiente), no bloqueamos el chat por eso — solo lo dejamos pasar
    // sin registrar. Mejor un chat sin límite temporal que un chat roto.
    console.error('[chat rate limit] error al contar:', countError.message)
    return { allowed: true }
  }

  if ((count || 0) >= MAX_MESSAGES) {
    return { allowed: false, retryAfterMinutes: WINDOW_MINUTES }
  }

  const { error: insertError } = await supabase.from('chat_rate_limit').insert({ user_id: userId })
  if (insertError) {
    console.error('[chat rate limit] error al registrar:', insertError.message)
  }

  return { allowed: true }
}
