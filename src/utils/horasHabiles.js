// Minutos hábiles entre dos momentos: solo cuenta de 8:00 a 18:00, de lunes a
// viernes, en hora de Torreón (no la del dispositivo). Versión simple: no
// descuenta comida ni días festivos.
export const JORNADA = { inicio: 8, fin: 18, zona: 'America/Monterrey' }

const MIN = 60000
const DIA = 24 * 60 * MIN

const partesFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: JORNADA.zona,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

// El reloj de pared de Torreón, como milisegundos "UTC" (para poder restar y
// leer el día de la semana sin depender de la zona del dispositivo).
function relojLocal(valor) {
  if (valor == null || valor === '') return null
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  const p = {}
  for (const { type, value } of partesFmt.formatToParts(fecha)) p[type] = Number(value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) + fecha.getMilliseconds()
}

export function calcularHorasHabiles(horaInicio, horaFin) {
  const inicio = relojLocal(horaInicio)
  const fin = relojLocal(horaFin)
  if (inicio == null || fin == null || fin <= inicio) return 0

  let total = 0
  for (let dia = Math.floor(inicio / DIA) * DIA; dia < fin; dia += DIA) {
    const diaSemana = new Date(dia).getUTCDay()
    if (diaSemana === 0 || diaSemana === 6) continue
    const desde = Math.max(inicio, dia + JORNADA.inicio * 60 * MIN)
    const hasta = Math.min(fin, dia + JORNADA.fin * 60 * MIN)
    if (hasta > desde) total += hasta - desde
  }
  return total / MIN
}

// "45 min", "2 h 15 min", "25 h" — siempre en horas, para no confundir un
// "día" de jornada (10 h) con un día de calendario.
export function formatMinutosHabiles(minutos) {
  if (minutos == null || Number.isNaN(minutos)) return '—'
  const m = Math.round(minutos)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}
