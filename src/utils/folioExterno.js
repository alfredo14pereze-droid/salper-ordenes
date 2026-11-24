// V218 — "Folio externo" de las órdenes de taller de Frisa (orders.folio_externo):
// el folio de nuestro control interno de órdenes, texto libre, cualquier formato.

// Se guarda sin espacios al inicio ni al final; vacío = sin folio (null).
export function limpiarFolioExterno(texto) {
  const t = String(texto ?? '').trim()
  return t === '' ? null : t
}

// ¿El texto parece un folio de SALPER (IND-054, ind 54, FR020, sub-0012)? Regresa
// { prefijo, numero } o null. Sirve para avisar si el folio capturado ya es el de
// una orden de SALPER (no se bloquea el guardado).
export function leerFolioSalper(texto) {
  const m = String(texto ?? '').trim().match(/^([A-Za-z]{1,4})[\s\-_.#]*(\d{1,6})$/)
  if (!m) return null
  const numero = Number(m[2])
  if (!numero) return null
  return { prefijo: m[1].toUpperCase(), numero }
}

// Las formas en que puede estar guardado ese folio (FR-20, FR-020, FR-0020…),
// para buscarlo con un "in" exacto en orders.order_number.
export function variantesFolioSalper(cand) {
  if (!cand) return []
  const base = String(cand.numero)
  const out = new Set()
  for (let ancho = base.length; ancho <= 6; ancho++) out.add(`${cand.prefijo}-${base.padStart(ancho, '0')}`)
  return [...out]
}

export function esMismoFolioSalper(orderNumber, cand) {
  const m = String(orderNumber ?? '').match(/^([A-Za-z]+)-0*(\d+)$/)
  return !!(m && cand && m[1].toUpperCase() === cand.prefijo && Number(m[2]) === cand.numero)
}

// Búsqueda en el módulo Frisa: folio FR o folio externo (sin importar espacios,
// guiones ni mayúsculas).
const plano = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, '')
export function coincideFolioFrisa(order, texto) {
  const q = String(texto ?? '').trim().toLowerCase()
  if (!q) return true
  const qp = plano(q)
  return [order?.order_number, order?.folio_externo].some((c) => {
    const v = String(c ?? '').toLowerCase()
    return v !== '' && (v.includes(q) || (qp !== '' && plano(v).includes(qp)))
  })
}
