// V178 — convierte un renglón de orden_cambios en texto que se entiende:
// "Fecha de entrega: 10 nov → 14 nov", "Playera · talla M: 10 → 12".
// El SQL guarda los campos generales que cambiaron (antes/después) y las
// prendas completas antes y después; aquí se comparan las prendas.
import { formatDate } from './dates'
import { etapasDeEstacion } from '../config/vistasPorRol'
import { situacionEnEstacion } from './ordenesDeEstacion'

const CAMPOS_GENERALES = {
  client_name: 'Cliente',
  order_type_key: 'Tipo de orden',
  requested_delivery_date: 'Fecha de entrega',
  description: 'Descripción',
  client_telefono: 'Teléfono',
  client_correo: 'Correo',
  folios_externos: 'Folios anteriores',
}

// Datos de la prenda que se muestran si cambian (el resto son internos).
const CAMPOS_PRENDA = {
  color: 'Color',
  tela_nombre: 'Tela',
  pantone: 'Pantone',
  manga: 'Manga',
  cuello: 'Cuello',
  punos: 'Puños',
  vivos: 'Vivos',
  logotipos: 'Logotipos',
  numeros: 'Números',
  bordado_ubicacion: 'Ubicación del bordado',
  observaciones: 'Observaciones',
}
const SI_NO_PRENDA = { lleva_bordado: 'Bordado', lleva_bolsas: 'Bolsas', lleva_impresion: 'Impresión' }
const LISTAS_PRENDA = {
  roster: 'cambió la lista de nombres y números',
  bordados: 'cambiaron los bordados',
  impresiones: 'cambiaron las impresiones',
  prenda_operaciones: 'cambiaron las operaciones',
}

const VACIO = '(vacío)'

