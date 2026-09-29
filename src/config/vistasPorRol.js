// V96/V97 — Vistas de estación para fábrica (Parte 1). Un solo lugar que
// define, por rol de etapa, su etapa en orden_etapas y si lleva el
// placeholder de consumo — para no regar `if (role === 'corte') ...
// else if (role === 'bordado') ...` por todo el código. Los 5 roles
// usan el mismo par de botones ("En progreso" / "Finalizado" — ver
// EstacionOrderPage.jsx), así que no hace falta un label por rol.
export const ESTACIONES = {
  corte: { etapa: 'corte', consumoPlaceholder: true },
  bordado: { etapa: 'bordado' },
  sublimado: { etapa: 'sublimado' },
  produccion: { etapa: 'produccion' },
  terminado: { etapa: 'terminado' },
}

export function esRolDeEstacion(role) {
  return Object.prototype.hasOwnProperty.call(ESTACIONES, role)
}

export function estacionDeRol(role) {
  return ESTACIONES[role] || null
}
