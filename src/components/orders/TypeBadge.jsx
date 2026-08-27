import { DEFAULT_ORDER_TYPE_COLOR } from '../../lib/constants'

export default function TypeBadge({ type }) {
  const label = type?.label || 'Sin tipo'
  const color = type?.color || DEFAULT_ORDER_TYPE_COLOR
  return (
    <span className="badge badge--outline" style={{ '--badge-color': color }}>
      {label}
    </span>
  )
}
