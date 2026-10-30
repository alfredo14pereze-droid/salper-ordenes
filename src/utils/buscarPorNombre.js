import { palabras, normalizar } from './inventarioBusqueda.js'

// Buscador de los catálogos (clientes, telas, productos): sin mayúsculas ni
// acentos, y cada palabra escrita tiene que aparecer en alguno de los campos
// ("pol azul" encuentra "Polo Azul Marino"). Vacío = todo coincide.
export function coincideNombre(texto, ...campos) {
  const buscadas = palabras(texto)
  if (buscadas.length === 0) return true
  const donde = campos.map(normalizar).join(' ')
  return buscadas.every((p) => donde.includes(p))
}
