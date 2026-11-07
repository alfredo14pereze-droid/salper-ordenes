// V184 — Niveles de inventario Frisa (reemplaza el Sheet "Consumos Frisa
// Niveles"). Aquí viven TODOS los cálculos; la base solo guarda consumos,
// stock y supuestos (ver supabase/schema_v184_frisa_niveles.sql).
//
//   demanda diaria = consumo_2026 ÷ dias_periodo
//   mínimo  = ceil(demanda × dias_minimo)    stock ≤ mínimo  → CRÍTICO
//   reorden = ceil(demanda × dias_reorden)   stock ≤ reorden → PEDIR
//   máximo  = ceil(demanda × dias_maximo)    si no           → OK
//   Sin ventas en 2026 (demanda 0) → siempre OK.
// (≤ como el Sheet; decisión de Alfredo 2026-11-06.)
//   A PEDIR = máximo − stock, solo en CRÍTICO o PEDIR (si no, null)
//
// stock = lo que hay en el almacén de la fábrica (no en las plantas).
// V185 — si la fila trae `disponible` (real − apartado), los niveles se
// calculan con el disponible; si no, con stock_actual.

export const ESTADOS = {
  critico: { key: 'critico', label: 'CRÍTICO', orden: 0 },
  pedir: { key: 'pedir', label: 'PEDIR', orden: 1 },
  ok: { key: 'ok', label: 'OK', orden: 2 },
}

export const CONFIG_INICIAL = { dias_periodo: 289, dias_maximo: 42, dias_reorden: 28, dias_minimo: 20 }

// ceil(consumo × dias ÷ periodo) en enteros: evita que 3.0000000004 suba a 4.
function nivel(consumo, dias, periodo) {
  const c = Math.max(0, Math.round(Number(consumo) || 0))
  const d = Math.max(0, Math.round(Number(dias) || 0))
  const p = Math.round(Number(periodo) || 0)
  if (!c || !d || p <= 0) return 0
  const n = c * d
  return Math.floor(n / p) + (n % p === 0 ? 0 : 1)
}

export function demandaDiaria(consumo2026, diasPeriodo) {
  const p = Number(diasPeriodo) || 0
  return p > 0 ? (Number(consumo2026) || 0) / p : 0
}

// prod: { consumo_2026, stock_actual }; cfg: dias_*
export function calcularNiveles(prod, cfg = CONFIG_INICIAL) {
  const consumo = Number(prod?.consumo_2026) || 0
  const stock = Number(prod?.disponible ?? prod?.stock_actual) || 0
  const minimo = nivel(consumo, cfg.dias_minimo, cfg.dias_periodo)
  const reorden = nivel(consumo, cfg.dias_reorden, cfg.dias_periodo)
  const maximo = nivel(consumo, cfg.dias_maximo, cfg.dias_periodo)
  const estado = consumo === 0 ? 'ok' : stock <= minimo ? 'critico' : stock <= reorden ? 'pedir' : 'ok'
  const aPedir = estado === 'ok' ? null : Math.max(0, maximo - stock)
  return {
    demanda: demandaDiaria(consumo, cfg.dias_periodo),
    minimo,
    reorden,
    maximo,
    estado,
    aPedir,
    sinMovimiento: consumo === 0,
  }
}

export function conNiveles(productos, cfg) {
  return (productos || []).map((p) => ({ ...p, niveles: calcularNiveles(p, cfg) }))
}

// CRÍTICO primero, luego PEDIR, luego OK; dentro, A PEDIR de mayor a menor; luego clave.
export function ordenarPorEstado(filas) {
  return [...filas].sort((a, b) => {
    const e = ESTADOS[a.niveles.estado].orden - ESTADOS[b.niveles.estado].orden
    if (e) return e
    const d = (b.niveles.aPedir ?? -1) - (a.niveles.aPedir ?? -1)
    if (d) return d
    return String(a.clave).localeCompare(String(b.clave))
  })
}

export function resumenNiveles(filas) {
  const r = { critico: 0, pedir: 0, ok: 0, piezasAPedir: 0, claves: filas.length }
  for (const f of filas) {
    r[f.niveles.estado]++
    r.piezasAPedir += f.niveles.aPedir || 0
  }
  return r
}

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// filtros: { estado: 'todos'|'critico'|'pedir'|'ok'|'alerta', tipo, color, texto, mostrarSinMovimiento }
export function filtrarNiveles(filas, f = {}) {
  const texto = sinAcentos(f.texto)
  return filas.filter((p) => {
    if (!f.mostrarSinMovimiento && p.niveles.sinMovimiento) return false
    if (f.estado === 'alerta' && p.niveles.estado === 'ok') return false
    if (f.estado && !['todos', 'alerta'].includes(f.estado) && p.niveles.estado !== f.estado) return false
    if (f.tipo && (p.tipo || '') !== f.tipo) return false
    if (f.color && (p.color || '') !== f.color) return false
    if (texto && !sinAcentos(p.clave).includes(texto) && !sinAcentos(p.nombre).includes(texto) && !(p.codigos || []).some((c) => sinAcentos(c).includes(texto))) return false
    return true
  })
}

