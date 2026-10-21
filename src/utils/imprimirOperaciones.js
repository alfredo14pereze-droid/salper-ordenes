// Impresión del catálogo de operaciones de producción: qué operaciones y qué
// columnas van en la hoja (antes siempre salía el catálogo completo).

export const COLUMNAS_OPCIONALES = [
  { key: 'prenda', label: 'Prenda' },
  { key: 'parte', label: 'Parte' },
  { key: 'segundos', label: 'Segundos' },
  { key: 'estado', label: 'Estado (activa / inactiva)' },
]
export const COLUMNAS_DEFAULT = ['prenda', 'parte', 'segundos']

// modo: 'visibles' (lo que se ve con el filtro y la búsqueda), 'marcadas'
// (las que tienen palomita) o 'todas'. Siempre en orden de folio.
export function operacionesParaImprimir(ops, { modo = 'visibles', visibles = [], marcadas = new Set(), incluirInactivas = false } = {}) {
  let lista = modo === 'todas' ? ops : modo === 'marcadas' ? ops.filter((o) => marcadas.has(o.folio)) : visibles
  if (!incluirInactivas) lista = lista.filter((o) => o.activa)
  return [...lista].sort((a, b) => a.folio - b.folio)
}

// [{ prenda, operaciones }] en orden de primer folio, para "una prenda por hoja".
export function agruparPorPrenda(ops) {
  const grupos = new Map()
  for (const o of ops) {
    if (!grupos.has(o.prenda)) grupos.set(o.prenda, [])
    grupos.get(o.prenda).push(o)
  }
  return [...grupos.entries()].map(([prenda, operaciones]) => ({ prenda, operaciones }))
}
