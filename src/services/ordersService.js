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

// V59 — las prendas (`orders.items`, JSONB sin schema fijo) a veces traen
// basura: una talla `null` suelta dentro de `sizes` (ya pasó de verdad: la
// orden ESC-005 tenía una en la posición 12 de una Pantalonera), o un item
// que no es objeto. Como muchísimo código recorre `item.sizes[].cantidad`,
// UNA sola talla nula bastaba para tirar la pantalla completa (página en
// blanco en "Nueva orden" y Calendario). Se limpia aquí, al leer, para que
// todo lo que viene después reciba siempre la forma esperada — no se
// modifica nada en la base.
function limpiarItems(items) {
  if (!Array.isArray(items)) return []
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      sizes: Array.isArray(item.sizes) ? item.sizes.filter((sz) => sz && typeof sz === 'object') : [],
    }))
}

function limpiarOrden(order) {
  return order ? { ...order, items: limpiarItems(order.items) } : order
}

// Dashboard/Resumen/Calendario/Órdenes pasadas viven todos de este hook
// (useOrders) — desde V24 excluye por default las órdenes con
// eliminada_en no nulo (soft-delete de admin_general). Para la pantalla
// "Control rápido de órdenes" (que sí necesita verlas, marcadas como
// "Eliminada") usa fetchAllOrdersForControl en vez de esta.
export async function fetchOrders() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .is('eliminada_en', null)
    .order('requested_delivery_date', { ascending: true })
  return { data: data ? data.map(limpiarOrden) : data, error }
}

// "Control rápido de órdenes" (V24): folio/cliente/estado para TODAS las
// órdenes, incluidas las eliminadas (el frontend las marca "Eliminada").
export async function fetchAllOrdersForControl() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orders').select('*').order('order_number', { ascending: true })
}

export async function fetchOrderById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data, error } = await supabase.from('orders').select('*').eq('id', id).single()
  return { data: limpiarOrden(data), error }
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

// Estadísticas (V35): TODO el historial de estados de TODAS las órdenes en
// un solo pedido (en vez de uno por orden como fetchOrderHistory) — se
// agrupa por order_id del lado del cliente, ver useOrderStatusHistory.
// Mismas políticas de lectura que el resto (autenticado, ver
// schema_v29_no_acceso_externo.sql), así que cualquier rol con sesión
// puede pedir esto.
export async function fetchAllOrderStatusHistory() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('order_status_history').select('*').order('changed_at', { ascending: true })
}

// Crea la orden y su primer registro de historial en una sola transacción
// (ver función SQL create_order en supabase/schema.sql). `items` es el
// arreglo de prendas (ver OrderItemsEditor) — opcional, por si se crea la
// orden sin especificarlas todavía. El folio (order_number) ya NO se manda
// desde aquí: lo asigna automáticamente un trigger en la base de datos
// (ver supabase/schema_v5_folios.sql). El tiempo estimado de producción
// tampoco se manda: nace en null y solo lo captura fábrica una vez que
// confirma la orden (ver EstimatedDaysCard / schema_v7_no_default_days.sql).
export async function createOrder({
  clientName,
  clientId,
  clientTelefono,
  clientCorreo,
  orderTypeKey,
  description,
  requestedDeliveryDate,
  items,
  foliosExternos,
  createdAt,
  totalOrden,
}) {
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
      p_client_telefono: clientTelefono || null,
      p_client_correo: clientCorreo || null,
      // V42: varias órdenes de taller viejas pueden corresponder a esta
      // misma orden en SALPER — ver FoliosExternosField.jsx.
      p_folios_externos: foliosExternos || [],
      // V38, TEMPORAL (ver CAPTURA_FECHA_CREACION_HABILITADA en
      // featureFlags.js): para subir el historial de órdenes ya activas
      // con su fecha real, no la de hoy. null = se comporta como
      // siempre (now() del lado del servidor).
      p_created_at: createdAt || null,
      // V42: opcional, para calcular "Restante" contra los anticipos.
      p_total_orden: totalOrden || null,
    })
    .single()
}

