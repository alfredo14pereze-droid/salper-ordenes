import { nombreFrisa } from './frisaColores.js'
// V185 — Frisa fase 1: inventario SALPER por clave y órdenes de surtido.
// Ver supabase/schema_v185_frisa_surtido.sql.
//
//   real       = stock_actual (lo mantienen los movimientos)
//   apartado   = líneas de órdenes 'surtida' (aún no entregadas)
//   disponible = real − apartado
//
// Urgente: las órdenes pendientes se revisan por fecha límite (la más
// próxima primero). Una orden se surte completa o no se surte (Frisa no
// acepta parciales): si alcanza, "toma" su parte del disponible; si no
// alcanza, no toma nada y dice cuánto falta de cada clave.

export const ESTADOS_SURTIDO = {
  pendiente: { label: 'Pendiente', clase: 'neutro' },
  surtida: { label: 'Surtida', clase: 'naranja' },
  entregada: { label: 'Entregada', clase: 'verde' },
  cancelada: { label: 'Cancelada', clase: 'neutro' },
}

export function lineasPorSurtido(lineas) {
  const m = new Map()
  for (const l of lineas || []) {
    if (!m.has(l.surtido_id)) m.set(l.surtido_id, [])
    m.get(l.surtido_id).push(l)
  }
  return m
}

// { producto_id → piezas apartadas }
export function apartadoPorProducto(surtidos, lineas) {
  const surtidas = new Set((surtidos || []).filter((s) => s.estado === 'surtida').map((s) => s.id))
  const m = new Map()
  for (const l of lineas || []) {
    if (!surtidas.has(l.surtido_id)) continue
    m.set(l.producto_id, (m.get(l.producto_id) || 0) + l.cantidad)
  }
  return m
}

// Agrega real / apartado / disponible a cada producto.
export function conInventario(productos, surtidos, lineas) {
  const ap = apartadoPorProducto(surtidos, lineas)
  return (productos || []).map((p) => {
    const real = Number(p.stock_actual) || 0
    const apartado = ap.get(p.id) || 0
    return { ...p, real, apartado, disponible: real - apartado }
  })
}

const fechaOrden = (s) => s.fecha_limite || '9999-12-31'

export function ordenarPendientes(surtidos) {
  return [...surtidos].sort((a, b) =>
    fechaOrden(a).localeCompare(fechaOrden(b)) || String(a.creado_en || '').localeCompare(String(b.creado_en || '')))
}

// Calcula Urgente. productosInv: salida de conInventario.
// Regresa { ordenes: [{ surtido, lineas, completa, faltantes: [{producto_id, clave, falta}] }],
//           porClave: [{ producto, pendiente, disponible, falta }], completas, piezasFaltantes }
export function calcularUrgente(productosInv, surtidos, lineas) {
  const prod = new Map(productosInv.map((p) => [p.id, p]))
  const restante = new Map(productosInv.map((p) => [p.id, p.disponible]))
  const porSurtido = lineasPorSurtido(lineas)
  const pendientes = ordenarPendientes((surtidos || []).filter((s) => s.estado === 'pendiente'))
  const ordenes = []
  const pendientePorClave = new Map()
  const usadoPor = new Map() // producto_id → OCs (que vencen antes) que ya se llevan esas piezas
  for (const s of pendientes) {
    const ls = porSurtido.get(s.id) || []
    const faltantes = []
    for (const l of ls) {
      pendientePorClave.set(l.producto_id, (pendientePorClave.get(l.producto_id) || 0) + l.cantidad)
      const hay = restante.get(l.producto_id) ?? 0
      if (hay < l.cantidad) faltantes.push({ producto_id: l.producto_id, clave: l.clave, nombre: prod.get(l.producto_id)?.nombre ?? l.clave, falta: l.cantidad - Math.max(0, hay) })
    }
    const completa = ls.length > 0 && faltantes.length === 0
    if (completa) for (const l of ls) {
      restante.set(l.producto_id, restante.get(l.producto_id) - l.cantidad)
      if (!usadoPor.has(l.producto_id)) usadoPor.set(l.producto_id, [])
      usadoPor.get(l.producto_id).push(s.numero_oc)
    }
    // Sola sí alcanza (sin contar las otras pendientes), pero otras que vencen antes ocupan esas piezas.
    const alcanzaSola = ls.length > 0 && ls.every((l) => l.cantidad <= (prod.get(l.producto_id)?.disponible ?? 0))
    const compiteCon = completa ? [] : [...new Set(faltantes.flatMap((f) => usadoPor.get(f.producto_id) || []))]
    ordenes.push({ surtido: s, lineas: ls, completa, faltantes, alcanzaSola, compiteCon })
  }
  const porClave = [...pendientePorClave.entries()].map(([id, pendiente]) => {
    const p = prod.get(id)
    const disponible = p ? p.disponible : 0
    return { producto: p || { id, clave: '?', nombre: '' }, pendiente, disponible, falta: Math.max(0, pendiente - Math.max(0, disponible)) }
  }).sort((a, b) => b.falta - a.falta || String(a.producto.clave).localeCompare(String(b.producto.clave)))
  return {
    ordenes,
    porClave,
    completas: ordenes.filter((o) => o.completa).length,
    piezasFaltantes: porClave.reduce((t, c) => t + c.falta, 0),
  }
}

