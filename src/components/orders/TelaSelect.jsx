import { useState } from 'react'
import { createTela } from '../../services/telasService'

// Dropdown de telas + alta rápida sin salir del formulario (mismo patrón
// que OrderTypeSelect/ClienteSelect). El duplicado exacto no truena: el RPC
// create_tela es "crear o reusar" — normaliza (trim + minúsculas) antes de
// comparar.
export default function TelaSelect({ telas, value, onChange, onTelaCreated }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return

    setSaving(true)
    setError(null)
    const { data, error: createError } = await createTela(trimmed)
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    onTelaCreated?.(data)
    onChange(data.id, data.nombre)
    setCreating(false)
    setNewName('')
  }

  if (creating) {
    return (
      <div className="order-type-create">
        <input
          type="text"
          className="input"
          placeholder="Nombre de la tela nueva"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
        <div className="order-type-create__actions">
          <button type="button" className="btn btn--primary btn--small" onClick={handleCreate} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar tela'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setCreating(false)}>
            Cancelar
          </button>
        </div>
        {error && <p className="form-error">{error.message}</p>}
      </div>
    )
  }

  return (
    <div className="form-row">
      <select
        className="input"
        value={value || ''}
        onChange={(e) => {
          const tela = telas.find((t) => t.id === e.target.value)
          onChange(tela?.id || '', tela?.nombre || '')
        }}
      >
        <option value="">Selecciona una tela…</option>
        {telas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setCreating(true)}>
        + Guardar tela
      </button>
    </div>
  )
}
