import { useAnnouncements } from '../hooks/useAnnouncements'
import { deleteAnnouncement } from '../services/announcementsService'
import AnnouncementCard from '../components/announcements/AnnouncementCard'
import AnnouncementForm from '../components/announcements/AnnouncementForm'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canManageAnnouncements } from '../utils/permissions'

export default function AnnouncementsPage() {
  const { role } = useAuth()
  const { announcements, loading, error, refresh } = useAnnouncements()
  const editable = canManageAnnouncements(role)

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este anuncio?')) return
    await deleteAnnouncement(id)
    refresh()
  }

  if (loading) return <Loading label="Cargando anuncios…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page page--narrow">
      <div className="section-header">
        <h2 className="section-title">Anuncios internos</h2>
      </div>

      {editable && <AnnouncementForm onCreated={refresh} />}

      {announcements.length === 0 ? (
        <EmptyState>No hay anuncios todavía.</EmptyState>
      ) : (
        <div className="announcement-list">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} onDelete={editable ? handleDelete : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
