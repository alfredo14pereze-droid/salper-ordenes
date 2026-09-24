import { useCallback, useEffect, useState } from 'react'
import { fetchTalleros, fetchProductosTalleros, fetchTalleroById, fetchMovimientos } from '../services/tallerosService'

// V63 — Talleros. Sin realtime: se recarga con `refresh()` tras cada cambio
// propio (mismo criterio que Pedidos Colegio).
export function useTalleros() {
  const [talleros, setTalleros] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([fetchTalleros(), fetchProductosTalleros()])
    const firstError = t.error || p.error
    if (firstError) {
      setError(firstError)
    } else {
      setTalleros(t.data || [])
      setProductos(p.data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { talleros, productos, loading, error, refresh: load }
}

export function useTallero(id) {
  const [tallero, setTallero] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([fetchTalleroById(id), fetchMovimientos(id)])
    const firstError = t.error || m.error
    if (firstError) {
      setError(firstError)
    } else {
      setTallero(t.data)
      setMovimientos(m.data || [])
      setError(null)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  return { tallero, movimientos, loading, error, refresh: load }
}
