// V209 — Inventario ATR: utilidades puras para la carga inicial (leer CSV,
// adivinar columnas y ligar cada renglón con una bata del catálogo) y para
// ordenar tallas. Sin dependencias, probadas en atrCarga.test.js.

// 2026-11-23 (V217): tallas como en Microsip — S en vez de CH, y XS y 5XL.
export const TALLAS_ATR = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const ALIAS_TALLA = {
  xs: 'XS', extrachica: 'XS', xch: 'XS',
  s: 'S', ch: 'S', chica: 'S', chico: 'S', mediana: 'M', mediano: 'M', grande: 'L', g: 'L',
  extragrande: 'XL', xg: 'XL', xxl: '2XL', xxxl: '3XL', xxxxl: '4XL', xxxxxl: '5XL',
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
// Acepta el nombre del catálogo, (producto, color) en columnas o el nombre de
// Microsip ("BATA C/BOLSA ATR A.CIELO T-2XL").
export function emparejar(producto, color, productos) {
  const exacto = normalizar(`${producto} ${color}`)
  const directo = productos.find((p) => normalizar(p.nombre) === exacto || normalizar(p.nombre) === normalizar(producto))
  if (directo && (!color || normalizar(directo.color) === normalizar(color))) return directo
  const { bolsa, color: c } = leerDescripcionAtr(`${producto} ${color}`)
  const col = colorDelCatalogo(c, productos)
  if (bolsa === null || !col) return null
  return productos.find((p) => !!p.con_bolsa === bolsa && normalizar(p.color) === col) || null
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

// ---------------------------------------------------------------------
// Leer una descripción de bata de ATR. Cada planta de ATR usa sus propios
// números de parte y su propia redacción ("BATA AZUL CIELO TALLA GRANDE SIN
// BOLSAS", "batas azul cielo sin bolsas talla XL", "BATABLNCATALLACHICA…") y
// Microsip la abrevia ("BATA S/BOLSA ATR AZUL CIELO T-2XL", "A.CIELO",
// "V.SUPERVISOR", "GRIS"), así que la bata se reconoce SOLO por la
// descripción: color + talla + con o sin bolsa. Nunca por el número de parte.
// ---------------------------------------------------------------------
const PALABRAS = /(batas?|talla|bolsas?|sin|con)/g
const TALLA_TXT = /\b(?:talla|t)\s*-?\s*(extra\s*grande|extra\s*chica|chica|chico|mediana|mediano|grande|xxxxxl|xxxxl|xxxl|xxl|[2-5]\s*xl|xl|xs|xg|ch|m|l|s|g)\b/
const TALLA_SUELTA = /\b(extra\s*grande|xxxxxl|xxxxl|xxxl|xxl|[2-5]\s*xl|xl|xs|xg)\b/

function distancia(a, b) {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[m][n]
}

// { bolsa: true|false|null, talla: 'M'|''…, color: texto que quedó }
export function leerDescripcionAtr(texto) {
  let t = normalizar(texto)
    .replace(/\bc\s*\/\s*/g, ' con ').replace(/\bs\s*\/\s*/g, ' sin ')
    // Abreviaturas de Microsip: A.CIELO, A. MARINO, V.SUPERVISOR, V,GRASA
    .replace(/\ba\s*[.,]\s*/g, ' azul ').replace(/\bv\s*[.,]\s*/g, ' verde ')
  // Texto pegado (algunos PDF no traen espacios): separa las palabras clave.
  t = t.replace(PALABRAS, ' $1 ').replace(/\s+/g, ' ').trim()
  let bolsa = null
  const mb = t.match(/\b(con|sin)\s+bolsas?\b/)
  if (mb) bolsa = mb[1] === 'con'
  let talla = ''
  const mt = t.match(TALLA_TXT) || t.match(TALLA_SUELTA)
  if (mt) talla = normalizarTalla(mt[1])
  const color = t
    .replace(/\b(con|sin)\s+bolsas?\b/g, ' ')
    .replace(TALLA_TXT, ' ')
    .replace(TALLA_SUELTA, ' ')
    .replace(/\b(batas?|talla|de|color|pza|pzas|piezas?|atr)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { bolsa, talla, color }
}

// Color del catálogo más parecido (tolera errores de dedo: "blnca" → Blanca).
export function colorDelCatalogo(color, productos) {
  const c = normalizar(color).replace(/\s+/g, '')
  if (!c) return null
  const colores = [...new Set((productos || []).map((p) => normalizar(p.color)).filter(Boolean))]
  const exacto = colores.find((x) => x.replace(/\s+/g, '') === c)
  if (exacto) return exacto
  const tope = Math.max(1, Math.floor(c.length * 0.25))
  const cerca = colores
    .map((x) => ({ x, d: distancia(x.replace(/\s+/g, ''), c) }))
    .filter((r) => r.d <= tope)
    .sort((a, b) => a.d - b.d)
  if (!cerca.length) {
    // "GRIS" de Microsip = "Gris Rata": si es la primera palabra de UN solo color.
    const primera = colores.filter((x) => x.split(' ')[0] === normalizar(color))
    return primera.length === 1 ? primera[0] : null
  }
  if (cerca.length > 1 && cerca[1].d === cerca[0].d) return null // empate: que lo elija una persona
  return cerca[0].x
}
