import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[SALPER] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y llena los valores de tu proyecto de Supabase.'
  )
}

// Si faltan las variables de entorno, exportamos null en vez de tronar:
// la UI (ver App.jsx) detecta esto y muestra una pantalla de configuración
// en vez de una pantalla en blanco con un error críptico en consola.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null
