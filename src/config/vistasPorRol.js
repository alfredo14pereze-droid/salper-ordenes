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
  // V131 — corte (Pancho) solo reporta corte. La etapa 'sublimado' (la
  // sublimada de las órdenes de sublimación) pasó al rol sublimado (Samuel),
  // que reporta las dos: primero 'impresion' (Impresa) y luego 'sublimado'
  // (Sublimada) — ver `finalLabels`. El dashboard de sublimado
  // (`dashboardSublimado`) y la subida de diseños (`disenos`) siguen igual.
  corte: { etapa: 'corte', consumoPlaceholder: true },
  // V134 — `pendientesTipo` también es la "parte" que le toca a la estación en
  // los tipos compuestos (p. ej. "Arreglo y bordado" lleva Arreglo y Bordado).
  // V140 — `pausa`: la estación puede pausar y reanudar el cronómetro de sus
  // etapas (bordado y terminado saltan de una orden a otra).
  bordado: { etapa: 'bordado', pendientesTipo: 'Bordado', pausa: true },
  sublimado: {
    etapa: 'sublimado',
    etapasExtra: ['impresion'],
    finalLabels: { impresion: 'Impresa', sublimado: 'Sublimada' },
    dashboardSublimado: true,
    disenos: true,
  },
  // V111 — 'produccion' (rol) queda deprecated, sin usuarios reales; el
  // rol nuevo es 'costura' — misma etapa ('produccion', que no se
  // renombró) y mismo pendientesTipo. Se deja la entrada 'produccion'
  // tal cual por si alguna vez se necesita (aditivo, no se borra).
  produccion: { etapa: 'produccion', pendientesTipo: 'Arreglo' },
  costura: { etapa: 'produccion', pendientesTipo: 'Arreglo' },
  // V105 — terminado ya no usa el botón genérico "Finalizado": captura
  // cantidades reales por talla y genera la remisión al confirmar (ver
  // EstacionOrderPage.jsx).
  // V134 — terminado también reporta la impresión de las prendas que la
  // llevan (etapa 'impresion_prenda', antes de terminado): botón "Impresa".
  terminado: {
    etapa: 'terminado',
    etapasExtra: ['impresion_prenda'],
    finalLabels: { impresion_prenda: 'Impresa' },
    pendientesCompleto: true,
    surtidoFinal: true,
    pausa: true,
  },
}

export function esRolDeEstacion(role) {
  return Object.prototype.hasOwnProperty.call(ESTACIONES, role)
}

export function estacionDeRol(role) {
  return ESTACIONES[role] || null
}

// Todas las etapas que reporta una estación, en el orden del flujo (las
// extra van antes que la propia: sublimado va antes de corte).
export function etapasDeEstacion(estacion) {
  if (!estacion) return []
  return [...(estacion.etapasExtra || []), estacion.etapa]
}
