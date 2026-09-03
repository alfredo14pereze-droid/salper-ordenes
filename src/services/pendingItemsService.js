import { supabase } from '../lib/supabaseClient'

// Reusa el mismo bucket de fotos de referencia de órdenes (ya confirmado
// que sus policies son authenticated-only, sin hueco público) bajo una
// carpeta separada, para no tener que dar de alta un bucket nuevo solo
// para las fotos de "Orden de reparación".
const PHOTO_BUCKET = 'order-photos'
export const MAX_PENDING_PHOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// "Pendientes": cosas fuera del flujo de órdenes de producción (una
// reparación mandada a un taller externo, un trámite, una compra, etc.).
export async function fetchPendingItems() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('pending_items').select('*').order('created_at', { ascending: false })
}

// Sube la foto de una "Orden de reparación" ANTES de crear el pendiente
// (el pendiente todavía no tiene id) — mismo patrón que
// photosService.uploadOrderPhotos pero para un solo archivo suelto bajo
// `pending/`. Se llama solo si el usuario adjuntó una foto.
export async function uploadPendingItemPhoto(file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (!file.type.startsWith('image/')) {
    return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  }
  if (file.size > MAX_PENDING_PHOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_PENDING_PHOTO_SIZE_MB}MB.`) }
  }

  const ext = file.name.split('.').pop()
  const path = `pending/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)

  return { data: { path, url: publicUrlData.publicUrl }, error: null }
}

// `garment`/`talla`/`cantidad`/`fotoUrl`/`fotoPath` son solo para el tipo
// "Orden de reparación" (ver schema_v14_bordado_y_reparaciones.sql) — un
// pendiente "general" los manda como null y el formulario ni los muestra.
export async function createPendingItem({
  title,
  description,
  category,
  garment,
  talla,
  cantidad,
  fotoUrl,
  fotoPath,
}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_pending_item', {
      p_title: title,
      p_description: description || null,
      p_category: category || null,
      p_garment: garment || null,
      p_talla: talla || null,
      p_cantidad: cantidad || null,
      p_foto_url: fotoUrl || null,
      p_foto_path: fotoPath || null,
    })
    .single()
}

export async function updatePendingItemStatus(id, status) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('update_pending_item_status', { p_id: id, p_status: status }).single()
}

export function subscribeToPendingItems(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('pending-items-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_items' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
