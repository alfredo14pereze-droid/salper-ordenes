import { useState } from 'react'
import { createOrderType } from '../../services/orderTypesService'
import { useAuth } from '../../contexts/AuthContext'
import { canManageOrderTypes } from '../../utils/permissions'
import { ETAPAS_PLANTILLA_DEFAULT } from '../../lib/constants'
import EtapasPlantillaChecks from './EtapasPlantillaChecks'

// Tabs de tipo de orden que además permiten crear un tipo nuevo al vuelo.
// V136 — "+ Nuevo tipo…" solo lo ven los administradores (tienda, fábrica,
// general) y pide las etapas del tipo: un tipo sin etapas deja sus órdenes
// invisibles para fábrica. Los tipos también se administran en Catálogos →
// Tipos de orden.
export default function OrderTypeSelect({ orderTypes, value, onChange, onTypeCreated }) {
  const { role } = useAuth()
  const puedeCrearTipo = canManageOrderTypes(role)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [etapas, setEtapas] = useState(ETAPAS_PLANTILLA_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreateType() {
    if (!newLabel.trim()) return
    if (etapas.length === 0) {
      setError(new Error('Elige al menos una etapa para el tipo de orden.'))
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: createError } = await createOrderType(newLabel.trim(), etapas)
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    onTypeCreated?.(data)
    onChange(data.key)
    setCreating(false)
    setNewLabel('')
    setEtapas(ETAPAS_PLANTILLA_DEFAULT)
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
        <EtapasPlantillaChecks value={etapas} onChange={setEtapas} disabled={saving} />
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
      {puedeCrearTipo && (
        <button type="button" className="type-tab type-tab--add" onClick={() => setCreating(true)}>
          + Nuevo tipo…
        </button>
      )}
    </div>
  )
}
