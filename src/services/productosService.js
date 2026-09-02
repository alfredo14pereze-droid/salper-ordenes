import { supabase } from '../lib/supabaseClient'

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
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
