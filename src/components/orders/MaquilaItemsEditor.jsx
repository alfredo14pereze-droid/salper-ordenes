// V143 — prenda de una orden de maquila: solo tallas/cantidades y si lleva
// bordado. El producto (y con él los procesos) se elige aparte, en "Nueva
// orden". Misma interfaz controlada que OrderItemsEditor (items + onChange);
// una orden de maquila tiene una sola prenda: items[0].
export default function MaquilaItemsEditor({ items, onChange, bordadoObligado = false }) {
  const item = items[0] || { sizes: [{ talla: '', cantidad: '' }] }
  const sizes = item.sizes?.length > 0 ? item.sizes : [{ talla: '', cantidad: '' }]
  const update = (patch) => onChange([{ ...item, ...patch }, ...items.slice(1)])

  function updateSize(sizeIndex, patch) {
    const next = sizes.map((s, i) => (i === sizeIndex ? { ...s, ...patch } : s))
    const last = next[next.length - 1]
    if (String(last.talla).trim() && Number(last.cantidad) > 0) next.push({ talla: '', cantidad: '' })
    update({ sizes: next })
  }

  const total = sizes.reduce((n, s) => n + (Number(s.cantidad) || 0), 0)

  return (
    <div className="items-editor">
      <div className="item-block">
        <span className="field-label" style={{ display: 'block' }}>
          Tallas y cantidades *
        </span>
        <div className="sizes-table">
          {sizes.map((s, sizeIndex) => (
            <div key={sizeIndex} className="sizes-row">
              <input
                type="text"
                className="input"
                placeholder="Ej. 8, CH, 34…"
                value={s.talla}
                onChange={(e) => updateSize(sizeIndex, { talla: e.target.value })}
                aria-label="Talla"
              />
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="input"
                placeholder="0"
                value={s.cantidad}
                onChange={(e) => updateSize(sizeIndex, { cantidad: e.target.value })}
                aria-label="Cantidad"
              />
              {sizes.length > 1 && (
                <button
                  type="button"
                  className="sizes-row__remove"
                  onClick={() => update({ sizes: sizes.filter((_, i) => i !== sizeIndex) })}
                  aria-label="Quitar talla"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={bordadoObligado || !!item.lleva_bordado}
            disabled={bordadoObligado}
            onChange={(e) => update({ lleva_bordado: e.target.checked })}
          />
          Lleva bordado
        </label>
        {bordadoObligado && <p className="pantone-hint">Este producto siempre lleva bordado.</p>}

        <div className="item-block__total">
          Total de piezas: <b>{total}</b>
        </div>
      </div>
    </div>
  )
}
