import { useCallback, useEffect, useState } from 'react'
import { fetchPendingItems, subscribeToPendingItems } from '../services/pendingItemsService'

export function usePendingItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchPendingItems()
    if (fetchError) {
      setError(fetchError)
    } else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToPendingItems(() => load())
    return unsubscribe
  }, [load])

  return { items, loading, error, refresh: load }
}
