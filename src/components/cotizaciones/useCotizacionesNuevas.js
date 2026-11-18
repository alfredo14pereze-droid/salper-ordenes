import { useCallback, useEffect, useState } from 'react'
import { contarCotizacionesNuevas, EVENTO_COTIZACIONES_WEB } from '../../services/cotizacionesWebService'

// V213 — número de cotizaciones web en estado "nueva" junto a
// "Cotizaciones web" en el menú. `activo` false = no consulta nada.
export default function useCotizacionesNuevas(activo) {
  const [n, setN] = useState(0)
  const contar = useCallback(async () => {
    if (!activo) return setN(0)
    const { data, error } = await contarCotizacionesNuevas()
    if (!error) setN(data || 0)
  }, [activo])

  useEffect(() => {
    contar()
    const alVolver = () => document.visibilityState === 'visible' && contar()
    window.addEventListener(EVENTO_COTIZACIONES_WEB, contar)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener(EVENTO_COTIZACIONES_WEB, contar)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [contar])
  return n
}