// V143 — orden de maquila: el servidor toma el nombre del cliente del
// catálogo y genera las etapas con los procesos del producto (ver
// create_order_maquila en schema_v143_maquila.sql).
export async function createOrderMaquila({ clientId, productoId, numeroCorte, requestedDeliveryDate, items, description, foliosExternos, totalOrden }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_order_maquila', {
      p_client_id: clientId,
      p_producto_id: productoId,
      p_numero_corte: numeroCorte,
      p_requested_delivery_date: requestedDeliveryDate,
      p_items: items || [],
      p_description: description || null,
      p_folios_externos: foliosExternos || [],
      p_total_orden: totalOrden || null,
    })
    .single()
}

// V145 — "Equipo": identificador extra y opcional de la orden (sublimación).
export async function setOrdenEquipo(orderId, equipo) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_orden_equipo', { p_order_id: orderId, p_equipo: equipo || null }).single()
}

// V143 — ¿ese cliente ya tiene una orden de maquila con ese número de corte?
// Es solo el aviso antes de guardar; el servidor lo vuelve a validar.
export async function fetchOrdenPorNumeroCorte(clientId, numeroCorte) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, numero_corte')
    .eq('order_type_key', 'maquila')
    .eq('client_id', clientId)
    .is('eliminada_en', null)
  if (error) return { data: null, error }
  const buscado = String(numeroCorte || '').trim().toUpperCase()
  return { data: (data || []).find((o) => String(o.numero_corte || '').trim().toUpperCase() === buscado) || null, error: null }
}

export async function setOrdenNumeroCorte(orderId, numeroCorte) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_orden_numero_corte', { p_order_id: orderId, p_numero_corte: numeroCorte }).single()
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

// V38: apaga pending_reconfirmation_at — exclusivo fábrica (mismos
// roles que confirman una orden nueva). No toca status ni orden_etapas,
// ver confirm_order_changes en schema_v38_fecha_creacion_y_reconfirmacion.sql.
export async function confirmOrderChanges(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('confirm_order_changes', { p_order_id: orderId }).single()
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

// Todas las filas de orden_etapas de TODAS las órdenes — para "Control
// rápido de órdenes" (V24), que necesita mostrar qué etapas están activas
// por orden sin pedirlas una por una.
export async function fetchAllOrdenEtapas() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('orden_etapas').select('*')
}

// V139 — etapas terminadas dentro de un periodo, con el folio, el cliente y
// las prendas de su orden (para el reporte de tiempos por etapa).
export async function fetchEtapasTerminadas(desdeIso, hastaIso) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .from('orden_etapas')
    // '*' y no la lista de columnas: `pausas` (V140) puede no existir todavía.
    .select('*, orders!inner(order_number, client_name, items, eliminada_en)')
    .eq('estado', 'completado')
    .gte('completado_en', desdeIso)
    .lt('completado_en', hastaIso)
    .is('orders.eliminada_en', null)
    .order('completado_en', { ascending: false })
}

// V139 — corrige las horas de una etapa ya terminada (solo admin_general; el
// servidor deja registro en orden_etapas_correcciones).
export async function corregirTiemposEtapa(orderId, etapa, iniciadoEn, completadoEn, motivo) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('corregir_tiempos_etapa', {
      p_order_id: orderId,
      p_etapa: etapa,
      p_iniciado_en: iniciadoEn,
      p_completado_en: completadoEn,
      p_motivo: motivo,
    })
    .single()
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

// V140 — pausa o reanuda una etapa en proceso (el cronómetro deja de contar;
// la etapa sigue "en proceso"). Mismo permiso que updateOrdenEtapa.
export async function pausarOrdenEtapa(orderId, etapa, pausar) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('pausar_orden_etapa', {
      p_order_id: orderId,
      p_etapa: etapa,
      p_pausar: pausar,
    })
    .single()
}

