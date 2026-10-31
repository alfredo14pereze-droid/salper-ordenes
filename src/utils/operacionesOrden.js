import { agruparPorParte } from './imprimirOperaciones.js'
// Operaciones de producción en la orden: cada prenda de la orden puede llevar
// `prenda_operaciones` (el nombre de una prenda del catálogo de operaciones,
// p. ej. "CHAMARRA DOMUS"). Con eso el PDF interno agrega la hoja de
// operaciones de esa prenda.
//   · prenda_operaciones = 'CHAMARRA DOMUS' → esa.
//   · prenda_operaciones = ''               → a propósito ninguna.
//   · sin la clave (orden vieja o sin tocar) → la sugerida por prenda + cliente.

const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const palabras = (s) => normalizar(s).split(/[^A-Z0-9]+/).filter(Boolean)

// Palabras del cliente que no dicen nada ("Colegio Domus" → DOMUS).
const GENERICAS = new Set(['COLEGIO', 'INSTITUTO', 'ESCUELA', 'LICEO', 'PREPARATORIA', 'PRIMARIA', 'SECUNDARIA', 'KINDER', 'CENTRO', 'EDUCATIVO', 'ESCOLAR', 'DEL', 'DE', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'SA', 'CV'])

// La prenda del catálogo que corresponde, o null si no hay una sola clara:
// tiene que traer la primera palabra de la prenda de la orden (CHAMARRA) y
// alguna palabra del cliente (DOMUS).
export function sugerirPrendaOperaciones(garment, clienteNombre, prendas) {
  const tipo = palabras(garment)[0]
  if (!tipo || tipo.length < 3) return null
  const delCliente = palabras(clienteNombre).filter((p) => p.length >= 3 && !GENERICAS.has(p))
  if (delCliente.length === 0) return null
  const candidatas = (prendas || []).filter((p) => {
    const w = palabras(p)
    return w.includes(tipo) && delCliente.some((c) => w.includes(c))
  })
  return candidatas.length === 1 ? candidatas[0] : null
}

// Lo que vale para una prenda: lo escogido, o la sugerencia si nunca se tocó.
export function prendaOperacionesDe(item, clienteNombre, prendas) {
  if (item && typeof item.prenda_operaciones === 'string') return item.prenda_operaciones
  return sugerirPrendaOperaciones(item?.garment, clienteNombre, prendas) || ''
}

// Al guardar: deja escrita la prenda que vale en cada prenda de la orden.
// Sin catálogo cargado (null) no toca nada.
export function fijarPrendasOperaciones(items, clienteNombre, prendas) {
  if (!prendas) return items
  return items.map((it) => ({ ...it, prenda_operaciones: prendaOperacionesDe(it, clienteNombre, prendas) }))
}

// Para el PDF interno: una hoja por prenda de la orden que tenga operaciones.
// `ops` = operaciones activas de esas prendas del catálogo.
export function armarHojasOperaciones(items, clienteNombre, prendas, ops) {
  const porPrenda = new Map()
  for (const o of ops || []) {
    if (!porPrenda.has(o.prenda)) porPrenda.set(o.prenda, [])
    porPrenda.get(o.prenda).push(o)
  }
  const hojas = []
  for (const it of items || []) {
    const prenda = prendaOperacionesDe(it, clienteNombre, prendas)
    const lista = prenda && porPrenda.get(prenda)
    if (!lista || lista.length === 0) continue
    const piezas = (it.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
    hojas.push({ prenda, garment: it.garment || '', piezas, grupos: agruparPorParte(lista) })
  }
  return hojas
}
