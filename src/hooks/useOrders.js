import { useCallback, useEffect, useState } from 'react'
import { fetchOrders, subscribeToOrderChanges } from '../services/ordersService'

// Lista completa de órdenes, con recarga automática cuando algo cambia
// en la base (realtime), para que el dashboard/calendario nunca queden
// desactualizados sin que nadie tenga que preguntar o refrescar.
export function useOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrders()
    if (fetchError) {
      setError(fetchError)
    } else {
      setOrders(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToOrderChanges(() => load())
    return unsubscribe
  }, [load])

  return { orders, loading, error, refresh: load }
}
