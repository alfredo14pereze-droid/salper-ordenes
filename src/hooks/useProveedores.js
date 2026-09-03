import { useCallback, useEffect, useState } from 'react'
import { fetchProveedores } from '../services/proveedoresService'

export function useProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchProveedores()
    if (fetchError) {
      setError(fetchError)
    } else {
      setProveedores(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { proveedores, loading, error, refresh: load }
}
