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

// Hoja de operaciones de una prenda: agrupada por parte. Las partes salen en el
// orden de su primer folio (el orden en que se arma la prenda) y dentro de
// cada parte, por folio. Sin parte → "SIN PARTE".
export function agruparPorParte(ops) {
  const grupos = new Map()
  for (const o of [...ops].sort((a, b) => a.folio - b.folio)) {
    const parte = (o.parte || '').trim() || 'SIN PARTE'
    const clave = parte.toUpperCase()
    if (!grupos.has(clave)) grupos.set(clave, { parte, operaciones: [] })
    grupos.get(clave).operaciones.push(o)
  }
  return [...grupos.values()]
}

// V182 — una hoja puede llevar operaciones de varias prendas (ej. 7 de
// CAMISOLA + 2 de PLAYERA). [{ prenda, n }] de la que más tiene a la que menos;
// empate: la de folio más bajo.
export function conteoPorPrenda(ops) {
  const m = new Map()
  for (const o of [...ops].sort((a, b) => a.folio - b.folio)) m.set(o.prenda, (m.get(o.prenda) || 0) + 1)
  return [...m.entries()].map(([prenda, n]) => ({ prenda, n })).sort((a, b) => b.n - a.n)
}

// La prenda "de" la hoja: la que más operaciones lleva.
export function prendaPrincipal(ops) {
  return conteoPorPrenda(ops)[0]?.prenda ?? null
}

// "7 de CAMISOLA y 2 de PLAYERA"
export function textoPorPrenda(ops) {
  const partes = conteoPorPrenda(ops).map((c) => `${c.n} de ${c.prenda}`)
  return partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`
}

// V182 — en la hoja de una prenda, las operaciones que vienen de otra prenda
// llevan su prenda en el nombre: "Pegar cuello (PLAYERA)". Todas quedan como de
// la prenda de la hoja, así se agrupan por parte juntas (cuello con cuello).
// Las copias viejas (sin prenda) no cambian.
export function marcarOtraPrenda(ops, prendaHoja) {
  return (ops || []).map((o) =>
    o.prenda && prendaHoja && o.prenda !== prendaHoja
      ? { ...o, operacion: `${o.operacion} (${o.prenda})`, prenda: prendaHoja }
      : o,
  )
}
