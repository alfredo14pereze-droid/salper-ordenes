import { useState } from 'react'
import { updateOrderDetails } from '../../services/ordersService'
import { formatDate, computeProductionWindow } from '../../utils/dates'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrder } from '../../utils/permissions'
import OrderTypeSelect from './OrderTypeSelect'

// Datos generales de la orden. Si el rol actual puede editarla (tienda
// solo mientras sigue "en_confirmacion"; admin siempre — ver
// canEditOrder), aparece un botón "Editar" que cambia a un formulario;
// si no, es de solo lectura. La validación real vive en el servidor
// (update_order_details), esto solo decide qué mostrar.
export default function OrderDetailsCard({ order, orderTypes, onUpdated }) {
  const { role } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    clientName: order.client_name,
    clientTelefono: order.client_telefono || '',
    clientCorreo: order.client_correo || '',
    orderTypeKey: order.order_type_key,
    description: order.description || '',
    requestedDeliveryDate: order.requested_delivery_date,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const productionWindow = computeProductionWindow(order)
  const editable = canEditOrder(role, order)

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function startEditing() {
    setForm({
      clientName: order.client_name,
      clientTelefono: order.client_telefono || '',
      clientCorreo: order.client_correo || '',
      orderTypeKey: order.order_type_key,
      description: order.description || '',
      requestedDeliveryDate: order.requested_delivery_date,
    })
    setError(null)
    setEditing(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error: saveError } = await updateOrderDetails(order.id, form)
    setSaving(false)

    if (saveError) {
      setError(saveError)
      return
    }
    setEditing(false)
    onUpdated?.()
  }

  if (editing) {
    return (
      <form className="order-form" onSubmit={handleSave}>
        <h3 className="section-title section-title--small">Editar orden</h3>
        <label>
          Cliente
          <input
            type="text"
            className="input"
            value={form.clientName}
            onChange={(e) => updateField('clientName', e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Teléfono del cliente
            <input
              type="tel"
              className="input"
              value={form.clientTelefono}
              onChange={(e) => updateField('clientTelefono', e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <label>
            Correo del cliente
            <input
              type="email"
              className="input"
              value={form.clientCorreo}
              onChange={(e) => updateField('clientCorreo', e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Tipo de orden
          </span>
          <OrderTypeSelect orderTypes={orderTypes} value={form.orderTypeKey} onChange={(key) => updateField('orderTypeKey', key)} />
        </div>
        <label>
          Fecha de entrega solicitada
          <input
            type="date"
            className="input"
            value={form.requestedDeliveryDate}
            onChange={(e) => updateField('requestedDeliveryDate', e.target.value)}
          />
        </label>
        <label>
          Descripción / especificaciones
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
          />
        </label>

        {error && <p className="form-error">{error.message}</p>}

        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          Detalles
        </h3>
        {editable && (
          <button type="button" className="btn btn--ghost" onClick={startEditing}>
            Editar
          </button>
        )}
      </div>
      <dl className="detail-list">
        {(order.client_telefono || order.client_correo) && (
          <div>
            <dt>Contacto del cliente</dt>
            <dd>
              {order.client_telefono || '—'}
              {order.client_telefono && order.client_correo ? ' · ' : ''}
              {order.client_correo || ''}
            </dd>
          </div>
        )}
        <div>
          <dt>Descripción / especificaciones</dt>
          <dd>{order.description || '—'}</dd>
        </div>
        <div>
          <dt>Fecha de entrega solicitada</dt>
          <dd>{formatDate(order.requested_delivery_date)}</dd>
        </div>
        <div>
          <dt>Tiempo estimado de producción</dt>
          <dd>
            {order.estimated_production_days
              ? `${order.estimated_production_days} día${order.estimated_production_days === 1 ? '' : 's'}`
              : 'Pendiente — lo captura fábrica al confirmar'}
          </dd>
        </div>
        {!!order.estimated_production_days && (
          <div>
            <dt>Ventana de producción estimada</dt>
            <dd>
              {formatDate(productionWindow.start)} → {formatDate(productionWindow.end)}
            </dd>
          </div>
        )}
        <div>
          <dt>Creada</dt>
          <dd>{formatDate(order.created_at)}</dd>
        </div>
      </dl>
    </>
  )
}
