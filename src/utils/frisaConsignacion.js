// V180 — Frisa a consignación (PRUEBA). Cálculos que hace la pantalla con los
// movimientos de frisa_movimientos: el stock nunca se guarda, se suma aquí.
// Ver supabase/schema_v180_frisa_consignacion_prueba.sql.
//
// Política (del prompt de Alfredo), por SKU y sobre stock TOTAL
// (bodega SALPER + plantas):
//   consumo semanal = consumo de las últimas 6 quincenas ÷ semanas que cubren
//   cobertura       = stock total ÷ consumo semanal (semanas)
//   rojo            = la bodega no alcanza para 20 días de consumo (2 entregas)
//   amarillo        = cobertura < 4 semanas → "Pedir producción"
//   verde           = cobertura ≥ 4 (objetivo 6)
//   sugerido        = 6 × consumo semanal − stock total, mínimo 0, ↑ a múltiplos de 10

export const TIPOS_MOVIMIENTO = [
  { key: 'produccion', label: 'Producción', corto: 'Producción' },
  { key: 'entrega', label: 'Entrega', corto: 'Entrega' },
  { key: 'consumo', label: 'Consumo', corto: 'Consumo' },
  { key: 'ajuste_confirmacion', label: 'Ajuste por confirmación', corto: 'Ajuste' },
]
export const etiquetaTipo = (k) => TIPOS_MOVIMIENTO.find((t) => t.key === k)?.label || k

export const SEMANAS_OBJETIVO = 6
export const SEMANAS_MINIMO = 4
export const DIAS_DOS_ENTREGAS = 20
export const QUINCENAS_PROMEDIO = 6

// ---------- Fechas (siempre 'yyyy-mm-dd', sin zona horaria) ----------
export function hoyISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const aFecha = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const aISO = (dt) => dt.toISOString().slice(0, 10)
export const sumarDias = (iso, n) => aISO(new Date(aFecha(iso).getTime() + n * 86400000))
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000)
const finDeMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m 1..12

