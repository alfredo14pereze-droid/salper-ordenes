import { formatTalla } from './inventarioTallas'
import { indexar, normalizar, palabras } from './inventarioBusqueda'

// V121 — arma, a partir del JSON compacto de inv_catalogo() y de los
// catálogos ya cargados, los artículos y modelos listos para pantalla y
// búsqueda. Un artículo SIN modelo ("sin clasificar") conserva su nombre
// de siempre (prenda · talla · sección); uno CON modelo usa el nombre
// generado: "[Tipo de prenda] [Cliente o línea] [Variante] T.[Talla]".

export function nombreModelo({ tipo, seccion, variante }) {
  return [tipo, seccion, variante].filter(Boolean).join(' ')
}

// Dentro de la pestaña de su cliente/línea el nombre de este ya está
// implícito: solo tipo + variante.
export function nombreCortoModelo({ tipo, variante }) {
  return [tipo, variante].filter(Boolean).join(' ')
}

export function buildCatalogo(raw, { secciones, tallas, ubicaciones, tipos }) {
  const seccionMap = new Map(secciones.map((s) => [s.id, s]))
  const tallaMap = new Map(tallas.map((t) => [t.id, t]))
  const tipoMap = new Map(tipos.map((t) => [t.id, t]))
  const ubicacionesActivas = ubicaciones.filter((u) => u.activa)
  const ubicacionActiva = new Set(ubicacionesActivas.map((u) => u.id))

  const aliasPorModelo = new Map()
  const aliasPorArticulo = new Map()
  for (const al of raw.alias || []) {
    const [map, key] = al.m ? [aliasPorModelo, al.m] : [aliasPorArticulo, al.a]
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ id: al.id, alias: al.alias, origen: al.origen })
  }

  const modelos = new Map()
  for (const m of raw.modelos || []) {
    const seccion = seccionMap.get(m.s)?.nombre || ''
    const tipo = tipoMap.get(m.tp)?.nombre || ''
    const alias = aliasPorModelo.get(m.id) || []
    const nombre = nombreModelo({ tipo, seccion, variante: m.v })
    modelos.set(m.id, {
      id: m.id,
      seccionId: m.s,
      seccion,
      tipoId: m.tp,
      tipo,
      variante: m.v || '',
      juegoId: m.j,
      nombre,
      nombreCorto: nombreCortoModelo({ tipo, variante: m.v }),
      alias,
      articulos: [],
      total: 0,
      busq: indexar({ nombre: [nombre], alias: alias.map((a) => a.alias) }),
    })
  }

  const existencias = new Map() // articulo_id → { ubicacion_id: n }
  for (const [articuloId, ubicacionId, n] of raw.existencias || []) {
    if (!existencias.has(articuloId)) existencias.set(articuloId, {})
    existencias.get(articuloId)[ubicacionId] = n
  }

  const articulos = []
  for (const a of raw.articulos || []) {
    const talla = tallaMap.get(a.t)
    const seccion = seccionMap.get(a.s)?.nombre || ''
    const modelo = a.m ? modelos.get(a.m) : null
    const ex = existencias.get(a.id) || {}
    const porUbicacion = {}
    let total = 0
    for (const u of ubicacionesActivas) {
      porUbicacion[u.id] = ex[u.id] ?? 0
      total += porUbicacion[u.id]
    }
    // Existencia que quedó en una ubicación desactivada: no se muestra en
    // columnas, pero tampoco se pierde del total si alguien la reactiva.
    for (const uid of Object.keys(ex)) if (!ubicacionActiva.has(uid)) porUbicacion[uid] = ex[uid]

    const tallaNombre = talla?.nombre || ''
    const aliasPropios = aliasPorArticulo.get(a.id) || []
    const nombreBase = modelo ? modelo.nombre : `${a.p} · ${seccion}`
    const nombre = modelo
      ? `${modelo.nombre} ${formatTalla(tallaNombre)}`
      : `${a.p} · ${formatTalla(tallaNombre)} · ${seccion}`
    const articulo = {
      articuloId: a.id,
      seccionId: a.s,
      seccion,
      prenda: a.p,
      tallaId: a.t,
      talla: tallaNombre,
      tallaOrden: talla?.orden ?? 0,
      minimo: a.min ?? null,
      modeloId: modelo ? modelo.id : null,
      porUbicacion,
      total,
      nombre,
      nombreBase,
      alias: aliasPropios,
      busq: indexar({
        // La prenda original también cuenta aunque ya tenga modelo: quien
        // la conocía como "Polo Blanca" la sigue encontrando así.
        nombre: modelo ? [modelo.nombre, a.p] : [a.p, seccion],
        talla: tallaNombre,
        alias: [...aliasPropios, ...(modelo ? modelo.alias : [])].map((x) => x.alias),
      }),
    }
    articulos.push(articulo)
    if (modelo) {
      modelo.articulos.push(articulo)
      modelo.total += total
    }
  }
  for (const m of modelos.values()) m.articulos.sort((x, y) => x.tallaOrden - y.tallaOrden)

  return { articulos, modelos: [...modelos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')) }
}

// Convierte las filas de inv_existencias(null) (V89) al mismo formato
// compacto de inv_catalogo(), para que la pantalla siga funcionando si
// V121 todavía no se aplica en la base (sin modelos ni alias).
export function catalogoDesdeExistencias(filas) {
  const articulos = new Map()
  const existencias = []
  for (const f of filas || []) {
    if (!articulos.has(f.articulo_id)) {
      articulos.set(f.articulo_id, { id: f.articulo_id, s: f.seccion_id, p: f.prenda, t: f.talla_id, m: null, min: f.minimo })
    }
    if (f.existencia) existencias.push([f.articulo_id, f.ubicacion_id, f.existencia])
  }
  return { articulos: [...articulos.values()], existencias, modelos: [], alias: [] }
}

// --- Sugerencia para "Artículos sin clasificar" ---------------------------
// A partir del texto libre de `prenda` propone tipo + variante. Solo es
// una propuesta en pantalla: nada se aplica hasta que el admin confirma.
//   "Playera Polo Gen 2032" → Playera polo / "Gen 2032"
//   "Polo Marino"           → Playera polo / "Marino"   (sinónimo)
//   "Chamarra Polar Gris"   → Chamarra     / "Polar Gris"
// Gana el tipo cuyas palabras estén TODAS en la prenda y que tenga más
// palabras (para que "Playera deportiva" le gane a un hipotético
// "Playera").
const SINONIMOS = [{ palabras: ['polo'], tipo: 'playera polo' }]

export function sugerirClasificacion(prenda, tipos) {
  const originales = String(prenda ?? '').trim().split(/\s+/).filter(Boolean)
  const norm = originales.map((w) => normalizar(w))

  let mejor = null
  const considerar = (tipo, claves) => {
    if (!tipo || claves.length === 0) return
    const usados = []
    for (const c of claves) {
      const i = norm.findIndex((w, idx) => w === c && !usados.includes(idx))
      if (i === -1) return
      usados.push(i)
    }
    if (!mejor || usados.length > mejor.usados.length) mejor = { tipo, usados }
  }

  for (const t of tipos) if (t.activo !== false) considerar(t, palabras(t.nombre))
  if (!mejor) {
    for (const s of SINONIMOS) {
      considerar(tipos.find((t) => normalizar(t.nombre) === s.tipo), s.palabras)
    }
  }
  if (!mejor) return { tipoId: '', variante: '' }
  return {
    tipoId: mejor.tipo.id,
    variante: originales.filter((_, i) => !mejor.usados.includes(i)).join(' '),
  }
}
