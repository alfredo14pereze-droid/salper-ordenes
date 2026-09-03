import { supabase } from '../lib/supabaseClient'

// Anticipos: pagos adelantados recibidos por una orden — monto, método
// (efectivo/tarjeta/transferencia) y quién lo recibió. Tabla separada de
// `orders`, de lectura SOLO autenticada (a diferencia del resto de la
// orden, que un invitado sí puede ver) porque es información financiera
// — mismo criterio que los documentos (cotización/orden de
// compra/factura). Ver supabase/schema_v16_anticipos.sql.

export const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'transferencia', label: 'Transferencia' },
]

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchAnticipos(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('anticipos').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
}

export async function createAnticipo({ orderId, monto, metodoPago, recibidoPor, notas }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_anticipo', {
      p_order_id: orderId,
      p_monto: monto,
      p_metodo_pago: metodoPago,
      p_recibido_por: recibidoPor,
      p_notas: notas || null,
    })
    .single()
}

// Solo admin puede borrar (ver create_anticipo/delete_anticipo en el
// schema) — corregir un error de captura, no un uso cotidiano.
export async function deleteAnticipo(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('delete_anticipo', { p_id: id })
}
