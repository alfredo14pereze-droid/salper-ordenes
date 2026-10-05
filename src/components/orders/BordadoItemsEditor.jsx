import { useRef, useState } from 'react'
import { uploadFotoBordado } from '../../services/bordadosService'
import { PRENDAS_BORDADO, OTRA_PRENDA, esCachucha, nuevoBordado, nuevaPrendaBordado } from '../../utils/bordadoOrden'

// V132 — editor de prendas para órdenes de tipo "bordado": solo prenda,
// tallas/cantidades y los bordados (foto + dónde va, salvo cachucha, que solo
// pide la foto). Sin tela, color, cuello, manga ni las demás especificaciones.
// Misma interfaz controlada que OrderItemsEditor (items + onChange).
export default function BordadoItemsEditor({ items, onChange }) {
  const [otraIds, setOtraIds] = useState(() => new Set())
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState(null)
  const inputsRef = useRef({})

  const updateItem = (index, patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  const removeItem = (index) => onChange(items.filter((_, i) => i !== index))

  function updateSize(itemIndex, sizeIndex, patch) {
    const item = items[itemIndex]
    const sizes = item.sizes.map((s, i) => (i === sizeIndex ? { ...s, ...patch } : s))
    const last = sizes[sizes.length - 1]
    if (String(last.talla).trim() && Number(last.cantidad) > 0) sizes.push({ talla: '', cantidad: '' })
    updateItem(itemIndex, { sizes })
  }
  function removeSize(itemIndex, sizeIndex) {
    updateItem(itemIndex, { sizes: items[itemIndex].sizes.filter((_, i) => i !== sizeIndex) })
  }

  function updateBordado(itemIndex, bordadoId, patch) {
    updateItem(itemIndex, { bordados: (items[itemIndex].bordados || []).map((b) => (b.id === bordadoId ? { ...b, ...patch } : b)) })
  }
  function removeBordado(itemIndex, bordadoId) {
    updateItem(itemIndex, { bordados: (items[itemIndex].bordados || []).filter((b) => b.id !== bordadoId) })
  }

  // Cada foto elegida es un bordado nuevo: se sube de inmediato y su fila aparece
  // con la miniatura (así se pueden subir varias a la vez).
  async function agregarFotos(itemIndex, fileList) {
    const files = [...(fileList || [])]
    if (files.length === 0) return
    setError(null)
    setSubiendo((n) => n + files.length)
    const nuevos = []
    for (const file of files) {
      const { data, error: upErr } = await uploadFotoBordado(file)
      if (upErr) setError(upErr)
      else nuevos.push(nuevoBordado({ foto_url: data.url, foto_path: data.path }))
      setSubiendo((n) => n - 1)
    }
    if (nuevos.length > 0) {
      // `items` pudo cambiar durante la subida: se vuelve a leer del arreglo actual.
      onChange((prev) => (prev || items).map((it, i) => (i === itemIndex ? { ...it, bordados: [...(it.bordados || []), ...nuevos] } : it)))
    }
  }

  return (
    <div className="items-editor">
      {items.map((item, itemIndex) => {
        const cachucha = esCachucha(item.garment)
        const enLista = PRENDAS_BORDADO.includes(item.garment)
        const modoOtra = otraIds.has(item.id) || (!!item.garment && !enLista)
        const selectValue = modoOtra ? OTRA_PRENDA : item.garment
        const total = item.sizes.reduce((n, s) => n + (Number(s.cantidad) || 0), 0)
        return (
          <div key={item.id || itemIndex} className="item-block">
            <div className="item-block__top">
              <span className="item-block__title">Prenda {itemIndex + 1}</span>
              {items.length > 1 && (
                <button type="button" className="item-block__remove" onClick={() => removeItem(itemIndex)} aria-label="Quitar prenda">
                  ×
                </button>
              )}
            </div>

            <div className="form-row">
              <label>
                Prenda
                <select
                  className="input"
                  value={selectValue}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === OTRA_PRENDA) {
                      setOtraIds((prev) => new Set(prev).add(item.id))
                      updateItem(itemIndex, { garment: enLista ? '' : item.garment })
                    } else {
                      setOtraIds((prev) => {
                        const n = new Set(prev)
                        n.delete(item.id)
                        return n
                      })
                      updateItem(itemIndex, { garment: v })
                    }
                  }}
                >
                  <option value="">Selecciona…</option>
                  {PRENDAS_BORDADO.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value={OTRA_PRENDA}>Otra…</option>
                </select>
              </label>
              {modoOtra && (
                <label>
                  ¿Cuál?
                  <input type="text" className="input" value={item.garment} onChange={(e) => updateItem(itemIndex, { garment: e.target.value })} placeholder="Ej. Bata, Overol" />
                </label>
              )}
            </div>

            <span className="field-label" style={{ display: 'block', marginTop: 8 }}>
              Tallas y cantidades
            </span>
            <div className="sizes-table">
              {item.sizes.map((s, sizeIndex) => (
                <div key={sizeIndex} className="sizes-row">
                  <input
                    type="text"
                    className="input"
                    placeholder={cachucha ? 'Única' : 'Ej. 8, CH, 34…'}
                    value={s.talla}
                    onChange={(e) => updateSize(itemIndex, sizeIndex, { talla: e.target.value })}
                    aria-label="Talla"
                  />
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="input"
                    placeholder="0"
                    value={s.cantidad}
                    onChange={(e) => updateSize(itemIndex, sizeIndex, { cantidad: e.target.value })}
                    aria-label="Cantidad"
                  />
                  {item.sizes.length > 1 && (
                    <button type="button" className="sizes-row__remove" onClick={() => removeSize(itemIndex, sizeIndex)} aria-label="Quitar talla">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="bordado-lista">
              <span className="field-label" style={{ display: 'block', marginTop: 12 }}>
                {cachucha ? 'Foto del bordado' : 'Bordados (foto y dónde va cada uno)'}
              </span>
              {(item.bordados || []).map((b) => (
                <div key={b.id} className="bordado-fila">
                  <a href={b.foto_url} target="_blank" rel="noreferrer">
                    <img src={b.foto_url} alt="Bordado" className="bordado-fila__foto" />
                  </a>
                  {!cachucha ? (
                    <input
                      type="text"
                      className="input"
                      value={b.ubicacion}
                      onChange={(e) => updateBordado(itemIndex, b.id, { ubicacion: e.target.value })}
                      placeholder="¿Dónde va? Ej. Espalda, manga derecha, pecho izquierdo"
                      aria-label="Dónde va el bordado"
                    />
                  ) : (
                    <span className="pantone-hint" style={{ flex: 1 }}>
                      Cachucha
                    </span>
                  )}
                  <button type="button" className="sizes-row__remove" onClick={() => removeBordado(itemIndex, b.id)} aria-label="Quitar bordado">
                    ×
                  </button>
                </div>
              ))}
              <label className="btn btn--secondary btn--small bordado-subir">
                {subiendo > 0 ? `Subiendo ${subiendo}…` : (item.bordados || []).length > 0 ? '+ Agregar otro bordado (foto)' : '+ Agregar foto del bordado'}
                <input
                  ref={(el) => (inputsRef.current[itemIndex] = el)}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    agregarFotos(itemIndex, e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
              <p className="pantone-hint">Puedes elegir varias fotos a la vez: cada una es un bordado distinto.</p>
            </div>

            <div className="item-block__total">
              Piezas en esta prenda: <b>{total}</b>
            </div>
          </div>
        )
      })}
      {error && <p className="form-error">{error.message}</p>}
      <button type="button" className="add-item-btn" onClick={() => onChange([...items, nuevaPrendaBordado()])}>
        + Agregar otra prenda a esta orden
      </button>
      <div className="items-editor__total">
        Total de piezas en la orden: <b>{items.reduce((n, it) => n + it.sizes.reduce((m, s) => m + (Number(s.cantidad) || 0), 0), 0)}</b>
      </div>
    </div>
  )
}
