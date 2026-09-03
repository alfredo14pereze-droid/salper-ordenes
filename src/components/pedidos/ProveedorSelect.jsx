import { useState } from 'react'
import { createProveedor } from '../../services/proveedoresService'
import { findSimilar, similarity } from '../../utils/similarity'

// Dropdown de proveedores existentes + alta rápida sin salir del flujo de
// "Nuevo pedido" — mismo patrón exacto que ClienteSelect.jsx (mismo
// utils/similarity.js para el aviso de "proveedor parecido"; el
// duplicado EXACTO ni llega a pedírselo al servidor). No se reusa el
// componente ClienteSelect tal cual porque el proveedor carga más
// campos (contacto, tipo de material) que un cliente no tiene — pero la
// lógica de detección de duplicados es la misma pieza de código, no una
// reimplementación.
export default function ProveedorSelect({ proveedores, value, onChange, onProveedorCreated }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [contacto, setContacto] = useState('')
  const [tipoMaterial, setTipoMaterial] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [similarWarning, setSimilarWarning] = useState(null)
  const [exactMatch, setExactMatch] = useState(null)

  function handleNewNameChange(v) {
    setNewName(v)
    setSimilarWarning(null)
    setExactMatch(null)
  }

  function selectProveedor(proveedor) {
    onChange(proveedor.id, proveedor.nombre)
    resetCreateForm()
  }

  function resetCreateForm() {
    setCreating(false)
    setNewName('')
    setContacto('')
    setTipoMaterial('')
    setSimilarWarning(null)
    setExactMatch(null)
  }

  async function handleCreate(force = false) {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (!force) {
      const exact = proveedores.find((p) => similarity(p.nombre, trimmed) === 1)
      if (exact) {
        setExactMatch(exact)
        return
      }
      const similar = findSimilar(
        trimmed,
        proveedores.map((p) => p.nombre)
      )
      if (similar) {
        setSimilarWarning(similar)
        return
      }
    }

    setSaving(true)
    setError(null)
    const { data, error: createError } = await createProveedor({
      nombre: trimmed,
      contacto: contacto.trim(),
      tipoMaterial: tipoMaterial.trim(),
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    onProveedorCreated?.(data)
    selectProveedor(data)
  }

  if (creating) {
    return (
      <div className="order-type-create">
        <input
          type="text"
          className="input"
          placeholder="Nombre del proveedor nuevo"
          value={newName}
          onChange={(e) => handleNewNameChange(e.target.value)}
          autoFocus
        />
        <div className="form-row" style={{ marginTop: 8 }}>
          <input
            type="text"
            className="input"
            placeholder="Contacto (teléfono o email) — opcional"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
          />
          <input
            type="text"
            className="input"
            placeholder="Tipo de material que surte — opcional"
            value={tipoMaterial}
            onChange={(e) => setTipoMaterial(e.target.value)}
          />
        </div>

        {exactMatch && (
          <p className="pantone-hint">
            Ya existe el proveedor "{exactMatch.nombre}" — se va a usar ese.{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => selectProveedor(exactMatch)}>
              Usar proveedor existente
            </button>
          </p>
        )}

        {similarWarning && (
          <p className="pantone-hint">
            Ya existe un proveedor parecido: "{similarWarning}". ¿Seguro que quieres crear uno nuevo?{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => handleCreate(true)} disabled={saving}>
              Sí, crear de todos modos
            </button>
          </p>
        )}

        <div className="order-type-create__actions">
          <button type="button" className="btn btn--primary" onClick={() => handleCreate(false)} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar proveedor'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={resetCreateForm}>
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
          const proveedor = proveedores.find((p) => p.id === e.target.value)
          onChange(proveedor?.id || '', proveedor?.nombre || '')
        }}
      >
        <option value="">Selecciona un proveedor…</option>
        {proveedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--secondary" onClick={() => setCreating(true)}>
        + Nuevo proveedor
      </button>
    </div>
  )
}
