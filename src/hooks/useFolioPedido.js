import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// V176 — folio del pedido de una orden (PED-0001) para las tarjetas del
// listado. Las tarjetas lo piden cada una; aquí se junta en UNA consulta por
// tanda. La tabla `pedidos` solo la leen los roles de dinero (RLS): para los
// demás regresa vacío y la tarjeta no muestra nada.
const cache = new Map() // pedidoId -> folio | null
const pendientes = new Set()
const avisar = new Set()
let timer = null

async function consultar() {
  const ids = [...pendientes]
  pendientes.clear()
  timer = null
  const { data } = supabase ? await supabase.from('pedidos').select('id, folio').in('id', ids) : { data: [] }
  for (const id of ids) cache.set(id, null)
  for (const p of data || []) cache.set(p.id, p.folio)
  avisar.forEach((f) => f())
}

export function useFolioPedido(pedidoId) {
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!pedidoId) return undefined
    const f = () => setVersion((v) => v + 1)
    avisar.add(f)
    if (!cache.has(pedidoId) && !pendientes.has(pedidoId)) {
      pendientes.add(pedidoId)
      if (!timer) timer = setTimeout(consultar, 0)
    }
    return () => avisar.delete(f)
  }, [pedidoId])
  return pedidoId ? cache.get(pedidoId) || null : null
}
