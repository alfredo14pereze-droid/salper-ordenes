import { useState } from 'react'
import { createProducto } from '../../services/productosService'

// Autocompletado de "productos" guardados de un cliente: solo aparece
// cuando la orden ya tiene un cliente EXISTENTE seleccionado (no uno nuevo,
// que todavía no puede tener productos). Elegir uno rellena garment/color/
// pantone/tela/foto en esa prenda — todo se queda editable después. También
// ofrece guardar la prenda actual como producto nuevo de ese cliente, para
// la próxima orden.
export default function ProductoAutocomplete({ clienteId, clienteNombre, productos, telas, item, onApply, onProductoCreated }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  if (!clienteId) return null

  function handleSelectProducto(e) {
    const producto = productos.find((p) => p.id === e.target.value)
    if (!producto) return

    const tela = telas.find((t) => t.id === producto.tela_id)

    onApply({
      garment: producto.garment || '',
      color: producto.color || '',
      pantone: producto.pantone || '',
      tela_id: producto.tela_id || '',
      tela_nombre: tela?.nombre || '',
      foto_url: producto.foto_url || '',
    })
    e.target.value = ''
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
        <label>
          Producto guardado de {clienteNombre}
          <select className="input" defaultValue="" onChange={handleSelectProducto}>
            <option value="">Elegir para autocompletar…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" className="btn btn--ghost btn--small" onClick={handleSaveAsProducto} disabled={saving || !item.garment.trim()}>
        {saving ? 'Guardando…' : `Guardar como producto de ${clienteNombre}`}
      </button>
      {saved && <span className="template-hint">✓ Guardado</span>}
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