// Quincena que contiene la fecha: { inicio, fin, clave, etiqueta }.
export function quincenaDe(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const p = (n) => String(n).padStart(2, '0')
  const primera = d <= 15
  const ini = primera ? 1 : 16
  const fin = primera ? 15 : finDeMes(y, m)
  const mes = MESES[m - 1]
  return {
    inicio: `${y}-${p(m)}-${p(ini)}`,
    fin: `${y}-${p(m)}-${p(fin)}`,
    clave: `${y}-${p(m)}-${primera ? 'A' : 'B'}`,
    etiqueta: `${ini}–${fin} ${mes} ${y}`,
  }
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Las n quincenas que terminan en la de `iso` (la más reciente primero).
export function quincenasHasta(iso, n) {
  const out = []
  let q = quincenaDe(iso)
  for (let i = 0; i < n; i++) {
    out.push(q)
    q = quincenaDe(sumarDias(q.inicio, -1))
  }
  return out
}

export function formatFecha(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]} ${y}`
}
export const formatPesos = (n) =>
  '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatNum = (n, dec = 0) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })

// ---------- Stock ----------
// Efecto de un movimiento: { bodega, planta } (planta = delta en su planta_id).
export function efecto(m) {
  switch (m.tipo) {
    case 'produccion': return { bodega: m.cantidad, planta: 0 }
    case 'entrega': return { bodega: -m.cantidad, planta: m.cantidad }
    case 'consumo': return { bodega: 0, planta: -m.cantidad }
    case 'ajuste_confirmacion': return { bodega: 0, planta: m.cantidad }
    default: return { bodega: 0, planta: 0 }
  }
}

// { bodega: {producto_id: n}, plantas: {planta_id: {producto_id: n}} }.
// `hasta` opcional (incluida).
export function calcularStock(movimientos, hasta = null) {
  const bodega = {}
  const plantas = {}
  for (const m of movimientos) {
    if (hasta && m.fecha > hasta) continue
    const e = efecto(m)
    if (e.bodega) bodega[m.producto_id] = (bodega[m.producto_id] || 0) + e.bodega
    if (e.planta && m.planta_id) {
      plantas[m.planta_id] = plantas[m.planta_id] || {}
      plantas[m.planta_id][m.producto_id] = (plantas[m.planta_id][m.producto_id] || 0) + e.planta
    }
  }
  return { bodega, plantas }
}

export const stockPlanta = (stock, plantaId, productoId) => stock.plantas[plantaId]?.[productoId] || 0
export const stockEnPlantas = (stock, productoId) =>
  Object.values(stock.plantas).reduce((s, p) => s + (p[productoId] || 0), 0)

// ---------- Consumo semanal ----------
// Ventana = las 6 quincenas más recientes que tienen algún consumo capturado
// (de cualquier planta/SKU). Semanas = días que cubren esas quincenas ÷ 7.
// Si todavía no hay 6, se usan las que haya.
export function ventanaConsumo(movimientos, n = QUINCENAS_PROMEDIO) {
  const porClave = new Map()
  for (const m of movimientos) {
    if (m.tipo !== 'consumo') continue
    const q = quincenaDe(m.fecha)
    porClave.set(q.clave, q)
  }
  const qs = [...porClave.values()].sort((a, b) => (a.inicio < b.inicio ? 1 : -1)).slice(0, n)
  const dias = qs.reduce((s, q) => s + diasEntre(q.inicio, q.fin) + 1, 0)
  return { quincenas: qs, claves: new Set(qs.map((q) => q.clave)), semanas: dias / 7 }
}

export function consumoSemanalPorProducto(movimientos, n = QUINCENAS_PROMEDIO) {
  const v = ventanaConsumo(movimientos, n)
  const tot = {}
  for (const m of movimientos) {
    if (m.tipo !== 'consumo' || !v.claves.has(quincenaDe(m.fecha).clave)) continue
    tot[m.producto_id] = (tot[m.producto_id] || 0) + m.cantidad
  }
  const out = {}
  for (const [k, c] of Object.entries(tot)) out[k] = v.semanas > 0 ? c / v.semanas : 0
  return { porProducto: out, ventana: v }
}

// ---------- Semáforo ----------
export const redondearArriba10 = (n) => (n <= 0 ? 0 : Math.ceil(n / 10) * 10)

export function nivelSku({ bodega, total, consumoSemanal }) {
  const cs = consumoSemanal || 0
  const cobertura = cs > 0 ? total / cs : Infinity
  const necesario20 = (cs / 7) * DIAS_DOS_ENTREGAS
  let color = 'verde'
  if (cs > 0 && bodega < necesario20) color = 'rojo'
  else if (cobertura < SEMANAS_MINIMO) color = 'amarillo'
  const sugerido = redondearArriba10(SEMANAS_OBJETIVO * cs - total)
  return { color, cobertura, necesario20, sugerido }
}

const ORDEN_COLOR = { rojo: 0, amarillo: 1, verde: 2 }

export function filasSemaforo(productos, movimientos) {
  const stock = calcularStock(movimientos)
  const { porProducto, ventana } = consumoSemanalPorProducto(movimientos)
  const filas = productos
    .filter((p) => p.activo !== false)
    .map((p) => {
      const bodega = stock.bodega[p.id] || 0
      const enPlantas = stockEnPlantas(stock, p.id)
      const total = bodega + enPlantas
      const consumoSemanal = porProducto[p.id] || 0
      return { producto: p, bodega, enPlantas, total, consumoSemanal, ...nivelSku({ bodega, total, consumoSemanal }) }
    })
    .sort((a, b) => ORDEN_COLOR[a.color] - ORDEN_COLOR[b.color] || a.cobertura - b.cobertura || a.producto.sku.localeCompare(b.producto.sku))
  return { filas, ventana }
}

// ---------- Por planta ----------
export function mapaMaximos(maximos) {
  const m = {}
  for (const x of maximos) (m[x.planta_id] = m[x.planta_id] || {})[x.producto_id] = x.maximo
  return m
}
export function aReponer(stock, maximo) {
  if (maximo == null) return null
  return Math.max(0, maximo - stock)
}

// ---------- Entrega ----------
// cantidades: {planta_id: {producto_id: n}} → por SKU {pedido, bodega, falta}.
export function revisarEntrega(cantidades, stock, productos) {
  const pedido = {}
  for (const porSku of Object.values(cantidades)) {
    for (const [pid, n] of Object.entries(porSku)) pedido[pid] = (pedido[pid] || 0) + (Number(n) || 0)
  }
  const faltantes = []
  let totalPiezas = 0
  for (const p of productos) {
    const pe = pedido[p.id] || 0
    totalPiezas += pe
    const b = stock.bodega[p.id] || 0
    if (pe > b) faltantes.push({ producto: p, pedido: pe, bodega: b, falta: pe - b })
  }
  return { pedido, faltantes, totalPiezas, completa: faltantes.length === 0 }
}

export function lineasEntrega(cantidades) {
  const out = []
  for (const [planta_id, porSku] of Object.entries(cantidades)) {
    for (const [producto_id, n] of Object.entries(porSku)) {
      const c = Number(n) || 0
      if (c > 0) out.push({ planta_id, producto_id, cantidad: c })
    }
  }
  return out
}

// ---------- Facturación ----------
// Consumo por planta y quincena con su monto (cantidad × precio_consumo).
export function facturacionPorQuincena(movimientos, productos, plantas) {
  const precio = Object.fromEntries(productos.map((p) => [p.id, Number(p.precio_consumo) || 0]))
  const nombre = Object.fromEntries(plantas.map((p) => [p.id, p.nombre]))
  const m = new Map()
  for (const x of movimientos) {
    if (x.tipo !== 'consumo') continue
    const q = quincenaDe(x.fecha)
    const k = q.clave + '|' + x.planta_id
    const r = m.get(k) || { quincena: q, planta_id: x.planta_id, planta: nombre[x.planta_id] || '—', piezas: 0, monto: 0 }
    r.piezas += x.cantidad
    r.monto += x.cantidad * (precio[x.producto_id] || 0)
    m.set(k, r)
  }
  return [...m.values()].sort((a, b) => (a.quincena.inicio < b.quincena.inicio ? 1 : a.quincena.inicio > b.quincena.inicio ? -1 : a.planta.localeCompare(b.planta)))
}

// ---------- Modelo / talla (V181) ----------
// Cada SKU es un modelo en una talla. Para ver el semáforo por modelo se
// suman sus tallas: se cambia producto_id por la clave del modelo.
const ORDEN_TALLAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'UNICA', 'ÚNICA']
export function compararTallas(a, b) {
  const ia = ORDEN_TALLAS.indexOf(String(a || '').toUpperCase())
  const ib = ORDEN_TALLAS.indexOf(String(b || '').toUpperCase())
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  const na = Number(a), nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(a || '').localeCompare(String(b || ''))
}
export const modeloDe = (p) => p.modelo || p.nombre || p.sku
export function ordenarProductos(productos) {
  return [...productos].sort((a, b) => modeloDe(a).localeCompare(modeloDe(b)) || compararTallas(a.talla, b.talla) || a.sku.localeCompare(b.sku))
}
export function agruparPorModelo(productos, movimientos, maximos = []) {
  const clave = {}
  const modelos = new Map()
  for (const p of productos) {
    const m = modeloDe(p)
    clave[p.id] = 'm:' + m
    const g = modelos.get(m) || { id: 'm:' + m, sku: m, nombre: '', modelo: m, tallas: [], activo: false, precio_consumo: p.precio_consumo }
    if (p.talla) g.tallas.push(p.talla)
    if (p.activo !== false) g.activo = true
    modelos.set(m, g)
  }
  for (const g of modelos.values()) g.nombre = g.tallas.sort(compararTallas).join(', ')
  const mx = new Map()
  for (const x of maximos) {
    const k = x.planta_id + '|' + clave[x.producto_id]
    mx.set(k, { planta_id: x.planta_id, producto_id: clave[x.producto_id], maximo: (mx.get(k)?.maximo || 0) + x.maximo })
  }
  return {
    productos: [...modelos.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
    movimientos: movimientos.map((m) => ({ ...m, producto_id: clave[m.producto_id] || m.producto_id })),
    maximos: [...mx.values()],
  }
}

// ---------- Órdenes de compra (V181) ----------
export const ESTADOS_OC = [
  { key: 'recibida', label: 'Recibida', paso: 'Hacer orden de taller' },
  { key: 'en_taller', label: 'En taller', paso: 'Esperando taller' },
  { key: 'lista', label: 'Lista para armar', paso: 'Armar' },
  { key: 'armada', label: 'Armada', paso: 'Entregar' },
  { key: 'entregada', label: 'Entregada', paso: '' },
  { key: 'cancelada', label: 'Cancelada', paso: '' },
]
export const etiquetaEstadoOC = (k) => ESTADOS_OC.find((e) => e.key === k)?.label || k

// Piezas apartadas por OCs armadas (todavía en bodega, ya no disponibles).
export function apartadoPorProducto(ordenes, lineas, excepto = null) {
  const armadas = new Set(ordenes.filter((o) => o.estado === 'armada' && o.id !== excepto).map((o) => o.id))
  const out = {}
  for (const l of lineas) if (armadas.has(l.oc_id)) out[l.producto_id] = (out[l.producto_id] || 0) + l.cantidad
  return out
}
export function disponibleBodega(stock, apartado, productoId) {
  return (stock.bodega[productoId] || 0) - (apartado[productoId] || 0)
}
// Para cada renglón de la OC: { pide, disponible, falta } y si se puede armar completa.
export function revisarArmado(oc, lineas, stock, ordenes, todasLineas) {
  const apartado = apartadoPorProducto(ordenes, todasLineas, oc.id)
  const filas = lineas.map((l) => {
    const disponible = Math.max(0, disponibleBodega(stock, apartado, l.producto_id))
    return { ...l, disponible, falta: Math.max(0, l.cantidad - disponible) }
  })
  return { filas, completa: filas.every((f) => f.falta === 0) }
}
// Días para la fecha límite (negativo = vencida).
export const diasParaLimite = (oc, hoy = hoyISO()) => (oc.fecha_limite ? diasEntre(hoy, oc.fecha_limite) : null)

// Normaliza una descripción como frisa_texto_alias() en el servidor.
export function textoAlias(texto, talla) {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ')
  return t + '|' + String(talla || '').trim().toUpperCase()
}
const palabras = (s) => new Set(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9/]+/).filter((w) => w.length > 1))
// SKU sugerido para un renglón leído del PDF: primero lo aprendido; si no,
// el modelo que más palabras comparte y con la misma talla.
export function sugerirProducto(descripcion, talla, productos, alias = []) {
  const a = alias.find((x) => x.texto === textoAlias(descripcion, talla))
  if (a && productos.some((p) => p.id === a.producto_id)) return { producto_id: a.producto_id, como: 'aprendido' }
  const t = String(talla || '').trim().toUpperCase()
  const w = palabras(descripcion)
  let mejor = null
  for (const p of productos) {
    if (p.activo === false) continue
    if (t && String(p.talla || '').toUpperCase() !== t) continue
    const pw = palabras(modeloDe(p) + ' ' + p.sku)
    let n = 0
    for (const x of w) if (pw.has(x)) n++
    if (n > 0 && (!mejor || n > mejor.n)) mejor = { producto_id: p.id, n }
  }
  return mejor ? { producto_id: mejor.producto_id, como: 'parecido' } : { producto_id: null, como: null }
}
export function sugerirPlanta(texto, plantas) {
  const w = palabras(texto)
  w.delete('FRISA'); w.delete('PLANTA')
  let mejor = null
  for (const p of plantas) {
    const pw = palabras(p.nombre)
    let n = 0
    for (const x of w) if (pw.has(x)) n++
    if (n > 0 && (!mejor || n > mejor.n)) mejor = { id: p.id, n }
  }
  return mejor?.id || null
}

// ---------- Datos de prueba ----------
// 5 plantas, 10 modelos con sus tallas (38 SKUs; 3 modelos de alta rotación),
// máximos y ~3 meses: cada viaje (cada 10 días) lleva una orden de compra
// por planta, consumo quincenal, una confirmación mensual con diferencias
// chicas, y órdenes de compra abiertas en todos los pasos (recibida, vencida,
// en taller, lista, armada). Deja 1 modelo en rojo y 2 en amarillo.
// Determinista (misma fecha → mismos datos).
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const PLANTAS_PRUEBA = ['Planta Norte (prueba)', 'Planta Sur (prueba)', 'Planta Oriente (prueba)', 'Planta Poniente (prueba)', 'Planta Centro (prueba)']
const LETRAS = (...t) => t
// semanal = consumo semanal del modelo (todas las plantas y tallas); nivel = cómo debe quedar.
export const MODELOS_PRUEBA = [
  { clave: 'PLA-MC', modelo: 'Playera reflejante M/C (prueba)', pdf: 'PLAYERA C/R M/C C/REFLEJANTE PRUEBA', precio: 185, semanal: 120, nivel: 'verde', tallas: LETRAS('S', 'M', 'L', 'XL', '2XL', '3XL'), pesos: [0.1, 0.25, 0.3, 0.2, 0.1, 0.05] },
  { clave: 'CAM-MZ', modelo: 'Camisa mezclilla (prueba)', pdf: 'CAMISA DE MEZCLILLA 7 OZ M/L PRUEBA', precio: 420, semanal: 90, nivel: 'rojo', tallas: LETRAS('S', 'M', 'L', 'XL', '2XL', '3XL'), pesos: [0.1, 0.25, 0.3, 0.2, 0.1, 0.05] },
  { clave: 'PLA-ML', modelo: 'Playera reflejante M/L (prueba)', pdf: 'PLAYERA C/R M/L C/REFLEJANTE PRUEBA', precio: 210, semanal: 70, nivel: 'amarillo', tallas: LETRAS('S', 'M', 'L', 'XL', '2XL'), pesos: [0.15, 0.3, 0.3, 0.15, 0.1] },
  { clave: 'PAN-MZ', modelo: 'Pantalón mezclilla (prueba)', pdf: 'PANTALON DE MEZCLILLA 14OZ PRUEBA', precio: 390, semanal: 22, nivel: 'verde', tallas: LETRAS('28', '30', '32', '34', '36', '38', '40'), pesos: [0.08, 0.17, 0.22, 0.2, 0.15, 0.1, 0.08] },
  { clave: 'CHA-RF', modelo: 'Chaleco reflejante (prueba)', pdf: 'CHALECO REFLEJANTE PRUEBA', precio: 160, semanal: 18, nivel: 'amarillo', tallas: LETRAS('M', 'L', 'XL'), pesos: [0.35, 0.4, 0.25] },
  { clave: 'SUD-MR', modelo: 'Sudadera marino (prueba)', pdf: 'SUDADERA MARINO PRUEBA', precio: 340, semanal: 12, nivel: 'verde', tallas: LETRAS('M', 'L', 'XL'), pesos: [0.35, 0.4, 0.25] },
  { clave: 'OVE-AZ', modelo: 'Overol azul (prueba)', pdf: 'OVEROL AZUL PRUEBA', precio: 650, semanal: 9, nivel: 'verde', tallas: LETRAS('M', 'L', 'XL'), pesos: [0.3, 0.45, 0.25] },
  { clave: 'CHM-IN', modelo: 'Chamarra industrial (prueba)', pdf: 'CHAMARRA INDUSTRIAL PRUEBA', precio: 720, semanal: 6, nivel: 'verde', tallas: LETRAS('L', 'XL'), pesos: [0.6, 0.4] },
  { clave: 'GOR-BL', modelo: 'Gorra bordada (prueba)', pdf: 'GORRA BORDADA PRUEBA', precio: 95, semanal: 10, nivel: 'verde', tallas: LETRAS('UNICA'), pesos: [1] },
  { clave: 'BAT-BL', modelo: 'Bata blanca (prueba)', pdf: 'BATA LABORATORIO PRUEBA', precio: 280, semanal: 5, nivel: 'verde', tallas: LETRAS('M', 'L'), pesos: [0.5, 0.5] },
]
// Un SKU por modelo y talla.
export const PRODUCTOS_PRUEBA = MODELOS_PRUEBA.flatMap((m) =>
  m.tallas.map((t, i) => ({ sku: `PRB-${m.clave}-${t}`, nombre: `${m.modelo} · ${t}`, modelo: m.modelo, talla: t, precio_consumo: m.precio, semanal: m.semanal * m.pesos[i], nivel: m.nivel, pdf: m.pdf })),
)
const PESO_PLANTA = [0.3, 0.25, 0.2, 0.15, 0.1]

export function generarDatosPrueba(hoy = hoyISO(), seed = 181) {
  const r = rng(seed)
  const [hy, hm] = hoy.split('-').map(Number)
  const inicio = aISO(new Date(Date.UTC(hy, hm - 1 - 3, 1))) // día 1 de hace 3 meses
  const ultimoFin = aISO(new Date(Date.UTC(hy, hm - 1, 0))) // último fin de mes
  const movimientos = []
  const ordenes_compra = []
  const ordenes_taller = []
  const add = (m) => movimientos.push(m)
  const P = PRODUCTOS_PRUEBA
  let lote = 0
  let numOC = 45006100
  let remision = 700
  let op = 1

  // Máximo por planta = 3 semanas de consumo de esa planta y talla.
  const maximos = []
  const maxDe = {}
  for (const [pi, planta] of PLANTAS_PRUEBA.entries()) {
    for (const p of P) {
      const mx = Math.max(2, Math.ceil(p.semanal * PESO_PLANTA[pi] * 3))
      maximos.push({ planta, sku: p.sku, maximo: mx })
      maxDe[planta + '|' + p.sku] = mx
    }
  }

  const bodega = Object.fromEntries(P.map((p) => [p.sku, 0]))
  const reg = {} // lo que dicen los movimientos
  const fisico = {} // lo que de verdad hay
  const acumulado = {} // consumo de la quincena en curso
  for (const pl of PLANTAS_PRUEBA) for (const p of P) { const k = pl + '|' + p.sku; reg[k] = 0; fisico[k] = 0; acumulado[k] = 0 }
  const producir = (fecha, sku, cant, extra = {}) => {
    if (cant <= 0) return
    add({ fecha, tipo: 'produccion', sku, planta: null, cantidad: cant, referencia: extra.referencia || `OP-${String(op++).padStart(3, '0')}`, ...extra })
    bodega[sku] += cant
  }

  for (let f = inicio; f < hoy; f = sumarDias(f, 1)) {
    const dia = diasEntre(inicio, f)
    // Viaje cada 10 días: una orden de compra por planta, completa al máximo
    // según lo que hay en el anaquel. Los modelos que deben quedar en
    // amarillo, en los últimos 35 días solo se completan al 15%.
    if (dia % 10 === 0) {
      const final = diasEntre(f, hoy) <= 35
      const porPlanta = {}
      for (const pl of PLANTAS_PRUEBA) for (const p of P) {
        const k = pl + '|' + p.sku
        const amarillo = final && p.nivel === 'amarillo'
        const tope = amarillo ? Math.round(maxDe[k] * 0.15) : maxDe[k]
        const hay = amarillo ? Math.max(reg[k], fisico[k]) : fisico[k]
        const n = Math.max(0, Math.round(tope - hay))
        if (n > 0) (porPlanta[pl] = porPlanta[pl] || []).push({ sku: p.sku, cantidad: n })
      }
      // Producción que llega a bodega 2 días antes si no alcanza (el rojo, justo).
      for (const p of P) {
        const necesita = Object.values(porPlanta).reduce((s, ls) => s + (ls.find((l) => l.sku === p.sku)?.cantidad || 0), 0)
        if (necesita > bodega[p.sku]) {
          const colchon = p.nivel === 'verde' ? p.semanal * 3 : 0
          producir(sumarDias(f, -2), p.sku, redondearArriba10(necesita - bodega[p.sku] + colchon))
        }
      }
      for (const [pl, lineas] of Object.entries(porPlanta)) {
        const numero = String(numOC++)
        const folio = String(remision++)
        ordenes_compra.push({
          numero, planta: pl, fecha_oc: sumarDias(f, -8), fecha_limite: sumarDias(f, 2), estado: 'entregada',
          remision_folio: folio, entregada_fecha: f,
          lineas: lineas.map((l) => ({ ...l, descripcion: P.find((p) => p.sku === l.sku).pdf })),
        })
        for (const l of lineas) {
          const k = pl + '|' + l.sku
          add({ fecha: f, tipo: 'entrega', sku: l.sku, planta: pl, cantidad: l.cantidad, oc: numero }) // referencia y lote los arma el servidor
          bodega[l.sku] -= l.cantidad
          reg[k] += l.cantidad
          fisico[k] += l.cantidad
        }
      }
    }
    // Consumo físico diario, con ruido.
    for (const [pi, pl] of PLANTAS_PRUEBA.entries()) for (const p of P) {
      const k = pl + '|' + p.sku
      const c = Math.min(fisico[k], ((p.semanal * PESO_PLANTA[pi]) / 7) * (0.6 + r() * 0.8))
      fisico[k] -= c
      acumulado[k] += c
    }
    // Fin de quincena: se captura el consumo.
    const q = quincenaDe(f)
    if (f === q.fin) {
      lote++
      for (const pl of PLANTAS_PRUEBA) for (const p of P) {
        const k = pl + '|' + p.sku
        const n = Math.min(reg[k], Math.round(acumulado[k]))
        acumulado[k] -= n
        if (n > 0) {
          add({ fecha: f, tipo: 'consumo', sku: p.sku, planta: pl, cantidad: n, lote: 'c' + lote + pl, referencia: `Quincena ${q.etiqueta}` })
          reg[k] -= n
        }
      }
    }
    // Confirmación mensual: diferencia chica en ~1 de cada 6 SKUs.
    if (f === ultimoFin) {
      for (const pl of PLANTAS_PRUEBA) {
        lote++
        for (const p of P) {
          const k = pl + '|' + p.sku
          const calc = reg[k]
          const dif = r() < 0.16 ? Math.max(-calc, Math.round(r() * 3) - 2) : 0 // −2 a +1
          add({ fecha: f, tipo: 'ajuste_confirmacion', sku: p.sku, planta: pl, cantidad: dif, confirmado: calc + dif, lote: 'a' + lote + pl, notas: 'Confirmación mensual (prueba)' })
          reg[k] += dif
          fisico[k] = Math.max(0, fisico[k] + dif)
        }
      }
    }
  }
  for (const k of Object.keys(reg)) if (reg[k] < 0) throw new Error('Stock negativo en ' + k)

  // Órdenes de compra abiertas, en todos los pasos (solo modelos en verde,
  // para no mover los colores del semáforo).
  const ayer = sumarDias(hoy, -1)
  const verdes = MODELOS_PRUEBA.filter((m) => m.nivel === 'verde')
  const lineasDe = (mods, mult) => mods.flatMap((m) => m.tallas.map((t, i) => ({ sku: `PRB-${m.clave}-${t}`, cantidad: Math.max(1, Math.round(m.semanal * m.pesos[i] * mult)), descripcion: m.pdf })))
  const abierta = (estado, planta, limite, mods, mult) => {
    const o = { numero: String(numOC++), planta, fecha_oc: sumarDias(hoy, -3), fecha_limite: sumarDias(hoy, limite), estado, lineas: lineasDe(mods, mult) }
    ordenes_compra.push(o)
    return o
  }
  abierta('recibida', PLANTAS_PRUEBA[0], 6, [verdes[0], verdes[1]], 0.5)
  abierta('recibida', PLANTAS_PRUEBA[3], -1, [verdes[3], verdes[4]], 1.5) // vencida
  let ot = 1
  for (const [planta, lim, mods] of [[PLANTAS_PRUEBA[1], 8, [verdes[2], verdes[3]]], [PLANTAS_PRUEBA[2], 3, [verdes[5]]]]) {
    const o = abierta('en_taller', planta, lim, mods, 1.5)
    ordenes_taller.push({ folio: `OT-PRB-${String(ot++).padStart(3, '0')}`, oc: o.numero, estado: 'abierta', fecha_compromiso: o.fecha_limite, lineas: o.lineas.map(({ sku, cantidad }) => ({ sku, cantidad })) })
  }
  const lista = abierta('lista', PLANTAS_PRUEBA[4], 4, [verdes[0]], 0.2)
  const otLista = `OT-PRB-${String(ot++).padStart(3, '0')}`
  ordenes_taller.push({ folio: otLista, oc: lista.numero, estado: 'terminada', fecha_compromiso: lista.fecha_limite, terminada_fecha: ayer, lineas: lista.lineas.map(({ sku, cantidad }) => ({ sku, cantidad })) })
  for (const l of lista.lineas) producir(ayer, l.sku, l.cantidad, { referencia: otLista, ot: otLista, oc: lista.numero })

  // Último lote de producción (ayer): deja cada modelo en su nivel, con el
  // mismo cálculo que la pantalla (por modelo, sumando tallas).
  const prodsSim = P.map((p) => ({ id: p.sku, sku: p.sku, modelo: p.modelo, talla: p.talla }))
  const movsSim = movimientos.map((m) => ({ ...m, producto_id: m.sku, planta_id: m.planta }))
  const { porProducto } = consumoSemanalPorProducto(movsSim)
  for (const p of P) {
    const cs = porProducto[p.sku] || 0
    const enPlantas = PLANTAS_PRUEBA.reduce((s, pl) => s + reg[pl + '|' + p.sku], 0)
    const nec20 = (cs / 7) * DIAS_DOS_ENTREGAS
    let meta = bodega[p.sku]
    if (p.nivel === 'verde') meta = Math.max(Math.ceil(nec20 * 1.25) + 2, Math.ceil(5 * cs - enPlantas))
    if (p.nivel === 'amarillo') meta = Math.ceil(nec20) + 1 // cubre 2 entregas, pero menos de 4 semanas
    producir(ayer, p.sku, meta - bodega[p.sku])
  }
  void prodsSim

  // Una OC armada con piezas de bodega (sin orden de taller): ~30% de lo que hay.
  const armada = { numero: String(numOC++), planta: PLANTAS_PRUEBA[1], fecha_oc: sumarDias(hoy, -4), fecha_limite: sumarDias(hoy, 2), estado: 'armada', lineas: [] }
  for (const m of [verdes[1], verdes[2]]) {
    for (const t of m.tallas) {
      const sku = `PRB-${m.clave}-${t}`
      const n = Math.floor(bodega[sku] * 0.3)
      if (n > 0) armada.lineas.push({ sku, cantidad: n, descripcion: m.pdf })
    }
  }
  if (armada.lineas.length) ordenes_compra.push(armada)

  const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  return {
    plantas: PLANTAS_PRUEBA.map((nombre) => ({ nombre })),
    productos: P.map(({ sku, nombre, modelo, talla, precio_consumo }) => ({ sku, nombre, modelo, talla, precio_consumo })),
    maximos,
    ordenes_compra,
    ordenes_taller,
    movimientos: ordenados,
  }
}
