import { useState } from 'react'
import { guardarProductoTallero } from '../../services/tallerosService'

// V63 — catálogo de prendas de talleros (admin): alta, renombrar y
// activar/desactivar. Sin borrar (los talleros existentes las referencian).
export default function CatalogoPrendasPanel({ productos, onChanged }) {
  const [nombre, setNombre] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNombre, setEditNombre] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function run(payload) {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarProductoTallero(payload)
    setSaving(false)
    if (err) return setError(err)
    onChanged()
  }

  async function handleAdd(e) {
    e.preventDefault()
    await run({ nombre: nombre.trim() })
    setNombre('')
  }

  return (
    <div className="card">
      <form className="mt-catalogo__add" onSubmit={handleAdd}>
        <input type="text" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva prenda…" />
        <button type="submit" className="btn btn--secondary btn--small" disabled={saving || !nombre.trim()}>
          Agregar
        </button>
      </form>
      {error && <p className="form-error">{error.message}</p>}
      <ul className="mt-catalogo__list">
        {productos.map((p) => (
          <li key={p.id} className={p.activo ? '' : 'mt-catalogo__item--off'}>
            {editId === p.id ? (
              <>
                <input type="text" className="input input--small" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={saving || !editNombre.trim()}
                  onClick={async () => {
                    await run({ id: p.id, nombre: editNombre.trim(), categoria: p.categoria, activo: p.activo })
                    setEditId(null)
                  }}
                >
                  Guardar
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditId(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span>{p.nombre}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => {
                    setEditId(p.id)
                    setEditNombre(p.nombre)
                  }}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={saving}
                  onClick={() => run({ id: p.id, nombre: p.nombre, categoria: p.categoria, activo: !p.activo })}
                >
                  {p.activo ? 'Desactivar' : 'Activar'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
