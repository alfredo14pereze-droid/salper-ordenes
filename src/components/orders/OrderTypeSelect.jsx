import { useState } from 'react'
import { createOrderType } from '../../services/orderTypesService'

// Tabs de tipo de orden que además permiten crear un tipo nuevo al vuelo
// (cumple "categoría seleccionable, con posibilidad de agregar más tipos
// después" sin necesitar una pantalla de administración aparte).
export default function OrderTypeSelect({ orderTypes, value, onChange, onTypeCreated }) {
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreateType() {
    if (!newLabel.trim()) return
    setSaving(true)
    setError(null)
    const { data, error: createError } = await createOrderType(newLabel.trim())
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    onTypeCreated?.(data)
    onChange(data.key)
    setCreating(false)
    setNewLabel('')
  }

  if (creating) {
    return (
      <div className="order-type-create">
        <input
          type="text"
          className="input"
          placeholder="Nombre del nuevo tipo (ej. Bordado)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          autoFocus
        />
        <div className="order-type-create__actions">
          <button type="button" className="btn btn--primary" onClick={handleCreateType} disabled={saving}>
            {saving ? 'Creando…' : 'Crear tipo'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setCreating(false)}>
            Cancelar
          </button>
        </div>
        {error && <p className="form-error">{error.message}</p>}
      </div>
    )
  }

  return (
    <div className="type-tabs" role="tablist">
      {orderTypes.map((type) => (
        <button
          key={type.key}
          type="button"
          role="tab"
          aria-selected={value === type.key}
          className={'type-tab' + (value === type.key ? ' type-tab--active' : '')}
          onClick={() => onChange(type.key)}
        >
          {type.label}
        </button>
      ))}
      <button type="button" className="type-tab type-tab--add" onClick={() => setCreating(true)}>
        + Nuevo tipo…
      </button>
    </div>
  )
}
