import { useState } from 'react'
import { createCliente } from '../../services/clientesService'
import { findSimilar, similarity } from '../../utils/similarity'

// Dropdown de clientes existentes + alta rápida sin salir del formulario
// (mismo patrón que OrderTypeSelect con su "+ Nuevo tipo…"). El duplicado
// EXACTO no llega ni a pedirle al servidor: si ya existe un cliente con ese
// nombre (normalizado), se selecciona directo. El "parecido pero no igual"
// se avisa con un aviso suave que no bloquea (el usuario decide).
export default function ClienteSelect({ clientes, value, onChange, onClienteCreated }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [similarWarning, setSimilarWarning] = useState(null)
  const [exactMatch, setExactMatch] = useState(null)

  function handleNewNameChange(v) {
    setNewName(v)
    setSimilarWarning(null)
    setExactMatch(null)
  }

  function selectCliente(cliente) {
    onChange(cliente.id, cliente.nombre)
    setCreating(false)
    setNewName('')
    setSimilarWarning(null)
    setExactMatch(null)
  }

  async function handleCreate(force = false) {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (!force) {
      const exact = clientes.find((c) => similarity(c.nombre, trimmed) === 1)
      if (exact) {
        setExactMatch(exact)
        return
      }
      const similar = findSimilar(
        trimmed,
        clientes.map((c) => c.nombre)
      )
      if (similar) {
        setSimilarWarning(similar)
        return
      }
    }

    setSaving(true)
    setError(null)
    const { data, error: createError } = await createCliente(trimmed)
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    onClienteCreated?.(data)
    selectCliente(data)
  }

  if (creating) {
    return (
      <div className="order-type-create">
        <input
          type="text"
          className="input"
          placeholder="Nombre del cliente nuevo"
          value={newName}
          onChange={(e) => handleNewNameChange(e.target.value)}
          autoFocus
        />

        {exactMatch && (
          <p className="pantone-hint">
            Ya existe el cliente "{exactMatch.nombre}" — se va a usar ese.{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => selectCliente(exactMatch)}>
              Usar cliente existente
            </button>
          </p>
        )}

        {similarWarning && (
          <p className="pantone-hint">
            Ya existe un cliente parecido: "{similarWarning}". ¿Seguro que quieres crear uno nuevo?{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => handleCreate(true)} disabled={saving}>
              Sí, crear de todos modos
            </button>
          </p>
        )}

        <div className="order-type-create__actions">
          <button type="button" className="btn btn--primary" onClick={() => handleCreate(false)} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cliente'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setCreating(false)
              setNewName('')
              setSimilarWarning(null)
              setExactMatch(null)
            }}
          >
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
          const cliente = clientes.find((c) => c.id === e.target.value)
          onChange(cliente?.id || '', cliente?.nombre || '')
        }}
      >
        <option value="">Selecciona un cliente…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--secondary" onClick={() => setCreating(true)}>
        + Cliente nuevo
      </button>
    </div>
  )
}
