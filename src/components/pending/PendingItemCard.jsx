import { formatDate } from '../../utils/dates'

export default function PendingItemCard({ item, onToggle }) {
  const isResolved = item.status === 'resuelto'

  return (
    <article className={'pending-card' + (isResolved ? ' pending-card--resolved' : '')}>
      <label className="pending-card__checkbox">
        <input
          type="checkbox"
          checked={isResolved}
          disabled={!onToggle}
          onChange={() => onToggle?.(item)}
        />
      </label>
      <div className="pending-card__body">
        <div className="pending-card__top">
          {item.category && <span className="badge badge--outline">{item.category}</span>}
          <span className="pending-card__date">{formatDate(item.created_at)}</span>
        </div>
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
      </div>
    </article>
  )
}
