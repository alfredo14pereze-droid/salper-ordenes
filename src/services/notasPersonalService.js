import { supabase } from '../lib/supabaseClient'

// V163 — Notas para el personal. Lectura directa (RLS: quien escribe ve todas;
// los demás, las de todos y las suyas); escritura por RPC — ver
// supabase/schema_v163_notas_para_personal.sql. La foto usa el mismo bucket
// que Notas de tienda (uploadNotaFoto en notasTiendaService.js).

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// Devuelve { notas, enterados }. enterados: todos (si escribes) o solo los tuyos.
export async function fetchNotasPersonal() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data: notas, error } = await supabase.from('np_notas').select('*').order('creado_en', { ascending: false }).limit(200)
  if (error) return { data: null, error }
  if (!notas.length) return { data: { notas, enterados: [] }, error: null }
  const { data: enterados, error: e2 } = await supabase.from('np_enterados').select('*').in('nota_id', notas.map((n) => n.id))
  if (e2) return { data: null, error: e2 }
  return { data: { notas, enterados }, error: null }
}

export async function fetchDestinatarios() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('np_destinatarios')
}

export async function crearNotaPersonal({ texto, paraId, foto }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('np_crear_nota', { p_texto: texto, p_para_id: paraId || null, p_foto_path: foto?.path || null, p_foto_url: foto?.url || null })
    .single()
}

export async function marcarEnterado(notaId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('np_marcar_enterado', { p_nota_id: notaId }).single()
}

export async function quitarNotaPersonal(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('np_quitar_nota', { p_id: id }).single()
}
