import { estadoParaMi, meToca, ordenarTareas } from './tareas.js'

// V169 — cálculos de la pantalla del chofer (sin React ni Supabase).

// Órdenes "Lista para entregar" (status 'terminado'), la de entrega más cercana primero.
export function ordenesParaEntregar(orders) {
  return (orders || [])
    .filter((o) => o.status === 'terminado' && !o.cancelled_at && !o.eliminada_en)
    .sort((a, b) => String(a.requested_delivery_date || '9999').localeCompare(String(b.requested_delivery_date || '9999')))
}

// Piezas de una orden: [{ prenda, color, tallas: 'M 10 · G 5', total }] y el total general.
export function piezasDeOrden(order) {
  const lineas = (order?.items || [])
    .map((item) => {
      const tallas = (item?.sizes || []).filter((s) => Number(s?.cantidad) > 0)
      const total = tallas.reduce((n, s) => n + Number(s.cantidad), 0)
      return {
        prenda: String(item?.garment || '').trim() || 'Prenda',
        color: String(item?.color || '').trim(),
        tallas: tallas.map((s) => `${s.talla} ${s.cantidad}`).join(' · '),
        total,
      }
    })
    .filter((l) => l.total > 0)
  return { lineas, total: lineas.reduce((n, l) => n + l.total, 0) }
}

// Pendientes tienda ↔ fábrica que van en camino (lo que el chofer lleva).
export function pendientesPorLlevar(items) {
  const lista = items || []
  return {
    aFabrica: lista.filter((p) => p.estado === 'enviado_a_fabrica'),
    aTienda: lista.filter((p) => p.estado === 'enviado_a_tienda'),
  }
}

// Tareas que le tocan al chofer y no están hechas, en el orden de la pantalla de Tareas.
export function tareasPendientes(tareas, completadas, { userId, role }) {
  const pendientes = (tareas || []).filter((t) => {
    if (t.quitada_en || !meToca(t, { userId, role })) return false
    const comps = (completadas || []).filter((c) => c.tarea_id === t.id)
    return !estadoParaMi(t, comps, userId).hecha
  })
  return ordenarTareas(pendientes)
}
