import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

// Verifica que quien llama al endpoint del chat de verdad tiene una
// sesión válida de Supabase — el chat cuesta dinero real (API de
// Anthropic) por mensaje, así que a diferencia del resto de la app
// (pública, de solo lectura), esto se restringe a usuarios con sesión
// (cualquier rol: tienda/fábrica/admin). No usamos la service role key
// aquí: le pasamos el token del que llama y dejamos que Supabase lo
// valide, igual que lo haría el propio navegador.
export async function verifyUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return null

  return data.user
}