// Valores distintos (sin vacíos ni "-") para los filtros de tipo/color.
export function opcionesDe(productos, campo) {
  const set = new Set()
  for (const p of productos || []) {
    const v = (p[campo] || '').trim()
    if (v && v !== '-') set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

export function formatoDemanda(d) {
  return (Number(d) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

// Lector de CSV con comillas ("a, b" y "" dentro). Acepta , o ; como separador.
export function parseCSV(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '')
  const primera = t.split(/\r?\n/, 1)[0] || ''
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ','
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else campo += ch
    } else if (ch === '"') enComillas = true
    else if (ch === sep) { fila.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += ch
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

// "1,234" → 1234; "" / "-" → null; "3.04" → 3.04
export function numeroCSV(v) {
  const s = String(v ?? '').trim().replace(/[\s$]/g, '')
  if (!s || s === '-' || s === '—') return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const texto = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

// Encabezado del Sheet → campo. Se compara sin acentos ni mayúsculas.
const COLUMNAS = [
  ['clave', (h) => h === 'clave'],
  ['nombre', (h) => h === 'nombre'],
  ['tipo', (h) => h === 'tipo'],
  ['reflejante', (h) => h.startsWith('reflejante')],
  ['manga', (h) => h === 'manga'],
  ['color', (h) => h === 'color'],
  ['consumo_2025', (h) => h === '2025'],
  ['consumo_2026', (h) => h === '2026'],
  ['total', (h) => h === 'total'],
  ['demanda', (h) => h.startsWith('demanda')],
  ['clase_abc', (h) => h.includes('abc')],
  ['stock_actual', (h) => h.startsWith('stock')],
  ['minimo', (h) => h.startsWith('minimo')],
  ['reorden', (h) => h.startsWith('reorden')],
  ['maximo', (h) => h.startsWith('maximo')],
  ['estado', (h) => h === 'estado'],
  ['a_pedir', (h) => h.replace(/\s+/g, ' ') === 'a pedir'],
  ['tendencia', (h) => h.startsWith('tendencia')],
  ['nota', (h) => h.startsWith('nota')],
]

export function estadoDeTexto(v) {
  const s = sinAcentos(v).replace(/[^a-z]/g, '')
  if (s.includes('critico')) return 'critico'
  if (s.includes('pedir')) return 'pedir'
  if (s === 'ok' || s.includes('ok')) return 'ok'
  return null
}

// Niveles.csv: los encabezados están en la fila 3 (se busca la fila que
// empieza con "Clave" por si cambia). Regresa { productos, sheet, errores }.
//   productos: lo que se manda a frisa_niveles_importar
//   sheet: { clave → {minimo, reorden, maximo, estado, a_pedir} } del Sheet, para comparar
export function parseNivelesCSV(textoCsv) {
  const filas = parseCSV(textoCsv)
  const iHead = filas.findIndex((f) => sinAcentos(f[0]) === 'clave')
  if (iHead < 0) return { productos: [], sheet: {}, errores: ['No encontré la fila de encabezados (la que empieza con "Clave").'] }
  const head = filas[iHead].map(sinAcentos)
  const idx = {}
  for (const [campo, prueba] of COLUMNAS) {
    const i = head.findIndex((h) => prueba(h))
    if (i >= 0) idx[campo] = i
  }
  const errores = []
  for (const req of ['clave', 'nombre', 'consumo_2026', 'stock_actual']) {
    if (idx[req] == null) errores.push(`Falta la columna "${req}".`)
  }
  if (errores.length) return { productos: [], sheet: {}, errores }
  const val = (f, c) => (idx[c] == null ? undefined : f[idx[c]])
  const productos = []
  const sheet = {}
  const vistas = new Set()
  let fin = false
  filas.slice(iHead + 1).forEach((f, n) => {
    if (fin) return
    const clave = texto(val(f, 'clave'))
    // La tabla termina en la primera fila sin clave (la de TOTAL); abajo
    // vienen las leyendas de estado y ABC, que no son claves.
    if (!clave) {
      if (productos.length) fin = true
      return
    }
    const linea = iHead + n + 2
    const k = clave.toLowerCase()
    if (vistas.has(k)) { errores.push(`Clave repetida ${clave} (renglón ${linea}).`); return }
    vistas.add(k)
    const c25 = numeroCSV(val(f, 'consumo_2025'))
    const c26 = numeroCSV(val(f, 'consumo_2026'))
    const stock = numeroCSV(val(f, 'stock_actual'))
    for (const [nom, v] of [['2025', c25], ['2026', c26], ['Stock actual', stock]]) {
      if (v != null && (v < 0 || !Number.isInteger(v))) errores.push(`${clave}: ${nom} = ${v} no es un entero de 0 o más.`)
    }
    productos.push({
      clave,
      nombre: texto(val(f, 'nombre')) || '',
      tipo: texto(val(f, 'tipo')),
      reflejante: texto(val(f, 'reflejante')),
      manga: texto(val(f, 'manga')),
      color: texto(val(f, 'color')),
      consumo_2025: c25 ?? 0,
      consumo_2026: c26 ?? 0,
      clase_abc: texto(val(f, 'clase_abc')),
      tendencia: texto(val(f, 'tendencia')),
      nota: texto(val(f, 'nota')),
      stock_actual: stock ?? 0,
    })
    sheet[clave] = {
      minimo: numeroCSV(val(f, 'minimo')),
      reorden: numeroCSV(val(f, 'reorden')),
      maximo: numeroCSV(val(f, 'maximo')),
      estado: estadoDeTexto(val(f, 'estado')),
      a_pedir: numeroCSV(val(f, 'a_pedir')),
      demanda: numeroCSV(val(f, 'demanda')),
    }
  })
  return { productos, sheet, errores }
}

// Supuestos.csv: Supuesto | Valor | Qué significa.
export function parseSupuestosCSV(textoCsv) {
  const cfg = {}
  for (const f of parseCSV(textoCsv)) {
    const s = sinAcentos(f[0])
    const v = numeroCSV(f[1])
    if (v == null || !s) continue
    if (s.includes('periodo')) cfg.dias_periodo = v
    else if (s.includes('maximo')) cfg.dias_maximo = v
    else if (s.includes('reorden')) cfg.dias_reorden = v
    else if (s.includes('minimo') || s.includes('critico')) cfg.dias_minimo = v
  }
  const faltan = ['dias_periodo', 'dias_maximo', 'dias_reorden', 'dias_minimo'].filter((k) => cfg[k] == null)
  return { config: cfg, errores: faltan.length ? [`En Supuestos.csv no encontré: ${faltan.join(', ')}.`] : [] }
}

// Compara lo que calcula la app contra las columnas del Sheet.
// Regresa [{ clave, campo, sheet, app }] solo donde no coinciden.
export function compararConSheet(productos, sheet, cfg) {
  const dif = []
  for (const p of productos) {
    const s = sheet[p.clave]
    if (!s) continue
    const n = calcularNiveles(p, cfg)
    const pares = [
      ['Mínimo', s.minimo ?? 0, n.minimo],
      ['Reorden', s.reorden ?? 0, n.reorden],
      ['Máximo', s.maximo ?? 0, n.maximo],
      ['Estado', s.estado ? ESTADOS[s.estado].label : '(vacío)', ESTADOS[n.estado].label],
      ['A PEDIR', s.a_pedir ?? '(vacío)', n.aPedir ?? '(vacío)'],
    ]
    for (const [campo, a, b] of pares) {
      if (String(a) !== String(b)) dif.push({ clave: p.clave, campo, sheet: a, app: b })
    }
  }
  return dif
}

// Lista A PEDIR (CRÍTICO + PEDIR) ordenada por estado y piezas.
export function listaAPedir(filas) {
  return ordenarPorEstado(filas.filter((f) => f.niveles.estado !== 'ok'))
}

const csvCampo = (v) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function aPedirCSV(filas) {
  const head = ['Clave', 'Nombre', 'Color', 'Disponible', 'Mínimo', 'Reorden', 'Máximo', 'Estado', 'A PEDIR']
  const lineas = [head.join(',')]
  for (const f of listaAPedir(filas)) {
    const n = f.niveles
    lineas.push([f.clave, f.nombre, f.color, f.disponible ?? f.stock_actual, n.minimo, n.reorden, n.maximo, ESTADOS[n.estado].label, n.aPedir].map(csvCampo).join(','))
  }
  return '﻿' + lineas.join('\r\n') + '\r\n'
}
