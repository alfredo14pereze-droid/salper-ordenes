import { supabase } from '../lib/supabaseClient'
import { slugify } from '../utils/slug'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchOrderTypes() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('order_types').select('*').eq('active', true).order('sort_order', { ascending: true })
}

// Crea un tipo de orden nuevo "al vuelo" desde el formulario de Nueva Orden.
// La key se deriva del label (ej. "Bordado industrial" -> "bordado_industrial").
export async function createOrderType(label) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const key = slugify(label)
  if (!key) {
    return { data: null, error: new Error('El nombre del tipo de orden no es válido.') }
  }

  return supabase
    .rpc('create_order_type', { p_key: key, p_label: label })
    .single()
}
