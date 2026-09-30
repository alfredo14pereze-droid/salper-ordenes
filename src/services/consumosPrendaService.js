import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// V101 — catálogo de rendimientos de tela por prenda (admin_fabrica/admin_general).
export async function fetchConsumosPrenda() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('consumos_prenda').select('*').order('prenda', { ascending: true })
}

// "Guardar" = alta (p_id null) o edición — la validación de tallas
// traslapadas/promedio-general-duplicado vive en el RPC (ver
// schema_v101_consumos_prenda.sql), no aquí.
export async function guardarConsumoPrenda({ id, prenda, tallas, consumo, unidad }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('guardar_consumo_prenda', {
      p_id: id || null,
      p_prenda: prenda,
      p_tallas: tallas && tallas.length > 0 ? tallas : null,
      p_consumo: consumo,
      p_unidad: unidad,
    })
    .single()
}

export async function eliminarConsumoPrenda(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('eliminar_consumo_prenda', { p_id: id })
}

// Prendas ya usadas en órdenes reales — solo informativo, para avisar
// "prenda no encontrada" en la vista previa del import de CSV (no hay un
// catálogo formal de prendas contra qué validar).
export async function fetchPrendasConocidas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('fetch_prendas_conocidas')
}
