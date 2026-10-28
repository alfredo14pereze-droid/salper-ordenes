import { useEffect, useState } from 'react'
import { fetchLineasMostrador } from '../services/finanzasService'

// V159 — qué líneas (item_index:size_index) de una orden son "venta de
// mostrador", para la etiqueta del listado y del detalle. Las tarjetas de un
// listado piden cada una su orden; aquí se juntan en UNA sola consulta por
// tanda (se espera al siguiente ciclo) y se guardan en memoria.
const cache = new Map() // orderId -> Set de "itemIndex:sizeIndex"
const pendientes = new Set()
const avisar = new Set()
let timer = null

async function consultar() {
  const ids = [...pendientes]
  pendientes.clear()
  timer = null
  const { data } = await fetchLineasMostrador(ids)
  for (const id of ids) cache.set(id, new Set())
  for (const r of data || []) cache.get(r.order_id)?.add(`${r.item_index}:${r.size_index}`)
  avisar.forEach((f) => f())
}

function pedir(orderId) {
  if (!orderId || cache.has(orderId) || pendientes.has(orderId)) return
  pendientes.add(orderId)
  if (!timer) timer = setTimeout(consultar, 0)
}

// Después de guardar las líneas de una orden: volver a consultarla.
export function refrescarLineasMostrador(orderId) {
  cache.delete(orderId)
  pedir(orderId)
}

export function useLineasMostrador(orderId) {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const f = () => setVersion((v) => v + 1)
    avisar.add(f)
    pedir(orderId)
    return () => avisar.delete(f)
  }, [orderId])
  return cache.get(orderId) || null
}
