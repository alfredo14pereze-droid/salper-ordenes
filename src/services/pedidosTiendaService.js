import { supabase } from '../lib/supabaseClient'

// Pedidos a Proveedor — módulo independiente del flujo de órdenes de
// producción (ver schema_v18_pedidos_tienda.sql). Lectura SOLO
// autenticada (trae costos reales de proveedor, no se abre a invitado),
// escritura vía RPC como el resto de la app.

function ensureClient() {
  if (!supabase) {
    return { error: new Error('Supabase no está configurado (revisa tu archivo .env).') }
  }
  return { error: null }
}

export async function fetchPedidosTienda() {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('pedidos_tienda').select('*').order('fecha_pedido', { ascending: false })
}

export async function fetchPedidoTiendaById(id) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.from('pedidos_tienda').select('*').eq('id', id).single()
}

export async function fetchPedidoTiendaArticulos(pedidoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .from('pedidos_tienda_articulos')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('nombre_articulo', { ascending: true })
}

// `articulos`: [{ nombreArticulo, cantidadPedida }, ...]
export async function createPedidoTienda({ proveedor, pedidoPor, fechaPedido, notas, articulos }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('create_pedido_tienda', {
      p_proveedor: proveedor,
      p_pedido_por: pedidoPor,
      p_fecha_pedido: fechaPedido,
      p_notas: notas || null,
      p_articulos: articulos.map((a) => ({
        nombre_articulo: a.nombreArticulo,
        cantidad_pedida: a.cantidadPedida,
      })),
    })
    .single()
}

export async function marcarPedidoRecibido(pedidoId) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase.rpc('marcar_pedido_recibido', { p_pedido_id: pedidoId }).single()
}

// `articulos`: [{ id, cantidadRecibida, precioUnitario, notaProblema }, ...]
export async function verificarPedidoTienda({ pedidoId, verificadoPor, articulos }) {
  const { error: cfgError } = ensureClient()
  if (cfgError) return { data: null, error: cfgError }

  return supabase
    .rpc('verificar_pedido_tienda', {
      p_pedido_id: pedidoId,
      p_verificado_por: verificadoPor,
      p_articulos: articulos.map((a) => ({
        id: a.id,
        cantidad_recibida: a.cantidadRecibida,
        precio_unitario: a.precioUnitario,
        nota_problema: a.notaProblema,
      })),
    })
    .single()
}

export function subscribeToPedidosTienda(onChange) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('pedidos-tienda-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_tienda' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_tienda_articulos' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
