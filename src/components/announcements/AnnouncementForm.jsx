import { useState } from 'react'
import { createAnnouncement } from '../../services/announcementsService'

export default function AnnouncementForm({ onCreated }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError(new Error('Escribe un título y un mensaje.'))
      return
    }

    setSaving(true)
    setError(null)
    const { error: createError } = await createAnnouncement({ title: title.trim(), body: body.trim(), pinned })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }

    setTitle('')
    setBody('')
    setPinned(false)
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        + Nuevo anuncio
      </button>
    )
  }

  return (
    <form className="order-form announcement-form" onSubmit={handleSubmit}>
      <label>
        Título *
        <input
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Cambio de horario de entregas"
        />
      </label>
      <label>
        Mensaje *
        <textarea
          className="input"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Detalles del comunicado…"
        />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Fijar arriba de los demás
      </label>

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Publicando…' : 'Publicar anuncio'}
        </button>
      </div>
    </form>
  )
}
