// V126 — búsqueda de órdenes compartida (Dashboard, Órdenes pasadas y la
// pantalla de Sublimado). Busca en el folio SALPER, el cliente y los folios
// del control anterior (folios_externos). Además de "contiene" tal cual,
// compara sin espacios, guiones ni puntos, para que "ORD 0007", "ord-0007"
// o "0007" encuentren "ORD0007". Antes la pantalla de Sublimado solo miraba
// folio SALPER y cliente, y por eso el folio anterior no aparecía.
const plano = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, '')

export function coincideBusquedaOrden(order, texto) {
  const q = String(texto ?? '').trim().toLowerCase()
  if (!q) return true
  const qp = plano(q)
  // V143: también el número de corte de las órdenes de maquila.
  const campos = [order.order_number, order.client_name, order.numero_corte, ...(order.folios_externos || [])]
  return campos.some((c) => {
    const v = String(c ?? '').toLowerCase()
    return v.includes(q) || (qp !== '' && plano(v).includes(qp))
  })
}
