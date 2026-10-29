// V164 — Tareas: cálculos puros (quién la debe hacer, si ya está hecha, si
// venció). Sin React ni Supabase para poder probarlos con node --test.

// Fecha de hoy en hora local como "YYYY-MM-DD" (igual que las columnas date).
export function hoyLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ¿Le toca esta tarea a esta persona?
export function meToca(tarea, { userId, role }) {
  if (tarea.destino_tipo === 'todos') return true
  if (tarea.destino_tipo === 'rol') return tarea.destino_rol === role
  if (tarea.destino_tipo === 'persona') return tarea.destino_id === userId
  return false
}

// Personas que deben hacerla (de la lista de ta_destinatarios).
export function destinatariosDe(tarea, destinatarios) {
  if (tarea.destino_tipo === 'todos') return destinatarios
  if (tarea.destino_tipo === 'rol') return destinatarios.filter((d) => d.rol === tarea.destino_rol)
  const d = destinatarios.find((x) => x.id === tarea.destino_id)
  return [d || { id: tarea.destino_id, nombre: tarea.destino_nombre, rol: null }]
}

// Estado para quien la hace: hecha por mí, hecha por otro (basta con uno) o pendiente.
export function estadoParaMi(tarea, completadas, userId) {
  const mia = completadas.find((c) => c.usuario_id === userId) || null
  if (mia) return { hecha: true, mia, porOtro: null }
  if (tarea.modo === 'uno' && completadas.length) return { hecha: true, mia: null, porOtro: completadas[0] }
  return { hecha: false, mia: null, porOtro: null }
}

// Estado para quien asigna: quiénes ya, quiénes faltan y si está completa.
export function estadoGeneral(tarea, completadas, destinatarios) {
  const lista = destinatariosDe(tarea, destinatarios)
  const ya = new Set(completadas.map((c) => c.usuario_id))
  const faltan = lista.filter((d) => !ya.has(d.id))
  const hecha = tarea.modo === 'uno' ? completadas.length > 0 : lista.length > 0 && faltan.length === 0
  return { hecha, total: lista.length, hechos: completadas, faltan }
}

export function vencida(tarea, hecha, hoy = hoyLocal()) {
  return !hecha && !!tarea.fecha_limite && tarea.fecha_limite < hoy
}

// Pendientes primero las vencidas, luego por fecha límite (sin fecha al final), luego las más nuevas.
export function ordenarTareas(tareas, hoy = hoyLocal()) {
  return [...tareas].sort((a, b) => {
    const va = a.fecha_limite && a.fecha_limite < hoy ? 0 : 1
    const vb = b.fecha_limite && b.fecha_limite < hoy ? 0 : 1
    if (va !== vb) return va - vb
    if (a.fecha_limite !== b.fecha_limite) {
      if (!a.fecha_limite) return 1
      if (!b.fecha_limite) return -1
      return a.fecha_limite < b.fecha_limite ? -1 : 1
    }
    return a.creado_en < b.creado_en ? 1 : -1
  })
}

export function textoDestino(tarea, { userId, roleLabels = {} } = {}) {
  if (tarea.destino_tipo === 'todos') return 'Para todo el personal'
  if (tarea.destino_tipo === 'rol') return `Para ${roleLabels[tarea.destino_rol] || tarea.destino_rol}`
  if (tarea.destino_id === userId) return 'Para ti'
  return `Para ${tarea.destino_nombre || 'una persona'}`
}
