import { JORNADA } from './horasHabiles.js'
import { minutosHabilesTrabajados } from './pausasEtapa.js'

// V139 — Tiempos reales por etapa. Todo sale de orden_etapas (iniciado_en /
// completado_en / responsable_id); aquí solo se mide y se agrupa.

// Si entre "Iniciar" y "Terminar" pasaron menos de 2 minutos, los dos botones
// se tocaron de corrido al terminar: no es un tiempo real y no entra al promedio.
export const UMBRAL_DE_CORRIDO_MIN = 2

export const MOTIVO_SIN_MEDIR = {
  sin_inicio: 'No se marcó el inicio',
  de_corrido: 'Inicio y fin de corrido',
  fuera_horario: 'Todo fuera de horario',
  en_pausa: 'Todo el tiempo en pausa',
}

// { minutos, motivo }: minutos hábiles si la etapa se puede medir; si no,
// minutos = null y el motivo. V140 — las pausas no cuentan.
export function medirEtapa(etapa) {
  const { iniciado_en: inicio, completado_en: fin } = etapa
  if (!inicio || !fin) return { minutos: null, motivo: 'sin_inicio' }
  const corridos = (new Date(fin) - new Date(inicio)) / 60000
  if (!(corridos >= UMBRAL_DE_CORRIDO_MIN)) return { minutos: null, motivo: 'de_corrido' }
  if (minutosHabilesTrabajados({ iniciado_en: inicio, completado_en: fin }) <= 0) return { minutos: null, motivo: 'fuera_horario' }
  const minutos = minutosHabilesTrabajados(etapa)
  if (minutos <= 0) return { minutos: null, motivo: 'en_pausa' }
  return { minutos, motivo: null }
}

function resumen(filas) {
  const medidas = filas.filter((f) => f.minutos != null)
  const tiempos = medidas.map((f) => f.minutos).sort((a, b) => a - b)
  const suma = tiempos.reduce((s, m) => s + m, 0)
  const mitad = Math.floor(tiempos.length / 2)
  const conPiezas = medidas.filter((f) => f.piezas > 0)
  const piezas = conPiezas.reduce((s, f) => s + f.piezas, 0)
  return {
    terminadas: filas.length,
    medidas: tiempos.length,
    sinMedir: filas.length - tiempos.length,
    promedio: tiempos.length ? suma / tiempos.length : null,
    mediana: !tiempos.length ? null : tiempos.length % 2 ? tiempos[mitad] : (tiempos[mitad - 1] + tiempos[mitad]) / 2,
    minimo: tiempos.length ? tiempos[0] : null,
    maximo: tiempos.length ? tiempos[tiempos.length - 1] : null,
    // Minutos por pieza del periodo: todo el tiempo entre todas las piezas.
    minutosPorPieza: piezas ? conPiezas.reduce((s, f) => s + f.minutos, 0) / piezas : null,
  }
}

function agrupar(filas, clave, orden) {
  const grupos = new Map()
  for (const f of filas) {
    const k = f[clave] ?? ''
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(f)
  }
  return [...grupos.entries()].map(([k, lista]) => ({ clave: k, ...resumen(lista) })).sort(orden)
}

export function resumenPorEtapa(filas, ordenEtapas = []) {
  const pos = (e) => (ordenEtapas.indexOf(e) === -1 ? ordenEtapas.length : ordenEtapas.indexOf(e))
  return agrupar(filas, 'etapa', (a, b) => pos(a.clave) - pos(b.clave))
}

export function resumenPorOperario(filas) {
  return agrupar(filas, 'operarioId', (a, b) => b.terminadas - a.terminadas)
}

export const resumenTotal = resumen

// --- Periodos (fechas de calendario de Torreón, 'YYYY-MM-DD') ---

const fechaFmt = new Intl.DateTimeFormat('en-CA', { timeZone: JORNADA.zona, year: 'numeric', month: '2-digit', day: '2-digit' })
const iso = (d) => d.toISOString().slice(0, 10)
const utc = (s) => new Date(`${s}T00:00:00Z`)

export function hoyTorreon(ahora = new Date()) {
  return fechaFmt.format(ahora)
}

export function sumarDias(fecha, dias) {
  const d = utc(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return iso(d)
}

// Semana de lunes a domingo; mes de calendario. `hasta` es inclusivo.
export function rangoPeriodo(tipo, hoy = hoyTorreon()) {
  const d = utc(hoy)
  const lunes = sumarDias(hoy, -((d.getUTCDay() + 6) % 7))
  const mes = (y, m) => ({ desde: iso(new Date(Date.UTC(y, m, 1))), hasta: iso(new Date(Date.UTC(y, m + 1, 0))) })
  if (tipo === 'semana') return { desde: lunes, hasta: sumarDias(lunes, 6) }
  if (tipo === 'semana_pasada') return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) }
  if (tipo === 'mes') return mes(d.getUTCFullYear(), d.getUTCMonth())
  if (tipo === 'mes_pasado') return mes(d.getUTCFullYear(), d.getUTCMonth() - 1)
  return null
}

// Torreón no cambia de horario: siempre UTC-6.
export function limitesPeriodo({ desde, hasta }) {
  return { desdeIso: `${desde}T00:00:00-06:00`, hastaIso: `${sumarDias(hasta, 1)}T00:00:00-06:00` }
}

// --- CSV ---

export function aCsv(encabezados, filas) {
  const celda = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [encabezados, ...filas].map((r) => r.map(celda).join(',')).join('\r\n')
}
