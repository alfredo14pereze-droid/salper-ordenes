import { useState } from 'react'
import Modal from '../talleros/Modal'

// V92 — elegir alcance (una ubicación / consolidado / consolidado
// detallando almacenes) y prenda (todas o una) antes de generar el PDF del
// reporte de un colegio.
export default function ReporteModal({ seccionNombre, ubicaciones, prendas, onClose, onGenerate }) {
  const [scope, setScope] = useState(ubicaciones[0] ? `ubicacion:${ubicaciones[0].id}` : 'consolidado')
  const [prendaFiltro, setPrendaFiltro] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
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
    onGenerate({ modo, ubicacionSeleccionada, prendaFiltro: prendaFiltro || null })
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
        <label>
          Prenda
          <select className="input" value={prendaFiltro} onChange={(e) => setPrendaFiltro(e.target.value)}>
            <option value="">Todas las prendas</option>
            {prendas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            Generar reporte
          </button>
        </div>
      </form>
    </Modal>
  )
}
