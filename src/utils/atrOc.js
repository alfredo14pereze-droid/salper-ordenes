// V215 — Órdenes de compra de ATR: utilidades puras (sugerir la bata de un
// renglón leído del PDF, ordenar la lista, % surtido, urgencia de la fecha
// de entrega). Sin dependencias de React ni de Supabase; pruebas en
// atrOc.test.js.
import { emparejar, normalizar, normalizarTalla } from './atrCarga.js'

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

// Bata sugerida para un renglón del PDF.
// alias: { [textoAlias]: producto_id } (lo aprendido en OCs anteriores).
// Regresa { producto_id, como } con como = 'aprendido' | 'parecido' | null.
export function sugerirBata(texto, productos, alias = {}) {
  const t = textoAlias(texto)
  if (!t) return { producto_id: '', como: null }
  const aprendido = alias[t]
  if (aprendido && productos.some((p) => p.id === aprendido)) return { producto_id: aprendido, como: 'aprendido' }
  const p = emparejar(texto, '', productos)
  return p ? { producto_id: p.id, como: 'parecido' } : { producto_id: '', como: null }
}

// Renglones del lector de PDF → renglones de la revisión.
export function renglonesDesdePdf(articulos, productos, alias) {
  return (articulos || []).map((a) => {
    const s = sugerirBata(a.nombre, productos, alias)
    return {
      texto_pdf: a.nombre || '',
      talla_pdf: a.talla || '',
      talla: a.talla ? normalizarTalla(a.talla) : '',
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
