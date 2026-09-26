import { useCallback, useEffect, useState } from 'react'
import { fetchTipos, guardarTipo } from '../../services/pendientesService'

// Catálogo editable de tipos de trabajo (solo administradores).
export default function TiposTrabajoModal({ onClose }) {
  const [tipos, setTipos] = useState([])
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data } = await fetchTipos({ soloActivos: false })
    setTipos(data || [])
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function run(fn) {
    setError(null)
    const { error: e } = await fn()
    if (e) setError(e)
    else load()
  }

  return (
    <div className="mt-modal-overlay" onClick={onClose}>
      <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mt-modal__head">
          <h3>Tipos de trabajo</h3>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {tipos.map((t) => (
          <div key={t.id} className="razon-row" style={{ marginBottom: 6 }}>
            <span style={{ opacity: t.activo ? 1 : 0.5 }}>
              {t.nombre} {!t.activo && '(inactivo)'}
            </span>
            <div className="razon-row__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  const n = window.prompt('Nuevo nombre', t.nombre)
                  if (n && n.trim()) run(() => guardarTipo({ id: t.id, nombre: n, activo: t.activo, orden: t.orden }))
                }}
              >
                Renombrar
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => run(() => guardarTipo({ id: t.id, nombre: t.nombre, activo: !t.activo, orden: t.orden }))}>
                {t.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
        <form
          className="order-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nombre.trim()) return
            run(() => guardarTipo({ nombre })).then(() => setNombre(''))
          }}
          style={{ marginTop: 10 }}
        >
          <label>
            Agregar tipo
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Planchado" />
          </label>
          <button type="submit" className="btn btn--secondary">
            + Agregar
          </button>
        </form>
        {error && <p className="form-error">{error.message}</p>}
      </div>
    </div>
  )
}
