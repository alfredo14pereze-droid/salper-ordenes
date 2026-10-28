import { supabase } from '../lib/supabaseClient'

// V158 — Notas de tienda. Lectura directa (RLS: permiso nt.ver); escritura
// siempre por RPC (nt_crear_nota / nt_resolver_nota) — ver
// supabase/schema_v158_notas_tienda.sql.

const BUCKET = 'nt-fotos'
export const MAX_FOTO_SIZE_MB = 5

export const TIPOS_NOTA = [
  { key: 'faltante', label: 'Producto faltante', placeholder: 'Ej. Faltan playeras polo azul talla CH (quedan 2).' },
  { key: 'dia', label: 'Nota del día', placeholder: 'Ej. Hoy viene el colegio Tricio a recoger a las 5.' },
  { key: 'error', label: 'Error', placeholder: 'Ej. La orden 1234 se entregó con una talla equivocada.' },
  { key: 'otro', label: 'Otro', placeholder: 'Escribe la nota…' },
]

export function etiquetaTipo(key) {
  return TIPOS_NOTA.find((t) => t.key === key)?.label || key
}

function ensureClient() {
  if (!supabase) return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  return { error: null }
}

// resueltas = false → solo pendientes; true → solo resueltas (las 200 más recientes).
export async function fetchNotasTienda({ resueltas = false } = {}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  let q = supabase.from('nt_notas').select('*')
  q = resueltas ? q.not('resuelta_en', 'is', null).order('resuelta_en', { ascending: false }) : q.is('resuelta_en', null).order('creado_en', { ascending: false })
  return q.limit(200)
}

export async function uploadNotaFoto(file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!file.type.startsWith('image/')) return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  if (file.size > MAX_FOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_FOTO_SIZE_MB}MB.`) }
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { data: { path, url: data.publicUrl }, error: null }
}

export async function crearNotaTienda({ tipo, texto, foto }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase
    .rpc('nt_crear_nota', { p_tipo: tipo, p_texto: texto, p_foto_path: foto?.path || null, p_foto_url: foto?.url || null })
    .single()
}

export async function resolverNotaTienda(id, resuelta) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  return supabase.rpc('nt_resolver_nota', { p_id: id, p_resuelta: resuelta }).single()
}
