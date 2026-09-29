// V96 — Vistas de estación para fábrica (Parte 1). Un solo lugar que
// define, por rol de etapa, su pantalla de inicio y la acción de su
// botón grande — para no regar `if (role === 'corte') ... else if
// (role === 'bordado') ...` por todo el código. `EstacionHomePage.jsx` y
// `EstacionOrderPage.jsx` son las únicas pantallas que leen esto.
export const ESTACIONES = {
  corte: { etapa: 'corte', accionLabel: 'Cortado', consumoPlaceholder: true },
  bordado: { etapa: 'bordado', accionLabel: 'Bordado' },
  sublimado: { etapa: 'sublimado', accionLabel: 'Sublimado' },
  // El rol se llama 'produccion' pero en el resto de la app ya se le dice
  // "Costura" (ver ROLE_LABELS/ETAPA_LABELS en permissions.js/constants.js)
  // — se usa el mismo nombre aquí para no meter un término nuevo.
  produccion: { etapa: 'produccion', accionLabel: 'Costura lista' },
  terminado: { etapa: 'terminado', accionLabel: 'Terminado' },
}

export function esRolDeEstacion(role) {
  return Object.prototype.hasOwnProperty.call(ESTACIONES, role)
}

export function estacionDeRol(role) {
  return ESTACIONES[role] || null
}
