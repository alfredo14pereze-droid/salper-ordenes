import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase para usar del lado del servidor (dentro de las
// tools del chat). Usa la anon key a propósito, no la service role key,
// MÁS la sesión de quien pregunta: desde V29 la base ya no deja leer nada
// sin sesión (antes las tools leían como invitado y por eso el asistente
// contestaba "permission denied for table orders"). Así cada consulta corre
// con los permisos de esa persona, igual que en la app. Reutiliza las mismas variables de entorno que ya existen
// para el frontend (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY): Vercel
// las expone igual dentro de las funciones serverless, aunque el prefijo
// "VITE_" solo importa para lo que Vite mete al bundle del navegador.
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[chat] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en las variables de entorno del servidor.')
}

export function supabaseDeUsuario(authHeader) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
