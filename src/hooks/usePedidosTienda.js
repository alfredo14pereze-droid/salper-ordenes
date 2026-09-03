import { useCallback, useEffect, useState } from 'react'
import { fetchPedidosTienda, subscribeToPedidosTienda } from '../services/pedidosTiendaService'

export function usePedidosTienda() {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchPedidosTienda()
    if (fetchError) {
      setError(fetchError)
    } else {
      setPedidos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToPedidosTienda(() => load())
    return unsubscribe
  }, [load])

  return { pedidos, loading, error, refresh: load }
}
