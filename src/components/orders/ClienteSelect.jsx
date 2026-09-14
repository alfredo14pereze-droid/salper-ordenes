import { useState } from 'react'
import { createCliente } from '../../services/clientesService'
import { findSimilar, similarity } from '../../utils/similarity'

// Dropdown de clientes existentes + alta rápida sin salir del formulario
// (mismo patrón que OrderTypeSelect con su "+ Nuevo tipo…"). El duplicado
// EXACTO no llega ni a pedirle al servidor: si ya existe un cliente con ese
// nombre (normalizado), se selecciona directo. El "parecido pero no igual"
// se avisa con un aviso suave que no bloquea (el usuario decide).
//
// V42 — bug encontrado: el teléfono/correo NO se guardaba al crear un
// cliente nuevo desde aquí, porque esta alta solo mandaba el nombre
// (createCliente(trimmed) sin teléfono/correo) — los campos de
// "Teléfono del cliente"/"Correo del cliente" de NewOrderPage.jsx están
// MÁS ABAJO en el formulario, separados de este botón, así que era fácil
// terminar de crear el cliente sin llegar a llenarlos. Ahora el teléfono
// y correo se capturan aquí mismo, como parte de la misma alta, con el
// botón "Guardar cliente" hasta abajo de los tres campos (pedido
// explícito del usuario). `onChange` ahora manda también
// teléfono/correo (4 argumentos) para que el formulario de arriba se
// prellene bien tanto al crear como al seleccionar un cliente existente
// — antes tenía una condición de carrera con la lista de clientes recién
// refrescada y casi siempre se quedaba en blanco para un cliente recién
// creado.
export default function ClienteSelect({ clientes, value, onChange, onClienteCreated }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTelefono, setNewTelefono] = useState('')
  const [newCorreo, setNewCorreo] = useState('')
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
    onChange(cliente.id, cliente.nombre, cliente.telefono || '', cliente.correo || '')
    setCreating(false)
    setNewName('')
    setNewTelefono('')
    setNewCorreo('')
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
    const { data, error: createError } = await createCliente(trimmed, newTelefono.trim(), newCorreo.trim())
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

        <div className="form-row" style={{ marginTop: 10 }}>
          <label>
            Teléfono
            <input
              type="tel"
              className="input"
              value={newTelefono}
              onChange={(e) => setNewTelefono(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label>
            Correo
            <input
              type="email"
              className="input"
              value={newCorreo}
              onChange={(e) => setNewCorreo(e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

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
              setNewTelefono('')
              setNewCorreo('')
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
          onChange(cliente?.id || '', cliente?.nombre || '', cliente?.telefono || '', cliente?.correo || '')
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
