import { useState } from 'react'
import OrderItemsEditor from './OrderItemsEditor'
import { setOrderItems } from '../../services/ordersService'
import { createOrderTemplate } from '../../services/templatesService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrder } from '../../utils/permissions'
import { useTelas } from '../../hooks/useTelas'
import { useProductosByCliente } from '../../hooks/useProductosByCliente'

const emptyItem = () => ({
  id: crypto.randomUUID(),
  garment: '',
  color: '',
  pantone: '',
  tela_id: '',
  tela_nombre: '',
  foto_url: '',
  lleva_bordado: false,
  lleva_bolsas: false,
  manga: '',
  vivos: '',
  cuello: '',
  punos: '',
  logotipos: '',
  numeros: '',
  tiene_roster: false,
  roster: [],
  sizes: [{ talla: '', cantidad: '' }],
})

function buildInitialItems(order) {
  // Prendas de órdenes creadas antes de V25 no traen `id` — se le asigna
  // uno aquí al entrar a editar, para que orden_bordados (item_id) tenga
  // con qué ligarse desde ahora en adelante (ver OrderBordadosCard.jsx).
  return order.items && order.items.length > 0
    ? order.items.map((item) => ({ id: item.id || crypto.randomUUID(), ...item }))
    : [emptyItem()]
}

// V48 — resumen de solo lectura de una prenda ya guardada: mismo patrón
// dt/dd que OrderDetailsCard, para que una orden ya creada se vea
// compacta por default (pedido explícito del usuario: "demasiada
// información a la vista... que se vea todo lo más fácil y limpio
// posible"). El formulario completo (OrderItemsEditor, con tela/roster/
// etc.) solo aparece al entrar a "Editar" — antes vivía siempre montado,
// nada más deshabilitado con un fieldset si el rol no podía tocarlo.
function ItemSummary({ item, index }) {
  const sizesText = (item.sizes || [])
    .filter((s) => String(s.talla).trim())
    .map((s) => `${s.talla}: ${s.cantidad}`)
    .join(' · ')

  const detalleRows = [
    item.tela_nombre && ['Tela', item.tela_nombre],
    item.pantone && ['Pantone / especificación', item.pantone],
    item.cuello && ['Cuello', item.cuello],
    item.manga && ['Manga', item.manga],
    item.vivos && ['Vivos', item.vivos],
    item.punos && ['Puños', item.punos],
    item.logotipos && ['Logotipos', item.logotipos],
    item.numeros && ['Números', item.numeros],
  ].filter(Boolean)

  const notas = [
    item.lleva_bordado && 'Lleva bordado',
    item.lleva_bolsas && 'Lleva bolsas',
    item.tiene_roster &&
      (item.roster || []).length > 0 &&
      `Lista de ${item.roster.length} registro${item.roster.length === 1 ? '' : 's'} (nombres/números)`,
  ].filter(Boolean)

  return (
    <div className="item-block">
      <div className="item-block__top">
        <span className="item-block__title">Prenda {index + 1}</span>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Prenda</dt>
          <dd>
            {item.garment || '—'}
            {item.color ? ` · ${item.color}` : ''}
          </dd>
        </div>
        {detalleRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Tallas y cantidades</dt>
          <dd>{sizesText || 'Sin tallas capturadas'}</dd>
        </div>
        {notas.length > 0 && (
          <div>
            <dt>Notas</dt>
            <dd>{notas.join(' · ')}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

// Prendas de una orden ya creada: tienda/admin pueden editarlas (mientras
// canEditOrder lo permita) y, aparte, guardar la orden completa como
// plantilla reutilizable. Fábrica las ve, pero no le toca cambiarlas —
// su trabajo es el tiempo/etapa, no re-especificar qué se está pidiendo.
export default function OrderItemsCard({ order, onUpdated }) {
  const { role } = useAuth()
  const editable = canEditOrder(role, order)
  const [editing, setEditing] = useState(false)
  const [items, setItems] = useState(() => buildInitialItems(order))
  const { telas, refresh: refreshTelas } = useTelas()
  const { productos, refresh: refreshProductos } = useProductosByCliente(order.client_id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  const grandTotal = (order.items || []).reduce(
    (sum, item) => sum + (item.sizes || []).reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )

  function startEditing() {
    setItems(buildInitialItems(order))
    setError(null)
    setEditing(true)
  }

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
    setEditing(false)
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

  if (!editing) {
    return (
      <div>
        <div className="section-header">
          <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
            Prendas
          </h3>
          {editable && (
            <button type="button" className="btn btn--ghost" onClick={startEditing}>
              Editar
            </button>
          )}
        </div>
        {!order.items || order.items.length === 0 ? (
          <p className="page-subtitle">Esta orden todavía no tiene prendas capturadas.</p>
        ) : (
          <>
            <div className="document-list">
              {order.items.map((item, i) => (
                <ItemSummary key={item.id || i} item={item} index={i} />
              ))}
            </div>
            <p className="pantone-hint" style={{ textAlign: 'right', marginTop: 10 }}>
              Total de piezas en la orden: <strong>{grandTotal}</strong>
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Editar prendas
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

      <OrderItemsEditor
        items={items}
        onChange={setItems}
        orderTypeKey={order.order_type_key}
        telas={telas}
        onTelaCreated={refreshTelas}
        clienteId={order.client_id}
        clienteNombre={order.client_name}
        productos={productos}
        onProductoCreated={refreshProductos}
      />

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios de prendas'}
        </button>
      </div>
    </div>
  )
}
