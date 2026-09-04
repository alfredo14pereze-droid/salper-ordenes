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
// orden sin especificarlas todavía. El folio (order_number) ya NO se manda
// desde aquí: lo asigna automáticamente un trigger en la base de datos
// (ver supabase/schema_v5_folios.sql). El tiempo estimado de producción
// tampoco se manda: nace en null y solo lo captura fábrica una vez que
// confirma la orden (ver EstimatedDaysCard / schema_v7_no_default_days.sql).
export async function createOrder({ clientName, clientId, orderTypeKey, description, requestedDeliveryDate, items }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_order', {
      p_client_name: clientName,
      p_order_type_key: orderTypeKey,
      p_description: description || null,
      p_requested_delivery_date: requestedDeliveryDate,
      p_items: items || [],
      p_client_id: clientId || null,
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

// Etapas paralelas (V23, ver supabase/schema_v23_etapas_paralelas.sql):
// cada orden tiene una fila por etapa aplicable a su tipo (corte,
// sublimado, producción, bordado, terminado), cada una con su propio
// estado — así que producción y terminado (por ejemplo) pueden estar
// activas al mismo tiempo. orders.status sigue existiendo como un
// resumen de un vistazo, recalculado automáticamente por el servidor
// cada vez que se llama updateOrdenEtapa.
export async function fetchOrdenEtapas(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orden_etapas').select('*').eq('order_id', orderId).order('orden_secuencia', { ascending: true })
}

// Avanza UNA etapa de UNA orden (pendiente -> en_proceso -> completado, o
// para corregir, cualquier valor directo). El servidor valida que el rol
// coincida con el nombre de la etapa (o sea admin_fabrica/admin_general)
// — ver update_orden_etapa en schema_v23_etapas_paralelas.sql.
export async function updateOrdenEtapa(orderId, etapa, nuevoEstado) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('update_orden_etapa', {
      p_order_id: orderId,
      p_etapa: etapa,
      p_nuevo_estado: nuevoEstado,
    })
    .single()
}

// Edita los datos generales de una orden ya creada (tienda solo mientras
// sigue "en_confirmacion"; admin siempre — ver update_order_details).
export async function updateOrderDetails(orderId, { clientName, orderTypeKey, description, requestedDeliveryDate }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('update_order_details', {
      p_order_id: orderId,
      p_client_name: clientName,
      p_order_type_key: orderTypeKey,
      p_description: description || null,
      p_requested_delivery_date: requestedDeliveryDate,
    })
    .single()
}

// Fábrica captura el tiempo estimado de producción (solo mientras la
// orden sigue "en_confirmacion"; admin no tiene esa restricción).
export async function setEstimatedProductionDays(orderId, days) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_estimated_production_days', { p_order_id: orderId, p_days: days }).single()
}

// Cancelar / reactivar una orden — exclusivo de admin.
export async function cancelOrder(orderId, notes) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('cancel_order', { p_order_id: orderId, p_notes: notes || null }).single()
}

export async function uncancelOrder(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('uncancel_order', { p_order_id: orderId }).single()
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_etapas' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
