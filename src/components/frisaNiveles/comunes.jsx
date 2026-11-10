import { ESTADOS } from '../../utils/frisaNiveles'
import { colorProductoFrisa, nombreFrisa } from '../../utils/frisaColores'

export function fechaCorta(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function EstadoBadge({ estado }) {
  const clase = { critico: 'rojo', pedir: 'naranja', ok: 'verde' }[estado]
  return <span className={'frisa-nivel frisa-nivel--' + clase}>{ESTADOS[estado].label}</span>
}

// Muestra del color del producto, igual que en la etiqueta de estantería y el cartel
// de bodega; la franja plateada quiere decir que la prenda lleva reflejante.
export function MuestraFrisa({ producto }) {
  const c = colorProductoFrisa(producto)
  if (!c) return null
  const titulo = `Color de etiqueta: ${c.nombre}${c.reflejante ? ' · lleva reflejante' : ''}`
  return (
    <span className={'frisa-muestra' + (c.hex === '#FFFFFF' ? ' frisa-muestra--blanco' : '')} style={{ background: c.hex }} title={titulo} role="img" aria-label={titulo}>
      {c.reflejante && <span className="frisa-muestra__ref" />}
    </span>
  )
}

// Nombre de la clave con la muestra de su color al frente.
export function NombreFrisa({ producto, className = 'frisa__sub' }) {
  return <div className={className}><MuestraFrisa producto={producto} />{nombreFrisa(producto?.nombre)}</div>
}

export function ColorFrisa({ producto }) {
  return producto?.color || '—'
}
