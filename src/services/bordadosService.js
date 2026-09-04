import { supabase } from '../lib/supabaseClient'

// Mismo bucket público que las fotos de referencia (order-photos) — el
// bordado también es solo referencia visual, no trae precios. Ver
// photosService.js para el patrón original.
const BUCKET = 'order-photos'
export const MAX_BORDADO_PHOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Bordado condicional POR PRENDA (V25, ver
// supabase/schema_v25_bordado_condicional.sql): cada prenda de una orden
// puede tener uno o más registros de bordado (ubicación + foto), ligados
// por item_id (el id que cada prenda trae en items[] — ver
// OrderItemsEditor.jsx). Exclusivo del rol bordado/admin_fabrica/
// admin_general, y solo si la orden tiene la etapa 'bordado' activa.
export async function fetchOrdenBordados(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orden_bordados').select('*').eq('order_id', orderId).order('creado_en', { ascending: true })
}

// Sube la foto (si se da un archivo) y crea el registro. `file` es
// opcional — se puede registrar una ubicación sin foto todavía y
// agregarla después con otro registro.
export async function createOrdenBordado(orderId, itemId, ubicacion, file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  let fotoUrl = null
  let fotoPath = null

  if (file) {
    if (!file.type.startsWith('image/')) {
      return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
    }
    if (file.size > MAX_BORDADO_PHOTO_SIZE_MB * 1024 * 1024) {
      return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_BORDADO_PHOTO_SIZE_MB}MB.`) }
    }
    const ext = file.name.split('.').pop()
    const path = `${orderId}/bordado/${itemId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
    if (uploadError) return { data: null, error: uploadError }
    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    fotoUrl = publicUrlData.publicUrl
    fotoPath = path
  }

  return supabase
    .rpc('create_orden_bordado', {
      p_order_id: orderId,
      p_item_id: itemId,
      p_ubicacion: ubicacion,
      p_foto_url: fotoUrl,
      p_foto_path: fotoPath,
    })
    .single()
}

export async function deleteOrdenBordado(registro) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (registro.foto_path) {
    await supabase.storage.from(BUCKET).remove([registro.foto_path])
  }
  return supabase.rpc('delete_orden_bordado', { p_id: registro.id })
}
