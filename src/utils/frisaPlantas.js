// V189 — Frisa plantas: stock en cada planta = remisiones − facturas.
// Lee el reporte de Microsip "Diarios del inventario" igual que
// salper-frisa/scripts/frisa_stock.py (leer_hoja): por hoja, renglón de
// documento (fecha, folio, planta, orden, total) y debajo sus artículos
// (descripción, unidades); se saltan encabezados y direcciones.

import { nombreFrisa } from './frisaColores.js'

const colapsar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const norm = (s) => colapsar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const RE_DIRECCION = /C\.?\s*P\.?\s*\d{5}/

// Excel guarda las fechas como número de días desde 1899-12-30.
export function fechaExcel(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// 'remision' | 'factura' | null, por el nombre de la hoja o su línea "Concepto:".
export function tipoDeHoja(nombre, filas) {
  const n = norm(nombre)
  if (n === 'ENTREGAS') return 'remision'
  if (n === 'FACTURADO') return 'factura'
  for (const f of (filas || []).slice(0, 10)) {
    const t = norm(f?.[0])
    if (t.startsWith('CONCEPTO:')) {
      if (t.includes('REMISION')) return 'remision'
      if (t.includes('VENTA') || t.includes('FACTURA')) return 'factura'
    }
  }
  return null
}

// hojas: [{nombre, filas}] → { docs: [{tipo, folio, fecha, planta, orden, total, lineas:[{descripcion, cantidad}]}], avisos, hojas }
export function leerDiarios(hojas) {
  const docs = []
  const avisos = []
  const usadas = []
  for (const h of hojas || []) {
    const tipo = tipoDeHoja(h.nombre, h.filas)
    if (!tipo) continue
    usadas.push({ nombre: h.nombre, tipo })
    let vistoEncabezado = false
    let actual = null
    h.filas.forEach((fila, i) => {
      const [a, b, c, d, e, f] = [0, 1, 2, 3, 4, 5].map((k) => fila?.[k] ?? null)
      if ([a, b, c, d, e, f].every((v) => v == null || String(v).trim() === '')) return
      if (norm(a) === 'FECHA' || norm(b) === 'FOLIO') { vistoEncabezado = true; return }
      if (!vistoEncabezado) return
      const fecha = fechaExcel(a)
      if (fecha) {
        actual = { tipo, folio: colapsar(b), fecha, planta: norm(c), orden: colapsar(d), total: typeof f === 'number' ? f : Number(f) || null, lineas: [], hoja: h.nombre, renglon: i + 1 }
        docs.push(actual)
        return
      }
      if (a == null && b == null && c == null && e != null) {
        if (f == null && RE_DIRECCION.test(String(e))) return
        if (!actual) { avisos.push(`${h.nombre} renglón ${i + 1}: artículo antes de cualquier documento.`); return }
        actual.lineas.push({ descripcion: colapsar(e), cantidad: typeof f === 'number' ? f : Number(f) || 0 })
        return
      }
      avisos.push(`${h.nombre} renglón ${i + 1}: no se reconoce (${[a, b, c, d, e, f].filter((x) => x != null).join(' · ')}).`)
    })
  }
  for (const d of docs) {
    const suma = d.lineas.reduce((t, l) => t + l.cantidad, 0)
    if (d.total != null && suma !== d.total) avisos.push(`Folio ${d.folio}: el total dice ${d.total} y los artículos suman ${suma}.`)
  }
  return { docs, avisos, hojas: usadas }
}

// Liga cada artículo con su clave por el nombre (sin acentos ni espacios de más).
export function ligarDocs(docs, productos) {
  const porNombre = new Map(productos.map((p) => [norm(p.nombre), p]))
  const sinClave = new Map()
  const ligados = docs.map((d) => ({
    ...d,
    lineas: d.lineas.map((l) => {
      const p = porNombre.get(norm(l.descripcion))
      if (!p) sinClave.set(norm(l.descripcion), (sinClave.get(norm(l.descripcion)) || 0) + l.cantidad)
      return { ...l, producto: p || null }
    }),
  }))
  return { docs: ligados, sinClave: [...sinClave.entries()].map(([descripcion, piezas]) => ({ descripcion, piezas })) }
}

// Separa folios ya contados de los nuevos. folios: [{tipo, folio}]
export function separarNuevos(docs, folios) {
  const ya = new Set((folios || []).map((f) => `${f.tipo}|${norm(f.folio)}`))
  const vistos = new Set()
  const nuevos = []
  const repetidos = []
  for (const d of docs) {
    const k = `${d.tipo}|${norm(d.folio)}`
    if (ya.has(k) || vistos.has(k)) repetidos.push(d)
    else { nuevos.push(d); vistos.add(k) }
  }
  return { nuevos, repetidos }
}

// Prenda (nombre sin talla) y talla de una clave, como el resumen de salper-frisa.
const ORDEN_TALLAS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
export function prendaYTalla(nombre) {
  let resto = colapsar(nombre).toUpperCase()
  let largo = ''
  const ml = resto.match(/\bLARGO\s+(\d+)\b/)
  if (ml) { largo = ` (L${ml[1]})`; resto = resto.replace(ml[0], '') }
  let talla = 'Única'
  const mn = resto.match(/\bTALLA\s+(\d+)\b/) || resto.match(/\bT-([0-9A-Z]+)\b/)
  if (mn) { talla = mn[1]; resto = resto.replace(mn[0], '') }
  return { prenda: nombreFrisa(colapsar(resto)), talla: talla + largo }
}
const ordenTalla = (t) => {
  const base = t.replace(/\s*\(.*\)$/, '')
  if (/^\d+$/.test(base)) return 100 + Number(base) + (t.includes('(') ? 0.5 : 0)
  const i = ORDEN_TALLAS.indexOf(base)
  return i >= 0 ? i : 99
}

// movs: frisa_pl_movimientos; plantas; productos → resumen por planta, por clave y por prenda/talla.
export function calcularPlantas(movs, plantas, productos) {
  const prod = new Map(productos.map((p) => [p.id, p]))
  const plantasOrd = [...plantas].sort((a, b) => a.orden - b.orden)
  const porPlanta = new Map(plantasOrd.map((p) => [p.id, { planta: p, remitido: 0, facturado: 0, ajuste: 0, stock: 0 }]))
  const celda = new Map() // `${producto}|${planta}` → {remitido, facturado, stock}
  for (const m of movs) {
    const pp = porPlanta.get(m.planta_id)
    if (!pp) continue
    const k = `${m.producto_id}|${m.planta_id}`
    if (!celda.has(k)) celda.set(k, { remitido: 0, facturado: 0, stock: 0 })
    const c = celda.get(k)
    if (m.tipo === 'remision') { pp.remitido += m.cantidad; c.remitido += m.cantidad }
    else if (m.tipo === 'factura') { pp.facturado -= m.cantidad; c.facturado -= m.cantidad }
    else pp.ajuste += m.cantidad
    pp.stock += m.cantidad
    c.stock += m.cantidad
  }
  const claves = [...new Set([...celda.keys()].map((k) => k.split('|')[0]))].map((id) => {
    const p = prod.get(id) || { id, clave: '?', nombre: '' }
    const { prenda, talla } = prendaYTalla(p.nombre)
    const plantasC = plantasOrd.map((pl) => celda.get(`${id}|${pl.id}`) || { remitido: 0, facturado: 0, stock: 0 })
    return {
      producto: p, prenda, talla, plantas: plantasC,
      remitido: plantasC.reduce((t, x) => t + x.remitido, 0), facturado: plantasC.reduce((t, x) => t + x.facturado, 0), stock: plantasC.reduce((t, x) => t + x.stock, 0),
    }
  }).sort((a, b) => a.prenda.localeCompare(b.prenda, 'es') || ordenTalla(a.talla) - ordenTalla(b.talla))
  const prendas = []
  for (const c of claves) {
    let g = prendas.find((x) => x.prenda === c.prenda)
    if (!g) { g = { prenda: c.prenda, filas: [], stock: 0, remitido: 0, facturado: 0 }; prendas.push(g) }
    g.filas.push(c)
    g.stock += c.stock; g.remitido += c.remitido; g.facturado += c.facturado
  }
  const totales = [...porPlanta.values()].reduce((t, p) => ({ remitido: t.remitido + p.remitido, facturado: t.facturado + p.facturado, stock: t.stock + p.stock }), { remitido: 0, facturado: 0, stock: 0 })
  const negativos = []
  for (const c of claves) c.plantas.forEach((x, i) => { if (x.stock < 0) negativos.push({ planta: plantasOrd[i], producto: c.producto, stock: x.stock }) })
  return { plantas: plantasOrd, porPlanta: [...porPlanta.values()], claves, prendas, totales, negativos }
}

// Lo que se manda a frisa_pl_importar.
export function docsParaImportar(docs) {
  return docs.map((d) => ({
    tipo: d.tipo, folio: d.folio, fecha: d.fecha, planta: d.planta, orden: d.orden || null,
    lineas: d.lineas.filter((l) => l.producto && l.cantidad > 0).map((l) => ({ producto_id: l.producto.id, descripcion: l.descripcion, cantidad: l.cantidad })),
  }))
}

// Planta de Microsip → planta de la página (o null si no existe).
export function plantaDe(nombreMicrosip, plantas) {
  const n = norm(nombreMicrosip)
  return plantas.find((p) => norm(p.nombre_microsip) === n) || null
}

// Resumen de lo que trae el archivo antes de subirlo.
export function resumenArchivo(nuevos, plantas) {
  const r = { remisiones: 0, facturas: 0, piezasRemitidas: 0, piezasFacturadas: 0, plantasDesconocidas: [], desde: null, hasta: null, validos: [] }
  const desconocidas = new Set()
  for (const d of nuevos) {
    if (!plantaDe(d.planta, plantas)) { desconocidas.add(d.planta || '(sin planta)'); continue }
    r.validos.push(d)
    const pz = d.lineas.filter((l) => l.producto).reduce((t, l) => t + l.cantidad, 0)
    if (d.tipo === 'remision') { r.remisiones++; r.piezasRemitidas += pz } else { r.facturas++; r.piezasFacturadas += pz }
    if (!r.desde || d.fecha < r.desde) r.desde = d.fecha
    if (!r.hasta || d.fecha > r.hasta) r.hasta = d.fecha
  }
  r.plantasDesconocidas = [...desconocidas]
  return r
}

// Reportes (mismo formato que utils/frisaReportes.js → CSV y PDF).
export function reportePlantasMatriz(calc) {
  return {
    titulo: 'Inventario en plantas Frisa',
    nota: 'Stock en cada planta = remisiones - facturas (Diarios del inventario de Microsip).',
    columnas: [{ titulo: 'Clave' }, { titulo: 'Prenda' }, { titulo: 'Talla' }, ...calc.plantas.map((p) => ({ titulo: p.nombre, num: true })), { titulo: 'Total', num: true }],
    filas: calc.claves.map((c) => [c.producto.clave, c.prenda, c.talla, ...c.plantas.map((x) => x.stock), c.stock]),
    colores: calc.claves.map((c) => c.producto),
    totales: { 'En plantas': calc.totales.stock, Remitido: calc.totales.remitido, Facturado: calc.totales.facturado },
  }
}

export function reportePlantasResumen(calc) {
  return {
    titulo: 'Plantas Frisa por planta',
    nota: 'Remitido y facturado acumulados; stock = remitido - facturado (+ ajustes).',
    columnas: [{ titulo: 'Planta' }, { titulo: 'Remitido', num: true }, { titulo: 'Facturado', num: true }, { titulo: 'Ajustes', num: true }, { titulo: 'En planta', num: true }],
    filas: calc.porPlanta.map((p) => [p.planta.nombre, p.remitido, p.facturado, p.ajuste, p.stock]),
    totales: { 'En plantas': calc.totales.stock },
  }
}
