import { useState } from 'react'
import { setItemSurtido } from '../../services/ordersService'
import { useAuth } from '../../contexts/AuthContext'
import { canManageSurtido } from '../../utils/permissions'

// Una fila por talla (no por prenda completa — una prenda casi siempre
// trae varias tallas, cada una con su propia cantidad pedida). Editable
// solo para terminado/admin_fabrica/admin_general (canManageSurtido);
// el resto de los roles ven lo ya capturado, de solo lectura.
function SizeSurtidoRow({ orderId, itemIndex, size, canEdit, onSaved }) {
  const [cantidad, setCantidad] = useState(size.cantidad_surtida ?? '')
  const [comentario, setComentario] = useState(size.comentario_surtido || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const dirty = String(size.cantidad_surtida ?? '') !== String(cantidad) || (size.comentario_surtido || '') !== comentario

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: saveError } = await setItemSurtido(
      orderId,
      itemIndex,
      size.talla,
      cantidad === '' ? null : Number(cantidad),
      comentario
    )
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onSaved?.()
  }

  return (
    <div className="form-row" style={{ alignItems: 'flex-end' }}>
      <label style={{ maxWidth: 90 }}>
        Talla
        <input type="text" className="input" value={size.talla} disabled readOnly />
      </label>
      <label style={{ maxWidth: 100 }}>
        Pedida
        <input type="text" className="input" value={size.cantidad} disabled readOnly />
      </label>
      <label style={{ maxWidth: 110 }}>
        Surtida
        {canEdit ? (
          <input
            type="number"
            min="0"
            className="input"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        ) : (
          <input type="text" className="input" value={size.cantidad_surtida ?? '—'} disabled readOnly />
        )}
      </label>
      <label style={{ flex: 1 }}>
        Comentario
        {canEdit ? (
          <input
            type="text"
            className="input"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Opcional — ej. faltante por tela agotada"
          />
        ) : (
          <input type="text" className="input" value={size.comentario_surtido || '—'} disabled readOnly />
        )}
      </label>
      {canEdit && (
        <button type="button" className="btn btn--primary btn--small" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      )}
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

// Terminado (V26, ver supabase/schema_v26_terminado_remision.sql):
// captura cantidad realmente surtida + comentario por cada talla de cada
// prenda. Siempre visible (todos ven todo), editable solo para el rol
// que corresponde.
export default function OrderSurtidoCard({ order, onUpdated }) {
  const { role } = useAuth()
  const canEdit = canManageSurtido(role) && !order.eliminada_en
  const items = order.items || []

  if (items.length === 0) return null

  return (
    <div>
      <h3 className="section-title section-title--small">Cantidad surtida</h3>
      <p className="page-subtitle" style={{ marginTop: -6, marginBottom: 10 }}>
        Comparación entre lo pedido y lo realmente surtido, por talla.
      </p>
      <div className="document-list">
        {items.map((item, itemIndex) => (
          <div key={item.id || itemIndex} className="document-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <span className="document-row__label">{item.garment || `Prenda ${itemIndex + 1}`}</span>
            {(item.sizes || []).map((size, sizeIndex) => (
              <SizeSurtidoRow
                key={sizeIndex}
                orderId={order.id}
                itemIndex={itemIndex}
                size={size}
                canEdit={canEdit}
                onSaved={onUpdated}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
