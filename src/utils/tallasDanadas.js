// V152 — cuántas tallas o prendas vacías (null) trae la orden. limpiarItems
// las quita para que la pantalla no truene, pero eso también las escondía:
// así nadie notó durante semanas que se estaban borrando tallas (V151). Con
// este conteo la orden muestra un aviso (AvisoTallasDanadas).
export function contarTallasDanadas(items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((n, item) => {
    if (!item || typeof item !== 'object') return n + 1
    return n + (Array.isArray(item.sizes) ? item.sizes.filter((sz) => !sz || typeof sz !== 'object').length : 0)
  }, 0)
}
