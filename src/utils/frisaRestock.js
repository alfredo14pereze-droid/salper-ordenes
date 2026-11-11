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

// Cada cuánto se pide y cuánto tarda en estar en bodega (días).
export const CICLO = { fabrica: { cada: 7, tarda: 10 }, compra: { cada: 10, tarda: 10 } }

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

  // 2026-11-11 (Alfredo): se pide por ciclo. Playera: cada 7 días y tarda 10 en el taller.
  // Pantalón (y lo que se compra hecho): cada 10 días y tarda 10 en llegar.
  //   alLlegar    = lo que habrá cuando llegue lo que se pide hoy (hay + viene − venta de esos días)
  //   alSiguiente = lo que habrá cuando llegue el SIGUIENTE pedido (sumando un ciclo más)
  //   estado: alSiguiente ≤ mínimo → CRÍTICO · ≤ reorden → PEDIR · ≤ reorden +20% → CERCA · si no OK
  //   aPedir (CRÍTICO / PEDIR / CERCA) = lo que falta para estar en el máximo cuando llegue lo de hoy.
  const filas = productosInv.map((p) => {
    const ep = enProceso.get(p.id) || 0
    const pe = porEntrar.get(p.id) || 0
    const proyectado = p.disponible + ep + pe
    const n = calcularNiveles(p, cfg)
    const liga = ligaPorClave.get(p.id) || null
    const se = liga ? 'fabrica' : 'compra'
    const ciclo = CICLO[se]
    const d = n.demanda || 0
    const alLlegar = Math.round(proyectado - d * ciclo.tarda)
    const alSiguiente = Math.round(proyectado - d * (ciclo.cada + ciclo.tarda))
    const estado = n.sinMovimiento ? 'ok' : alSiguiente <= n.minimo ? 'critico' : alSiguiente <= n.reorden ? 'pedir'
      : alSiguiente <= Math.ceil(n.reorden * 1.2) ? 'cerca' : 'ok'
    return {
      producto: p, liga, se, ciclo,
      disponible: p.disponible, enProceso: ep, porEntrar: pe, proyectado, demanda: d, alLlegar, alSiguiente,
      diasAlcanza: d > 0 ? Math.floor(proyectado / d) : null,
      minimo: n.minimo, reorden: n.reorden, maximo: n.maximo, estado,
      aPedir: estado === 'ok' ? 0 : Math.max(0, n.maximo - alLlegar),
    }
  })

  // Órdenes de taller: una por producto Frisa con TODAS sus tallas (2026-11-11: Alfredo quiere
  // poder agregar tallas). Las que hay que pedir traen su cantidad; las demás en 0.
  // talleresPropuestos = los que tienen algo que pedir; talleresTodos = todos (para "otro producto").
  const porProducto = new Map()
  for (const f of filas) {
    if (f.se !== 'fabrica' || !f.liga) continue
    const k = f.liga.producto_frisa_id
    if (!porProducto.has(k)) porProducto.set(k, { producto_frisa_id: k, lineas: [], aPedir: 0 })
    const g = porProducto.get(k)
    g.lineas.push({ producto_id: f.producto.id, clave: f.producto.clave, talla: T(f.liga.talla), cantidad: Math.max(0, f.aPedir || 0), sugerido: Math.max(0, f.aPedir || 0) })
    g.aPedir += Math.max(0, f.aPedir || 0)
  }
  for (const g of porProducto.values()) g.lineas.sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla) || a.talla.localeCompare(b.talla))
  const compraPropuesta = filas.filter((f) => f.se === 'compra' && f.aPedir > 0)
    .map((f) => ({ producto_id: f.producto.id, clave: f.producto.clave, cantidad: f.aPedir }))

  return {
    filas,
    ordenes,
    talleresPropuestos: [...porProducto.values()].filter((g) => g.aPedir > 0),
    talleresTodos: [...porProducto.values()],
    compraPropuesta,
  }
}

function ordenTalla(t) {
  const i = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL'].indexOf(String(t).toUpperCase())
  if (i >= 0) return i
  const n = Number(String(t).match(/\d+/)?.[0])
  return Number.isFinite(n) ? 100 + n : 999
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
