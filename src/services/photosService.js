import { supabase } from '../lib/supabaseClient'

const BUCKET = 'order-photos'
export const MAX_PHOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Sube uno o varios archivos al bucket de Storage bajo la carpeta de la
// orden, y regresa el arreglo listo para guardar en orders.reference_photos
// (ver add_order_photos en supabase/schema_v2.sql).
export async function uploadOrderPhotos(orderId, files) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const uploaded = []

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
    }
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_PHOTO_SIZE_MB}MB.`) }
    }

    const ext = file.name.split('.').pop()
    const path = `${orderId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
    if (uploadError) return { data: null, error: uploadError }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

    uploaded.push({ path, url: publicUrlData.publicUrl, name: file.name })
  }

  const { data, error } = await supabase.rpc('add_order_photos', {
    p_order_id: orderId,
    p_photos: uploaded,
  }).single()

  return { data, error }
}

// Adjunta fotos que ya existen en Storage (ej. copiadas de una plantilla,
// ver templatesService.copyTemplatePhotosToOrder) sin volver a subir
// ningún archivo — solo registra el arreglo en orders.reference_photos.
export async function attachExistingPhotos(orderId, photos) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!photos || photos.length === 0) return { data: null, error: null }

  return supabase.rpc('add_order_photos', { p_order_id: orderId, p_photos: photos }).single()
}

export async function removeOrderPhoto(orderId, photo) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([photo.path])
  if (storageError) return { data: null, error: storageError }

  return supabase.rpc('remove_order_photo', { p_order_id: orderId, p_photo_path: photo.path }).single()
}
