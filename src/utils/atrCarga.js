// V209 — Inventario ATR: utilidades puras para la carga inicial (leer CSV,
// adivinar columnas y ligar cada renglón con una bata del catálogo) y para
// ordenar tallas. Sin dependencias, probadas en atrCarga.test.js.

export const TALLAS_ATR = ['CH', 'M', 'L', 'XL', '2XL', '3XL', '4XL']

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS_TALLA = {
  s: 'CH', chica: 'CH', chico: 'CH', ch: 'CH', mediana: 'M', mediano: 'M', grande: 'L', g: 'L',
  extragrande: 'XL', xg: 'XL', xxl: '2XL', xxxl: '3XL', xxxxl: '4XL',
}

export function normalizarTalla(t) {
  const n = normalizar(t).replace(/[\s.-]/g, '')
  if (ALIAS_TALLA[n]) return ALIAS_TALLA[n]
  return n.toUpperCase()
}

export function ordenTalla(t) {
  const i = TALLAS_ATR.indexOf(t)
  return i < 0 ? 100 : i
}

// CSV con coma, punto y coma o tabulador; respeta comillas.
export function leerCsv(texto) {
  const limpio = String(texto ?? '').replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/)[0] || ''
  const sep = [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0]
  const filas = []
  let fila = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++ }
      else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(celda); celda = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda); filas.push(fila); fila = []; celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  return filas.filter((f) => f.some((x) => String(x).trim() !== ''))
}

// Adivina qué columna es cada cosa por su encabezado. Regresa índices o -1.
export function adivinarColumnas(encabezados) {
  const n = encabezados.map(normalizar)
  const busca = (...claves) => n.findIndex((h) => claves.some((k) => h === k || h.includes(k)))
  return {
    producto: busca('producto', 'articulo', 'descripcion', 'prenda', 'modelo'),
    talla: busca('talla', 'size'),
    cantidad: busca('cantidad', 'existencia', 'piezas', 'pzas', 'cant', 'stock'),
    color: busca('color'),
  }
}

// Saca "con/sin bolsa" y el color de un texto como "Bata con bolsa Blanca",
// "BATA BLANCA C/BOLSA" o (producto, color) en columnas separadas.
export function leerBata(producto, color = '') {
  const t = normalizar(`${producto} ${color}`).replace(/c\/\s*/g, 'con ').replace(/s\/\s*/g, 'sin ')
  let bolsa = null
  if (/\bsin bolsa\b/.test(t)) bolsa = false
  else if (/\bcon bolsa\b/.test(t)) bolsa = true
  const resto = t
    .replace(/\b(con|sin) bolsa\b/g, ' ')
    .replace(/\bbatas?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { bolsa, color: resto }
}

// Liga un renglón con un producto de ATR. productos: [{id, nombre, color, con_bolsa}]
export function emparejar(producto, color, productos) {
  const exacto = normalizar(`${producto} ${color}`)
  const directo = productos.find((p) => normalizar(p.nombre) === exacto || normalizar(p.nombre) === normalizar(producto))
  if (directo && (!color || normalizar(directo.color) === normalizar(color))) return directo
  const { bolsa, color: c } = leerBata(producto, color)
  if (bolsa === null || !c) return null
  return productos.find((p) => p.con_bolsa === bolsa && normalizar(p.color) === c) || null
}

// Convierte las filas leídas (con encabezado) en renglones para la vista previa.
// cols: {producto, talla, cantidad, color}. Cada renglón: {n, producto, color,
// talla, cantidad, error, match}
export function armarRenglones(filas, cols, productos) {
  return filas.slice(1).map((f, i) => {
    const producto = String(f[cols.producto] ?? '').trim()
    const color = cols.color >= 0 ? String(f[cols.color] ?? '').trim() : ''
    const talla = normalizarTalla(f[cols.talla])
    const crudo = String(f[cols.cantidad] ?? '').trim()
    const cantidad = /^\d+$/.test(crudo) ? Number(crudo) : typeof f[cols.cantidad] === 'number' ? f[cols.cantidad] : NaN
    let error = null
    if (!producto) error = 'Sin producto'
    else if (!talla) error = 'Sin talla'
    else if (!Number.isInteger(cantidad) || cantidad < 0) error = 'Cantidad inválida'
    return {
      n: i + 2,
      producto,
      color,
      talla,
      cantidad: Number.isInteger(cantidad) ? cantidad : null,
      error,
      match: error ? null : emparejar(producto, color, productos),
    }
  })
}
