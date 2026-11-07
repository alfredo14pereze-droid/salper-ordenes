// V191 — Cotizar desde una hoja de operaciones impresa (foto o PDF).
// La IA lee folio, operación y segundos de cada renglón; aquí se liga cada
// renglón con el catálogo (prod_operaciones) por FOLIO, que es único en todo
// el catálogo. El costo siempre usa los segundos del catálogo.

// Estados de un renglón:
//   ok            el folio existe y los segundos coinciden (o la hoja no los trae)
//   segundos      el folio existe pero la hoja trae otros segundos (se usa el catálogo)
//   inactiva      el folio existe pero ya no está activo en el catálogo (sí cuenta)
//   no_encontrado el folio no está en el catálogo (no cuenta)
//   sin_folio     no se leyó un folio (no cuenta)
//   repetido      el mismo folio ya salió en un renglón anterior (no cuenta)
export const ESTADOS_QUE_CUENTAN = new Set(['ok', 'segundos', 'inactiva'])

export function folioValido(v) {
  if (v === '' || v == null) return null
  const n = Number(String(v).trim())
  return Number.isInteger(n) && n >= 0 ? n : null
}

// leidas: [{ folio, operacion, segundos, parte }] (lo que leyó la IA o se
// agregó a mano). catalogo: todas las operaciones (activas e inactivas).
export function ligarHoja(leidas, catalogo) {
  const porFolio = new Map((catalogo || []).map((o) => [Number(o.folio), o]))
  const vistos = new Set()
  return (leidas || []).map((l, i) => {
    const folio = folioValido(l.folio)
    const base = { i, folio, leida: l, op: null }
    if (folio == null) return { ...base, estado: 'sin_folio' }
    const op = porFolio.get(folio)
    if (!op) return { ...base, estado: 'no_encontrado' }
    if (vistos.has(folio)) return { ...base, op, estado: 'repetido' }
    vistos.add(folio)
    if (!op.activa && op.activa !== undefined) return { ...base, op, estado: 'inactiva' }
    const segHoja = Number(l.segundos)
    if (l.segundos != null && l.segundos !== '' && Number.isFinite(segHoja) && segHoja !== Number(op.segundos)) {
      return { ...base, op, estado: 'segundos' }
    }
    return { ...base, op, estado: 'ok' }
  })
}

// Operaciones del catálogo que sí cuentan para el costo.
export function operacionesQueCuentan(renglones) {
  return renglones.filter((r) => ESTADOS_QUE_CUENTAN.has(r.estado)).map((r) => r.op)
}

export function resumenHoja(renglones) {
  const n = (e) => renglones.filter((r) => r.estado === e).length
  return {
    total: renglones.length,
    cuentan: renglones.filter((r) => ESTADOS_QUE_CUENTAN.has(r.estado)).length,
    ok: n('ok'),
    segundos: n('segundos'),
    inactiva: n('inactiva'),
    noCuentan: n('no_encontrado') + n('sin_folio') + n('repetido'),
  }
}

// La prenda con más operaciones (empate: la del folio más chico). Es la que
// se guarda como "prenda" de la cotización; igual que en la base (V191).
export function prendaPrincipal(ops) {
  const cuenta = new Map()
  for (const o of [...ops].sort((a, b) => a.folio - b.folio)) cuenta.set(o.prenda, (cuenta.get(o.prenda) || 0) + 1)
  let mejor = null
  for (const [p, c] of cuenta) if (mejor == null || c > cuenta.get(mejor)) mejor = p
  return mejor
}

// Una cotización guardada desde hoja (V191) trae la prenda en cada operación.
export function esCotizacionDeHoja(c) {
  return Array.isArray(c?.operaciones) && c.operaciones.length > 0 && c.operaciones.every((o) => typeof o.prenda === 'string')
}
