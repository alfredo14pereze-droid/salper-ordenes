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

// 'lista'    → sale en "Siguientes órdenes" de la estación.
// 'espera'   → es de la estación pero falta el paso anterior.
// null       → no es de la estación (no tiene la etapa o ya la terminó).
export function situacionEnEstacion(etapa, etapasDeLaOrden = []) {
  const mia = etapasDeLaOrden.find((e) => e.etapa === etapa)
  if (!mia || (mia.estado !== 'pendiente' && mia.estado !== 'en_proceso')) return null
  // Lo que ya se empezó nunca se esconde.
  if (mia.estado === 'en_proceso') return 'lista'
  const regla = ETAPAS_PREVIAS[etapa]
  if (!regla) return 'lista'
  const previas = etapasDeLaOrden.filter((e) => regla.etapas.includes(e.etapa))
  if (previas.length === 0) return 'lista'
  return previas.some((e) => regla.estados.includes(e.estado)) ? 'lista' : 'espera'
}
