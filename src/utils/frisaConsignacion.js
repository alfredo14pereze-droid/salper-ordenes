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

// ---------- Datos de prueba ----------
// Arma 5 plantas, 10 SKUs (3 de alta rotación), máximos y ~3 meses de
// movimientos (entregas cada 10 días, consumo quincenal, 1 confirmación
// mensual con diferencias chicas). Deja 1 SKU en rojo y 2 en amarillo.
// Determinista (misma semilla → mismos datos) para que se pueda probar.
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
// semanal = consumo semanal total esperado (todas las plantas); nivel = cómo debe quedar.
export const PRODUCTOS_PRUEBA = [
  { sku: 'PRB-PLA-MC', nombre: 'Playera reflejante manga corta', precio_consumo: 185, semanal: 120, nivel: 'verde' },
  { sku: 'PRB-CAM-MZ', nombre: 'Camisa mezclilla', precio_consumo: 420, semanal: 90, nivel: 'rojo' },
  { sku: 'PRB-PLA-ML', nombre: 'Playera reflejante manga larga', precio_consumo: 210, semanal: 70, nivel: 'amarillo' },
  { sku: 'PRB-PAN-GB', nombre: 'Pantalón gabardina', precio_consumo: 390, semanal: 22, nivel: 'verde' },
  { sku: 'PRB-CHA-RF', nombre: 'Chaleco reflejante', precio_consumo: 160, semanal: 18, nivel: 'amarillo' },
  { sku: 'PRB-SUD-MR', nombre: 'Sudadera marino', precio_consumo: 340, semanal: 12, nivel: 'verde' },
  { sku: 'PRB-OVE-AZ', nombre: 'Overol azul', precio_consumo: 650, semanal: 9, nivel: 'verde' },
  { sku: 'PRB-CHM-IN', nombre: 'Chamarra industrial', precio_consumo: 720, semanal: 6, nivel: 'verde' },
  { sku: 'PRB-GOR-BL', nombre: 'Gorra bordada', precio_consumo: 95, semanal: 10, nivel: 'verde' },
  { sku: 'PRB-BAT-BL', nombre: 'Bata blanca', precio_consumo: 280, semanal: 5, nivel: 'verde' },
]
const PESO_PLANTA = [0.3, 0.25, 0.2, 0.15, 0.1]

