// V96/V97 — Vistas de estación para fábrica (Parte 1). Un solo lugar que
// define, por rol de etapa, su etapa en orden_etapas, si lleva el
// placeholder de consumo, y su acceso a Pendientes — para no regar
// `if (role === 'corte') ... else if (role === 'bordado') ...` por todo
// el código. Los 5 roles usan el mismo par de botones ("En progreso" /
// "Finalizado" — ver EstacionOrderPage.jsx), así que no hace falta un
// label por rol.
//
// Pendientes (V97, pedido explícito del usuario): terminado ve TODO
// (mismas 4 bandejas de siempre, sin restricción — `pendientesCompleto`).
// bordado y produccion (costura) solo ven su lista de "por hacer" ya
// filtrada al tipo de trabajo que les toca (`pendientesTipo`, debe
// coincidir con el nombre en `pf_tipos_trabajo` — hoy solo existen
// "Arreglo" y "Bordado" activos, ver V82). corte y sublimado no tienen
// tipo de trabajo propio en Pendientes — se quedan sin acceso (ni
// `pendientesTipo` ni `pendientesCompleto`).
export const ESTACIONES = {
  corte: { etapa: 'corte', consumoPlaceholder: true },
  bordado: { etapa: 'bordado', pendientesTipo: 'Bordado' },
  sublimado: { etapa: 'sublimado' },
  produccion: { etapa: 'produccion', pendientesTipo: 'Arreglo' },
  // V105 — terminado ya no usa el botón genérico "Finalizado": captura
  // cantidades reales por talla y genera la remisión al confirmar (ver
  // EstacionOrderPage.jsx).
  terminado: { etapa: 'terminado', pendientesCompleto: true, surtidoFinal: true },
}

export function esRolDeEstacion(role) {
  return Object.prototype.hasOwnProperty.call(ESTACIONES, role)
}

export function estacionDeRol(role) {
  return ESTACIONES[role] || null
}
