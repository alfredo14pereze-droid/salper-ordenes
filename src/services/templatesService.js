import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Plantillas para órdenes habituales (ej. "Polo Colegio Vanguard"): tipo,
// descripción, días estimados, prendas y fotos de referencia por default,
// para que "Nueva orden" se prellene con un clic.
export async function fetchOrderTemplates() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('order_templates').select('*').order('name', { ascending: true })
}

export async function createOrderTemplate({
  name,
  orderTypeKey,
  description,
  estimatedProductionDays,
  items,
  referencePhotos,
}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_order_template', {
      p_name: name,
      p_order_type_key: orderTypeKey,
      p_description: description || null,
      p_estimated_production_days: estimatedProductionDays || 1,
      p_items: items || [],
      p_reference_photos: referencePhotos || [],
    })
    .single()
}

export async function deleteOrderTemplate(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { error: cfgError }

  return supabase.rpc('delete_order_template', { p_id: id })
}

// Copia las fotos de una plantilla al espacio de una orden nueva (Storage),
// en vez de reutilizar el mismo archivo — así, si luego alguien borra una
// foto desde la orden nueva, no desaparece también de la plantilla.
export async function copyTemplatePhotosToOrder(orderId, templatePhotos) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!templatePhotos || templatePhotos.length === 0) return { data: [], error: null }

  const BUCKET = 'order-photos'
  const copied = []

  for (const photo of templatePhotos) {
    const ext = photo.path.split('.').pop()
    const newPath = `${orderId}/${crypto.randomUUID()}.${ext}`

    const { error: copyError } = await supabase.storage.from(BUCKET).copy(photo.path, newPath)
    if (copyError) return { data: null, error: copyError }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
    copied.push({ path: newPath, url: publicUrlData.publicUrl, name: photo.name })
  }

  return { data: copied, error: null }
}
