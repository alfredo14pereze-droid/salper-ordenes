import { supabase } from '../lib/supabaseClient'

// Toda esta capa asume que `supabase` puede ser null (si faltan las env vars,
// ver lib/supabaseClient.js). Cada función revisa eso primero para devolver
// un error legible en vez de reventar con "Cannot read properties of null".

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchOrders() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orders').select('*').order('requested_delivery_date', { ascending: true })
}

export async function fetchOrderById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orders').select('*').eq('id', id).single()
}

export async function fetchOrderHistory(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false })
}

// Crea la orden y su primer registro de historial en una sola transacción
// (ver función SQL create_order en supabase/schema.sql). `items` es el
// arreglo de prendas (ver OrderItemsEditor) — opcional, por si se crea la
// orden sin especificarlas todavía.
export async function createOrder({
  orderNumber,
  clientName,
  orderTypeKey,
  description,
  requestedDeliveryDate,
  estimatedProductionDays,
  items,
}) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_order', {
      p_order_number: orderNumber,
      p_client_name: clientName,
      p_order_type_key: orderTypeKey,
      p_description: description || null,
      p_requested_delivery_date: requestedDeliveryDate,
      p_estimated_production_days: estimatedProductionDays,
      p_items: items || [],
    })
    .single()
}

// Reemplaza por completo el arreglo de prendas de una orden ya creada
// (ver función SQL set_order_items).
export async function setOrderItems(orderId, items) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_items', { p_order_id: orderId, p_items: items || [] }).single()
}

// Cambia el estado de una orden y agrega el registro de historial
// correspondiente (ver función SQL update_order_status).
export async function updateOrderStatus(orderId, newStatus, notes) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_notes: notes || null,
    })
    .single()
}

// Se suscribe a cambios en tiempo real de órdenes y su historial, para que
// el dashboard/calendario se actualicen solos cuando alguien más mueve una
// orden (sin tener que refrescar la página). Devuelve una función para
// cancelar la suscripción.
export function subscribeToOrderChanges(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
