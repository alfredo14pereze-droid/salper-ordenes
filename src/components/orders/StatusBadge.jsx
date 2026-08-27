import { getStatus } from '../../utils/status'

export default function StatusBadge({ status }) {
  const s = getStatus(status)
  return (
    <span className="badge" style={{ '--badge-color': s.color }}>
      {s.label}
    </span>
  )
}
