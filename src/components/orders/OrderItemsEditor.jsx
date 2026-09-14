import { useState } from 'react'
import { GARMENT_COLORS, GARMENT_OPTIONS_SUBLIMACION, GARMENT_TOP_KEYS_SUBLIMACION, ORDER_TYPES_REQUIRING_PANTONE } from '../../lib/constants'
import TelaSelect from './TelaSelect'
import ProductoAutocomplete from './ProductoAutocomplete'

const OTRO_COLOR = '__otro__'

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
//
// V39 — solo para sublimación (pedido explícito del usuario, casi siempre
// son las mismas 5 prendas): "Prenda" pasa de texto libre a opciones
// cerradas, "Color" pasa AL REVÉS (de opciones cerradas a texto libre,
// hay demasiados tonos distintos), cuello/manga solo aplican a las 3
// prendas "de arriba" (playera/chamarra/sudadera), y aparece el roster de
// nombres+números (o solo números, para short) — ver GARMENT_TOP_KEYS_SUBLIMACION
// y GARMENT_OPTIONS_SUBLIMACION en utils/constants.js. Los demás tipos de
// orden (escolar, industrial) se quedan exactamente como estaban.
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
  const isSublimacion = orderTypeKey === 'sublimacion'

  // V43 — "Otro" en Color (solo escolar/industrial, sublimación ya es
  // texto libre desde V39): la lista de colores no siempre alcanza, pero
  // no se puede saber "está en modo Otro" solo con item.color porque
  // arranca vacío en cuanto se elige "Otro" (y '' es indistinguible de
  // "nada elegido todavía") — por eso este set aparte, por id de prenda.
  // Si una prenda YA trae un color que no está en la lista (por ejemplo
  // al editar una orden vieja), se detecta sola sin tener que estar en
  // este set (ver colorIsOtro más abajo).
  const [otroColorIds, setOtroColorIds] = useState(() => new Set())

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
        lleva_bolsas: false,
        manga: '',
        vivos: '',
        cuello: '',
        punos: '',
        logotipos: '',
        numeros: '',
        tiene_roster: false,
        roster: [],
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

  // Roster (V39): lista de talla/nombre/número (o solo talla/número para
  // short) — para equipos, casi siempre llevan nombre y número en la
  // espalda. Vive aparte de "Tallas y cantidades" (esa sigue siendo el
  // total a producir); el roster es el detalle de QUIÉN lleva cuál.
  function toggleRoster(itemIndex) {
    const item = items[itemIndex]
    const turningOn = !item.tiene_roster
    updateItem(itemIndex, {
      tiene_roster: turningOn,
      roster: turningOn && (!item.roster || item.roster.length === 0) ? [{ talla: '', nombre: '', numero: '' }] : item.roster,
    })
  }

  function addRosterRow(itemIndex) {
    const item = items[itemIndex]
    updateItem(itemIndex, { roster: [...(item.roster || []), { talla: '', nombre: '', numero: '' }] })
  }

  function removeRosterRow(itemIndex, rowIndex) {
    const item = items[itemIndex]
    updateItem(itemIndex, { roster: item.roster.filter((_, i) => i !== rowIndex) })
  }

  function updateRosterRow(itemIndex, rowIndex, patch) {
    const item = items[itemIndex]
    updateItem(itemIndex, { roster: item.roster.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)) })
  }

  const grandTotal = items.reduce(
    (sum, item) => sum + item.sizes.reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0),
    0
  )

  return (
    <div className="items-editor">
      {items.map((item, itemIndex) => {
        const itemTotal = item.sizes.reduce((s, sz) => s + (Number(sz.cantidad) || 0), 0)
        // Solo aplica dentro de sublimación (fuera de ahí "Prenda" sigue
        // siendo texto libre, así que esto no significa nada).
        const isTopGarment = isSublimacion && GARMENT_TOP_KEYS_SUBLIMACION.includes(item.garment)
        const isShort = isSublimacion && item.garment === 'Short'
        const showCuelloManga = !isSublimacion || isTopGarment
        const showRosterButton = isTopGarment || isShort
        const tallasDisponibles = [...new Set(item.sizes.map((s) => s.talla.trim()).filter(Boolean))]
        // V43: "otro" si se eligió a propósito (el set) O si ya trae un
        // color que no está en la lista (orden vieja, o cambió de tipo).
        const colorIsOtro = otroColorIds.has(item.id) || (!!item.color && !GARMENT_COLORS.includes(item.color))

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

            <div className={isShort ? 'form-row-4' : needsPantone ? 'form-row-3' : 'form-row'}>
              <label>
                Prenda
                {isSublimacion ? (
                  <select
                    className="input"
                    value={item.garment}
                    onChange={(e) => updateItem(itemIndex, { garment: e.target.value })}
                  >
                    <option value="">Selecciona…</option>
                    {GARMENT_OPTIONS_SUBLIMACION.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. Playera, Short, Chamarra…"
                    value={item.garment}
                    onChange={(e) => updateItem(itemIndex, { garment: e.target.value })}
                  />
                )}
              </label>
              <label>
                Color
                {isSublimacion ? (
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. Azul cielo, verde bandera oscuro…"
                    value={item.color}
                    onChange={(e) => updateItem(itemIndex, { color: e.target.value })}
                  />
                ) : (
                  <>
                    <select
                      className="input"
                      value={colorIsOtro ? OTRO_COLOR : item.color}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === OTRO_COLOR) {
                          setOtroColorIds((ids) => new Set(ids).add(item.id))
                          updateItem(itemIndex, { color: '' })
                        } else {
                          setOtroColorIds((ids) => {
                            if (!ids.has(item.id)) return ids
                            const next = new Set(ids)
                            next.delete(item.id)
                            return next
                          })
                          updateItem(itemIndex, { color: v })
                        }
                      }}
                    >
                      <option value="">Selecciona…</option>
                      {GARMENT_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value={OTRO_COLOR}>Otro…</option>
                    </select>
                    {colorIsOtro && (
                      <input
                        type="text"
                        className="input"
                        style={{ marginTop: 6 }}
                        placeholder="Escribe el color"
                        value={item.color}
                        onChange={(e) => updateItem(itemIndex, { color: e.target.value })}
                        autoFocus
                      />
                    )}
                  </>
                )}
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
              {/* V47 — pedido explícito: el botón de bolsas se movió de
                  "Detalles de la prenda" a junto a Prenda/Color/Pantone, y
                  pasó de un botón ghost (fácil de pasar por alto) a un
                  selector Sí/No siempre pintado de un color u otro — nunca
                  se ve "vacío", así no se puede dejar sin contestar sin
                  querer. */}
              {isShort && (
                <div>
                  <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
                    ¿Lleva bolsas?
                  </span>
                  <div className="bolsas-toggle">
                    <button
                      type="button"
                      className={'bolsas-toggle__btn' + (item.lleva_bolsas ? ' bolsas-toggle__btn--si' : '')}
                      onClick={() => updateItem(itemIndex, { lleva_bolsas: true })}
                    >
                      Sí lleva
                    </button>
                    <button
                      type="button"
                      className={'bolsas-toggle__btn' + (!item.lleva_bolsas ? ' bolsas-toggle__btn--no' : '')}
                      onClick={() => updateItem(itemIndex, { lleva_bolsas: false })}
                    >
                      Sin bolsas
                    </button>
                  </div>
                </div>
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

            <div>
              <span className="field-label" style={{ marginBottom: 6, display: 'block', marginTop: 12 }}>
                Detalles de la prenda
              </span>
              {showCuelloManga && (
                <div className="form-row">
                  <label>
                    Cuello
                    <input
                      type="text"
                      className="input"
                      value={item.cuello || ''}
                      onChange={(e) => updateItem(itemIndex, { cuello: e.target.value })}
                    />
                  </label>
                  <label>
                    Manga
                    <input
                      type="text"
                      className="input"
                      value={item.manga || ''}
                      onChange={(e) => updateItem(itemIndex, { manga: e.target.value })}
                    />
                  </label>
                </div>
              )}
              <div className="form-row-4" style={{ marginTop: showCuelloManga ? 12 : 0 }}>
                <label>
                  Vivos
                  <input
                    type="text"
                    className="input"
                    value={item.vivos || ''}
                    onChange={(e) => updateItem(itemIndex, { vivos: e.target.value })}
                  />
                </label>
                <label>
                  Puños
                  <input
                    type="text"
                    className="input"
                    value={item.punos || ''}
                    onChange={(e) => updateItem(itemIndex, { punos: e.target.value })}
                  />
                </label>
                <label>
                  Logotipos
                  <input
                    type="text"
                    className="input"
                    value={item.logotipos || ''}
                    onChange={(e) => updateItem(itemIndex, { logotipos: e.target.value })}
                  />
                </label>
                <label>
                  Números
                  <input
                    type="text"
                    className="input"
                    value={item.numeros || ''}
                    onChange={(e) => updateItem(itemIndex, { numeros: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* V40: sublimación nunca lleva bordado — el botón ni se ofrece
                (pedido explícito del usuario). Si una prenda vieja de
                sublimación ya tenía lleva_bordado=true, el dato se queda
                como está, solo deja de poder tocarse desde aquí. */}
            {!isSublimacion && (
              <button
                type="button"
                className={item.lleva_bordado ? 'btn btn--secondary btn--small' : 'btn btn--ghost btn--small'}
                style={{ marginTop: 12 }}
                onClick={() => updateItem(itemIndex, { lleva_bordado: !item.lleva_bordado })}
              >
                {item.lleva_bordado ? '✓ Lleva bordado' : '¿Lleva bordado?'}
              </button>
            )}

            {showRosterButton && (
              <button
                type="button"
                className={item.tiene_roster ? 'btn btn--secondary btn--small' : 'btn btn--ghost btn--small'}
                style={{ marginTop: 8, marginLeft: 8 }}
                onClick={() => toggleRoster(itemIndex)}
              >
                {item.tiene_roster
                  ? isShort
                    ? '✓ Lista de números'
                    : '✓ Lista de nombres y números'
                  : isShort
                    ? '+ Agregar número'
                    : '+ Agregar nombres y números'}
              </button>
            )}

            {showRosterButton && item.tiene_roster && (
              <div style={{ marginTop: 10 }}>
                <p className="pantone-hint">
                  Casi siempre son equipos: cada quien lleva su {isShort ? 'número' : 'nombre y número'} en la espalda —
                  la talla se toma de las que ya agregaste abajo, para no equivocarnos.
                </p>
                <div className={'roster-table' + (isShort ? ' roster-table--numero-only' : '')}>
                  <div className={'roster-row-header' + (isShort ? ' roster-row--numero-only' : '')}>
                    <span>Talla</span>
                    {!isShort && <span>Nombre</span>}
                    <span>Número</span>
                    <span />
                  </div>
                  {(item.roster || []).map((row, rowIndex) => (
                    <div key={rowIndex} className={'roster-row' + (isShort ? ' roster-row--numero-only' : '')}>
                      <select
                        className="input"
                        value={row.talla}
                        onChange={(e) => updateRosterRow(itemIndex, rowIndex, { talla: e.target.value })}
                      >
                        <option value="">
                          {tallasDisponibles.length === 0 ? 'Agrega tallas abajo' : 'Talla…'}
                        </option>
                        {tallasDisponibles.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {!isShort && (
                        <input
                          type="text"
                          className="input"
                          placeholder="Nombre"
                          value={row.nombre}
                          onChange={(e) => updateRosterRow(itemIndex, rowIndex, { nombre: e.target.value })}
                        />
                      )}
                      <input
                        type="text"
                        className="input"
                        placeholder="Número"
                        value={row.numero}
                        onChange={(e) => updateRosterRow(itemIndex, rowIndex, { numero: e.target.value })}
                      />
                      {(item.roster || []).length > 1 && (
                        <button
                          type="button"
                          className="sizes-row__remove"
                          onClick={() => removeRosterRow(itemIndex, rowIndex)}
                          aria-label={isShort ? 'Quitar número' : 'Quitar nombre y número'}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="add-size-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => addRosterRow(itemIndex)}
                >
                  {isShort ? '+ Agregar número' : '+ Agregar nombre y número'}
                </button>
              </div>
            )}

            {clienteId && (
              <ProductoAutocomplete
                clienteId={clienteId}
                clienteNombre={clienteNombre}
                productos={productos}
                telas={telas}
                item={item}
                onApply={(patch) => updateItem(itemIndex, patch)}
                onProductoCreated={onProductoCreated}
                canSaveAsProducto={!isSublimacion}
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
