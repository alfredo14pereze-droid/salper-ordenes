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

// V136 — todos los tipos (también los desactivados), para administrarlos
// en Catálogos → Tipos de orden.
export async function fetchAllOrderTypes() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('order_types').select('*').order('sort_order', { ascending: true })
}

// Plantilla de etapas de cada tipo (plantillas_etapas): las etapas que
// create_order le genera a una orden nueva de ese tipo.
export async function fetchPlantillasEtapas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('plantillas_etapas').select('order_type_key, etapa, orden_secuencia').order('orden_secuencia', { ascending: true })
}

// Crea un tipo de orden nuevo. La key se deriva del label (ej. "Bordado
// industrial" -> "bordado_industrial"). V136: solo administradores, y
// siempre con sus etapas — un tipo sin etapas deja sus órdenes invisibles
// para fábrica (pasó con "Venta Mostrador").
export async function createOrderType(label, etapas) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const key = slugify(label)
  if (!key) {
    return { data: null, error: new Error('El nombre del tipo de orden no es válido.') }
  }
  if (!etapas?.length) {
    return { data: null, error: new Error('Elige al menos una etapa para el tipo de orden.') }
  }

  return supabase
    .rpc('create_order_type', { p_key: key, p_label: label, p_etapas: etapas })
    .single()
}

export async function setOrderTypeEtapas(key, etapas) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_type_etapas', { p_key: key, p_etapas: etapas })
}

export async function setOrderTypeActive(key, active) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_type_active', { p_key: key, p_active: active })
}
