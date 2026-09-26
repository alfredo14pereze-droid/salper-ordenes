import { useCallback, useEffect, useState } from 'react'
import { fetchPendientes, subscribeToPendientes } from '../services/pendientesService'

export function usePendientes() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: e } = await fetchPendientes()
    if (e) setError(e)
    else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    return subscribeToPendientes(() => load())
  }, [load])

  return { items, loading, error, refresh: load }
}
