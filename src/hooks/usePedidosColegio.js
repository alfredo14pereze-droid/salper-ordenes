import { useCallback, useEffect, useState } from 'react'
import { fetchColegios, fetchPedidos, fetchPedidoById } from '../services/pedidosColegioService'

// V57 — Pedidos Colegio (beta, solo admin_general). Sin realtime a
// propósito: es un módulo de un solo usuario (admin_general) capturando —
// se recarga con `refresh()` después de cada cambio propio.

// Colegios activos + todos los pedidos vigentes (para la vista de colegios).
export function usePedidosColegio() {
  const [colegios, setColegios] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [{ data: colegiosData, error: colegiosError }, { data: pedidosData, error: pedidosError }] =
      await Promise.all([fetchColegios(), fetchPedidos()])
    const firstError = colegiosError || pedidosError
    if (firstError) {
      setError(firstError)
    } else {
      setColegios(colegiosData || [])
      setPedidos(pedidosData || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { colegios, pedidos, loading, error, refresh: load }
}

// Solo los colegios activos (para el selector del formulario de alta).
export function useColegios() {
  const [colegios, setColegios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchColegios().then(({ data, error: fetchError }) => {
      if (cancelled) return
      if (fetchError) setError(fetchError)
      else setColegios(data || [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { colegios, loading, error }
}

// Un pedido con su colegio, artículos y abonos (para el detalle).
export function usePedidoColegio(pedidoId) {
  const [pedido, setPedido] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!pedidoId) return
    const { data, error: fetchError } = await fetchPedidoById(pedidoId)
    if (fetchError) {
      setError(fetchError)
    } else {
      setPedido(data)
      setError(null)
    }
    setLoading(false)
  }, [pedidoId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  return { pedido, loading, error, refresh: load }
}
