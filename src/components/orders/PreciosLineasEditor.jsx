import { formatMxn } from '../../services/finanzasService'
import { subtotalFila } from '../../utils/preciosLineas'

// V159 — Tabla de líneas: prenda | talla | cantidad | mostrador | precio | subtotal.
// La usan el alta (NewOrderPage) y el detalle (OrderFacturacionCard). No
// calcula nada por su cuenta: la lógica está en utils/preciosLineas.js.
//
// filas: [{ itemIndex, sizeIndex, prenda, talla, cantidad, precioUnitario,
//           precioTexto?, ventaMostrador, extrasPorPieza? }]
// onChange(fila, { precio } | { ventaMostrador })
export default function PreciosLineasEditor({ filas, onChange, disabled = false, conPrecio = true }) {
  if (filas.length === 0) {
    return <p className="pantone-hint">Captura arriba las tallas y cantidades; aquí aparecerá una línea por talla para ponerle precio.</p>
  }
  const hayExtras = filas.some((f) => Number(f.extrasPorPieza) > 0)
  return (
    <div className="table-scroll">
      <table className="precio-table precio-lineas">
        <thead>
          <tr>
            <th>Prenda</th>
            <th>Talla</th>
            <th>Cant.</th>
            <th>Venta de mostrador</th>
            {conPrecio && <th>Precio unitario</th>}
            {conPrecio && hayExtras && <th>Extras / pza</th>}
            {conPrecio && <th style={{ textAlign: 'right' }}>Subtotal</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const sinPrecio = conPrecio && !f.ventaMostrador && !(Number(f.precioUnitario) > 0)
            const valor = f.precioTexto !== undefined ? f.precioTexto : f.precioUnitario ?? ''
            return (
              <tr key={`${f.itemIndex}:${f.sizeIndex}`} className={f.ventaMostrador ? 'precio-lineas__fila--mostrador' : undefined}>
                <td data-label="Prenda"><b>{f.prenda}</b></td>
                <td data-label="Talla">{f.talla}</td>
                <td data-label="Cantidad">{f.cantidad}</td>
                <td data-label="Mostrador">
                  <label className="fin-check precio-lineas__mostrador">
                    <input
                      type="checkbox"
                      checked={!!f.ventaMostrador}
                      disabled={disabled}
                      onChange={(e) => onChange(f, { ventaMostrador: e.target.checked })}
                    />
                    {f.ventaMostrador ? <span className="badge badge--mostrador">Mostrador</span> : 'No'}
                  </label>
                </td>
                {conPrecio && (
                  <td data-label="Precio unitario">
                    {f.ventaMostrador ? (
                      <span className="pantone-hint">No aplica</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        className={`input${sinPrecio ? ' input--error' : ''}`}
                        value={valor}
                        disabled={disabled}
                        placeholder="0.00"
                        aria-label={`Precio unitario ${f.prenda} ${f.talla}`}
                        onChange={(e) => onChange(f, { precio: e.target.value })}
                      />
                    )}
                  </td>
                )}
                {conPrecio && hayExtras && (
                  <td data-label="Extras / pza">{Number(f.extrasPorPieza) > 0 && !f.ventaMostrador ? formatMxn(f.extrasPorPieza) : '—'}</td>
                )}
                {conPrecio && (
                  <td data-label="Subtotal" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {f.ventaMostrador ? '—' : formatMxn(subtotalFila(f))}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