function texto(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function valorGeneral(campo, v, tiposPorClave) {
  if (campo === 'requested_delivery_date') return v ? formatDate(v) : VACIO
  if (campo === 'folios_externos') return Array.isArray(v) && v.length ? v.join(', ') : VACIO
  if (campo === 'order_type_key') return v ? tiposPorClave?.[v]?.label || v : VACIO
  return texto(v) || VACIO
}

function nombrePrenda(item, i) {
  return texto(item?.garment) || `Prenda ${i + 1}`
}

// talla → cantidad (si una talla se repite, se suman).
function tallas(item) {
  const m = new Map()
  for (const sz of Array.isArray(item?.sizes) ? item.sizes : []) {
    if (!sz || typeof sz !== 'object') continue
    const t = texto(sz.talla)
    if (!t) continue
    m.set(t, (m.get(t) || 0) + (Number(sz.cantidad) || 0))
  }
  return m
}

function textoTallas(item) {
  const partes = [...tallas(item)].map(([t, n]) => `${t} ×${n}`)
  return partes.length ? partes.join(', ') : 'sin tallas'
}

function piezas(items) {
  return (items || []).reduce((s, it) => s + [...tallas(it).values()].reduce((a, b) => a + b, 0), 0)
}

function mismo(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function diferenciasDePrenda(antes, despues) {
  const lineas = []
  if (texto(antes.garment) !== texto(despues.garment)) {
    lineas.push(`Prenda: ${texto(antes.garment) || VACIO} → ${texto(despues.garment) || VACIO}`)
  }
  const ta = tallas(antes)
  const td = tallas(despues)
  for (const [t, n] of td) {
    if (!ta.has(t)) lineas.push(`Se agregó talla ${t} ×${n}`)
    else if (ta.get(t) !== n) lineas.push(`Talla ${t}: ${ta.get(t)} → ${n}`)
  }
  for (const [t, n] of ta) {
    if (!td.has(t)) lineas.push(`Se quitó talla ${t} (eran ${n})`)
  }
  for (const [k, label] of Object.entries(CAMPOS_PRENDA)) {
    if (texto(antes[k]) !== texto(despues[k])) lineas.push(`${label}: ${texto(antes[k]) || VACIO} → ${texto(despues[k]) || VACIO}`)
  }
  for (const [k, label] of Object.entries(SI_NO_PRENDA)) {
    if (!!antes[k] !== !!despues[k]) lineas.push(`${label}: ${antes[k] ? 'sí' : 'no'} → ${despues[k] ? 'sí' : 'no'}`)
  }
  for (const [k, frase] of Object.entries(LISTAS_PRENDA)) {
    if (!mismo(antes[k], despues[k])) lineas.push(frase.charAt(0).toUpperCase() + frase.slice(1))
  }
  return lineas
}

// Empareja prendas por id; las que no tienen id, por posición.
function emparejar(antes, despues) {
  const pares = []
  const usadas = new Set()
  despues.forEach((d, j) => {
    let i = d?.id ? antes.findIndex((a, k) => !usadas.has(k) && a?.id === d.id) : -1
    if (i < 0 && !d?.id && j < antes.length && !usadas.has(j) && !antes[j]?.id) i = j
    if (i >= 0) usadas.add(i)
    pares.push({ antes: i >= 0 ? antes[i] : null, despues: d, i: j })
  })
  antes.forEach((a, k) => {
    if (!usadas.has(k)) pares.push({ antes: a, despues: null, i: k })
  })
  return pares
}

function soloObjetos(items) {
  return Array.isArray(items) ? items.filter((it) => it && typeof it === 'object') : []
}

// → { generales: [{ label, antes, despues }], prendas: [{ titulo, lineas }], total: 'a → b' | null }
export function resumenCambio(cambio, tiposPorClave) {
  const generales = Object.entries(CAMPOS_GENERALES)
    .filter(([campo]) => cambio?.campos && campo in cambio.campos)
    .map(([campo, label]) => ({
      label,
      antes: valorGeneral(campo, cambio.campos[campo]?.antes, tiposPorClave),
      despues: valorGeneral(campo, cambio.campos[campo]?.despues, tiposPorClave),
    }))

  const prendas = []
  let total = null
  if (cambio?.items_antes || cambio?.items_despues) {
    const antes = soloObjetos(cambio.items_antes)
    const despues = soloObjetos(cambio.items_despues)
    for (const par of emparejar(antes, despues)) {
      if (!par.antes) {
        prendas.push({ titulo: `Se agregó: ${nombrePrenda(par.despues, par.i)}`, lineas: [textoTallas(par.despues)], tipo: 'agregada' })
      } else if (!par.despues) {
        prendas.push({ titulo: `Se quitó: ${nombrePrenda(par.antes, par.i)}`, lineas: [`Tenía ${textoTallas(par.antes)}`], tipo: 'quitada' })
      } else {
        const lineas = diferenciasDePrenda(par.antes, par.despues)
        if (lineas.length) prendas.push({ titulo: nombrePrenda(par.despues, par.i), lineas, tipo: 'cambiada' })
      }
    }
    const pa = piezas(antes)
    const pd = piezas(despues)
    if (pa !== pd) total = `${pa} → ${pd} piezas`
    if (prendas.length === 0 && !total) prendas.push({ titulo: 'Prendas', lineas: ['Cambios menores en la captura de las prendas'], tipo: 'cambiada' })
  }
  // V179 — cambios anteriores a V178: aviso de "datos generales sin detalle".
  const nota = typeof cambio?.campos?._nota === 'string' ? cambio.campos._nota : null
  const vacio = !nota && generales.length === 0 && !total && prendas.every((p) => p.titulo === 'Prendas')
  return { generales, prendas, total, nota, vacio }
}

// V179 — los cambios rellenados de antes de V178 que no cambiaron nada que se
// vea (p. ej. un guardado de prendas igual) no se muestran.
export function cambiosVisibles(cambios) {
  return (cambios || []).filter((c) => !(c?.campos?._anterior && resumenCambio(c).vacio))
}

export function cambiosPendientes(cambios) {
  return (cambios || []).filter((c) => c.requiere_aceptar && !c.aceptado_en)
}

// Decisión de Alfredo (2026-11-03): una estación solo ve los cambios si la
// orden ya le aparece en "Siguientes órdenes" (su parte ya le toca).
export function estacionVeCambios(order, estacion, etapasDeLaOrden) {
  if (!order?.pending_reconfirmation_at || order.cancelled_at || order.status === 'completado') return false
  return etapasDeEstacion(estacion).some((etapa) => situacionEnEstacion(etapa, etapasDeLaOrden || [], order) === 'lista')
}
