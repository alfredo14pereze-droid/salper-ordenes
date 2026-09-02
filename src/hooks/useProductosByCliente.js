import { useCallback, useEffect, useState } from 'react'
import { fetchProductosByCliente } from '../services/productosService'

// Se refresca solo cuando cambia `clienteId` — para el autocompletado de
// productos al elegir un cliente existente en el formulario de orden (ver
// ProductoAutocomplete.jsx).
export function useProductosByCliente(clienteId) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!clienteId) {
      setProductos([])
      return
    }
    setLoading(true)
    const { data } = await fetchProductosByCliente(clienteId)
    setProductos(data || [])
    setLoading(false)
  }, [clienteId])

  useEffect(() => {
    load()
  }, [load])

  return { productos, loading, refresh: load }
}
