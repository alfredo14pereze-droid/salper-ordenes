// V70 — lógica pura del dashboard de producción y de folios por centena.
// Sin dependencias de React/Supabase para poder probarla sola.

// ---------- Dashboard: estadísticas por operadora ----------
export const UMBRAL_CAMBIO_PCT = 10 // ±10% contra su promedio de las 4 semanas anteriores

// rows: filas de prod_historial_valores. Regresa semanas de la más nueva a la más vieja.
export function agruparSemanas(rows) {
  const mapa = new Map()
  for (const r of rows) {
    if (!mapa.has(r.semana_id)) {
      mapa.set(r.semana_id, {
        id: r.semana_id,
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        estado: r.estado,
        importada: r.importada,
        valores: new Map(),
      })
    }
    mapa.get(r.semana_id).valores.set(r.operadora_id, Number(r.valor) || 0)
  }
  return [...mapa.values()].sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1))
}

export function clasificar(cambioPct) {
  if (cambioPct == null) return 'Sin base'
  if (cambioPct >= UMBRAL_CAMBIO_PCT) return 'Arriba de su promedio'
  if (cambioPct <= -UMBRAL_CAMBIO_PCT) return 'Abajo de su promedio'
  return 'En su promedio'
}

// semanas: salida de agruparSemanas; idx: posición de la semana "actual" en ese arreglo.
export function estadisticasOperadora(semanas, operadoraId, idx) {
  const val = (s) => s?.valores.get(operadoraId) ?? 0
  const actual = val(semanas[idx])
  const anterior = semanas[idx + 1] ? val(semanas[idx + 1]) : null
  const previas = semanas.slice(idx + 1, idx + 5)
  const promedio4 = previas.length ? previas.reduce((s, w) => s + val(w), 0) / previas.length : null
  const cambioPct = promedio4 && promedio4 > 0 ? ((actual - promedio4) / promedio4) * 100 : null
  let mejor = null
  let conDatos = 0
  for (const w of semanas.slice(idx)) {
    const v = val(w)
    if (v > 0) conDatos += 1
    if (!mejor || v > mejor.valor) mejor = { valor: v, fecha_fin: w.fecha_fin }
  }
  return { actual, anterior, promedio4, cambioPct, mejor, conDatos, clasificacion: clasificar(cambioPct) }
}

// Últimas n semanas (de la más vieja a la más nueva) hasta la semana idx, para la gráfica.
export function serieOperadora(semanas, operadoraId, idx, n = 8) {
  return semanas
    .slice(idx, idx + n)
    .reverse()
    .map((w) => ({ fecha_fin: w.fecha_fin, valor: w.valores.get(operadoraId) ?? 0 }))
}

// ---------- Folios de operación por centena ----------
export const centena = (folio) => Math.floor(folio / 100)

// Centenas que usa una prenda (ej. "PLAYERA" y "CAMISOLA" comparten la 4).
export function centenasDePrenda(ops, prenda) {
  return [...new Set(ops.filter((o) => o.prenda === prenda).map((o) => centena(o.folio)))].sort((a, b) => a - b)
}

// Siguiente folio libre de una prenda existente: máximo folio de esa prenda + 1, saltando los que ya
// use CUALQUIER prenda (así no choca con otra prenda que comparte la centena).
export function sugerirFolioPrendaExistente(ops, prenda) {
  const propios = ops.filter((o) => o.prenda === prenda)
  if (propios.length === 0) return null
  const usados = new Set(ops.map((o) => o.folio))
  const centenas = centenasDePrenda(ops, prenda)
  let folio = Math.max(...propios.map((o) => o.folio)) + 1
  while (usados.has(folio)) folio += 1
  return { folio, fueraDeCentena: !centenas.includes(centena(folio)), centenas }
}

// Prenda nueva: primera centena completamente libre (hoy 1300).
export function sugerirCentenaNueva(ops) {
  const usadas = new Set(ops.map((o) => centena(o.folio)))
  let c = 0
  while (usadas.has(c)) c += 1
  return { folio: c * 100, centena: c }
}

export const MIN_LIBRES_AVISO = 10

// Estado de cada centena: cuántos folios usados/libres y qué prendas la comparten.
export function resumenCentenas(ops) {
  const mapa = new Map()
  for (const o of ops) {
    const c = centena(o.folio)
    if (!mapa.has(c)) mapa.set(c, { centena: c, usados: 0, prendas: new Set() })
    const x = mapa.get(c)
    x.usados += 1
    x.prendas.add(o.prenda)
  }
  return [...mapa.values()]
    .map((x) => ({ centena: x.centena, usados: x.usados, libres: 100 - x.usados, prendas: [...x.prendas].sort(), pocos: 100 - x.usados < MIN_LIBRES_AVISO }))
    .sort((a, b) => a.centena - b.centena)
}

// Validaciones al dar de alta: existe / fuera de la centena de la prenda / quedan pocos folios libres.
export function validarFolioNuevo(ops, folio, prenda) {
  const usados = new Set(ops.map((o) => o.folio))
  const existe = usados.has(folio)
  const centenas = prenda && ops.some((o) => o.prenda === prenda) ? centenasDePrenda(ops, prenda) : null
  const fuera = centenas ? !centenas.includes(centena(folio)) : false
  const usadosCentena = ops.filter((o) => centena(o.folio) === centena(folio)).length
  const librasTras = 100 - usadosCentena - (existe ? 0 : 1)
  return { existe, fuera, centenas, libresTras: librasTras, pocosLibres: librasTras < MIN_LIBRES_AVISO }
}
