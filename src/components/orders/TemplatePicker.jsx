import { useState } from 'react'

// Selector de plantilla para prellenar "Nueva orden" de un clic (ej. un
// pedido habitual como "Polo Colegio Vanguard"). El aplicar la plantilla lo
// resuelve el padre (onApply) porque implica copiar fotos en Storage, que
// es async y puede fallar — este componente solo es la UI de selección.
export default function TemplatePicker({ templates, onApply }) {
  const [applying, setApplying] = useState(false)
  const [appliedName, setAppliedName] = useState(null)

  async function handleChange(e) {
    const id = e.target.value
    if (!id) {
      setAppliedName(null)
      return
    }
    const template = templates.find((t) => t.id === id)
    if (!template) return

    setApplying(true)
    await onApply(template)
    setApplying(false)
    setAppliedName(template.name)
  }

  if (templates.length === 0) return null

  return (
    <div className="template-picker">
      <span className="field-label">Usar plantilla (opcional)</span>
      <select className="input" onChange={handleChange} disabled={applying}>
        <option value="">{applying ? 'Aplicando…' : 'Ninguna — empezar en blanco'}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {appliedName && (
        <p className="template-hint">
          ✓ Se llenaron tipo, prendas{templates.find((t) => t.name === appliedName)?.reference_photos?.length ? ' y foto de referencia' : ''} con
          los datos de "{appliedName}" — revisa las tallas y cantidades antes de crear la orden.
        </p>
      )}
    </div>
  )
}
