// V121 — Búsqueda flexible de Inventario (traspasos, entradas, pantalla
// principal). Corre en el navegador sobre el catálogo ya cargado: con
// unos cientos/miles de artículos es instantáneo y da resultados en cada
// tecla sin ir al servidor.
//
// Reglas:
//   - Lo escrito se parte en palabras (tokens); cada token debe coincidir
//     con el INICIO de alguna palabra del nombre o de un alias, en
//     cualquier orden ("po tri 12", "tri polo 12", "polo 12 tricio").
//   - Sin mayúsculas, acentos ni puntuación ("Pólo TRI" = "polo tri").
//   - "T.12" / "t12" se buscan como la talla 12.
//   - Un token numérico se compara EXACTO: `12` encuentra la talla 12 (o
//     un número completo del nombre, ej. "Gen 2032", "18 de marzo"), pero
//     nunca 120 ni nada que solo empiece con 12.
//   - Orden: primero lo que tiene existencia, luego la mejor coincidencia.

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function palabras(texto) {
  const n = normalizar(texto)
  return n ? n.split(' ') : []
}

// Tokens de lo que escribió el usuario. Quita el prefijo de talla "T."
// ("T.12", "t 12" pegado como "t12") para que quede solo el número.
export function tokensDeBusqueda(texto) {
  const sinPrefijo = String(texto ?? '').replace(/(^|\s)t\.\s*(?=\S)/gi, '$1')
  return palabras(sinPrefijo).map((t) => (/^t\d+$/.test(t) ? t.slice(1) : t))
}

// Índice de un artículo/modelo: { nombre: [...], talla: [...], alias: [...] }
// (arreglos de palabras ya normalizadas). Se arma una vez al cargar.
export function indexar({ nombre = [], talla = '', alias = [] }) {
  return {
    nombre: nombre.flatMap(palabras),
    talla: palabras(talla),
    alias: alias.flatMap(palabras),
  }
}

const ES_NUMERO = /^\d+$/

// Puntaje de un token contra un índice; 0 = no coincide.
function puntajeToken(token, idx) {
  if (ES_NUMERO.test(token)) {
    if (idx.talla.includes(token)) return 4
    if (idx.nombre.includes(token)) return 3
    if (idx.alias.includes(token)) return 2
    return 0
  }
  let mejor = 0
  for (const w of idx.talla) {
    if (w === token) mejor = Math.max(mejor, 4)
    else if (w.startsWith(token)) mejor = Math.max(mejor, 2)
  }
  for (const w of idx.nombre) {
    if (w === token) mejor = Math.max(mejor, 3)
    else if (w.startsWith(token)) mejor = Math.max(mejor, 2)
  }
  if (mejor) return mejor
  for (const w of idx.alias) {
    if (w === token) mejor = Math.max(mejor, 2)
    else if (w.startsWith(token)) mejor = Math.max(mejor, 1)
  }
  return mejor
}

// 0 si algún token no coincide; si no, la suma de puntajes.
export function puntaje(tokens, idx) {
  let total = 0
  for (const t of tokens) {
    const p = puntajeToken(t, idx)
    if (!p) return 0
    total += p
  }
  return total
}

// items: cualquier objeto con `busq` (ver indexar) y `nombre` (o
// `nombreBase`, el nombre sin talla, para desempatar antes que la talla).
// existencia(item) → número, para ordenar primero lo que sí hay.
export function buscar(items, texto, { existencia = () => 0, limite = 30 } = {}) {
  const tokens = tokensDeBusqueda(texto)
  if (tokens.length === 0) return []
  const hits = []
  for (const item of items) {
    const p = puntaje(tokens, item.busq)
    if (p) hits.push({ item, p, hay: existencia(item) > 0 ? 1 : 0 })
  }
  hits.sort(
    (a, b) =>
      b.hay - a.hay ||
      b.p - a.p ||
      (a.item.nombreBase ?? a.item.nombre).localeCompare(b.item.nombreBase ?? b.item.nombre, 'es') ||
      (a.item.tallaOrden ?? 0) - (b.item.tallaOrden ?? 0)
  )
  return hits.slice(0, limite).map((h) => h.item)
}
