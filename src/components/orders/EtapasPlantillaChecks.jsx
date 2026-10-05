import { ETAPAS_PLANTILLA_OPTIONS } from '../../lib/constants'

// V136 — casillas de las etapas de un tipo de orden (su plantilla). Se usa al
// crear un tipo ("+ Nuevo tipo…") y al editarlo en Catálogos → Tipos de orden.
export default function EtapasPlantillaChecks({ value, onChange, disabled = false }) {
  function toggle(key) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {ETAPAS_PLANTILLA_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
            <input type="checkbox" checked={value.includes(opt.key)} onChange={() => toggle(opt.key)} disabled={disabled} />
            {opt.label}
          </label>
        ))}
      </div>
      <p className="pantone-hint" style={{ marginTop: 6 }}>
        Son las etapas por las que pasan las órdenes de este tipo en fábrica. Bordado no va aquí: se marca en cada
        orden con "¿Lleva bordado?".
      </p>
    </div>
  )
}
