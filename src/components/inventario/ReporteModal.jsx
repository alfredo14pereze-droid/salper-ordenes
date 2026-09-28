import { useState } from 'react'
import Modal from '../talleros/Modal'

// V92/V93 — elegir alcance (una ubicación / consolidado / consolidado
// detallando almacenes) y prendas (todas, o cualquier combinación elegida
// con checks) antes de generar el PDF del reporte de un colegio.
export default function ReporteModal({ seccionNombre, ubicaciones, prendas, onClose, onGenerate }) {
  const [scope, setScope] = useState(ubicaciones[0] ? `ubicacion:${ubicaciones[0].id}` : 'consolidado')
  const [todas, setTodas] = useState(true)
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())

  function toggle(p) {
    setSeleccionadas((cur) => {
      const next = new Set(cur)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const puedeEnviar = todas || seleccionadas.size > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!puedeEnviar) return
    let modo, ubicacionSeleccionada
    if (scope === 'consolidado') {
      modo = 'consolidado'
    } else if (scope === 'detallado') {
      modo = 'detallado'
    } else {
      modo = 'ubicacion'
      const id = scope.split(':')[1]
      ubicacionSeleccionada = ubicaciones.find((u) => u.id === id)
    }
    const prendasFiltro = todas ? null : prendas.filter((p) => seleccionadas.has(p))
    onGenerate({ modo, ubicacionSeleccionada, prendasFiltro })
  }

  return (
    <Modal title={`Reporte · ${seccionNombre}`} onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <label>
          Alcance
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            {ubicaciones.map((u) => (
              <option key={u.id} value={`ubicacion:${u.id}`}>
                {u.nombre}
              </option>
            ))}
            <option value="consolidado">Consolidado (total)</option>
            <option value="detallado">Consolidado detallando almacenes</option>
          </select>
        </label>

        <div>
          <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>
            Prendas
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginBottom: 8 }}>
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            Todas las prendas
          </label>
          {!todas && (
            <div className="inv-reporte-prendas">
              {prendas.map((p) => (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={seleccionadas.has(p)} onChange={() => toggle(p)} />
                  {p}
                </label>
              ))}
            </div>
          )}
          {!todas && seleccionadas.size === 0 && <p className="form-error">Elige al menos una prenda.</p>}
        </div>

        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!puedeEnviar}>
            Generar reporte
          </button>
        </div>
      </form>
    </Modal>
  )
}
