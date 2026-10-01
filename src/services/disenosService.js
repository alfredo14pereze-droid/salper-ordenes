import { supabase } from '../lib/supabaseClient'

// V120 — diseños de una orden (ver
// supabase/schema_v120_sublimado_impresion_disenos.sql). Mismo bucket
// público que las fotos de referencia y de bordado (order-photos), bajo
// su propia carpeta. Sube/borra: sublimado, admin_fabrica, admin_general
// — el servidor lo valida en add_orden_diseno / delete_orden_diseno.
const BUCKET = 'order-photos'
export const MAX_DISENO_SIZE_MB = 10

export const DISENO_TIPO_LABELS = {
  propuesta: 'Propuesta',
  final: 'Diseño final',
}

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export function esImagenDiseno(diseno) {
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(diseno.path || '')
}

export async function fetchOrdenDisenos(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orden_disenos').select('*').eq('order_id', orderId).order('creado_en', { ascending: true })
}

// Solo order_id + tipo de TODAS las órdenes — para que el dashboard de
// sublimado pinte el estado de diseño de cada orden sin pedirlas una por
// una.
export async function fetchResumenDisenos() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orden_disenos').select('order_id, tipo')
}

export async function uploadOrdenDiseno(orderId, tipo, file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
    return { data: null, error: new Error(`"${file.name}" no es una imagen ni un PDF.`) }
  }
  if (file.size > MAX_DISENO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_DISENO_SIZE_MB}MB.`) }
  }

  const ext = file.name.split('.').pop()
  const path = `disenos/${orderId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }
  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { data, error } = await supabase
    .rpc('add_orden_diseno', {
      p_order_id: orderId,
      p_tipo: tipo,
      p_url: publicUrlData.publicUrl,
      p_path: path,
      p_nombre: file.name,
    })
    .single()
  // Si el registro falla, no se deja el archivo huérfano en Storage.
  if (error) await supabase.storage.from(BUCKET).remove([path])
  return { data, error }
}

export async function deleteOrdenDiseno(diseno) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { error } = await supabase.rpc('delete_orden_diseno', { p_id: diseno.id })
  if (error) return { data: null, error }
  await supabase.storage.from(BUCKET).remove([diseno.path])
  return { data: null, error: null }
}
