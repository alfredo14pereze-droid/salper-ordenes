import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase para usar del lado del servidor (dentro de las
// tools del chat). Usa la anon key a propósito, no la service role key:
// las tools solo hacen lecturas, y esas tablas ya son de lectura pública
// (ver supabase/schema_v10_guest_read.sql) — no hace falta el privilegio
// de la service role para esto, y usar la key con menos poder posible es
// más seguro. Reutiliza las mismas variables de entorno que ya existen
// para el frontend (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY): Vercel
// las expone igual dentro de las funciones serverless, aunque el prefijo
// "VITE_" solo importa para lo que Vite mete al bundle del navegador.
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[chat] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en las variables de entorno del servidor.')
}

export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey)
