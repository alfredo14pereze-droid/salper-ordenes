import { TINTAS } from './impresionReporte.js'

// V167 — impresión por lote (sublimación). Ver schema_v167_lotes_impresion.sql.

// Telas de una orden, sin repetir ("Lycra · Dry fit").
export function telasDeOrden(order) {
  const vistas = new Set()
  for (const item of order?.items || []) {
    const t = String(item?.tela_nombre ?? '').trim()
    if (t) vistas.add(t)
  }
  return [...vistas]
}

// Los números de un lote como los usa la pantalla (mismas claves que el
// reporte por orden de V146: largo, azul, magenta, amarillo, negro, total).
export function reporteDeLote(lote) {
  if (!lote) return null
  const tintas = Object.fromEntries(TINTAS.map((t) => [t.key, Number(lote[`tinta_${t.key}_ml`]) || 0]))
  return { largo: Number(lote.largo_m) || 0, ...tintas, total: Number(lote.tinta_total_ml) || 0 }
}

// Las órdenes del lote con sus telas (para el reporte). Si una orden ya no
// está en la lista cargada, queda solo con su folio.
export function ordenesDelLote(lote, orders) {
  const porId = new Map((orders || []).map((o) => [o.id, o]))
  return (lote?.order_ids || []).map((id, i) => {
    const o = porId.get(id)
    return { id, folio: lote.folios?.[i] || o?.order_number || '—', cliente: o?.client_name || '', telas: o ? telasDeOrden(o) : [] }
  })
}
