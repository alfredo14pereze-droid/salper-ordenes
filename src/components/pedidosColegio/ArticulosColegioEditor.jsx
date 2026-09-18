import { formatImporte, round2 } from '../../utils/pedidosColegio'

export const emptyLinea = () => ({ articulo: '', talla: '', cantidad: '', precio: '' })

export function importeDeLinea(linea) {
  return round2((Number(linea.cantidad) || 0) * (Number(linea.precio) || 0))
}

// Una línea cuenta como "llena" (para el auto-agregado de renglón y para
// mandarse al servidor) cuando trae nombre, cantidad > 0 y un precio
// capturado (0 es válido: cortesía).
export function lineaCompleta(linea) {
  return linea.articulo.trim() !== '' && Number(linea.cantidad) > 0 && String(linea.precio).trim() !== ''
}

// V57 — renglones de un Pedido Colegio: artículo / talla / cantidad /
// precio / importe. Mismo patrón que PedidoArticulosEditor y las tallas
// de OrderItemsEditor: al llenar el último renglón se agrega uno vacío
// solo. Controlado: recibe `lineas`/`onChange`, sin estado propio.
export default function ArticulosColegioEditor({ lineas, onChange }) {
  function updateLinea(index, patch) {
    const next = lineas.map((l, i) => (i === index ? { ...l, ...patch } : l))
    onChange(next)

    const isLastRow = index === next.length - 1
    if (isLastRow && lineaCompleta(next[index])) {
      onChange([...next, emptyLinea()])
    }
  }

  function removeLinea(index) {
    onChange(lineas.filter((_, i) => i !== index))
  }

  return (
    <div>
      <span className="field-label">Artículos</span>
      <div className="sizes-table" style={{ marginTop: 8 }}>
        <div className="sizes-row-header pedido-colegio-row">
          <span>Artículo</span>
          <span>Talla</span>
          <span>Cantidad</span>
          <span>Precio</span>
          <span style={{ textAlign: 'right' }}>Importe</span>
          <span />
        </div>
        {lineas.map((linea, index) => (
          <div key={index} className="sizes-row pedido-colegio-row">
            <input
              type="text"
              className="input"
              placeholder="Ej. Playera polo Avenue"
              value={linea.articulo}
              onChange={(e) => updateLinea(index, { articulo: e.target.value })}
            />
            <input
              type="text"
              className="input"
              placeholder="—"
              value={linea.talla}
              onChange={(e) => updateLinea(index, { talla: e.target.value })}
            />
            <input
              type="number"
              min="1"
              step="1"
              className="input"
              placeholder="0"
              value={linea.cantidad}
              onChange={(e) => updateLinea(index, { cantidad: e.target.value })}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              placeholder="0.00"
              value={linea.precio}
              onChange={(e) => updateLinea(index, { precio: e.target.value })}
            />
            <span className="pedido-colegio-importe">{formatImporte(importeDeLinea(linea))}</span>
            {lineas.length > 1 ? (
              <button
                type="button"
                className="sizes-row__remove"
                onClick={() => removeLinea(index)}
                aria-label="Quitar artículo"
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
