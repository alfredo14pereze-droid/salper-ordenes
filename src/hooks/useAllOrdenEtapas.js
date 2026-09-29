import { useCallback, useEffect, useState } from 'react'
import { fetchAllOrdenEtapas, subscribeToOrderChanges } from '../services/ordersService'

// Todas las filas de orden_etapas, agrupadas por order_id — mismo patrón
// que ya usa ControlRapidoPage.jsx, reusado por las vistas de estación
// (EstacionHomePage.jsx) para saber qué le toca a cada rol de etapa sin
// pedir las etapas una orden a la vez.
export function useAllOrdenEtapas() {
  const [etapasPorOrden, setEtapasPorOrden] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchAllOrdenEtapas()
    if (fetchError) {
      setError(fetchError)
    } else {
      const grouped = {}
      for (const et of data || []) {
        if (!grouped[et.order_id]) grouped[et.order_id] = []
        grouped[et.order_id].push(et)
      }
      setEtapasPorOrden(grouped)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToOrderChanges(() => load())
    return unsubscribe
  }, [load])

  return { etapasPorOrden, loading, error, refresh: load }
}
