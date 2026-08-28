import { useState } from 'react'
import { createPendingItem } from '../../services/pendingItemsService'

export default function PendingItemForm({ onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError(new Error('Escribe al menos un título.'))
      return
    }

    setSaving(true)
    setError(null)
    const { error: createError } = await createPendingItem({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }

    setTitle('')
    setDescription('')
    setCategory('')
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        + Nuevo pendiente
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Título *
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Máquina de bordado en reparación"
          />
        </label>
        <label>
          Categoría
          <input
            type="text"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ej. Reparación, Compra, Trámite…"
          />
        </label>
      </div>
      <label>
        Detalles
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Con quién quedó, fecha esperada de regreso, etc."
        />
      </label>

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Agregar pendiente'}
        </button>
      </div>
    </form>
  )
}
