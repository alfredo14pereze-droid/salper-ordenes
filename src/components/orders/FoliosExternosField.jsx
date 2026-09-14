import { useState } from 'react'

// V42 — antes una orden solo podía traer UN folio externo (control
// anterior); el usuario pidió poder agregar varios, porque un mismo
// cliente a veces pedía cosas muy distintas que en el control de antes
// quedaron en varias órdenes de taller separadas. Mismo patrón que
// FolioExternoField (V37): "ORD" fijo + 4 dígitos, pero aquí se van
// juntando en una lista en vez de reemplazar un solo valor.
//
// `value` es un arreglo de folios completos (ej. ["ORD0007", "ORD0012"]);
// `onChange` recibe el arreglo completo actualizado.
function onlyDigits(value) {
  return (value || '').replace(/\D/g, '').slice(0, 4)
}

export default function FoliosExternosField({ value = [], onChange, id }) {
  const [draft, setDraft] = useState('')

  function addFolio() {
    const digits = onlyDigits(draft)
    if (!digits) return
    const folio = `ORD${digits}`
    if (!value.includes(folio)) {
      onChange([...value, folio])
    }
    setDraft('')
  }

  function removeFolio(folio) {
    onChange(value.filter((f) => f !== folio))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="input-group" style={{ maxWidth: 160 }}>
          <span className="input-group__prefix">ORD</span>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            className="input input-group__input"
            value={draft}
            onChange={(e) => setDraft(onlyDigits(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFolio()
              }
            }}
            placeholder="0001"
          />
        </div>
        <button type="button" className="btn btn--secondary btn--small" onClick={addFolio} disabled={!draft}>
          + Agregar folio
        </button>
      </div>

      {value.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {value.map((folio) => (
            <span
              key={folio}
              className="badge badge--outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {folio}
              <button
                type="button"
                onClick={() => removeFolio(folio)}
                aria-label={`Quitar folio ${folio}`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