// Una orden concreta contra el disponible de hoy (sin competir con otras).
export function faltantesDeOrden(lineasOrden, productosInv) {
  const prod = new Map(productosInv.map((p) => [p.id, p]))
  return lineasOrden
    .map((l) => ({ ...l, disponible: prod.get(l.producto_id)?.disponible ?? 0 }))
    .map((l) => ({ ...l, falta: Math.max(0, l.cantidad - Math.max(0, l.disponible)) }))
}

export function piezasDe(lineas) {
  return (lineas || []).reduce((t, l) => t + (Number(l.cantidad) || 0), 0)
}

// Días para la fecha límite (hoy en Monterrey = fecha local del navegador).
export function diasParaLimite(fecha, hoy = hoyISO()) {
  if (!fecha) return null
  const a = Date.UTC(...hoy.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))
  const b = Date.UTC(...String(fecha).slice(0, 10).split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))
  return Math.round((b - a) / 86400000)
}

export function textoLimite(fecha, hoy) {
  const d = diasParaLimite(fecha, hoy)
  if (d == null) return { texto: 'Sin fecha límite', urgente: false }
  if (d < 0) return { texto: `Vencida hace ${-d} día${d === -1 ? '' : 's'}`, urgente: true }
  if (d === 0) return { texto: 'Vence hoy', urgente: true }
  return { texto: `Vence en ${d} día${d === 1 ? '' : 's'}`, urgente: d <= 2 }
}

export function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------
// Sugerir la clave de un renglón del PDF
// ---------------------------------------------------------------------
const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// Mismo texto que frisa_texto_alias_niveles() en el SQL.
export function textoAlias(texto, talla) {
  return `${String(texto ?? '').trim().replace(/\s+/g, ' ').toUpperCase()} | ${String(talla ?? '').trim().toUpperCase()}`
}

const PALABRAS_VACIAS = new Set(['DE', 'LA', 'EL', 'CON', 'SIN', 'Y', 'FRISA', 'T', 'TALLA', 'C', 'R', 'M', 'IMP'])

// Manga y reflejante pesan: "M/C" = "MANGA CORTA", "S/REFLEJANTE" = "SIN REFLEJANTE".
function marcas(s) {
  return s
    .replace(/\bM\s*\/\s*C\b|\bMANGA\s+CORTA\b/g, ' MANGACORTA ')
    .replace(/\bM\s*\/\s*L\b|\bMANGA\s+LARGA\b/g, ' MANGALARGA ')
    .replace(/\bS\s*\/\s*REFLEJANTE\b|\bSIN\s+REFLEJANTE\b/g, ' SINREFLEJANTE ')
    .replace(/\bC\s*\/\s*REFLEJANTE\b|\bCON\s+REFLEJANTE\b/g, ' CONREFLEJANTE ')
}

function palabras(s) {
  return new Set(marcas(sinAcentos(s)).replace(/[^A-Z0-9]+/g, ' ').split(' ').filter((w) => w && !PALABRAS_VACIAS.has(w)))
}

// Talla de una clave: del nombre ("… T-XL", "TALLA 32 … LARGO 34") o del código.
export function tallaDeProducto(p) {
  const n = sinAcentos(p?.nombre)
  const t = n.match(/\bT-([0-9]*X*[SML]|[0-9]+)\s*$/)
  if (t) return t[1]
  const pan = n.match(/TALLA\s+(\d+)/)
  if (pan) return /LARGO\s+(\d+)/.test(n) ? `${pan[1]}/${n.match(/LARGO\s+(\d+)/)[1]}` : pan[1]
  const c = String(p?.clave || '').match(/^[A-Z]+-([0-9A-Z]{4})-/)
  return c ? c[1].replace(/^0+/, '') : ''
}

