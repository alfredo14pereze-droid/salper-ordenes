import { useMemo, useState } from 'react'
import { createCliente } from '../../services/clientesService'
import { findSimilar, similarity } from '../../utils/similarity'
import { CLIENTE_TIPO_ORDEN_OPTIONS } from '../../lib/constants'

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
//
// V45 — lista filtrada por tipo de orden: si se pasa `orderTypeKey` y es
// una de las 3 categorías fijas (escolar/industrial/sublimación), el
// dropdown solo muestra clientes cuyo `tipo_orden` incluye esa categoría —
// más los clientes sin categoría todavía (tipo_orden vacío, ej. los de
// antes de este cambio), para no esconderle a nadie un cliente real de la
// noche a la mañana. Si `orderTypeKey` es otro tipo (custom, agregado con
// "+ Nuevo tipo…") o todavía no se eligió, se muestran todos. Al crear un
// cliente nuevo desde aquí, se le preseleccionan (pero se pueden cambiar)
// las casillas de categoría según el tipo de orden actual.
const FIXED_TIPO_KEYS = CLIENTE_TIPO_ORDEN_OPTIONS.map((o) => o.key)

export default function ClienteSelect({ clientes, value, onChange, onClienteCreated, orderTypeKey }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTelefono, setNewTelefono] = useState('')
  const [newCorreo, setNewCorreo] = useState('')
  const [newTipoOrden, setNewTipoOrden] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [similarWarning, setSimilarWarning] = useState(null)
  const [exactMatch, setExactMatch] = useState(null)

  const clientesFiltrados = useMemo(() => {
    if (!orderTypeKey || !FIXED_TIPO_KEYS.includes(orderTypeKey)) return clientes
    return clientes.filter((c) => !c.tipo_orden?.length || c.tipo_orden.includes(orderTypeKey))
  }, [clientes, orderTypeKey])

  function startCreating() {
    // Preselecciona la categoría según el tipo de orden actual (se puede
    // cambiar) — solo si es una de las 3 fijas, no un tipo custom.
    setNewTipoOrden(orderTypeKey && FIXED_TIPO_KEYS.includes(orderTypeKey) ? [orderTypeKey] : [])
    setCreating(true)
  }

  function toggleTipoOrden(key) {
    setNewTipoOrden((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))
  }

  function handleNewNameChange(v) {
    setNewName(v)
    setSimilarWarning(null)
    setExactMatch(null)
  }

  function resetCreateForm() {
    setCreating(false)
    setNewName('')
    setNewTelefono('')
    setNewCorreo('')
    setNewTipoOrden([])
    setSimilarWarning(null)
    setExactMatch(null)
  }

  function selectCliente(cliente) {
    onChange(cliente.id, cliente.nombre, cliente.telefono || '', cliente.correo || '')
    resetCreateForm()
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
    const { data, error: createError } = await createCliente(trimmed, newTelefono.trim(), newCorreo.trim(), newTipoOrden)
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

        <div style={{ marginTop: 10 }}>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Categoría del cliente (puede ser más de una)
          </span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {CLIENTE_TIPO_ORDEN_OPTIONS.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={newTipoOrden.includes(opt.key)} onChange={() => toggleTipoOrden(opt.key)} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="order-type-create__actions">
          <button type="button" className="btn btn--primary" onClick={() => handleCreate(false)} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cliente'}
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
          const cliente = clientesFiltrados.find((c) => c.id === e.target.value)
          onChange(cliente?.id || '', cliente?.nombre || '', cliente?.telefono || '', cliente?.correo || '')
        }}
      >
        <option value="">Selecciona un cliente…</option>
        {clientesFiltrados.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--secondary" onClick={startCreating}>
        + Cliente nuevo
      </button>
    </div>
  )
}
