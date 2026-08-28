import { useCallback, useEffect, useState } from 'react'
import { fetchOrderTemplates } from '../services/templatesService'

export function useOrderTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrderTemplates()
    if (fetchError) {
      setError(fetchError)
    } else {
      setTemplates(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { templates, loading, error, refresh: load }
}
