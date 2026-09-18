import { supabase } from '../lib/supabaseClient'

// Documentos por orden (cotización / orden de compra / factura) — bucket
// PRIVADO a propósito (a diferencia de order-photos), porque estos PDFs
// pueden traer precios. Por eso no hay getPublicUrl: la URL se pide al
// vuelo con una signed URL cada vez que alguien quiere ver/descargar el
// archivo, y solo funciona con sesión (ver supabase/schema_v11_documentos.sql
// y schema_v15_factura.sql).
const BUCKET = 'orden-documentos'
const SIGNED_URL_TTL_SECONDS = 60

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Lista de archivos subidos a una orden (V58: puede haber varios por tipo).
// `kind` es 'cotizacion', 'orden_compra' o 'factura'.
export async function fetchOrderDocumentos(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .from('order_documentos')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
}

// Sube UN PDF a la orden y lo registra como un documento más (no
// reemplaza a los que ya había). Si el registro falla después de haber
// subido el archivo, se intenta borrar el archivo huérfano.
export async function uploadOrderDocument(orderId, kind, file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (file.type !== 'application/pdf') {
    return { data: null, error: new Error(`"${file.name}" no es un PDF.`) }
  }

  const path = `${orderId}/${kind}-${crypto.randomUUID()}.pdf`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }

  const { data, error } = await supabase
    .rpc('add_order_documento', { p_order_id: orderId, p_kind: kind, p_path: path, p_nombre: file.name })
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
  }
  return { data, error }
}

// Genera una URL temporal para ver/descargar un documento ya subido.
export async function getSignedDocumentUrl(path) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return { data: null, error }

  return { data: data.signedUrl, error: null }
}

// Quita UN documento de la orden (V58). El registro se borra por RPC (el
// servidor revisa el rol); el archivo de Storage se borra después, sin
// que un fallo ahí cuente como error — el documento ya dejó de aparecer.
export async function deleteOrderDocumento(documento) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { error } = await supabase.rpc('delete_order_documento', { p_documento_id: documento.id })
  if (error) return { data: null, error }

  await supabase.storage.from(BUCKET).remove([documento.path])
  return { data: true, error: null }
}

// V42: constancia de situación fiscal — es del CLIENTE, no de la orden
// (un cliente casi siempre pide varias veces y su constancia no cambia
// entre pedidos), pero se sube/ve desde el detalle de la orden porque es
// justo ahí donde se factura. Mismo bucket privado, prefijo de ruta
// distinto (`clientes/<id>/...` en vez de `<orderId>/...`).
export async function uploadClienteConstanciaFiscal(clienteId, file) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  if (file.type !== 'application/pdf') {
    return { data: null, error: new Error(`"${file.name}" no es un PDF.`) }
  }

  const path = `clientes/${clienteId}/constancia-${crypto.randomUUID()}.pdf`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file)
  if (uploadError) return { data: null, error: uploadError }

  const { data, error } = await supabase
    .rpc('set_cliente_constancia_fiscal', { p_cliente_id: clienteId, p_path: path })
    .single()

  return { data, error }
}
