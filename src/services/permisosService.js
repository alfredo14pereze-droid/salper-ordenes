import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// V125 — Roles y permisos editables. Lectura abierta a cualquier sesión (la
// pantalla/AuthContext necesitan saber qué puede cada rol); el cambio pasa
// SIEMPRE por el RPC, que solo acepta admin_general.
export async function fetchRolPermisos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.from('rol_permisos').select('rol, clave')
}

export async function fetchPermisosCatalogo() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('permisos_catalogo')
    .select('clave, modulo, etiqueta, descripcion, nivel, orden')
    .order('orden', { ascending: true })
}

export async function setRolPermiso(rol, clave, permitido) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('admin_set_rol_permiso', { p_rol: rol, p_clave: clave, p_permitido: !!permitido })
}

export async function fetchRolPermisosLog(limit = 40) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .from('rol_permisos_log')
    .select('id, cambiado_en, cambiado_por_nombre, rol, clave, permitido')
    .order('id', { ascending: false })
    .limit(limit)
}
