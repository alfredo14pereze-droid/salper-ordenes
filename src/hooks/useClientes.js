import { useCallback, useEffect, useState } from 'react'
import { fetchClientes } from '../services/clientesService'

export function useClientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchClientes()
    if (fetchError) {
      setError(fetchError)
    } else {
      setClientes(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { clientes, loading, error, refresh: load }
}
