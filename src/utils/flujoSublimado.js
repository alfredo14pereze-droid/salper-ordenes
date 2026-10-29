// V165 — flujo de Samuel (sublimado) en secuencia:
//   diseno   → diseño sin autorizar (el estado por omisión)
//   imprimir → diseño autorizado, impresión sin terminar
//   sublimar → impresa, sublimado sin terminar
//   hecha    → sublimada: sale de los pendientes y queda en "Todas"
// Se calcula con orders.diseno_autorizado_en y las etapas impresion /
// sublimado de orden_etapas; no guarda nada aparte.

const etapa = (etapas, nombre) => (etapas || []).find((e) => e.etapa === nombre)

export function pasoSublimado(order, etapas) {
  const imp = etapa(etapas, 'impresion')
  const sub = etapa(etapas, 'sublimado')
  if (sub?.estado === 'completado') return 'hecha'
  if (!imp || imp.estado === 'completado') return sub ? 'sublimar' : 'hecha'
  // Si alguien ya arrancó la impresión, la orden está en impresión aunque
  // nadie haya presionado "Diseño autorizado".
  if (order.diseno_autorizado_en || imp.estado !== 'pendiente') return 'imprimir'
  return 'diseno'
}

const IMPRESION = { pendiente: 'Por imprimir', en_proceso: 'Imprimiendo', completado: 'Impreso' }
const SUBLIMADO = { pendiente: 'Por sublimar', en_proceso: 'Sublimando', completado: 'Sublimado' }

// Chips de la tarjeta: verdes (estado 'completado') cuando el paso se cumplió.
export function badgesSublimado(order, etapas) {
  const imp = etapa(etapas, 'impresion')
  const sub = etapa(etapas, 'sublimado')
  const autorizado = !!order.diseno_autorizado_en || (imp && imp.estado !== 'pendiente')
  const out = [autorizado ? { key: 'diseno', label: 'Diseño autorizado', estado: 'completado' } : { key: 'diseno', label: 'Diseño por autorizar', estado: 'pendiente' }]
  if (imp) out.push({ key: 'impresion', label: IMPRESION[imp.estado] || imp.estado, estado: imp.estado })
  if (sub) out.push({ key: 'sublimado', label: SUBLIMADO[sub.estado] || sub.estado, estado: sub.estado })
  return out
}

// Las cuatro pestañas. Pendientes: solo órdenes vivas (sin cancelar ni
// entregar), en el orden en que llegan (por fecha de entrega). "Todas" es el
// historial: las ya sublimadas (o entregadas), la más reciente primero.
export function bandejasSublimado(orders, etapasPorOrden) {
  const sub = (orders || []).filter((o) => o.order_type_key === 'sublimacion' && !o.cancelled_at && !o.eliminada_en)
  const paso = new Map(sub.map((o) => [o.id, pasoSublimado(o, etapasPorOrden[o.id])]))
  const vivas = sub.filter((o) => o.status !== 'completado')
  const enPaso = (p) => vivas.filter((o) => paso.get(o.id) === p)
  const fechaHecha = (o) => {
    const s = etapa(etapasPorOrden[o.id], 'sublimado')
    return s?.completado_en || o.delivered_at || o.requested_delivery_date || ''
  }
  const historial = sub
    .filter((o) => paso.get(o.id) === 'hecha' || o.status === 'completado')
    .sort((a, b) => String(fechaHecha(b)).localeCompare(String(fechaHecha(a))))
  return [
    { key: 'diseno', label: 'Pendientes de diseño', ordenes: enPaso('diseno') },
    { key: 'imprimir', label: 'Pendientes de impresión', ordenes: enPaso('imprimir') },
    { key: 'sublimar', label: 'Pendientes de sublimado', ordenes: enPaso('sublimar') },
    { key: 'todas', label: 'Todas', ordenes: historial },
  ]
}
