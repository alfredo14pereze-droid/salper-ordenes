import { useState } from 'react'
import { createProducto } from '../../services/productosService'
import { prendaDesdeProducto } from '../../utils/productoCatalogo'

// Catálogo de productos de un cliente: solo aparece cuando la orden ya tiene
// un cliente EXISTENTE seleccionado (no uno nuevo, que todavía no puede tener
// productos). V133 — se muestran con miniatura, nombre y prenda; elegir uno
// COPIA a la prenda sus especificaciones, tela y bordados (las tallas no)
// (ver utils/productoCatalogo.js) — todo se queda editable después y nada de
// lo que se cambie en la orden regresa al catálogo. También ofrece guardar la
// prenda actual como producto nuevo de ese cliente, para la próxima orden —
// salvo que `canSaveAsProducto` sea false (V40: sublimación no lo usa, ver
// OrderItemsEditor.jsx) o que la prenda ya venga del catálogo.
export default function ProductoAutocomplete({
  clienteId,
  clienteNombre,
  productos,
  telas,
  item,
  onApply,
  onProductoCreated,
  canSaveAsProducto = true,
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // Abierto de entrada solo en una prenda todavía en blanco.
  const [abierto, setAbierto] = useState(() => !item.producto_id && !item.garment.trim())

  if (!clienteId) return null

  const elegido = item.producto_id ? productos.find((p) => p.id === item.producto_id) : null

  function handleSelectProducto(producto) {
    onApply(prendaDesdeProducto(producto, { telas, conBordado: canSaveAsProducto }))
    setAbierto(false)
  }

  async function handleSaveAsProducto() {
    if (!item.garment.trim()) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const { data, error: createError } = await createProducto({
      clienteId,
      nombre: item.garment.trim(),
      garment: item.garment.trim(),
      color: item.color,
      pantone: item.pantone,
      telaId: item.tela_id,
      fotoUrl: item.foto_url,
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }
    setSaved(true)
    onProductoCreated?.(data)
  }

  return (
    <div className="producto-autocomplete">
      {productos.length > 0 && (
        <>
          <div className="producto-picker__head">
            <span>
              Catálogo de {clienteNombre} ({productos.length})
            </span>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setAbierto((v) => !v)}>
              {abierto ? 'Ocultar' : elegido ? 'Cambiar producto' : 'Elegir del catálogo'}
            </button>
          </div>

          {elegido && !abierto && (
            <div className="producto-elegido">
              {elegido.foto_url && <img src={elegido.foto_url} alt="" loading="lazy" />}
              <div>
                <b>{elegido.nombre}</b>
                {elegido.pendiente_validar && (
                  <span className="producto-aviso" title={elegido.notas_validacion || undefined}>
                    ⚠️ Datos por validar
                  </span>
                )}
              </div>
            </div>
          )}

          {abierto && (
            <div className="producto-picker__grid">
              {productos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={'producto-card' + (p.id === item.producto_id ? ' producto-card--activo' : '')}
                  onClick={() => handleSelectProducto(p)}
                >
                  {p.foto_url ? (
                    <img src={p.foto_url} alt="" loading="lazy" />
                  ) : (
                    <span className="producto-card__sin-foto">Sin foto</span>
                  )}
                  <span className="producto-card__nombre">{p.nombre}</span>
                  {p.garment && <span className="producto-card__prenda">{p.garment}</span>}
                  {p.pendiente_validar && <span className="producto-aviso">⚠️ Datos por validar</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {canSaveAsProducto && !item.producto_id && (
        <>
          <button type="button" className="btn btn--ghost btn--small" onClick={handleSaveAsProducto} disabled={saving || !item.garment.trim()}>
            {saving ? 'Guardando…' : `Guardar como producto de ${clienteNombre}`}
          </button>
          {saved && <span className="template-hint">✓ Guardado</span>}
          {error && <p className="form-error">{error.message}</p>}
        </>
      )}
    </div>
  )
}
