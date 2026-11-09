import { supabase } from '../lib/supabaseClient'

// V196 — Manuales. Lectura directa (RLS: cualquiera con sesión); escritura
// por RPC con el permiso man.editar — ver supabase/schema_v196_manuales.sql.

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// Todo de una vez (son pocos y el buscador necesita el contenido).
export async function fetchManuales() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  const [sec, man] = await Promise.all([
    supabase.from('manual_secciones').select('*').order('orden'),
    supabase.from('manuales').select('*').order('orden'),
  ])
  if (sec.error) return { data: null, error: sec.error }
  if (man.error) return { data: null, error: man.error }
  return { data: { secciones: sec.data || [], manuales: man.data || [] }, error: null }
}

export async function guardarSeccion({ id, nombre, descripcion, icono }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('man_guardar_seccion', { p_id: id || null, p_nombre: nombre, p_descripcion: descripcion || null, p_icono: icono || null })
    .single()
}

export async function eliminarSeccion(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('man_eliminar_seccion', { p_id: id })
}

export async function guardarManual({ id, seccionId, titulo, contenido }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('man_guardar_manual', { p_id: id || null, p_seccion_id: seccionId, p_titulo: titulo, p_contenido: contenido })
    .single()
}

export async function eliminarManual(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('man_eliminar_manual', { p_id: id })
}

// tipo: 'seccion' | 'manual'; dir: -1 sube, 1 baja.
export async function moverManual(tipo, id, dir) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('man_mover', { p_tipo: tipo, p_id: id, p_dir: dir })
}
