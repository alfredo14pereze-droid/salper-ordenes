// V162 — Textos del % de mejora. El CÁLCULO vive en el servidor
// (prod_base_mejora → prod_calcular_premios / prod_revision_semana /
// prod_ranking_semana / prod_stats_destacados); aquí solo se arma lo que se ve,
// igual en Revisión, Estadísticas y los PDFs.
//
// Una fila trae: mejora_pct, valor_anterior y, desde V162, base_promedio,
// base_semanas y base_regla ('promedio' | 'semana_anterior'). Si la base todavía
// no tiene V162, base_regla viene vacío y se muestra como antes.

export const SEMANAS_BASE = 4

const fmtMoney = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export function esPromedio(f) {
  return f?.base_regla === 'promedio'
}

// Base contra la que se comparó (promedio o semana anterior), o null.
export function baseMejora(f) {
  const b = f?.base_promedio ?? f?.valor_anterior
  return b == null ? null : Number(b)
}

// "+24.7%" / "N/A" (regla nueva) / "Sin base" (regla vieja).
export function textoMejora(f) {
  if (f?.mejora_pct == null) return esPromedio(f) ? 'N/A' : 'Sin base'
  const n = Number(f.mejora_pct)
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

// "vs promedio de 4 semanas" / "vs promedio de 2 semanas" / "vs semana anterior".
export function textoVs(f) {
  if (!esPromedio(f)) return 'vs semana anterior'
  const n = f?.base_semanas
  if (!n) return 'sin semanas previas'
  return `vs promedio de ${n} ${n === 1 ? 'semana' : 'semanas'}`
}

// Etiqueta corta para quien tiene menos de 4 semanas de historial ("2 sem."), o null.
export function etiquetaPocasSemanas(f) {
  if (!esPromedio(f) || !f?.base_semanas || f.base_semanas >= SEMANAS_BASE) return null
  return `${f.base_semanas} sem.`
}

// Una línea completa: "+24.7% vs promedio de 4 semanas ($772.04)".
export function textoMejoraCompleto(f) {
  if (f?.mejora_pct == null) return esPromedio(f) ? 'N/A (sin semanas previas)' : 'sin base'
  const b = baseMejora(f)
  return `${textoMejora(f)} ${textoVs(f)}${b == null ? '' : ` (${fmtMoney(b)})`}`
}
