import { useCallback, useEffect, useState } from 'react'
import {
  fetchPedidoTiendaById,
  fetchPedidoTiendaArticulos,
  subscribeToPedidosTienda,
} from '../services/pedidosTiendaService'

// Un pedido a proveedor + sus artículos, para la vista de detalle.
export function usePedidoTienda(pedidoId) {
  const [pedido, setPedido] = useState(null)
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!pedidoId) return
    const [{ data: pedidoData, error: pedidoError }, { data: articulosData, error: articulosError }] =
      await Promise.all([fetchPedidoTiendaById(pedidoId), fetchPedidoTiendaArticulos(pedidoId)])

    if (pedidoError) {
      setError(pedidoError)
    } else {
      setPedido(pedidoData)
      setArticulos(articulosData || [])
      setError(articulosError || null)
    }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => {
    setLoading(true)
    load()
    const unsubscribe = subscribeToPedidosTienda(() => load())
    return unsubscribe
  }, [load])

  return { pedido, articulos, loading, error, refresh: load }
}
