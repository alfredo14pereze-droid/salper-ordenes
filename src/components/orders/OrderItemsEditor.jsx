import { GARMENT_COLORS, ORDER_TYPES_REQUIRING_PANTONE } from '../../lib/constants'
import TelaSelect from './TelaSelect'
import ProductoAutocomplete from './ProductoAutocomplete'

// Editor de las prendas de una orden: cada prenda tiene nombre, color,
// Pantone (solo si el tipo de orden lo requiere — ver constants.js), tela
// (catálogo opcional — ver telas/tela_id/tela_nombre) y una tabla de
// tallas+cantidades con filas que se agregan solas al llenar la última.
//
// Es "controlado": recibe `items` y `onChange`, no tiene estado propio de
// los datos. Así el mismo componente sirve tanto para armar una orden nueva
// (estado en memoria) como para editar una ya creada (se guarda con un
// botón). `telas`/`clienteId` son opcionales: si no se pasan, el selector de
// tela y el autocompletado de producto simplemente no aparecen (una orden
// vieja sin cliente catalogado se sigue viendo y editando sin error).
export default function OrderItemsEditor({
  items,
  onChange,
  orderTypeKey,
  telas = [],
  onTelaCreated,
  clienteId = null,
  clienteNombre = '',
  productos = [],
  onProductoCreated,
}) {
  const needsPantone = ORDER_TYPES_REQUIRING_PANTONE.includes(orderTypeKey)

  function updateItem(index, patch) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeItem(index) {
    onChange(items.filter((_, i) => i !== index))
  }

  function addItem() {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        garment: '',
        color: '',
        pantone: '',
        tela_id: '',
        tela_nombre: '',
        foto_url: '',
        lleva_bordado: false,
        sizes: [{ talla: '', cantidad: '' }],
      },
    ])
  }

  function updateSize(itemIndex, sizeIndex, patch) {
    const item = items[itemIndex]
    const sizes = item.sizes.map((s, i) => (i === sizeIndex ? { ...s, ...patch } : s))
    updateItem(itemIndex, { sizes })

    // Auto-agregar fila: si la que se acaba de editar es la última y ya
    // quedó completa (talla + cantidad), se agrega una fila vacía nueva
    // sola, sin que haga falta darle "+ Agregar talla". No duplica: una vez
    // que la fila nueva vacía existe, editarla no vuelve a disparar esto
    // hasta que ELLA quede completa (en ese punto ya es la última de nuevo).
    const isLastRow = sizeIndex === sizes.length - 1
    const rowFilled = sizes[sizeIndex].talla.trim() !== '' && Number(sizes[sizeIndex].cantidad) > 0
    if (isLastRow && rowFilled) {
      updateItem(itemIndex, { sizes: [...sizes, { talla: '', cantidad: '' }] })
    }
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
              <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                Tela
              </span>
              <TelaSelect
                telas={telas}
                value={item.tela_id}
                onChange={(telaId, telaNombre) => updateItem(itemIndex, { tela_id: telaId, tela_nombre: telaNombre })}
                onTelaCreated={onTelaCreated}
              />
            </div>

            <button
              type="button"
              className={item.lleva_bordado ? 'btn btn--secondary btn--small' : 'btn btn--ghost btn--small'}
              style={{ marginTop: 8 }}
              onClick={() => updateItem(itemIndex, { lleva_bordado: !item.lleva_bordado })}
            >
              {item.lleva_bordado ? '✓ Lleva bordado' : '¿Lleva bordado?'}
            </button>

            {clienteId && (
              <ProductoAutocomplete
                clienteId={clienteId}
                clienteNombre={clienteNombre}
                productos={productos}
                telas={telas}
                item={item}
                onApply={(patch) => updateItem(itemIndex, patch)}
                onProductoCreated={onProductoCreated}
              />
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
