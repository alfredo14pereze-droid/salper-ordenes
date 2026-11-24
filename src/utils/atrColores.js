// Colores de las batas de ATR para la ayuda visual (muestra de color y texto
// sobre el color). Nombres como en el catálogo / Microsip. Sin dependencias.
import { normalizar } from './atrCarga.js'

const COLORES = {
  'azul cielo': '#8ecae6',
  'azul marino': '#1d2f5c',
  'azul rey': '#1f4fd1',
  blanca: '#ffffff',
  cafe: '#6f4e37',
  gris: '#8b8d91',
  'gris rata': '#8b8d91',
  guinda: '#7b1e3a',
  naranja: '#f47b20',
  negra: '#141414',
  'verde supervisor': '#1f7a5a',
  'verde jade': '#1f7a5a',
  amarillo: '#f5d22e',
  beige: '#e6d5b3',
  lila: '#c3a3dd',
  paja: '#e2c46e',
  'verde bandera': '#0b7a3b',
  'verde fosfo': '#9be22d',
  'verde grasa': '#5a6b2f',
}

export function colorHex(nombre) {
  return COLORES[normalizar(nombre)] || null
}

// Negro o blanco, lo que se lea mejor sobre ese color.
export function textoSobre(hex) {
  if (!hex) return '#1a1a1a'
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff'
}

// Colores distintos del catálogo, en orden alfabético, para el filtro.
export function coloresDe(productos) {
  const m = new Map()
  for (const p of productos || []) if (p.color && !m.has(normalizar(p.color))) m.set(normalizar(p.color), p.color)
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

// Inventario en matriz: una fila por bata, una columna por talla.
// productos: catálogo de ATR; existencias: filas de atr_existencias.
// Regresa { filas: [{producto, porTalla: {S: 5…}, total}], tallas } con las
// tallas que tienen algo o que son las de siempre (S–3XL).
export function matrizInventario(productos, existencias, tallasTodas) {
  const porProd = new Map()
  for (const e of existencias || []) {
    if (!porProd.has(e.producto_id)) porProd.set(e.producto_id, {})
    const t = porProd.get(e.producto_id)
    t[e.talla] = (t[e.talla] || 0) + e.existencia
  }
  const siempre = ['S', 'M', 'L', 'XL', '2XL', '3XL']
  const conAlgo = new Set()
  for (const t of porProd.values()) for (const [talla, v] of Object.entries(t)) if (v !== 0) conAlgo.add(talla)
  const extra = [...conAlgo].filter((t) => !tallasTodas.includes(t))
  const tallas = [...tallasTodas.filter((t) => siempre.includes(t) || conAlgo.has(t)), ...extra]
  const filas = (productos || []).map((p) => {
    const porTalla = porProd.get(p.id) || {}
    const total = Object.values(porTalla).reduce((s, v) => s + v, 0)
    return { producto: p, porTalla, total }
  })
  const orden = ordenBatas(productos)
  filas.sort((a, b) => orden(a.producto) - orden(b.producto))
  return { filas, tallas }
}

// Orden de las batas (pedido de Alfredo): por color, cada color con bolsa y
// luego sin bolsa. Primero los colores que hay en las dos versiones (Azul
// Cielo, Blanca, Café…), luego los que solo hay en una; dentro, alfabético.
// Regresa una función producto → posición. productos: [{id, color, con_bolsa}]
export function ordenBatas(productos) {
  const versiones = new Map()
  for (const p of productos || []) {
    const c = normalizar(p.color)
    if (!versiones.has(c)) versiones.set(c, new Set())
    versiones.get(c).add(!!p.con_bolsa)
  }
  const colores = [...versiones.keys()].sort((a, b) =>
    (versiones.get(b).size - versiones.get(a).size) || a.localeCompare(b, 'es'))
  const pos = new Map(colores.map((c, i) => [c, i]))
  return (p) => (pos.get(normalizar(p.color)) ?? 999) * 2 + (p.con_bolsa ? 0 : 1)
}
