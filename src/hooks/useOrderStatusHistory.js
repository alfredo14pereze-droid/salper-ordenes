import { useCallback, useEffect, useState } from 'react'
import { fetchAllOrderStatusHistory } from '../services/ordersService'

// Para Estadísticas (V35): todo el historial de estados de TODAS las
// órdenes, agrupado por order_id, en un solo pedido. A diferencia de
// useOrders no lleva suscripción realtime — esta pantalla es de análisis
// (promedios, tendencias), no necesita refrescarse sola al segundo; se
// recarga al entrar y con el botón "Actualizar" de la página.
export function useOrderStatusHistory() {
  const [historyByOrder, setHistoryByOrder] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await fetchAllOrderStatusHistory()
    if (fetchError) {
      setError(fetchError)
    } else {
      const grouped = {}
      for (const row of data || []) {
        if (!grouped[row.order_id]) grouped[row.order_id] = []
        grouped[row.order_id].push(row)
      }
      setHistoryByOrder(grouped)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { historyByOrder, loading, error, refresh: load }
}
