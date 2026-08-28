import { formatDateTime } from '../../utils/dates'

export default function AnnouncementCard({ announcement, onDelete }) {
  return (
    <article className={'announcement-card' + (announcement.pinned ? ' announcement-card--pinned' : '')}>
      <div className="announcement-card__top">
        {announcement.pinned && <span className="badge badge--pin">Fijado</span>}
        <span className="announcement-card__date">{formatDateTime(announcement.created_at)}</span>
      </div>
      <h3>{announcement.title}</h3>
      <p>{announcement.body}</p>
      {onDelete && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onDelete(announcement.id)}>
          Eliminar
        </button>
      )}
    </article>
  )
}
