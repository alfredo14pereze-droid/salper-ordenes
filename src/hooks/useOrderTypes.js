import { useCallback, useEffect, useState } from 'react'
import { fetchOrderTypes } from '../services/orderTypesService'

export function useOrderTypes() {
  const [orderTypes, setOrderTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrderTypes()
    if (fetchError) {
      setError(fetchError)
    } else {
      setOrderTypes(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const typesByKey = Object.fromEntries(orderTypes.map((t) => [t.key, t]))

  return { orderTypes, typesByKey, loading, error, refresh: load }
}
