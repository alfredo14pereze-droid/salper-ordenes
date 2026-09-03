// Lista de artículos de un pedido a proveedor: nombre + talla (opcional)
// + cantidad, con fila que se agrega sola al llenar la última — mismo
// patrón exacto que las tallas/cantidades de OrderItemsEditor.jsx (mismas
// clases base sizes-table/sizes-row__remove/add-size-btn), con una clase
// extra `pedido-articulos-row` que agrega la 4ta columna de talla sin
// tocar `.sizes-row` (que OrderItemsEditor sigue usando con 3 columnas).
//
// Controlado: recibe `articulos`/`onChange`, sin estado propio — así el
// mismo editor sirve tanto para llenarlo a mano como para prellenarlo con
// lo que reconoce la foto (ver recognizePedidoPhoto en
// services/pedidoOcrService.js).
export default function PedidoArticulosEditor({ articulos, onChange }) {
  function updateArticulo(index, patch) {
    const next = articulos.map((a, i) => (i === index ? { ...a, ...patch } : a))
    onChange(next)

    // Auto-agregar fila: si la que se acaba de editar es la última y ya
    // quedó completa (nombre + cantidad — la talla es opcional, no cuenta
    // para esto), se agrega una fila vacía nueva sola.
    const isLastRow = index === next.length - 1
    const rowFilled = next[index].nombreArticulo.trim() !== '' && Number(next[index].cantidadPedida) > 0
    if (isLastRow && rowFilled) {
      onChange([...next, { nombreArticulo: '', cantidadPedida: '', talla: '' }])
    }
  }

  function removeArticulo(index) {
    onChange(articulos.filter((_, i) => i !== index))
  }

  return (
    <div>
      <span className="field-label">Artículos</span>
      <div className="sizes-table" style={{ marginTop: 8 }}>
        <div className="sizes-row-header pedido-articulos-row">
          <span>Artículo</span>
          <span>Talla</span>
          <span>Cantidad</span>
          <span />
        </div>
        {articulos.map((articulo, index) => (
          <div key={index} className="sizes-row pedido-articulos-row">
            <input
              type="text"
              className="input"
              placeholder="Ej. Balones de básquetbol #7"
              value={articulo.nombreArticulo}
              onChange={(e) => updateArticulo(index, { nombreArticulo: e.target.value })}
            />
            <input
              type="text"
              className="input"
              placeholder="—"
              value={articulo.talla || ''}
              onChange={(e) => updateArticulo(index, { talla: e.target.value })}
            />
            <input
              type="number"
              min="1"
              className="input"
              placeholder="0"
              value={articulo.cantidadPedida}
              onChange={(e) => updateArticulo(index, { cantidadPedida: e.target.value })}
            />
            {articulos.length > 1 && (
              <button
                type="button"
                className="sizes-row__remove"
                onClick={() => removeArticulo(index)}
                aria-label="Quitar artículo"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