// Edita los datos generales de una orden ya creada (ventas y
// administradores de tienda, en cualquier estado — ver update_order_details).
export async function updateOrderDetails(
  orderId,
  { clientName, orderTypeKey, description, requestedDeliveryDate, clientTelefono, clientCorreo, foliosExternos }
) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('update_order_details', {
      p_order_id: orderId,
      p_client_name: clientName,
      p_order_type_key: orderTypeKey,
      p_description: description || null,
      p_requested_delivery_date: requestedDeliveryDate,
      p_client_telefono: clientTelefono || null,
      p_client_correo: clientCorreo || null,
      p_folios_externos: foliosExternos || [],
    })
    .single()
}

// V42: total acordado con el cliente — aparte de update_order_details a
// propósito (no dispara pending_reconfirmation_at, fábrica no necesita
// reconfirmar un cambio de precio). "Restante" (total - anticipos) se
// calcula en el frontend con esto + fetchAnticipos, nunca se guarda.
export async function setOrderTotal(orderId, total) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_total', { p_order_id: orderId, p_total: total }).single()
}

// V51: notas internas — comunicación entre áreas, nunca sale en ningún
// PDF ni se le muestra al cliente (ver OrderNotesCard.jsx). Aparte de
// update_order_details a propósito, mismo criterio que setOrderTotal:
// no es un dato de la orden que fábrica necesite reconfirmar.
export async function setOrderNotasInternas(orderId, notas) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('set_order_notas_internas', { p_order_id: orderId, p_notas: notas || null }).single()
}

// V130: marcar la nota interna como resuelta (o reabrirla). Si el texto de la
// nota se edita, el servidor la deja otra vez sin resolver.
export async function resolverNotaOrden(orderId, resuelta = true) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('resolver_nota_orden', { p_order_id: orderId, p_resuelta: resuelta }).single()
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

// Soft-delete de órdenes (V24) — exclusivo admin_general. Antes de
// eliminar, el frontend debe consultar getOrderDeleteImpact para avisar
// cuántos registros relacionados existen (la orden en sí no se borra
// nunca, solo se marca con eliminada_en).
export async function getOrderDeleteImpact(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('get_order_delete_impact', { p_order_id: orderId }).single()
}

export async function softDeleteOrder(orderId, notes) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('soft_delete_order', { p_order_id: orderId, p_notes: notes || null }).single()
}

export async function restoreOrder(orderId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('restore_order', { p_order_id: orderId }).single()
}

// Terminado (V26, ver supabase/schema_v26_terminado_remision.sql): único
// punto de escritura para el rol `terminado` — SOLO toca cantidad_surtida/
// comentario_surtido de UNA talla de UNA prenda (localizada por su ÍNDICE
// dentro de items[], no por `id` — una orden vieja no re-guardada desde
// Parte 3 no trae `id` en la base), nunca el resto de la orden. Exclusivo
// terminado/admin_fabrica/admin_general.
export async function setItemSurtido(orderId, itemIndex, talla, cantidadSurtida, comentarioSurtido) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('set_item_surtido', {
      p_order_id: orderId,
      p_item_index: itemIndex,
      p_talla: talla,
      p_cantidad_surtida: cantidadSurtida,
      p_comentario_surtido: comentarioSurtido || null,
    })
    .single()
}

// Se suscribe a cambios en tiempo real de órdenes y su historial, para que
// el dashboard/calendario se actualicen solos cuando alguien más mueve una
// orden (sin tener que refrescar la página). Devuelve una función para
// cancelar la suscripción.
//
// V96/V97 — bug real encontrado: el nombre del canal era fijo
// ('orders-realtime'), así que si dos hooks independientes lo llamaban al
// mismo tiempo en la misma pantalla (useOrders + useAllOrdenEtapas, que
// EstacionHomePage.jsx sí hace), el cliente de Supabase regresaba el MISMO
// canal ya suscrito y el segundo `.on(...)` reventaba con "cannot add
// postgres_changes callbacks... after subscribe()". Nombre único por
// llamada = cada quien tiene su propio canal, sin importar cuántas
// pantallas se suscriban a la vez.
export function subscribeToOrderChanges(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`orders-realtime-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_etapas' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
