import { Link } from 'react-router-dom'
import { useAnnouncements } from '../../hooks/useAnnouncements'
import { formatDate } from '../../utils/dates'

// Banner compacto con el anuncio más reciente, para que se vea desde el
// dashboard sin tener que entrar a la sección de Anuncios.
export default function AnnouncementBanner() {
  const { announcements, loading } = useAnnouncements()

  if (loading || announcements.length === 0) return null

  const latest = announcements[0]

  return (
    <Link to="/anuncios" className="announcement-banner">
      <span className="announcement-banner__label">📣 Anuncio</span>
      <span className="announcement-banner__title">{latest.title}</span>
      <span className="announcement-banner__date">{formatDate(latest.created_at)}</span>
    </Link>
  )
}
