import { nombreFrisa } from './frisaColores.js'
import { nombreLisa } from './frisaLisas.js'

// 2026-11-12 — Movimientos de Frisa con su motivo (por qué se movió), como en el inventario normal.
// Bodega (frisa_inv_movimientos): inicial, entrega, ingreso_bodega (orden de taller o compra), ajuste.
// Playera lisa (frisa_lisa_movimientos): inicial, compra, consumo, devolucion, ajuste.
// grupo: 'entrega' | 'entrada' | 'ajuste' | 'inicial' (para filtrar).
export function motivoBodega(m) {
  const ref = String(m.referencia || '')
  if (m.tipo === 'inicial') return { grupo: 'inicial', motivo: 'Inventario inicial', detalle: ref }
  if (m.tipo === 'entrega') return { grupo: 'entrega', motivo: 'Entrega a Frisa', detalle: ref }
  if (m.tipo === 'ingreso_bodega') {
    if (m.compra_id || /^Compra/i.test(ref)) return { grupo: 'entrada', motivo: 'Compra recibida', detalle: ref }
    return { grupo: 'entrada', motivo: 'Orden de taller subida a bodega', detalle: ref }
  }
  if (m.tipo === 'ajuste') {
    if (/Microsip/i.test(ref)) return { grupo: 'ajuste', motivo: 'Ajuste por revisión Microsip', detalle: ref }
    if (/Conteo/i.test(ref)) return { grupo: 'ajuste', motivo: 'Ajuste por conteo', detalle: '' }
    return { grupo: 'ajuste', motivo: 'Ajuste', detalle: ref }
  }
  return { grupo: 'ajuste', motivo: m.tipo, detalle: ref }
}

export function motivoLisa(m) {
  const ref = String(m.referencia || '')
  const M = {
    inicial: ['inicial', 'Inventario inicial'],
    compra: ['entrada', 'Compra recibida'],
    consumo: ['entrega', 'Salida al taller (orden de taller)'],
    devolucion: ['entrada', 'Regreso al anaquel'],
    ajuste: ['ajuste', 'Ajuste por conteo'],
  }[m.tipo] || ['ajuste', m.tipo]
  return { grupo: M[0], motivo: M[1], detalle: ref }
}

// → [{ id, en, que: 'bodega'|'lisa', producto (para el color), nombre, cantidad, grupo, motivo, detalle, notas, quien }]
export function armarMovimientos({ movs = [], lisaMovs = [], productos = [], lisas = [] }) {
  const prod = new Map(productos.map((p) => [p.id, p]))
  const lisa = new Map(lisas.map((l) => [l.id, l]))
  const a = movs.map((m) => {
    const p = prod.get(m.producto_id)
    return { id: m.id, en: m.creado_en, que: 'bodega', producto: p || null, nombre: nombreFrisa(p?.nombre) || m.clave, cantidad: m.cantidad, ...motivoBodega(m), notas: m.notas || '', quien: m.creado_por_nombre || '' }
  })
  const b = lisaMovs.map((m) => {
    const l = lisa.get(m.lisa_id)
    return { id: m.id, en: m.creado_en, que: 'lisa', producto: null, nombre: l ? nombreLisa(l).toUpperCase() : 'PLAYERA LISA', cantidad: m.cantidad, ...motivoLisa(m), notas: m.notas || '', quien: m.creado_por_nombre || '' }
  })
  return [...a, ...b].sort((x, y) => String(y.en).localeCompare(String(x.en)))
}
