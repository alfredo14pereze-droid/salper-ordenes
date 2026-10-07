// "Nuevo producto" de Inventario: las tallas se escriben a mano, como se
// dicen ("32, 34, 38", "28-48", "6 a 3XL"), y esto las convierte en tallas
// del catálogo.
//
// Un rango sigue la serie de siempre, no todo lo que exista en el catálogo:
// "6-3XL" = 6, 8, 10, 12, 14, XS, CH, M, L, XL, 2XL, 3XL (sin 16, sin TALL,
// sin 1(20)…). Fuera de esas series, un rango toma las tallas normales del
// catálogo que queden entre las dos.

const SERIE_PRENDA = ['00', '0', '1', '2', '4', '6', '8', '10', '12', '14', 'XS', 'CH', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
const SERIE_PANTALON = ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48']

// Otras formas de escribir la misma talla.
const ALIAS = { S: 'CH', XCH: 'XS', XXL: '2XL', XXXL: '3XL', G: 'L', XG: 'XL' }

function limpiar(texto) {
  const t = String(texto ?? '').trim().toUpperCase().replace(/^T[.\-\s]+(?=\S)/, '').replace(/\s+/g, ' ')
  if (/^\d+$/.test(t) && t !== '00') return String(Number(t)) // "02" → "2"
  return ALIAS[t] || t
}

function esVariante(nombre) {
  return /TALL/i.test(nombre) || /\(\d+\)/.test(nombre)
}

// Orden para una talla numérica que todavía no existe en el catálogo (mismos
// cortes que las ya sembradas: 0–20 → n×10; pantalón 28, 30… → 2000, 2010…).
export function ordenTallaNueva(nombre) {
  const n = Number(nombre)
  return n <= 20 ? n * 10 : 2000 + (n - 28) * 5
}

// Regresa { tallas: [talla del catálogo o { nueva: true, nombre, orden }], errores: [texto] }.
export function parsearTallas(texto, catalogo) {
  const porNombre = new Map(catalogo.map((t) => [t.nombre.toUpperCase(), t]))
  const elegidas = new Map() // nombre → talla
  const errores = []

  function agregar(nombre) {
    const t = porNombre.get(nombre)
    if (t) return elegidas.set(nombre, t)
    if (/^\d{1,2}$/.test(nombre)) return elegidas.set(nombre, { nueva: true, nombre, orden: ordenTallaNueva(nombre) })
    errores.push(`No conozco la talla "${nombre}".`)
  }

  const partes = String(texto ?? '')
    .replace(/\bT[.\-]\s*(?=[0-9A-Z])/gi, '') // "T.02", "T-04" → "02", "04"
    .replace(/\s+(a|al|hasta)\s+/gi, '-')
    .split(/[,;\n]+|\s+y\s+/i)
    .flatMap((p) => (p.includes('-') ? [p] : p.trim().split(/\s+(?!TALL)/i)))
    .map((p) => p.trim())
    .filter(Boolean)

  for (const parte of partes) {
    const extremos = parte.split('-').map(limpiar).filter(Boolean)
    if (extremos.length === 1) {
      agregar(extremos[0])
      continue
    }
    if (extremos.length !== 2) {
      errores.push(`No entendí "${parte}".`)
      continue
    }
    const [a, b] = extremos
    const serie = [SERIE_PRENDA, SERIE_PANTALON].find((s) => s.includes(a) && s.includes(b))
    if (serie) {
      const [i, j] = [serie.indexOf(a), serie.indexOf(b)].sort((x, y) => x - y)
      serie.slice(i, j + 1).forEach(agregar)
      continue
    }
    const ta = porNombre.get(a)
    const tb = porNombre.get(b)
    if (!ta || !tb) {
      errores.push(`No pude armar el rango "${parte}": escribe las tallas una por una.`)
      continue
    }
    const [min, max] = [ta.orden, tb.orden].sort((x, y) => x - y)
    catalogo
      .filter((t) => t.orden >= min && t.orden <= max && (!esVariante(t.nombre) || t.id === ta.id || t.id === tb.id))
      .forEach((t) => agregar(t.nombre.toUpperCase()))
  }

  return { tallas: [...elegidas.values()].sort((x, y) => x.orden - y.orden), errores }
}