export function generarDatosPrueba(hoy = hoyISO(), seed = 180) {
  const r = rng(seed)
  const [hy, hm] = hoy.split('-').map(Number)
  // Arranca el día 1 de hace 3 meses.
  const inicioMes = new Date(Date.UTC(hy, hm - 1 - 3, 1))
  const inicio = aISO(inicioMes)
  const movimientos = []
  let lote = 0
  const add = (m) => movimientos.push(m)

  const P = PRODUCTOS_PRUEBA
  // Máximo por planta = 3 semanas de consumo de esa planta.
  const semanasMax = () => 3
  const maximos = []
  const maxDe = {}
  for (const [pi, planta] of PLANTAS_PRUEBA.entries()) {
    for (const p of P) {
      const mx = Math.max(10, Math.ceil((p.semanal * PESO_PLANTA[pi] * semanasMax(p)) / 5) * 5)
      maximos.push({ planta, sku: p.sku, maximo: mx })
      maxDe[planta + '|' + p.sku] = mx
    }
  }

  // Estado físico (lo que de verdad hay) y registrado (lo que dicen los movimientos).
  const bodega = Object.fromEntries(P.map((p) => [p.sku, 0]))
  const reg = {} // planta|sku → stock registrado
  const fisico = {} // planta|sku → stock físico
  const acumulado = {} // planta|sku → consumo de la quincena en curso
  for (const pl of PLANTAS_PRUEBA) for (const p of P) { reg[pl + '|' + p.sku] = 0; fisico[pl + '|' + p.sku] = 0; acumulado[pl + '|' + p.sku] = 0 }

  const producir = (fecha, sku, cant, ref) => {
    if (cant <= 0) return
    add({ fecha, tipo: 'produccion', sku, planta: null, cantidad: cant, referencia: ref })
    bodega[sku] += cant
  }

  let op = 1
  const ultimoFin = aISO(new Date(Date.UTC(hy, hm - 1, 0)))
  for (let f = inicio; f < hoy; f = sumarDias(f, 1)) {
    const dia = diasEntre(inicio, f)
    // Entrega cada 10 días (día 0, 10, 20…), reponiendo hasta el máximo
    // según lo que de verdad hay en la planta.
    if (dia % 10 === 0) {
      lote++
      const ref = `Viaje ${lote}`
      const pedido = {}
      // Los SKUs que deben quedar en amarillo: en los últimos viajes solo se
      // completa ~15% del máximo (la entrega es libre), para que las plantas
      // queden bajas.
      const final = diasEntre(f, hoy) <= 35
      for (const pl of PLANTAS_PRUEBA) for (const p of P) {
        const k = pl + '|' + p.sku
        const tope = final && p.nivel === 'amarillo' ? Math.round(maxDe[k] * 0.15) : maxDe[k]
        const hay = final && p.nivel === 'amarillo' ? Math.max(reg[k], fisico[k]) : fisico[k] // el chofer ve lo que hay en el anaquel
        const n = Math.max(0, Math.round(tope - hay))
        if (n > 0) pedido[k] = n
      }
      // Producción que llega a bodega 2 días antes si no alcanza.
      for (const p of P) {
        const necesita = PLANTAS_PRUEBA.reduce((s, pl) => s + (pedido[pl + '|' + p.sku] || 0), 0)
        if (necesita > bodega[p.sku]) {
          // El SKU que debe quedar en rojo se produce justo; los demás con colchón de ~3 semanas.
          const colchon = p.nivel === 'verde' ? p.semanal * 3 : 0
          const cant = redondearArriba10(necesita - bodega[p.sku] + colchon)
          producir(sumarDias(f, -2), p.sku, cant, `OP-${String(op++).padStart(3, '0')}`)
        }
      }
      for (const [k, n] of Object.entries(pedido)) {
        const [pl, sku] = k.split('|')
        add({ fecha: f, tipo: 'entrega', sku, planta: pl, cantidad: n, lote: 'e' + lote, referencia: ref })
        bodega[sku] -= n
        reg[k] += n
        fisico[k] += n
      }
    }
    // Consumo físico diario (con ruido).
    for (const [pi, pl] of PLANTAS_PRUEBA.entries()) for (const p of P) {
      const k = pl + '|' + p.sku
      const diario = (p.semanal * PESO_PLANTA[pi]) / 7
      const c = Math.min(fisico[k], diario * (0.6 + r() * 0.8))
      fisico[k] -= c
      acumulado[k] += c
    }
    // Fin de quincena: Frisa reporta y SALPER captura el consumo.
    const q = quincenaDe(f)
    if (f === q.fin) {
      lote++
      for (const pl of PLANTAS_PRUEBA) for (const p of P) {
        const k = pl + '|' + p.sku
        const n = Math.min(reg[k], Math.round(acumulado[k]))
        acumulado[k] = 0
        if (n > 0) {
          add({ fecha: f, tipo: 'consumo', sku: p.sku, planta: pl, cantidad: n, lote: 'c' + lote + pl, referencia: `Quincena ${q.etiqueta}` })
          reg[k] -= n
        }
      }
    }
    // Confirmación mensual: el último fin de mes completo, después de capturar
    // su consumo. Frisa cuenta y sale una diferencia chica en ~1 de cada 4.
    if (f === ultimoFin) {
      for (const pl of PLANTAS_PRUEBA) {
        lote++
        for (const p of P) {
          const k = pl + '|' + p.sku
          const calc = reg[k]
          const dif = r() < 0.25 ? Math.max(-calc, Math.round(r() * 5) - 3) : 0 // −3 a +2
          add({ fecha: f, tipo: 'ajuste_confirmacion', sku: p.sku, planta: pl, cantidad: dif, confirmado: calc + dif, lote: 'a' + lote + pl, notas: 'Confirmación mensual (prueba)' })
          reg[k] += dif
          fisico[k] = Math.max(0, fisico[k] + dif)
        }
      }
    }
  }
  for (const k of Object.keys(reg)) if (reg[k] < 0) throw new Error('Stock negativo en ' + k)

  // Último lote de producción (ayer) para dejar cada SKU en su nivel, con el
  // mismo cálculo que usa la pantalla.
  const porSku = movimientos.map((m) => ({ ...m, producto_id: m.sku, planta_id: m.planta }))
  const { porProducto } = consumoSemanalPorProducto(porSku)
  const ayer = sumarDias(hoy, -1)
  for (const p of P) {
    const cs = porProducto[p.sku] || 0
    const enPlantas = PLANTAS_PRUEBA.reduce((s, pl) => s + reg[pl + '|' + p.sku], 0)
    const nec20 = (cs / 7) * DIAS_DOS_ENTREGAS
    let meta = bodega[p.sku]
    if (p.nivel === 'verde') meta = Math.max(Math.ceil(nec20 * 1.25), Math.ceil(5 * cs - enPlantas))
    if (p.nivel === 'amarillo') meta = Math.ceil(nec20) + 1 // apenas lo de 2 entregas: no es rojo, pero cubre < 4 semanas
    producir(ayer, p.sku, meta - bodega[p.sku], `OP-${String(op++).padStart(3, '0')}`)
  }

  const ordenados = [...movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  return {
    plantas: PLANTAS_PRUEBA.map((nombre) => ({ nombre })),
    productos: P.map(({ sku, nombre, precio_consumo }) => ({ sku, nombre, precio_consumo })),
    maximos,
    movimientos: ordenados,
  }
}
