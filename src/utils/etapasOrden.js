import { ETAPAS_ORDEN_OPTIONS } from '../lib/constants.js'

// V157 — "Editar etapas" de una orden. `lista` = [{etapa, estado}] en el
// orden nuevo; las que se agregan llegan sin estado (nacen pendientes).

export const etiquetaEtapaOrden = (etapa) => ETAPAS_ORDEN_OPTIONS.find((o) => o.key === etapa)?.label || etapa

// Una etapa ya empezada o terminada no se puede quitar.
export const sePuedeQuitar = (fila) => !fila.estado || fila.estado === 'pendiente'

export const etapasParaAgregar = (lista) => ETAPAS_ORDEN_OPTIONS.filter((o) => !lista.some((f) => f.etapa === o.key))

// Mensaje de error (o null) antes de guardar.
export function validarEtapasOrden(lista, originales = []) {
  if (!lista.length) return 'La orden necesita al menos una etapa.'
  const quitada = originales.find((o) => !sePuedeQuitar(o) && !lista.some((f) => f.etapa === o.etapa))
  if (quitada) return `No se puede quitar ${etiquetaEtapaOrden(quitada.etapa)}: ya se empezó.`
  return null
}

// "Corte > Costura > Terminado" → para el aviso antes de guardar.
export const resumenEtapas = (lista) => lista.map((f) => etiquetaEtapaOrden(f.etapa)).join(' → ')
