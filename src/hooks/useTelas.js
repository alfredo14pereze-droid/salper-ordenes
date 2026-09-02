import { useCallback, useEffect, useState } from 'react'
import { fetchTelas } from '../services/telasService'

export function useTelas() {
  const [telas, setTelas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchTelas()
    if (fetchError) {
      setError(fetchError)
    } else {
      setTelas(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { telas, loading, error, refresh: load }
}
