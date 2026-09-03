import { formatDate } from '../../utils/dates'

export default function PendingItemCard({ item, onToggle }) {
  const isResolved = item.status === 'resuelto'
  const isReparacion = Boolean(item.garment)

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

        {isReparacion && (
          <p className="pending-card__garment">
            {item.garment}
            {item.talla && ` · Talla ${item.talla}`}
            {item.cantidad && ` · Cantidad ${item.cantidad}`}
          </p>
        )}

        {item.description && <p>{item.description}</p>}

        {item.foto_url && (
          <a href={item.foto_url} target="_blank" rel="noreferrer" className="pending-card__photo">
            <img src={item.foto_url} alt={item.garment || item.title} />
          </a>
        )}
      </div>
    </article>
  )
}
