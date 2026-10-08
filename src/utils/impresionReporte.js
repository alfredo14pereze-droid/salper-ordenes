// V146 — reporte de impresión de sublimación: largo del trazo (m) y tinta
// gastada por color (mL), como lo da el programa de impresión. El total se
// suma solo.
export const TINTAS = [
  { key: 'azul', label: 'Azul', columna: 'imp_tinta_azul_ml' },
  { key: 'magenta', label: 'Magenta', columna: 'imp_tinta_magenta_ml' },
  { key: 'amarillo', label: 'Amarillo', columna: 'imp_tinta_amarillo_ml' },
  { key: 'negro', label: 'Negro', columna: 'imp_tinta_negro_ml' },
]

// "2,653" o " 2.653 " → 2.653; vacío o texto → null.
export function numero(valor) {
  const s = String(valor ?? '').trim().replace(',', '.')
  if (s === '' || !/^\d*\.?\d+$|^\d+\.$/.test(s)) return null
  return Number(s)
}

// Suma en milésimas para no arrastrar decimales de más (0.1 + 0.2).
export function totalTinta(valores) {
  const milesimas = TINTAS.reduce((n, t) => n + Math.round((numero(valores?.[t.key]) || 0) * 1000), 0)
  return milesimas / 1000
}

export const formatMl = (n) => `${Number(n || 0).toFixed(3)} mL`

// Mensaje de error (o null) antes de marcar "Impresa".
export function validarReporteImpresion({ largo, ...tintas }) {
  const m = numero(largo)
  if (m == null || m <= 0) return 'Escribe el largo del trazo en metros.'
  for (const t of TINTAS) {
    if (numero(tintas[t.key]) == null) return `Escribe la tinta de ${t.label.toLowerCase()} (pon 0 si no se usó).`
  }
  return null
}

// Lo que ya quedó guardado en la fila de la etapa (o null si no hay reporte).
export function reporteDeEtapa(etapa) {
  if (etapa?.imp_largo_m == null) return null
  const tintas = Object.fromEntries(TINTAS.map((t) => [t.key, Number(etapa[t.columna]) || 0]))
  return { largo: Number(etapa.imp_largo_m), ...tintas, total: etapa.imp_tinta_total_ml != null ? Number(etapa.imp_tinta_total_ml) : totalTinta(tintas) }
}
