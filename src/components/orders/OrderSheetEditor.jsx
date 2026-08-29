import { useState } from 'react'
import { ORDER_SHEET_SIZES, emptyOrderSheetSection } from '../../lib/constants'

// Editor de la "hoja de orden": los campos exactos de la hoja física de
// taller que SALPER usa en papel (folio, playera/chamarra, short/pantalón,
// tallas fijas 20-50...). Alimenta el PDF de confirmación — ver
// components/pdf/OrderConfirmationPdf. Es opcional al crear la orden (se
// puede llenar después desde el detalle), por eso empieza colapsado.
//
// Controlado: recibe `sheet` y `onChange`, sin estado propio de los datos.
const SECTION_LABELS = {
  playera: 'Playera o chamarra',
  short: 'Short / Pantalón',
}

export default function OrderSheetEditor({ sheet, onChange, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  function updateField(field, value) {
    onChange({ ...sheet, [field]: value })
  }

  function updateSectionField(sectionKey, field, value) {
    const section = sheet.sections[sectionKey] || emptyOrderSheetSection()
    onChange({
      ...sheet,
      sections: { ...sheet.sections, [sectionKey]: { ...section, [field]: value } },
    })
  }

  function updateSectionSize(sectionKey, size, value) {
    const section = sheet.sections[sectionKey] || emptyOrderSheetSection()
    const sizes = { ...section.sizes }
    if (value.trim() === '') {
      delete sizes[size]
    } else {
      sizes[size] = value
    }
    updateSectionField(sectionKey, 'sizes', sizes)
  }

  return (
    <div className="order-sheet-editor">
      <button type="button" className="order-sheet-editor__toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? '− Ocultar' : '+ Llenar'} hoja de orden de taller (opcional — para el PDF de confirmación)
      </button>

      {expanded && (
        <div className="order-sheet-editor__body">
          <div className="form-row-3">
            <label>
              Vendedor
              <input
                type="text"
                className="input"
                value={sheet.vendedor}
                onChange={(e) => updateField('vendedor', e.target.value)}
              />
            </label>
            <label>
              Torneos en los que interviene
              <input
                type="text"
                className="input"
                value={sheet.torneos}
                onChange={(e) => updateField('torneos', e.target.value)}
              />
            </label>
          </div>

          <div className="form-row-3">
            <label>
              Nombre (contacto)
              <input
                type="text"
                className="input"
                value={sheet.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
              />
            </label>
            <label>
              Domicilio
              <input
                type="text"
                className="input"
                value={sheet.contact_address}
                onChange={(e) => updateField('contact_address', e.target.value)}
              />
            </label>
            <label>
              Teléfono
              <input
                type="text"
                className="input"
                value={sheet.contact_phone}
                onChange={(e) => updateField('contact_phone', e.target.value)}
              />
            </label>
          </div>

          {Object.keys(SECTION_LABELS).map((sectionKey) => {
            const section = sheet.sections[sectionKey] || emptyOrderSheetSection()
            return (
              <div key={sectionKey} className="order-sheet-section">
                <span className="order-sheet-section__title">{SECTION_LABELS[sectionKey]}</span>

                <div className="form-row-3">
                  <label>
                    Cliente
                    <input
                      type="text"
                      className="input"
                      value={section.cliente}
                      onChange={(e) => updateSectionField(sectionKey, 'cliente', e.target.value)}
                    />
                  </label>
                  <label>
                    Color
                    <input
                      type="text"
                      className="input"
                      value={section.color}
                      onChange={(e) => updateSectionField(sectionKey, 'color', e.target.value)}
                    />
                  </label>
                  <label>
                    Manga
                    <input
                      type="text"
                      className="input"
                      value={section.manga}
                      onChange={(e) => updateSectionField(sectionKey, 'manga', e.target.value)}
                    />
                  </label>
                </div>

                <div className="form-row-3">
                  <label>
                    Vivos
                    <input
                      type="text"
                      className="input"
                      value={section.vivos}
                      onChange={(e) => updateSectionField(sectionKey, 'vivos', e.target.value)}
                    />
                  </label>
                  <label>
                    Cuello
                    <input
                      type="text"
                      className="input"
                      value={section.cuello}
                      onChange={(e) => updateSectionField(sectionKey, 'cuello', e.target.value)}
                    />
                  </label>
                  <label>
                    Puños
                    <input
                      type="text"
                      className="input"
                      value={section.punos}
                      onChange={(e) => updateSectionField(sectionKey, 'punos', e.target.value)}
                    />
                  </label>
                </div>

                <div className="form-row-3">
                  <label>
                    Tela
                    <input
                      type="text"
                      className="input"
                      value={section.tela}
                      onChange={(e) => updateSectionField(sectionKey, 'tela', e.target.value)}
                    />
                  </label>
                  <label>
                    Logotipos
                    <input
                      type="text"
                      className="input"
                      value={section.logotipos}
                      onChange={(e) => updateSectionField(sectionKey, 'logotipos', e.target.value)}
                    />
                  </label>
                  <label>
                    Números
                    <input
                      type="text"
                      className="input"
                      value={section.numeros}
                      onChange={(e) => updateSectionField(sectionKey, 'numeros', e.target.value)}
                    />
                  </label>
                </div>

                <span className="field-label" style={{ display: 'block', marginTop: 8 }}>
                  Tallas
                </span>
                <div className="order-sheet-sizes">
                  {ORDER_SHEET_SIZES.map((size) => (
                    <label key={size} className="order-sheet-sizes__cell">
                      <span>{size}</span>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        placeholder="0"
                        value={section.sizes[size] || ''}
                        onChange={(e) => updateSectionSize(sectionKey, size, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
