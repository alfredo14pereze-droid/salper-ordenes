import { supabase } from '../lib/supabaseClient'

const BUCKET = 'order-photos'
export const MAX_PRODUCTO_FOTO_SIZE_MB = 5

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Sube la foto de un producto al mismo bucket que las fotos de
// referencia de órdenes (order-photos, ya público), bajo su propia
// carpeta `productos/<clienteId>/...` para no mezclarse con las
// carpetas de órdenes (que usan el UUID de la orden). Regresa
// {url, path} listos para pasarle a createProducto — igual patrón que
// uploadOrderPhotos en photosService.js.
export async function uploadProductoFoto(clienteId, file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (!file.type.startsWith('image/')) {
    return { data: null, error: new Error(`"${file.name}" no es una imagen.`) }
  }
  if (file.size > MAX_PRODUCTO_FOTO_SIZE_MB * 1024 * 1024) {
    return { data: null, error: new Error(`"${file.name}" pesa más de ${MAX_PRODUCTO_FOTO_SIZE_MB}MB.`) }
  }

  const ext = file.name.split('.').pop()
  const path = `productos/${clienteId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return { data: { url: publicUrlData.publicUrl, path }, error: null }
}

export async function fetchProductosByCliente(clienteId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }
  if (!clienteId) return { data: [], error: null }

  return supabase.from('productos').select('*').eq('cliente_id', clienteId).order('nombre', { ascending: true })
}

export async function createProducto({ clienteId, nombre, garment, color, pantone, telaId, fotoUrl, fotoPath }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_producto', {
      p_cliente_id: clienteId,
      p_nombre: nombre,
      p_garment: garment || null,
      p_color: color || null,
      p_pantone: pantone || null,
      p_tela_id: telaId || null,
      p_foto_url: fotoUrl || null,
      p_foto_path: fotoPath || null,
    })
    .single()
}

// Hard-delete (V24) — exclusivo admin_general. Sin impact-check: un
// producto no tiene filas dependientes en el schema actual.
export async function deleteProducto(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('delete_producto', { p_id: id })
}
