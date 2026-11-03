import { useCallback, useEffect, useState } from 'react'
import { fetchOrdenCambios } from '../services/ordersService'
import { cambiosVisibles } from '../utils/cambiosOrden'

// V178 — cambios registrados de una orden (más reciente primero). Se vuelve
// a leer cuando la orden cambia (updated_at / bandera de reconfirmación).
export function useOrdenCambios(order) {
  const [cambios, setCambios] = useState([])
  const [disponible, setDisponible] = useState(true)
  const orderId = order?.id

  const load = useCallback(async () => {
    if (!orderId) return
    const { data, error } = await fetchOrdenCambios(orderId)
    setDisponible(!error)
    setCambios(error ? [] : cambiosVisibles(data))
  }, [orderId])

  useEffect(() => {
    load()
  }, [load, order?.updated_at, order?.pending_reconfirmation_at])

  return { cambios, disponible, refresh: load }
}
