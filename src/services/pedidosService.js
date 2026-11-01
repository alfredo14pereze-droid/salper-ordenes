import { supabase } from '../lib/supabaseClient'

// V176 — Pedidos: agrupan varias órdenes de un cliente con un anticipo,
// abonos y datos de factura. Todo se escribe por RPC (ver
// supabase/schema_v176_pedidos.sql); los totales los calcula la base.

function sinCliente() {
  return supabase ? null : { data: null, error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
}

export async function fetchPedidosLista(incluirEliminados = false) {
  return sinCliente() || supabase.rpc('pedidos_lista', { p_incluir_eliminados: incluirEliminados })
}

export async function fetchPedido(id) {
  return sinCliente() || supabase.from('pedidos').select('*').eq('id', id).maybeSingle()
}

export async function fetchPedidoTotales(id) {
  return sinCliente() || supabase.rpc('pedido_totales', { p_pedido_id: id })
}

export async function fetchPedidoAbonos(id) {
  return sinCliente() || supabase.from('pedido_abonos').select('*').eq('pedido_id', id).order('created_at', { ascending: false })
}

// datos: ver datosParaGuardar() en utils/pedidos.js
export async function crearPedido(datos, orderIds = []) {
  return sinCliente() || supabase.rpc('pedido_crear', { p_datos: datos, p_order_ids: orderIds }).single()
}

export async function actualizarPedido(id, datos) {
  return sinCliente() || supabase.rpc('pedido_actualizar', { p_pedido_id: id, p_datos: datos }).single()
}

export async function agregarOrdenAPedido(pedidoId, orderId) {
  return sinCliente() || supabase.rpc('pedido_agregar_orden', { p_pedido_id: pedidoId, p_order_id: orderId }).single()
}

export async function quitarOrdenDePedido(orderId) {
  return sinCliente() || supabase.rpc('pedido_quitar_orden', { p_order_id: orderId })
}

export async function eliminarPedido(id) {
  return sinCliente() || supabase.rpc('pedido_eliminar', { p_pedido_id: id })
}

export async function crearAbonoPedido({ pedidoId, monto, metodoPago, recibidoPor, notas }) {
  return (
    sinCliente() ||
    supabase
      .rpc('create_pedido_abono', {
        p_pedido_id: pedidoId,
        p_monto: monto,
        p_metodo_pago: metodoPago,
        p_recibido_por: recibidoPor,
        p_notas: notas || null,
      })
      .single()
  )
}

export async function borrarAbonoPedido(id) {
  return sinCliente() || supabase.rpc('delete_pedido_abono', { p_id: id })
}
