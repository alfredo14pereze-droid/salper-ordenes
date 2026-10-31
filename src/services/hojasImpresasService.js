import { supabase } from '../lib/supabaseClient'

// V173 — hojas de operaciones impresas. Lectura directa (RLS: quien ve el
// catálogo de operaciones); escritura por RPC — ver
// supabase/schema_v173_hojas_impresas.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

export async function fetchHojasImpresas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('hojas_impresas').select('*').order('ultima_en', { ascending: false })
}

export async function fetchHojaImpresa(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('hojas_impresas').select('*').eq('id', id).maybeSingle()
}

export async function registrarHojaImpresa({ prenda, titulo, folios }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('registrar_hoja_impresa', { p_prenda: prenda, p_titulo: titulo, p_folios: folios }).single()
}

export async function quitarHojaImpresa(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('quitar_hoja_impresa', { p_id: id })
}