export function normalizarTalla(t) {
  const s = sinAcentos(t).replace(/^T-?/, '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '')
  return s.replace(/^(\d)X/, '$1X').replace(/^XXL$/, '2XL').replace(/^XXXL$/, '3XL')
}

// Rasgos que deciden el producto (si el texto trae uno y la clave otro, no es esa clave):
// tipo de prenda, color, manga y reflejante. Así "NUEVO INGRESO" u otras palabras de más no confunden.
const TIPOS = ['PLAYERA', 'CAMISA', 'PANTALON', 'BATA', 'BOLSA']
function rasgos(w) {
  const r = {}
  r.tipo = TIPOS.find((t) => w.has(t)) || null
  if ([...w].some((x) => x.startsWith('ROJ'))) r.color = 'ROJO'
  else if (w.has('VERDE')) r.color = 'VERDE'
  else if (w.has('ORO') || w.has('MANGO')) r.color = 'ORO'
  else if (w.has('MARINO') || w.has('AZUL')) r.color = 'MARINO'
  else r.color = null
  r.manga = w.has('MANGACORTA') ? 'C' : w.has('MANGALARGA') ? 'L' : null
  r.reflejante = w.has('CONREFLEJANTE') ? 'CON' : w.has('SINREFLEJANTE') ? 'SIN' : null
  return r
}
const choca = (a, b) => ['tipo', 'color', 'manga', 'reflejante'].some((k) => a[k] && b[k] && a[k] !== b[k])

// productos: claves (frisa_productos_niveles); alias: [{texto, producto_id}]
export function sugerirClave(texto, talla, productos, alias = [], codigo = '') {
  // 1) Por el número de material de la OC (= número de artículo de Microsip).
  const cod = String(codigo || '').replace(/\s+/g, '').toUpperCase()
  if (cod) {
    const pc = productos.find((p) => p.activo !== false && (p.codigos || []).some((c) => String(c).toUpperCase() === cod))
    if (pc) return { producto_id: pc.id, como: 'codigo' }
  }
  const a = alias.find((x) => x.texto === textoAlias(texto, talla))
  if (a && productos.some((p) => p.id === a.producto_id)) return { producto_id: a.producto_id, como: 'aprendido' }
  const t = normalizarTalla(talla)
  const w = palabras(texto)
  const rw = rasgos(w)
  let mejor = null
  for (const p of productos) {
    if (p.activo === false) continue
    if (t && normalizarTalla(tallaDeProducto(p)) !== t) continue
    const pw = palabras(String(p.nombre).replace(/\bT-\S+\s*$/, ''))
    if (choca(rw, rasgos(pw))) continue
    let n = 0
    for (const x of w) if (pw.has(x)) n++
    // Desempate: la clave con menos palabras que el texto no trae.
    const sobran = [...pw].filter((x) => !w.has(x)).length
    if (n > 0 && (!mejor || n > mejor.n || (n === mejor.n && sobran < mejor.sobran))) mejor = { producto_id: p.id, n, sobran }
  }
  return mejor ? { producto_id: mejor.producto_id, como: 'parecido' } : { producto_id: null, como: null }
}

// Planta de una OC para agrupar: sin acentos, sin "FRISA" ni "PLANTA" ("Frisa Acería" = "FRISA ACERIA").
export function clavePlanta(planta) {
  return String(planta ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/\bFRISA\b|\bPLANTA\b/g, ' ').replace(/\s+/g, ' ').trim()
}
const titulo = (t) => t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ (De|Del|La|Las|Los|Y) /g, (m) => m.toLowerCase())

// Plantas de una lista de órdenes: [{ clave, nombre, ordenes }] ordenadas por nombre.
export function plantasDe(surtidos) {
  const m = new Map()
  for (const s of surtidos || []) {
    const k = clavePlanta(s.planta)
    if (!m.has(k)) m.set(k, { clave: k, nombre: titulo(k || 'Sin planta'), ordenes: 0 })
    m.get(k).ordenes++
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Todo lo que piden varias órdenes juntas, por clave, contra el disponible.
export function juntarPorClave(ordenes, lineasPor, productosInv) {
  const prod = new Map((productosInv || []).map((p) => [p.id, p]))
  const m = new Map()
  for (const s of ordenes) for (const l of lineasPor.get(s.id) || []) {
    if (!m.has(l.producto_id)) m.set(l.producto_id, { producto: prod.get(l.producto_id) || { id: l.producto_id, clave: l.clave, nombre: '' }, cantidad: 0, ordenes: 0 })
    const x = m.get(l.producto_id)
    x.cantidad += l.cantidad
    x.ordenes++
  }
  return [...m.values()].map((x) => ({ ...x, disponible: x.producto.disponible ?? 0, falta: Math.max(0, x.cantidad - Math.max(0, x.producto.disponible ?? 0)) }))
    .sort((a, b) => String(a.producto.clave).localeCompare(String(b.producto.clave)))
}

// Buscar producto dentro de las órdenes (pedido de Alfredo, 2026-11-09): escribe una clave,
// número de artículo o parte del nombre ("roja manga corta talla m") y regresa los renglones
// que coinciden. Cada palabra debe aparecer; "talla X" tiene que ser esa talla exacta.
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
export function buscadorProducto(texto) {
  let q = normalizar(texto)
  if (q.length < 2) return null
  const tallas = []
  q = q.replace(/\bTALLA\s+([0-9A-Z]+)\b/g, (_, t) => { tallas.push(t); return ' ' })
  const palabras = q.split(' ').filter(Boolean)
  return (producto, clave = '') => {
    const nombre = normalizar(nombreFrisa(producto?.nombre))
    const todo = `${nombre} ${normalizar(producto?.nombre)} ${normalizar(producto?.clave ?? clave)} ${normalizar(producto?.articulo)} ${normalizar(clave)}`
    if (tallas.some((t) => !new RegExp(`\\bTALLA ${t}\\b`).test(nombre))) return false
    return palabras.every((p) => todo.includes(p))
  }
}
