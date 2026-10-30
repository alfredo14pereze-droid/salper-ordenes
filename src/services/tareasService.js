import { supabase } from '../lib/supabaseClient'

// V164 — Tareas. Lectura directa (RLS: quien asigna ve todas; los demás, las
// que les tocan); escritura por RPC — ver supabase/schema_v164_tareas.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// Devuelve { tareas, completadas } (últimas 300 tareas activas).
export async function fetchTareas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const { data: tareas, error } = await supabase.from('ta_tareas').select('*').order('creado_en', { ascending: false }).limit(300)
  if (error) return { data: null, error }
  if (!tareas.length) return { data: { tareas, completadas: [] }, error: null }
  const { data: completadas, error: e2 } = await supabase.from('ta_completadas').select('*').in('tarea_id', tareas.map((t) => t.id))
  if (e2) return { data: null, error: e2 }
  return { data: { tareas, completadas }, error: null }
}

export async function fetchDestinatariosTareas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('ta_destinatarios')
}

// destino: { tipo: 'todos' | 'rol' | 'persona', rol?, personaId? }
export async function crearTarea({ titulo, descripcion, destino, modo, fechaLimite }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('ta_crear_tarea', {
      p_titulo: titulo,
      p_descripcion: descripcion || null,
      p_destino_tipo: destino.tipo,
      p_destino_rol: destino.tipo === 'rol' ? destino.rol : null,
      p_destino_id: destino.tipo === 'persona' ? destino.personaId : null,
      p_modo: destino.tipo === 'persona' ? 'cada_quien' : modo,
      p_fecha_limite: fechaLimite || null,
    })
    .single()
}

// V170 — tarea propia: para quien la escribe; solo la ven él y admin_general.
export async function crearTareaPropia({ titulo, descripcion, fechaLimite }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('ta_crear_tarea_propia', { p_titulo: titulo, p_descripcion: descripcion || null, p_fecha_limite: fechaLimite || null })
    .single()
}

export async function marcarTarea(id, hecha) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('ta_marcar_tarea', { p_tarea_id: id, p_hecha: hecha })
}

export async function quitarTarea(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('ta_quitar_tarea', { p_id: id }).single()
}
