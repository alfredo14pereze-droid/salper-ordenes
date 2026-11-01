import { useEffect, useState } from 'react'
import { fetchHojasParaOrden, fetchPrendasConOperaciones } from '../services/produccionService'
import { armarOpciones } from '../utils/operacionesOrden'

// V174/V175 — lo que se puede escoger en "Operaciones" de cada prenda de la
// orden: prendas del catálogo de operaciones + hojas guardadas en «Hojas
// impresas». Se carga una vez y se reusa. null = todavía no hay lista
// (cargando, o falta la función en la base): entonces las órdenes se guardan
// sin tocar `prenda_operaciones`.
let cache = null
let pendiente = null

export async function cargarOpcionesOperaciones() {
  if (cache) return cache
  pendiente ||= Promise.all([fetchPrendasConOperaciones(), fetchHojasParaOrden()]).then(([p, h]) => {
    pendiente = null
    if (!p.error && p.data) cache = armarOpciones(p.data, h.error ? [] : h.data || [])
    return cache
  })
  return pendiente
}

// Después de guardar una hoja nueva, para que aparezca sin recargar.
export function olvidarOpcionesOperaciones() {
  cache = null
}

export function usePrendasOperaciones() {
  const [opciones, setOpciones] = useState(cache)
  useEffect(() => {
    let vivo = true
    cargarOpcionesOperaciones().then((o) => vivo && setOpciones(o))
    return () => {
      vivo = false
    }
  }, [])
  return opciones
}
