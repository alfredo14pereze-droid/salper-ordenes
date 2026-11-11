import { nombreFrisa } from './frisaColores.js'
// V187 — Frisa fase 4: playera lisa (sin procesos), por color + manga + talla.
// Ver supabase/schema_v187_frisa_playera_lisa.sql.
//   stock      = lo que hay en el anaquel (las lisas se descuentan al crear/ligar la orden de taller)
//   en proceso = piezas de órdenes de taller ligadas que no se han subido a bodega (informativo)
//   piden      = piezas de las órdenes de taller que propone el restock
//   a comprar  = piden − stock (mínimo 0)

import { tallasDeOrden } from './frisaRestock.js'

const T = (s) => String(s ?? '').trim().toUpperCase()
const C = (s) => String(s ?? '').trim().toLowerCase()

export const MANGA = { MC: 'manga corta', ML: 'manga larga' }

export function nombreLisa(l) {
  return `Playera lisa ${l.color} ${MANGA[l.manga] || l.manga} talla ${l.talla}`
}

// Para pintarla con su color (utils/frisaColores): tipo + color + nombre.
export const lisaComoProducto = (l) => ({ tipo: 'Playera', color: l.color, nombre: nombreLisa(l).toUpperCase(), insumo: true })

// productoLisa: [{producto_frisa_id, color, manga, proveedor}] ; lisas: [{id, color, manga, talla, stock}]
export function buscadorLisa(productoLisa, lisas) {
  const porProducto = new Map((productoLisa || []).map((p) => [p.producto_frisa_id, p]))
  const porClave = new Map((lisas || []).map((l) => [`${C(l.color)}|${l.manga}|${T(l.talla)}`, l]))
  return (productoFrisaId, talla) => {
    const pl = porProducto.get(productoFrisaId)
    return pl ? porClave.get(`${C(pl.color)}|${pl.manga}|${T(talla)}`) || null : null
  }
}

// "Con reflejante" / "Sin reflejante" según el nombre del producto (nombreFrisa: S/REF → LISA).
export function tipoReflejante(nombre) {
  const n = String(nombre || '').toUpperCase()
  if (/CON REFLEJANTE/.test(n)) return 'Con reflejante'
  if (/\bLISA\b|SIN REFLEJANTE/.test(n)) return 'Sin reflejante'
  return ''
}

export function calcularLisas({ lisas = [], productoLisa = [], productosFrisa = [], ligas = [], orders = [], talleresPropuestos = [] }) {
  const lisaDe = buscadorLisa(productoLisa, lisas)
  const comprometidas = new Map()
  const piden = new Map()
  const suma = (m, k, n) => m.set(k, (m.get(k) || 0) + n)
  // 2026-11-11: también por producto (con / sin reflejante) para ver a cuál va cada lisa.
  const enProcesoProd = new Map() // `${lisa_id}|${producto_frisa_id}` → piezas
  const pidenProd = new Map()
  const ordenPorId = new Map(orders.map((o) => [o.id, o]))

  for (const liga of ligas) {
    if (liga.ingresado_en) continue
    const o = ordenPorId.get(liga.order_id)
    if (!o || o.cancelled_at || o.eliminada_en) continue
    for (const { talla, cantidad } of tallasDeOrden(o)) {
      const l = lisaDe(o.producto_frisa_id, talla)
      if (l) { suma(comprometidas, l.id, cantidad); suma(enProcesoProd, `${l.id}|${o.producto_frisa_id}`, cantidad) }
    }
  }
  for (const g of talleresPropuestos) {
    for (const ln of g.lineas) {
      const l = lisaDe(g.producto_frisa_id, ln.talla)
      if (l) { suma(piden, l.id, Number(ln.cantidad) || 0); suma(pidenProd, `${l.id}|${g.producto_frisa_id}`, Number(ln.cantidad) || 0) }
    }
  }

  // Qué productos usan cada combinación color + manga, y su proveedor.
  const codigo = new Map(productosFrisa.map((p) => [p.id, nombreFrisa(p.nombre) || p.codigo]))
  const usos = new Map()
  for (const pl of productoLisa) {
    const k = `${C(pl.color)}|${pl.manga}`
    if (!usos.has(k)) usos.set(k, { productos: [], ids: [], proveedor: null })
    const u = usos.get(k)
    u.productos.push(codigo.get(pl.producto_frisa_id) || '')
    u.ids.push(pl.producto_frisa_id)
    if (!u.proveedor && pl.proveedor) u.proveedor = pl.proveedor
  }

  const ORDEN_TALLA = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
  const filas = lisas.map((l) => {
    const stock = Number(l.stock) || 0
    const comp = comprometidas.get(l.id) || 0
    const pid = piden.get(l.id) || 0
    const u = usos.get(`${C(l.color)}|${l.manga}`) || { productos: [], ids: [], proveedor: null }
    const porProducto = u.ids.map((id, i) => ({
      producto_frisa_id: id, nombre: u.productos[i], reflejante: tipoReflejante(u.productos[i]),
      enProceso: enProcesoProd.get(`${l.id}|${id}`) || 0, piden: pidenProd.get(`${l.id}|${id}`) || 0,
    }))
    return { lisa: l, stock, enProceso: comp, piden: pid, aComprar: Math.max(0, pid - stock), productos: u.productos, porProducto, proveedor: u.proveedor }
  }).sort((a, b) => a.lisa.color.localeCompare(b.lisa.color, 'es') || a.lisa.manga.localeCompare(b.lisa.manga)
    || ORDEN_TALLA.indexOf(T(a.lisa.talla)) - ORDEN_TALLA.indexOf(T(b.lisa.talla)))

  // Pedido sugerido por proveedor.
  const porProveedor = new Map()
  for (const f of filas) {
    if (f.aComprar <= 0) continue
    const k = f.proveedor || ''
    if (!porProveedor.has(k)) porProveedor.set(k, { proveedor: f.proveedor || '', lineas: [] })
    porProveedor.get(k).lineas.push({ lisa_id: f.lisa.id, lisa: f.lisa, cantidad: f.aComprar })
  }
  return { filas, pedidos: [...porProveedor.values()] }
}
