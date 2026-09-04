import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchTelas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('telas').select('*').order('nombre', { ascending: true })
}

// "Crear o reusar" — ver create_tela en supabase/schema_v12_catalogos.sql.
// Si ya existe una tela con ese nombre (normalizado), regresa la existente.
export async function createTela(nombre) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('create_tela', { p_nombre: nombre }).single()
}

// Hard-delete (V24) — exclusivo admin_general. productos.tela_id tiene ON
// DELETE SET NULL, así que borrar una tela no borra productos, solo les
// quita la referencia — el impact-check avisa cuántos se verían afectados.
export async function getTelaDeleteImpact(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('get_tela_delete_impact', { p_id: id }).single()
}

export async function deleteTela(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('delete_tela', { p_id: id })
}
