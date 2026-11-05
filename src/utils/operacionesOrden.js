import { agruparPorParte, marcarOtraPrenda } from './imprimirOperaciones.js'
// Operaciones de producción en la orden: cada prenda de la orden puede llevar
// `prenda_operaciones`, con lo que el PDF interno agrega su hoja de operaciones:
//   · 'CHAMARRA DOMUS'  → todas las operaciones activas de esa prenda del catálogo (V174).
//   · 'hoja:<id>'       → una hoja guardada en «Hojas impresas», con su título (V175).
//   · ''                → a propósito ninguna.
//   · sin la clave (orden vieja o sin tocar) → la sugerida por prenda + cliente.
//
// "Opciones" = lo que se puede escoger: [{ valor, etiqueta }]. Una prenda del
// catálogo es { valor: nombre, etiqueta: nombre }; una hoja es
// { valor: 'hoja:<id>', etiqueta: título }. También se aceptan nombres sueltos.

export const PREFIJO_HOJA = 'hoja:'
export const esHoja = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO_HOJA)
export const idDeHoja = (valor) => (esHoja(valor) ? valor.slice(PREFIJO_HOJA.length) : null)

// Prendas del catálogo + hojas guardadas → opciones.
export function armarOpciones(prendas, hojas) {
  return [
    ...(prendas || []).map((p) => ({ valor: p, etiqueta: p })),
    ...(hojas || []).map((h) => ({ valor: PREFIJO_HOJA + h.id, etiqueta: h.titulo })),
  ]
}

const comoOpciones = (lista) => (lista || []).map((o) => (typeof o === 'string' ? { valor: o, etiqueta: o } : o))

const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const palabras = (s) => normalizar(s).split(/[^A-Z0-9]+/).filter(Boolean)

// Palabras del cliente que no dicen nada ("Colegio Domus" → DOMUS).
const GENERICAS = new Set(['COLEGIO', 'INSTITUTO', 'ESCUELA', 'LICEO', 'PREPARATORIA', 'PRIMARIA', 'SECUNDARIA', 'KINDER', 'CENTRO', 'EDUCATIVO', 'ESCOLAR', 'DEL', 'DE', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'SA', 'CV'])

// El valor de la opción que corresponde, o null si no hay una sola clara: su
// nombre tiene que traer la primera palabra de la prenda de la orden
// (CHAMARRA) y alguna palabra del cliente (DOMUS).
export function sugerirPrendaOperaciones(garment, clienteNombre, opciones) {
  const tipo = palabras(garment)[0]
  if (!tipo || tipo.length < 3) return null
  const delCliente = palabras(clienteNombre).filter((p) => p.length >= 3 && !GENERICAS.has(p))
  if (delCliente.length === 0) return null
  const candidatas = comoOpciones(opciones).filter((o) => {
    const w = palabras(o.etiqueta)
    return w.includes(tipo) && delCliente.some((c) => w.includes(c))
  })
  return candidatas.length === 1 ? candidatas[0].valor : null
}

// Lo que vale para una prenda: lo escogido, o la sugerencia si nunca se tocó.
export function prendaOperacionesDe(item, clienteNombre, opciones) {
  if (item && typeof item.prenda_operaciones === 'string') return item.prenda_operaciones
  return sugerirPrendaOperaciones(item?.garment, clienteNombre, opciones) || ''
}

// Al guardar: deja escrito lo que vale en cada prenda de la orden.
// Sin opciones cargadas (null) no toca nada.
export function fijarPrendasOperaciones(items, clienteNombre, opciones) {
  if (!opciones) return items
  return items.map((it) => ({ ...it, prenda_operaciones: prendaOperacionesDe(it, clienteNombre, opciones) }))
}

// Para el PDF interno: una hoja por prenda de la orden que tenga operaciones.
// `ops` = operaciones activas de las prendas del catálogo escogidas;
// `hojas` = hojas guardadas escogidas ({ id, titulo, prenda, operaciones }).
export function armarHojasOperaciones(items, clienteNombre, opciones, ops, hojas = []) {
  const porPrenda = new Map()
  for (const o of ops || []) {
    if (!porPrenda.has(o.prenda)) porPrenda.set(o.prenda, [])
    porPrenda.get(o.prenda).push(o)
  }
  const porHoja = new Map((hojas || []).map((h) => [h.id, h]))
  const resultado = []
  for (const it of items || []) {
    const valor = prendaOperacionesDe(it, clienteNombre, opciones)
    if (!valor) continue
    let titulo = valor
    let lista = null
    if (esHoja(valor)) {
      const h = porHoja.get(idDeHoja(valor))
      if (h) {
        titulo = h.titulo
        lista = marcarOtraPrenda(h.operaciones, h.prenda) // V182: puede traer operaciones de otra prenda
      }
    } else {
      lista = porPrenda.get(valor)
    }
    if (!lista || lista.length === 0) continue
    const piezas = (it.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
    resultado.push({ prenda: titulo, garment: it.garment || '', piezas, grupos: agruparPorParte(lista) })
  }
  return resultado
}
