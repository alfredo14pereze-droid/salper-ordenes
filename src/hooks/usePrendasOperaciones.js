import { useEffect, useState } from 'react'
import { fetchPrendasConOperaciones } from '../services/produccionService'

// V174 — prendas del catálogo de operaciones (para escoger en cada prenda de
// la orden). Se carga una vez por sesión de la página. null = todavía no hay
// lista (cargando, o la función de la base aún no existe): en ese caso las
// órdenes se guardan sin tocar `prenda_operaciones`.
let cache = null
let pendiente = null

export function usePrendasOperaciones() {
  const [prendas, setPrendas] = useState(cache)
  useEffect(() => {
    if (cache) return
    let vivo = true
    pendiente ||= fetchPrendasConOperaciones().then(({ data, error }) => {
      pendiente = null
      if (!error && data) cache = data
      return cache
    })
    pendiente.then((p) => vivo && setPrendas(p))
    return () => {
      vivo = false
    }
  }, [])
  return prendas
}
