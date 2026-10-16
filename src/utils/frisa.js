import { PROCESOS_FRISA_OPTIONS, TIPO_FRISA } from '../lib/constants.js'

// V155 — órdenes de Frisa: el cliente es "Frisa" (sin cliente del catálogo),
// sin precio, y cada orden es UN producto del catálogo Frisa con su
// secuencia de procesos en el orden guardado. Ver schema_v155_frisa_productos.sql.
export const esOrdenFrisa = (orderTypeKey) => orderTypeKey === TIPO_FRISA

export const ORIGENES_FRISA = [
  { key: 'confeccionada', label: 'Confeccionada' },
  { key: 'comprada', label: 'Comprada' },
]

export const procesoFrisa = (key) => PROCESOS_FRISA_OPTIONS.find((o) => o.key === key) || null
export const etiquetaProceso = (key) => procesoFrisa(key)?.label || key

// Escala de tallas de letra, de menor a mayor.
const ESCALA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL']
const normalizarTalla = (t) => {
  const s = String(t ?? '').trim().toUpperCase()
  return { XXL: '2XL', XXXL: '3XL', CH: 'S', G: 'L', EG: 'XL' }[s] || s
}

// "S-3XL" → ['S', 'M', 'L', 'XL', '2XL', '3XL']. También acepta listas
// ("S, M, L") y rangos de números pares ("28-40"). Si no se entiende, la
// talla tal cual.
export function expandirTallas(rango) {
  const texto = String(rango ?? '').trim()
  if (!texto) return []
  if (texto.includes(',')) return texto.split(',').map((t) => t.trim()).filter(Boolean)
  const m = texto.match(/^(.+?)\s*[-–]\s*(.+)$/)
  if (m) {
    const [desde, hasta] = [normalizarTalla(m[1]), normalizarTalla(m[2])]
    const i = ESCALA.indexOf(desde)
    const j = ESCALA.indexOf(hasta)
    if (i >= 0 && j >= i) return ESCALA.slice(i, j + 1)
    const [a, b] = [Number(desde), Number(hasta)]
    if (Number.isInteger(a) && Number.isInteger(b) && b >= a && b - a <= 60) {
      const paso = a % 2 === 0 && b % 2 === 0 ? 2 : 1
      const tallas = []
      for (let n = a; n <= b; n += paso) tallas.push(String(n))
      return tallas
    }
  }
  return [texto]
}

// Secuencia del producto ordenada: [{proceso, orden, impresiones, notas}].
export function secuenciaDeProducto(producto) {
  return [...(producto?.procesos || [])].sort((a, b) => a.orden - b.orden)
}

export const productoBordaFrisa = (producto) => secuenciaDeProducto(producto).some((p) => p.proceso === 'bordado')

// Bordado por orden: solo confeccionadas cuya secuencia no lo trae.
export const admiteBordadoPorOrden = (producto) => producto?.origen === 'confeccionada' && !productoBordaFrisa(producto)

// La secuencia que tendrá la orden: la del producto y, si se pidió bordado
// por orden (y aplica), bordado justo antes de terminado. Igual que
// create_order_frisa en el servidor.
export function procesosDeLaOrdenFrisa(producto, llevaBordado = false) {
  const base = secuenciaDeProducto(producto).map(({ proceso, impresiones, notas }) => ({ proceso, impresiones: impresiones ?? null, notas: notas ?? null }))
  if (llevaBordado && admiteBordadoPorOrden(producto)) {
    const i = base.findIndex((p) => p.proceso === 'terminado')
    base.splice(i >= 0 ? i : base.length, 0, { proceso: 'bordado', impresiones: null, notas: 'Bordado por orden' })
  }
  return base.map((p, i) => ({ ...p, orden: i + 1 }))
}

// "Descosido → Reflejante → Impresión ×2 → Terminado"
export function etiquetaSecuencia(procesos) {
  return [...(procesos || [])]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((p) => etiquetaProceso(p.proceso) + (p.impresiones ? ` ×${p.impresiones}` : ''))
    .join(' → ')
}

// La copia que guardó la orden al crearse (no cambia si el producto cambia).
export const secuenciaDeOrden = (order) => order?.frisa_producto?.procesos || []
export const codigoProductoFrisa = (order) => order?.frisa_producto?.codigo || ''

// La prenda de una orden Frisa: el producto y sus cantidades por talla, en
// el orden del rango del producto.
export function prendaFrisa(producto, cantidades = {}) {
  const tallas = expandirTallas(producto?.tallas_rango)
  const extra = Object.keys(cantidades).filter((t) => !tallas.includes(t))
  return {
    id: crypto.randomUUID(),
    garment: producto?.nombre || '',
    color: producto?.color || '',
    producto_frisa_id: producto?.id || '',
    sizes: [...tallas, ...extra]
      .filter((t) => Number(cantidades[t]) > 0)
      .map((t) => ({ talla: t, cantidad: Number(cantidades[t]) })),
  }
}

// Mensaje de error (o null) antes de guardar una orden Frisa.
export function validarOrdenFrisa({ producto, cantidades }) {
  if (!producto) return 'Elige el producto de Frisa.'
  if (!producto.activo) return `El producto ${producto.codigo} está dado de baja.`
  if (secuenciaDeProducto(producto).length === 0) return `El producto ${producto.codigo} no tiene procesos. Agrégalos en Catálogos → Frisa.`
  if (prendaFrisa(producto, cantidades).sizes.length === 0) return 'Captura al menos una talla con su cantidad.'
  return null
}

// Mensaje de error (o null) antes de guardar un producto del catálogo.
export function validarProductoFrisa({ codigo, nombre, origen, procesos }) {
  if (!String(codigo ?? '').trim()) return 'Falta el código.'
  if (!String(nombre ?? '').trim()) return 'Falta el nombre.'
  if (!ORIGENES_FRISA.some((o) => o.key === origen)) return 'Elige si es confeccionada o comprada.'
  if (!procesos?.length) return 'Agrega al menos un proceso.'
  const vistos = new Set()
  for (const p of procesos) {
    if (!procesoFrisa(p.proceso)) return `Proceso desconocido: ${p.proceso}.`
    if (vistos.has(p.proceso)) return `"${etiquetaProceso(p.proceso)}" está dos veces en la secuencia.`
    vistos.add(p.proceso)
    if (p.proceso === 'impresion' && p.impresiones !== '' && p.impresiones != null && !(Number(p.impresiones) >= 1)) {
      return 'El número de impresiones debe ser 1 o más.'
    }
  }
  return null
}

// Lo que se manda a guardar_producto_frisa: en el orden de la lista;
// impresiones solo en impresión.
export function procesosParaGuardar(procesos) {
  return (procesos || []).map((p) => ({
    proceso: p.proceso,
    impresiones: p.proceso === 'impresion' && Number(p.impresiones) >= 1 ? Number(p.impresiones) : null,
    notas: String(p.notas ?? '').trim() || null,
  }))
}

// Mover un paso de la lista (arriba = -1, abajo = +1).
export function moverProceso(procesos, i, delta) {
  const j = i + delta
  if (j < 0 || j >= procesos.length) return procesos
  const copia = [...procesos]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}
