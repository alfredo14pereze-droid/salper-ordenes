import { normalizar } from './inventarioBusqueda.js'

// Inventario — "Playeras" en un solo desplegable (solo presentación).
//
// En la pantalla principal cada modelo es su propio desplegable; en un
// colegio con generaciones (Instituto Tricio: "Playera polo Gen 2029" …
// "Gen 2038" y "sin generacion") eso eran 10+ desplegables casi iguales.
// Aquí se juntan TODAS las playeras de la sección en un grupo "Playeras":
//   tipo de playera (Playera polo, Playera deportiva…)
//     → bloques con generación, de la más reciente a la más vieja
//     → otras variantes sin año (si las hay)
//     → "Sin generación" al final
// Las tallas ya vienen en el orden del catálogo (inv_tallas.orden:
// 00, 0, 2, 4 … 16, XS, S, M …), no alfabético.
//
// Solo se activa si la sección tiene al menos una playera CON generación;
// en los demás colegios los grupos se quedan exactamente como estaban.
// No cambia artículos, existencias ni movimientos: cada bloque sigue siendo
// el mismo grupo (modelo o prenda sin clasificar) de antes, con sus botones.

export const PLAYERAS_KEY = 'playeras'

export function esPlayera(tipo) {
  const n = normalizar(tipo)
  return n.startsWith('playera') || /\bpolo\b/.test(n)
}

// Año de generación en un texto ("Gen 2032", "Generación 2032", "GEN. 2032").
export function generacionDe(texto) {
  const n = normalizar(texto)
  const m = n.match(/\bgen(?:eracion)?\s*(\d{4})\b/) || n.match(/\b(20\d{2})\b/)
  return m ? Number(m[1]) : null
}

function esSinGeneracion(texto) {
  const n = normalizar(texto)
  return n === '' || /\bsin gen/.test(n)
}

// Tipo y variante de un grupo: del modelo si lo tiene; si es una prenda
// sin clasificar, del texto ("Playera Polo Gen 2032" → "Playera Polo" / "Gen 2032").
function tipoYVariante(g) {
  if (g.modelo) return { tipo: g.modelo.tipo || g.label, variante: g.modelo.variante || '' }
  const texto = String(g.label || '')
  const corte = texto.search(/\b(gen(eraci[oó]n)?\.?\s*\d{4}|sin\s+gen)/i)
  if (corte > 0) return { tipo: texto.slice(0, corte).trim(), variante: texto.slice(corte).trim() }
  return { tipo: texto, variante: '' }
}

function tieneRegistros(g) {
  return g.items.some((i) => !i.virtual)
}

function primeraMayuscula(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// grupos: los de `agrupar()` en InventarioPage ({ key, label, modelo, items }).
// Regresa la misma lista, pero con las playeras dentro de un solo grupo
// { key: 'playeras', label: 'Playeras', playeras: [tipos], items }.
export function agruparPlayeras(grupos) {
  const info = grupos.map((g) => {
    const { tipo, variante } = tipoYVariante(g)
    return { g, tipo, variante, playera: esPlayera(tipo), gen: generacionDe(variante) }
  })
  if (!info.some((x) => x.playera && x.gen != null)) return grupos

  const tipos = new Map()
  const resto = []
  for (const x of info) {
    if (!x.playera) {
      resto.push(x.g)
      continue
    }
    if (!tieneRegistros(x.g)) continue // generación (o variante) vacía: no aparece
    // En las generaciones solo se ven las tallas con existencia (total de
    // todas las ubicaciones); las de 0 siguen existiendo en la base y se les
    // da entrada con "Dar entrada". Sin piezas en ninguna talla, la
    // generación no aparece. "Sin generación" y otras variantes muestran todo.
    const items = x.gen != null ? x.g.items.filter((i) => i.total > 0) : x.g.items
    if (items.length === 0) continue
    const tipoKey = normalizar(x.tipo)
    if (!tipos.has(tipoKey)) tipos.set(tipoKey, { key: tipoKey, label: primeraMayuscula(x.tipo), bloques: [] })
    const orden = x.gen != null ? 0 : esSinGeneracion(x.variante) ? 2 : 1
    tipos.get(tipoKey).bloques.push({
      key: x.g.key,
      titulo: x.gen != null ? `Gen ${x.gen}` : orden === 2 ? 'Sin generación' : x.variante,
      gen: x.gen,
      orden,
      grupo: { ...x.g, items: [...items].sort((a, b) => a.tallaOrden - b.tallaOrden) },
    })
  }

  const listaTipos = [...tipos.values()]
    .map((t) => {
      t.bloques.sort((a, b) => a.orden - b.orden || (b.gen ?? 0) - (a.gen ?? 0) || a.titulo.localeCompare(b.titulo, 'es'))
      t.total = t.bloques.reduce((s, b) => s + b.grupo.items.reduce((n, a) => n + a.total, 0), 0)
      return t
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))

  if (listaTipos.length === 0) return resto
  const combinado = {
    key: PLAYERAS_KEY,
    label: 'Playeras',
    modelo: null,
    playeras: listaTipos,
    items: listaTipos.flatMap((t) => t.bloques.flatMap((b) => b.grupo.items)),
  }
  return [...resto, combinado].sort((x, y) => x.label.localeCompare(y.label, 'es'))
}

// Llave del desplegable que hay que abrir para llegar a `grupoKey`
// (el de "Playeras" si quedó adentro; si no, el mismo).
export function grupoContenedor(gruposVista, grupoKey) {
  const p = gruposVista.find((g) => g.key === PLAYERAS_KEY)
  if (p && p.playeras.some((t) => t.bloques.some((b) => b.key === grupoKey))) return PLAYERAS_KEY
  return grupoKey
}
