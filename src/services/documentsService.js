import { supabase } from '../lib/supabaseClient'

// Documentos por orden (cotización / orden de compra) — bucket PRIVADO a
// propósito (a diferencia de order-photos), porque estos PDFs pueden traer
// precios. Por eso no hay getPublicUrl: la URL se pide al vuelo con una
// signed URL cada vez que alguien quiere ver/descargar el archivo, y solo
// funciona con sesión (ver supabase/schema_v11_documentos.sql).
const BUCKET = 'orden-documentos'
const SIGNED_URL_TTL_SECONDS = 60

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

// Sube un PDF nuevo (o de reemplazo) para una orden y lo registra en la
// columna correspondiente. `kind` es 'cotizacion' u 'orden_compra'.
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
    .rpc('set_order_document', { p_order_id: orderId, p_kind: kind, p_path: path })
    .single()

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

// Quita el documento de la orden (deja el campo en null). No borra el
// archivo viejo de Storage — si se está "reemplazando", el flujo de arriba
// (uploadOrderDocument) ya sobreescribe el registro con el path nuevo; este
// helper es para el caso de "quitar sin reemplazar".
export async function removeOrderDocument(orderId, kind) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_document', { p_order_id: orderId, p_kind: kind, p_path: null }).single()
}
