import { useCallback, useEffect, useState } from 'react'
import { fetchOrderById, fetchOrderHistory, subscribeToOrderChanges } from '../services/ordersService'

// Una orden individual + su historial de estados, para la vista de detalle.
export function useOrder(orderId) {
  const [order, setOrder] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orderId) return
    const [{ data: orderData, error: orderError }, { data: historyData, error: historyError }] = await Promise.all([
      fetchOrderById(orderId),
      fetchOrderHistory(orderId),
    ])

    if (orderError) {
      setError(orderError)
    } else {
      setOrder(orderData)
      setHistory(historyData || [])
      setError(historyError || null)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => {
    setLoading(true)
    load()
    const unsubscribe = subscribeToOrderChanges(() => load())
    return unsubscribe
  }, [load])

  return { order, history, loading, error, refresh: load }
}
