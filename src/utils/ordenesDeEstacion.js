// V140 — ¿ya le toca esta orden a la estación? Antes cada estación veía
// toda orden con su etapa sin terminar, aunque faltara el paso anterior.
// Ahora:
// - Costura (etapa 'produccion') y bordado: cuando corte ya terminó.
// - Terminado: cuando costura o bordado ya empezaron (o terminaron); puede
//   trabajar mientras ellas siguen.
// La condición solo aplica a las etapas previas que la orden SÍ tiene: una
// orden de tipo "bordado" (bordado → terminado, sin corte) le sale a bordado
// de inmediato. Las demás etapas (corte, impresión, sublimado) no cambian.
export const ETAPAS_PREVIAS = {
  produccion: { etapas: ['corte'], estados: ['completado'] },
  bordado: { etapas: ['corte'], estados: ['completado'] },
  terminado: { etapas: ['produccion', 'bordado'], estados: ['en_proceso', 'completado'] },
}

// V155 — órdenes de Frisa: regla estricta, en el orden de la secuencia de su
// producto (orden_secuencia 1..n): una etapa le toca cuando la anterior está
// completada, o si es la primera. El servidor tiene el mismo candado
// (orden_etapas_frisa_secuencia). Los demás tipos siguen con ETAPAS_PREVIAS.
export function etapaAnteriorEnSecuencia(etapa, etapasDeLaOrden = []) {
  const mia = etapasDeLaOrden.find((e) => e.etapa === etapa)
  if (!mia) return null
  return (
    etapasDeLaOrden
      .filter((e) => e.orden_secuencia < mia.orden_secuencia)
      .sort((a, b) => b.orden_secuencia - a.orden_secuencia)[0] || null
  )
}

// 'lista'    → sale en "Siguientes órdenes" de la estación.
// 'espera'   → es de la estación pero falta el paso anterior.
// null       → no es de la estación (no tiene la etapa o ya la terminó).
// `orden` (opcional): con order_type_key 'frisa' aplica la regla estricta.
export function situacionEnEstacion(etapa, etapasDeLaOrden = [], orden = null) {
  const mia = etapasDeLaOrden.find((e) => e.etapa === etapa)
  if (!mia || (mia.estado !== 'pendiente' && mia.estado !== 'en_proceso')) return null
  // Lo que ya se empezó nunca se esconde.
  if (mia.estado === 'en_proceso') return 'lista'
  if (orden?.order_type_key === 'frisa') {
    const anterior = etapaAnteriorEnSecuencia(etapa, etapasDeLaOrden)
    return !anterior || anterior.estado === 'completado' ? 'lista' : 'espera'
  }
  const regla = ETAPAS_PREVIAS[etapa]
  if (!regla) return 'lista'
  const previas = etapasDeLaOrden.filter((e) => regla.etapas.includes(e.etapa))
  if (previas.length === 0) return 'lista'
  return previas.some((e) => regla.estados.includes(e.estado)) ? 'lista' : 'espera'
}
