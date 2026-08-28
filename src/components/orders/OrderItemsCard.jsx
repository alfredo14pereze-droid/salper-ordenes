import { useState } from 'react'
import OrderItemsEditor from './OrderItemsEditor'
import { setOrderItems } from '../../services/ordersService'
import { createOrderTemplate } from '../../services/templatesService'

const emptyItem = () => ({ garment: '', color: '', pantone: '', sizes: [{ talla: '', cantidad: '' }] })

// Prendas de una orden ya creada: se pueden editar (guardar cambios) y,
// aparte, guardar la orden completa como plantilla reutilizable — así no
// hace falta una pantalla separada para "armar" plantillas desde cero.
export default function OrderItemsCard({ order, onUpdated }) {
  const [items, setItems] = useState(order.items && order.items.length > 0 ? order.items : [emptyItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const cleanItems = items
      .filter((item) => item.garment.trim() || item.sizes.some((s) => String(s.talla).trim()))
      .map((item) => ({
        ...item,
        sizes: item.sizes
          .filter((s) => String(s.talla).trim() && Number(s.cantidad) > 0)
          .map((s) => ({ talla: String(s.talla).trim(), cantidad: Number(s.cantidad) })),
      }))

    const { error: saveError } = await setOrderItems(order.id, cleanItems)
    setSaving(false)

    if (saveError) {
      setError(saveError)
      return
    }
    onUpdated?.()
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    setError(null)

    const { error: templateError } = await createOrderTemplate({
      name: templateName.trim(),
      orderTypeKey: order.order_type_key,
      description: order.description,
      estimatedProductionDays: order.estimated_production_days,
      items: order.items || [],
      referencePhotos: order.reference_photos || [],
    })

    setSavingTemplate(false)

    if (templateError) {
      setError(templateError)
      return
    }
    setTemplateSaved(true)
    setShowTemplateForm(false)
    setTemplateName('')
  }

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Prendas
        </h3>
        {!showTemplateForm && (
          <button type="button" className="btn btn--ghost" onClick={() => setShowTemplateForm(true)}>
            Guardar esta orden como plantilla
          </button>
        )}
      </div>

      {showTemplateForm && (
        <div className="template-picker" style={{ marginBottom: 14 }}>
          <div className="form-row">
            <input
              type="text"
              className="input"
              placeholder='Nombre de la plantilla, ej. "Polo Colegio Vanguard"'
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--primary" onClick={handleSaveTemplate} disabled={savingTemplate}>
                {savingTemplate ? 'Guardando…' : 'Guardar plantilla'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setShowTemplateForm(false)}>
                Cancelar
              </button>
            </div>
          </div>
          <p className="pantone-hint">
            Guarda el tipo, descripción, prendas y fotos actuales de esta orden para reutilizarlos en pedidos futuros.
          </p>
        </div>
      )}
      {templateSaved && <p className="template-hint">✓ Plantilla guardada — ya aparece en "Nueva orden".</p>}

      <OrderItemsEditor items={items} onChange={setItems} orderTypeKey={order.order_type_key} />

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios de prendas'}
        </button>
      </div>
    </div>
  )
}
