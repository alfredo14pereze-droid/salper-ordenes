// Reportes en PDF de la fábrica (desde Resumen):
// 1) Pendientes de entrega: toda orden viva que no se ha entregado.
// 2) Sin empezar: de esas, las que no tienen ninguna etapa empezada (todas sus
//    etapas siguen "pendiente": nadie ha cortado, cosido, sublimado…).
// Agrupadas por cliente, cada cliente ordenado por su entrega más próxima.

export function piezasDeOrden(order) {
  return (order.items || []).reduce(
    (s, it) => s + (it?.sizes || []).reduce((t, sz) => t + (Number(sz?.cantidad) || 0), 0),
    0,
  )
}

// "Playera: CH 10 · M 5" por prenda (sin filas vacías).
export function prendasDeOrden(order) {
  return (order.items || [])
    .filter((it) => it && (String(it.garment || '').trim() || (it.sizes || []).some((s) => Number(s?.cantidad) > 0)))
    .map((it) => {
      const tallas = (it.sizes || [])
        .filter((s) => String(s?.talla ?? '').trim() || Number(s?.cantidad) > 0)
        .map((s) => `${String(s.talla ?? '').trim() || '—'} ${Number(s.cantidad) || 0}`)
        .join(' · ')
      const nombre = [String(it.garment || '').trim() || 'Prenda', it.color && String(it.color).trim()].filter(Boolean).join(' ')
      return { nombre: it.comprada === true ? `${nombre} (comprada)` : nombre, tallas }
    })
}

export function pendientesDeEntrega(orders = []) {
  return (orders || []).filter((o) => o.status !== 'completado' && !o.cancelled_at && !o.eliminada_en)
}

// etapas: filas de orden_etapas de todas las órdenes ({ order_id, estado }).
// Una orden sin filas de etapas cuenta como sin empezar.
export function sinEmpezar(orders = [], etapas = []) {
  const empezadas = new Set(
    (etapas || []).filter((e) => e.estado === 'en_proceso' || e.estado === 'completado').map((e) => e.order_id),
  )
  return pendientesDeEntrega(orders).filter((o) => !empezadas.has(o.id))
}

const dia = (d) => (d ? String(d).slice(0, 10) : '9999-12-31')

// [{ cliente, ordenes, piezas, entregaMasProxima }]
export function agruparPorCliente(orders = []) {
  const grupos = new Map()
  for (const o of orders) {
    const nombre = String(o.client_name || 'Sin cliente').trim()
    const clave = nombre.toLowerCase()
    if (!grupos.has(clave)) grupos.set(clave, { cliente: nombre, ordenes: [] })
    grupos.get(clave).ordenes.push(o)
  }
  return [...grupos.values()]
    .map((g) => {
      const ordenes = [...g.ordenes].sort((a, b) => dia(a.requested_delivery_date).localeCompare(dia(b.requested_delivery_date)))
      return {
        cliente: g.cliente,
        ordenes,
        piezas: ordenes.reduce((s, o) => s + piezasDeOrden(o), 0),
        entregaMasProxima: ordenes[0]?.requested_delivery_date || null,
      }
    })
    .sort((a, b) => dia(a.entregaMasProxima).localeCompare(dia(b.entregaMasProxima)) || a.cliente.localeCompare(b.cliente))
}

// Días que faltan para la entrega (negativo = atrasada). hoy: 'yyyy-mm-dd'.
export function diasParaEntrega(fecha, hoy) {
  if (!fecha) return null
  const a = Date.UTC(...String(hoy).slice(0, 10).split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)))
  const b = Date.UTC(...String(fecha).slice(0, 10).split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)))
  return Math.round((b - a) / 86400000)
}
