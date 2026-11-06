import { ESTADOS } from '../../utils/frisaNiveles'

export function fechaCorta(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function EstadoBadge({ estado }) {
  const clase = { critico: 'rojo', pedir: 'naranja', ok: 'verde' }[estado]
  return <span className={'frisa-nivel frisa-nivel--' + clase}>{ESTADOS[estado].label}</span>
}
