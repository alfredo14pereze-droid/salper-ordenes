import { ESTADOS } from '../../utils/frisaNiveles'
import { colorPlayera } from '../../utils/frisaColores'

export function fechaCorta(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function EstadoBadge({ estado }) {
  const clase = { critico: 'rojo', pedir: 'naranja', ok: 'verde' }[estado]
  return <span className={'frisa-nivel frisa-nivel--' + clase}>{ESTADOS[estado].label}</span>
}

// Nombre de la clave; las playeras van en su color (texto oscuro en negritas, fondo claro).
export function NombreFrisa({ producto, className = 'frisa__sub' }) {
  const c = colorPlayera(producto)
  if (!c) return <div className={className}>{producto?.nombre}</div>
  return <div className={className}><span className={'frisa-color frisa-color--' + c}>{producto.nombre}</span></div>
}

export function ColorFrisa({ producto }) {
  const c = colorPlayera(producto)
  if (!c) return producto?.color || '—'
  return <span className={'frisa-color frisa-color--' + c}>{producto.color}</span>
}
