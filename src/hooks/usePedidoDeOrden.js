import { useEffect, useState } from 'react'
import { fetchPedido } from '../services/pedidosService'

// V176 — el pedido al que pertenece una orden (o null). Varias tarjetas del
// detalle lo piden a la vez: una sola consulta por pedido, en memoria.
const cache = new Map() // pedidoId -> Promise<pedido|null>

export function olvidarPedido(pedidoId) {
  cache.delete(pedidoId)
}

export function usePedidoDeOrden(order) {
  const pedidoId = order?.pedido_id || null
  const [pedido, setPedido] = useState(null)
  useEffect(() => {
    let vivo = true
    if (!pedidoId) {
      setPedido(null)
      return undefined
    }
    if (!cache.has(pedidoId)) cache.set(pedidoId, fetchPedido(pedidoId).then(({ data }) => data || null))
    cache.get(pedidoId).then((p) => vivo && setPedido(p))
    return () => {
      vivo = false
    }
  }, [pedidoId, order])
  return pedido
}
