// Estadísticas del CRM (todo se calcula en el navegador con lo que ya carga la lista).
import { CRM_ESTATUS, estaAbierto } from './crm'

// "Contestó" = el prospecto ya pasó a En conversación o más adelante
// (decisión de Alfredo, 2026-11-13: sin casilla nueva en la bitácora).
export const ESTATUS_CONTESTADO = ['en_conversacion', 'visita_reunion', 'cotizado', 'ganado']
export const contesto = (estatus) => ESTATUS_CONTESTADO.includes(estatus)

const suma = (lista, f) => lista.reduce((t, x) => t + (Number(f(x)) || 0), 0)
const pct = (a, b) => (b > 0 ? a / b : null)

// Lunes de la semana de una fecha YYYY-MM-DD.
export function lunesDe(fechaIso) {
  const d = new Date(fechaIso + 'T12:00:00')
  const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia)
  return d.toISOString().slice(0, 10)
}

// Meses (YYYY-MM) que tienen algún contacto registrado, del más reciente al más viejo.
export function mesesConActividad(actividades) {
  return [...new Set(actividades.map((a) => a.fecha.slice(0, 7)))].sort().reverse()
}

// mes: '' (todo) o 'YYYY-MM' → solo los prospectos con algún contacto
// registrado en ese mes, y solo los contactos de ese mes.
// responsable: '' (todos), 'sin' o un id.
export function calcularStats({ empresas, seguimientos, actividades }, { mes = '', responsable = '', hoy }) {
  let emps = empresas
  if (responsable) emps = emps.filter((e) => (responsable === 'sin' ? !e.responsable_id : e.responsable_id === responsable))
  const ids = new Set(emps.map((e) => e.id))
  let acts = actividades.filter((a) => ids.has(a.empresa_id))
  if (mes) {
    acts = acts.filter((a) => a.fecha.startsWith(mes))
    const conAct = new Set(acts.map((a) => a.empresa_id))
    emps = emps.filter((e) => conAct.has(e.id))
  }

  const abiertos = emps.filter((e) => estaAbierto(e.estatus))
  const ganados = emps.filter((e) => e.estatus === 'ganado')
  const perdidos = emps.filter((e) => e.estatus === 'perdido')
  const conSeg = new Set(seguimientos.map((s) => s.empresa_id))
  const sinSeguimiento = abiertos.filter((e) => !conSeg.has(e.id))
  const vencidos = seguimientos.filter((s) => ids.has(s.empresa_id) && s.fecha < hoy).length
  const contestaron = emps.filter((e) => contesto(e.estatus)).length

  const embudo = CRM_ESTATUS.map((s) => {
    const lista = emps.filter((e) => e.estatus === s.key)
    return { ...s, n: lista.length, monto: suma(lista, (e) => (s.key === 'ganado' ? e.monto_vendido ?? e.monto_cotizado : e.monto_cotizado)) }
  })

  // Contactos registrados por semana (últimas 8 con datos, o las del mes).
  const porSemana = new Map()
  for (const a of acts) {
    const k = lunesDe(a.fecha)
    porSemana.set(k, (porSemana.get(k) || 0) + 1)
  }
  const semanas = [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([lunes, n]) => ({ lunes, n }))

  const porUsuario = new Map()
  for (const a of acts) porUsuario.set(a.usuario_id || null, (porUsuario.get(a.usuario_id || null) || 0) + 1)

  // Motivos de pérdida más comunes.
  const motivos = new Map()
  for (const e of perdidos) {
    const m = (e.motivo_perdida || 'Sin motivo').trim()
    const k = m.toLowerCase()
    const prev = motivos.get(k)
    motivos.set(k, { motivo: prev?.motivo || m, n: (prev?.n || 0) + 1 })
  }

  return {
    total: emps.length,
    enProceso: suma(abiertos, (e) => e.monto_cotizado),
    abiertos: abiertos.length,
    ganadoMonto: suma(ganados, (e) => e.monto_vendido ?? e.monto_cotizado),
    ganados: ganados.length,
    perdidos: perdidos.length,
    tasaCierre: pct(ganados.length, ganados.length + perdidos.length),
    contestaron,
    tasaRespuesta: pct(contestaron, emps.length),
    sinSeguimiento: sinSeguimiento.length,
    vencidos,
    actividades: acts.length,
    embudo,
    semanas,
    porUsuario: [...porUsuario.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
    motivos: [...motivos.values()].sort((a, b) => b.n - a.n),
  }
}

// $1.2 M / $450 mil / $8,500
export function montoCorto(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' M'
  if (v >= 10_000) return '$' + Math.round(v / 1000).toLocaleString('es-MX') + ' mil'
  return '$' + v.toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

export const pctTexto = (p) => (p === null || p === undefined ? '—' : Math.round(p * 100) + '%')
