// V186 — Frisa fase 2: restock. Ver supabase/schema_v186_frisa_restock.sql.
//
// Por clave:
//   en proceso = órdenes de taller ligadas que no se han terminado
//                + pedidos de compra que no han llegado
//   por entrar = órdenes de taller terminadas que no se han subido a bodega
//   proyectado = disponible + en proceso + por entrar
//   si proyectado ≤ reorden (PEDIR o CRÍTICO) → A PEDIR = máximo − proyectado
// Lo que tiene liga a un producto Frisa se pide como orden de taller (una
// orden FR por producto, con sus tallas); lo que no, como pedido de compra.

import { calcularNiveles } from './frisaNiveles.js'

const T = (s) => String(s ?? '').trim().toUpperCase()

// clavesProducto: [{producto_id, producto_frisa_id, talla}] → Map "frisaId|TALLA" → producto_id
export function mapaTallas(clavesProducto) {
  const m = new Map()
  for (const c of clavesProducto || []) m.set(`${c.producto_frisa_id}|${T(c.talla)}`, c.producto_id)
  return m
}

// Piezas por talla de una orden FR: [{talla, cantidad}]
export function tallasDeOrden(order) {
  const out = new Map()
  for (const it of order?.items || []) {
    for (const sz of it?.sizes || []) {
      const t = T(sz?.talla)
      const n = Number(sz?.cantidad) || 0
      if (t && n > 0) out.set(t, (out.get(t) || 0) + n)
    }
  }
  return [...out.entries()].map(([talla, cantidad]) => ({ talla, cantidad }))
}

// Terminada = etapa terminado completada, o la orden ya está en terminado/completado.
export function ordenTerminada(order, etapas = []) {
  if (['terminado', 'completado'].includes(order?.status)) return true
  return etapas.some((e) => e.order_id === order?.id && e.etapa === 'terminado' && e.estado === 'completado')
}

// Estado de cada orden ligada: 'en_proceso' | 'por_entrar' | 'en_bodega' | 'cancelada'
export function estadoOrdenRestock(liga, order, etapas) {
  if (liga?.ingresado_en) return 'en_bodega'
  if (!order || order.cancelled_at || order.eliminada_en) return 'cancelada'
  return ordenTerminada(order, etapas) ? 'por_entrar' : 'en_proceso'
}

// Lo que propone subir a bodega una orden: [{producto_id, talla, cantidad}] (+ tallas sin clave).
export function propuestaIngreso(order, clavesProducto) {
  const mapa = mapaTallas(clavesProducto)
  const lineas = []
  const sinClave = []
  for (const { talla, cantidad } of tallasDeOrden(order)) {
    const pid = mapa.get(`${order.producto_frisa_id}|${talla}`)
    if (pid) lineas.push({ producto_id: pid, talla, cantidad })
    else sinClave.push({ talla, cantidad })
  }
  return { lineas, sinClave }
}

// datos: { productosInv, cfg, clavesProducto, ligas, orders, etapas, compras, compraLineas }
export function calcularRestock({ productosInv, cfg, clavesProducto = [], ligas = [], orders = [], etapas = [], compras = [], compraLineas = [] }) {
  const mapa = mapaTallas(clavesProducto)
  const ligaPorClave = new Map(clavesProducto.map((c) => [c.producto_id, c]))
  const ordenPorId = new Map(orders.map((o) => [o.id, o]))
  const enProceso = new Map()
  const porEntrar = new Map()
  const suma = (m, k, n) => m.set(k, (m.get(k) || 0) + n)

  const ordenes = ligas.map((liga) => {
    const order = ordenPorId.get(liga.order_id)
    const estado = estadoOrdenRestock(liga, order, etapas)
    const piezas = order ? tallasDeOrden(order).reduce((t, x) => t + x.cantidad, 0) : 0
    if (order && (estado === 'en_proceso' || estado === 'por_entrar')) {
      for (const { talla, cantidad } of tallasDeOrden(order)) {
        const pid = mapa.get(`${order.producto_frisa_id}|${talla}`)
        if (pid) suma(estado === 'en_proceso' ? enProceso : porEntrar, pid, cantidad)
      }
    }
    return { liga, order, estado, piezas }
  })

  const pedidas = new Set(compras.filter((c) => c.estado === 'pedida').map((c) => c.id))
  for (const l of compraLineas) if (pedidas.has(l.compra_id)) suma(enProceso, l.producto_id, l.cantidad)

  const filas = productosInv.map((p) => {
    const ep = enProceso.get(p.id) || 0
    const pe = porEntrar.get(p.id) || 0
    const proyectado = p.disponible + ep + pe
    const n = calcularNiveles({ ...p, disponible: proyectado }, cfg)
    const liga = ligaPorClave.get(p.id) || null
    return {
      producto: p, liga, se: liga ? 'fabrica' : 'compra',
      disponible: p.disponible, enProceso: ep, porEntrar: pe, proyectado,
      minimo: n.minimo, reorden: n.reorden, maximo: n.maximo, estado: n.estado,
      aPedir: n.aPedir || 0,
    }
  })

  // Órdenes de taller propuestas: una por producto Frisa con sus tallas.
  const porProducto = new Map()
  for (const f of filas) {
    if (f.se !== 'fabrica' || f.aPedir <= 0) continue
    const k = f.liga.producto_frisa_id
    if (!porProducto.has(k)) porProducto.set(k, { producto_frisa_id: k, lineas: [] })
    porProducto.get(k).lineas.push({ producto_id: f.producto.id, clave: f.producto.clave, talla: T(f.liga.talla), cantidad: f.aPedir })
  }
  const compraPropuesta = filas.filter((f) => f.se === 'compra' && f.aPedir > 0)
    .map((f) => ({ producto_id: f.producto.id, clave: f.producto.clave, cantidad: f.aPedir }))

  return {
    filas,
    ordenes,
    talleresPropuestos: [...porProducto.values()],
    compraPropuesta,
  }
}

// Items para create_order_frisa: [{garment, color, producto_frisa_id, sizes:[{talla, cantidad}]}]
export function itemsOrdenRestock(productoFrisa, lineas) {
  return [{
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    garment: productoFrisa?.nombre || '',
    color: productoFrisa?.color || '',
    producto_frisa_id: productoFrisa?.id || '',
    sizes: lineas.filter((l) => Number(l.cantidad) > 0).map((l) => ({ talla: l.talla, cantidad: Number(l.cantidad) })),
  }]
}
