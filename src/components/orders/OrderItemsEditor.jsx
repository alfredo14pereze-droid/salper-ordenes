import { GARMENT_COLORS, ORDER_TYPES_REQUIRING_PANTONE } from '../../lib/constants'

// Editor de las prendas de una orden: cada prenda tiene nombre, color,
// Pantone (solo si el tipo de orden lo requiere — ver constants.js) y una
// tabla de tallas+cantidades con filas que se agregan de una en una.
//
// Es "controlado": recibe `items` y `onChange`, no tiene estado propio de
// los datos (sí de UI, como cuál prenda está expandida no aplica aquí).
// Así el mismo componente sirve tanto para armar una orden nueva (estado
// en memoria) como para editar una ya creada (se guarda con un botón).
export default function OrderItemsEditor({ items, onChange, orderTypeKey }) {
  const needsPantone = ORDER_TYPES_REQUIRING_PANTONE.includes(orderTypeKey)

  function updateItem(index, patch) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeItem(index) {
    onChange(items.filter((_, i) => i !== index))
  }

  function addItem() {
    onChange([...items, { garment: '', color: '', pantone: '', sizes: [{ talla: '', cantidad: '' }] }])
  }

  function updateSize(itemIndex, sizeIndex, patch) {
    const item = items[itemIndex]
    const sizes = item.sizes.map((s, i) => (i === sizeIndex ? { ...s, ...patch } : s))
    updateItem(itemIndex, { sizes })
  }

  function addSize(itemIndex) {
    const item = items[itemIndex]
    updateItem(itemIndex, { sizes: [...item.sizes, { talla: '', cantidad: '' }] })
  }

  function removeSize(itemIndex, sizeIndex) {
    const item = items[itemIndex]
    updateItem(itemIndex, { sizes: item.sizes.filter((_, i) => i !== sizeIndex) })
  }

  const grandTotal = items.reduce(
    (sum, item) => sum + item.sizes.reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )

  return (
    <div className="items-editor">
      {items.map((item, itemIndex) => {
        const itemTotal = item.sizes.reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)

        return (
          <div key={itemIndex} className="item-block">
            <div className="item-block__top">
              <span className="item-block__title">Prenda {itemIndex + 1}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  className="item-block__remove"
                  onClick={() => removeItem(itemIndex)}
                  aria-label="Quitar prenda"
                >
                  ×
                </button>
              )}
            </div>

            <div className={needsPantone ? 'form-row-3' : 'form-row'}>
              <label>
                Prenda
                <input
                  type="text"
                  className="input"
                  placeholder="Ej. Playera, Short, Chamarra…"
                  value={item.garment}
                  onChange={(e) => updateItem(itemIndex, { garment: e.target.value })}
                />
              </label>
              <label>
                Color
                <select
                  className="input"
                  value={item.color}
                  onChange={(e) => updateItem(itemIndex, { color: e.target.value })}
                >
                  <option value="">Selecciona…</option>
                  {GARMENT_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {needsPantone && (
                <label>
                  Pantone / especificación
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. PMS 289 C"
                    value={item.pantone}
                    onChange={(e) => updateItem(itemIndex, { pantone: e.target.value })}
                  />
                </label>
              )}
            </div>
            {needsPantone && (
              <p className="pantone-hint">
                Solo en sublimación: aquí se especifica el tono exacto. En otros tipos de orden basta con el color de arriba.
              </p>
            )}

            <div>
              <span className="field-label">Tallas y cantidades</span>
              <div className="sizes-table" style={{ marginTop: 8 }}>
                <div className="sizes-row-header">
                  <span>Talla</span>
                  <span>Cantidad</span>
                  <span />
                </div>
                {item.sizes.map((size, sizeIndex) => (
                  <div key={sizeIndex} className="sizes-row">
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. 8, CH, 34…"
                      value={size.talla}
                      onChange={(e) => updateSize(itemIndex, sizeIndex, { talla: e.target.value })}
                    />
                    <input
                      type="number"
                      min="1"
                      className="input"
                      placeholder="0"
                      value={size.cantidad}
                      onChange={(e) => updateSize(itemIndex, sizeIndex, { cantidad: e.target.value })}
                    />
                    {item.sizes.length > 1 && (
                      <button
                        type="button"
                        className="sizes-row__remove"
                        onClick={() => removeSize(itemIndex, sizeIndex)}
                        aria-label="Quitar talla"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="add-size-btn" style={{ marginTop: 8 }} onClick={() => addSize(itemIndex)}>
                + Agregar talla
              </button>
            </div>

            <div className="item-block__total">
              Piezas en esta prenda: <b>{itemTotal}</b>
            </div>
          </div>
        )
      })}

      <button type="button" className="add-item-btn" onClick={addItem}>
        + Agregar otra prenda a esta orden
      </button>

      <div className="items-grand-total">
        <span>Total de piezas en la orden</span>
        <b>{grandTotal}</b>
      </div>
    </div>
  )
}
