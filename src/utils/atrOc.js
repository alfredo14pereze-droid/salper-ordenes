// V215 — Órdenes de compra de ATR: utilidades puras (sugerir la bata de un
// renglón leído del PDF, ordenar la lista, % surtido, urgencia de la fecha
// de entrega). Sin dependencias de React ni de Supabase; pruebas en
// atrOc.test.js.
import { emparejar, normalizar, normalizarTalla, ordenTalla } from './atrCarga.js'

export const ESTADOS_OC = {
  abierta: 'Abierta',
  parcial: 'Parcial',
  surtida: 'Surtida',
  cancelada: 'Cancelada',
}

// Texto como lo guarda la base (atr_texto_norm): minúsculas y un solo espacio.
// Se usa para buscar lo aprendido; la base hace lo mismo al guardar.
export function textoAlias(t) {
  return String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------
// Leer una descripción de OC de ATR. Cada planta de ATR usa sus propios
// números de parte y su propia redacción ("BATA AZUL CIELO TALLA GRANDE SIN
// BOLSAS", "batas azul cielo sin bolsas talla XL", "BATABLNCATALLACHICA…"),
// así que la bata se reconoce SOLO por la descripción: color + talla + con o
// sin bolsa. Nunca por el número de parte.
// ---------------------------------------------------------------------
const PALABRAS = /(batas?|talla|bolsas?|sin|con)/g
const TALLA_TXT = /\btalla\s+(extra\s*grande|chica|chico|mediana|mediano|grande|xxxxl|xxxl|xxl|[2-4]\s*xl|xl|xg|ch|m|l|s|g)\b/
const TALLA_SUELTA = /\b(extra\s*grande|xxxxl|xxxl|xxl|[2-4]\s*xl|xl|xg)\b/

function distancia(a, b) {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[m][n]
}

// { bolsa: true|false|null, talla: 'M'|''…, color: texto que quedó }
export function leerDescripcionAtr(texto) {
  let t = normalizar(texto).replace(/c\s*\/\s*/g, ' con ').replace(/s\s*\/\s*/g, ' sin ')
  // Texto pegado (algunos PDF no traen espacios): separa las palabras clave.
  t = t.replace(PALABRAS, ' $1 ').replace(/\s+/g, ' ').trim()
  let bolsa = null
  const mb = t.match(/\b(con|sin)\s+bolsas?\b/)
  if (mb) bolsa = mb[1] === 'con'
  let talla = ''
  const mt = t.match(TALLA_TXT) || t.match(TALLA_SUELTA)
  if (mt) talla = normalizarTalla(mt[1])
  const color = t
    .replace(/\b(con|sin)\s+bolsas?\b/g, ' ')
    .replace(TALLA_TXT, ' ')
    .replace(TALLA_SUELTA, ' ')
    .replace(/\b(batas?|talla|de|color|pza|pzas|piezas?)\b/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { bolsa, talla, color }
}

// Color del catálogo más parecido (tolera errores de dedo: "blnca" → Blanca).
export function colorDelCatalogo(color, productos) {
  const c = normalizar(color).replace(/\s+/g, '')
  if (!c) return null
  const colores = [...new Set((productos || []).map((p) => normalizar(p.color)).filter(Boolean))]
  const exacto = colores.find((x) => x.replace(/\s+/g, '') === c)
  if (exacto) return exacto
  const tope = Math.max(1, Math.floor(c.length * 0.25))
  const cerca = colores
    .map((x) => ({ x, d: distancia(x.replace(/\s+/g, ''), c) }))
    .filter((r) => r.d <= tope)
    .sort((a, b) => a.d - b.d)
  if (!cerca.length) return null
  if (cerca.length > 1 && cerca[1].d === cerca[0].d) return null // empate: que lo elija una persona
  return cerca[0].x
}

// Bata sugerida para un renglón del PDF.
// alias: { [textoAlias]: producto_id } (lo aprendido en OCs anteriores).
// Regresa { producto_id, como, talla } con como = 'aprendido' | 'descripcion' | null.
export function sugerirBata(texto, productos, alias = {}) {
  const t = textoAlias(texto)
  const leido = leerDescripcionAtr(texto)
  if (!t) return { producto_id: '', como: null, talla: '' }
  const aprendido = alias[t]
  if (aprendido && productos.some((p) => p.id === aprendido)) return { producto_id: aprendido, como: 'aprendido', talla: leido.talla }
  const color = colorDelCatalogo(leido.color, productos)
  if (color) {
    const delColor = productos.filter((p) => normalizar(p.color) === color)
    const p = leido.bolsa === null ? (delColor.length === 1 ? delColor[0] : null) : delColor.find((x) => !!x.con_bolsa === leido.bolsa)
    if (p) return { producto_id: p.id, como: 'descripcion', talla: leido.talla }
  }
  return { producto_id: '', como: null, talla: leido.talla }
}

// Renglones del lector de PDF → renglones de la revisión. La talla sale de
// lo que leyó el PDF o, si no la separó, de la descripción.
export function renglonesDesdePdf(articulos, productos, alias) {
  return (articulos || []).map((a) => {
    const s = sugerirBata(a.nombre, productos, alias)
    return {
      texto_pdf: a.nombre || '',
      talla_pdf: a.talla || '',
      talla: a.talla ? normalizarTalla(a.talla) : s.talla,
      cantidad: a.cantidad ? String(a.cantidad) : '',
      producto_id: s.producto_id,
      como: s.como,
    }
  })
}

// Problemas de un renglón antes de guardar (null = está bien).
export function problemaRenglon(r, tallasValidas) {
  if (!r.producto_id) return 'Sin bata: asígnala o dala de alta'
  if (!r.talla) return 'Sin talla'
  if (tallasValidas && !tallasValidas.includes(r.talla)) return `Talla ${r.talla} no existe en esta bata`
  if (!/^\d+$/.test(String(r.cantidad)) || Number(r.cantidad) <= 0) return 'Cantidad inválida'
  return null
}

// Claves bata|talla repetidas en la revisión (se avisan: la base las suma).
export function repetidos(renglones) {
  const c = {}
  for (const r of renglones) if (r.producto_id && r.talla) c[`${r.producto_id}|${r.talla}`] = (c[`${r.producto_id}|${r.talla}`] || 0) + 1
  return new Set(Object.keys(c).filter((k) => c[k] > 1))
}

export const normOC = (x) => normalizar(x).replace(/\s+/g, '')

// ¿Ya existe una OC activa con ese número?
export function ocRepetida(numero, lista) {
  const n = normOC(numero)
  if (!n) return null
  return (lista || []).find((o) => o.estado !== 'cancelada' && normOC(o.numero_oc) === n) || null
}

export function pctSurtido(oc) {
  if (!oc.pedido) return 0
  return Math.min(100, Math.round((oc.surtido / oc.pedido) * 100))
}

// Abiertas y parciales primero (por fecha de entrega, sin fecha al final);
// luego surtidas y canceladas, más recientes primero.
const PESO = { abierta: 0, parcial: 0, surtida: 1, cancelada: 2 }
export function ordenarOcs(lista) {
  return [...(lista || [])].sort((a, b) => {
    const pa = PESO[a.estado] ?? 3
    const pb = PESO[b.estado] ?? 3
    if (pa !== pb) return pa - pb
    if (pa === 0) {
      if (a.fecha_entrega && b.fecha_entrega && a.fecha_entrega !== b.fecha_entrega) return a.fecha_entrega < b.fecha_entrega ? -1 : 1
      if (a.fecha_entrega && !b.fecha_entrega) return -1
      if (!a.fecha_entrega && b.fecha_entrega) return 1
    }
    return String(b.creado_en || '').localeCompare(String(a.creado_en || ''))
  })
}

// Misma regla que la tarjeta de orden (OrderCard): vencida, hoy o ≤3 días =
// rojo; 4–7 días = ámbar; más, neutro. Surtida/cancelada no alarman.
// dias = días que faltan (negativo = ya pasó). Regresa { nivel, texto }.
export function urgenciaEntrega(estado, dias) {
  if (estado === 'surtida') return { nivel: 'good', texto: '✓ Surtida' }
  if (estado === 'cancelada') return { nivel: null, texto: 'Cancelada' }
  if (dias === null || dias === undefined) return { nivel: null, texto: 'Sin fecha de entrega' }
  if (dias < 0) return { nivel: 'overdue', texto: `Atrasada ${-dias} día${dias === -1 ? '' : 's'}` }
  if (dias === 0) return { nivel: 'overdue', texto: 'Entrega hoy' }
  const texto = `Entrega en ${dias} día${dias === 1 ? '' : 's'}`
  if (dias <= 3) return { nivel: 'overdue', texto }
  if (dias <= 7) return { nivel: 'warning', texto }
  return { nivel: null, texto }
}

// ---------------------------------------------------------------------
// Parte 4 — "Qué nos falta" y surtido
// ---------------------------------------------------------------------

// Color de una fila de faltantes (columnas de atr_faltantes):
//   'rojo'     → falta producir (faltante > 0)
//   'amarillo' → faltante 0, pero solo porque cuenta lo que está en taller
//   null       → alcanza con la existencia
export function nivelFaltante(f) {
  if (f.faltante > 0) return 'rojo'
  if (f.en_taller > 0 && f.pendiente > Math.max(0, f.existencia)) return 'amarillo'
  return null
}

const csvCelda = (v) => {
  const t = String(v ?? '')
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function faltantesCSV(filas) {
  const enc = ['Bata', 'Talla', 'Pendiente por surtir', 'Existencia', 'En taller', 'Faltante', 'Órdenes en taller']
  const lineas = filas.map((f) => [
    f.producto, f.talla, f.pendiente, f.existencia, f.en_taller, f.faltante,
    (f.en_taller_ordenes || []).map((o) => `${o.order_number || 's/folio'} (${o.cantidad})`).join(' / '),
  ])
  return '﻿' + [enc, ...lineas].map((l) => l.map(csvCelda).join(',')).join('\n') + '\n'
}

// Cantidad que se propone surtir por línea: min(pendiente, existencia ≥ 0).
export function cantidadPropuesta(l) {
  return Math.max(0, Math.min(l.pendiente, Math.max(0, l.existencia)))
}

// Revisa lo capturado para surtir. cant: { [oc_linea_id]: texto }.
// Regresa { lineas: [{oc_linea_id, cantidad}], errores: [], negativos: [], piezas }.
export function revisarSurtido(lineasOc, cant) {
  const out = { lineas: [], errores: [], negativos: [], piezas: 0 }
  for (const l of lineasOc) {
    const txt = String(cant[l.oc_linea_id] ?? '').trim()
    if (txt === '' || txt === '0') continue
    if (!/^\d+$/.test(txt)) { out.errores.push(`${l.producto} ${l.talla}: cantidad inválida`); continue }
    const c = Number(txt)
    if (c > l.pendiente) { out.errores.push(`${l.producto} ${l.talla}: pendiente ${l.pendiente}, capturaste ${c}`); continue }
    if (l.existencia - c < 0) out.negativos.push(`${l.producto} ${l.talla} (hay ${l.existencia}, salen ${c})`)
    out.lineas.push({ oc_linea_id: l.oc_linea_id, cantidad: c })
    out.piezas += c
  }
  return out
}

// Movimientos de una OC (salida_surtido / reversa_surtido) agrupados por
// surtido. lineasOc da el nombre de la bata y la talla de cada línea.
export function agruparSurtidos(movs, lineasOc) {
  const porLinea = Object.fromEntries((lineasOc || []).map((l) => [l.oc_linea_id, l]))
  const grupos = new Map()
  for (const m of movs || []) {
    if (!m.surtido_id) continue
    if (!grupos.has(m.surtido_id)) {
      grupos.set(m.surtido_id, { surtido_id: m.surtido_id, fecha: null, usuario: null, nota: null, lineas: [], piezas: 0, deshecho: null })
    }
    const g = grupos.get(m.surtido_id)
    if (m.tipo === 'salida_surtido') {
      const l = porLinea[m.oc_linea_id] || {}
      g.fecha = g.fecha && g.fecha < m.creado_en ? g.fecha : m.creado_en
      g.usuario = g.usuario || m.usuario_nombre
      g.nota = g.nota || m.nota
      g.lineas.push({ producto: l.producto || '—', talla: m.talla, cantidad: -m.cantidad })
      g.piezas += -m.cantidad
    } else if (m.tipo === 'reversa_surtido') {
      g.deshecho = { fecha: m.creado_en, usuario: m.usuario_nombre, motivo: m.nota }
    }
  }
  return [...grupos.values()]
    .filter((g) => g.lineas.length)
    .map((g) => ({ ...g, lineas: g.lineas.sort((a, b) => a.producto.localeCompare(b.producto, 'es')) }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
}

// ---------------------------------------------------------------------
// Parte 5 — Orden de taller desde "Qué nos falta"
// ---------------------------------------------------------------------
// Filas elegidas → prendas para el formulario normal de Nueva orden: una
// prenda por bata, con sus tallas; cantidad = faltante (vacía si la fila
// no tenía faltante: se eligió para producir de más y se captura a mano).
// productos: batas de ATR (id, nombre, garment, color, especificaciones…).
// Regresa [{ producto, sizes: [{talla, cantidad}] }] en orden de nombre y talla.
export function prendasParaOrden(filas, productos) {
  const porId = Object.fromEntries((productos || []).map((p) => [p.id, p]))
  const grupos = new Map()
  for (const f of filas || []) {
    const producto = porId[f.producto_id] || { id: f.producto_id, nombre: f.producto, garment: 'Bata', color: f.color || '' }
    if (!grupos.has(producto.id)) grupos.set(producto.id, { producto, sizes: [] })
    grupos.get(producto.id).sizes.push({ talla: f.talla, cantidad: f.faltante > 0 ? String(f.faltante) : '' })
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, sizes: g.sizes.sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla)) }))
    .sort((a, b) => String(a.producto.nombre).localeCompare(String(b.producto.nombre), 'es'))
}

// Selección por defecto: todas las filas con faltante.
export const seleccionInicial = (filas) => new Set((filas || []).filter((f) => f.faltante > 0).map((f) => `${f.producto_id}|${f.talla}`))
