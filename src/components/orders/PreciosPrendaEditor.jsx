import { formatMxn } from '../../services/finanzasService'
import { precioNumero } from '../../utils/preciosLineas'
import {
  agregarGrupo,
  alternarTalla,
  cambiarModo,
  cambiarPrecioGrupo,
  cambiarPrecioUnico,
  grupoDeTalla,
  precioDeTalla,
  quitarGrupo,
  tallasSinPrecio,
} from '../../utils/preciosPrenda'

// Fase 1B — precio unitario por prenda: "Mismo precio" (un solo campo para
// todas las tallas con cantidad) o "Precios por talla" (un precio + las
// tallas que lo llevan, con "+ otro precio"). Lo usan el alta (NewOrderPage)
// y el detalle (OrderFacturacionCard). La lógica está en utils/preciosPrenda.js.
//
// prendas: [{ key, nombre, tallas: [{ talla, cantidad }], extrasPorPieza?,
//             mostradorPrevio?: ['10', ...] }]   (tallas ya de mostrador, V159)
// estados: { [key]: estado }   onChange(key, estadoNuevo)
export default function PreciosPrendaEditor({ prendas, estados, onChange, disabled = false, marcarFaltantes = true }) {
  if (prendas.length === 0) {
    return <p className="pantone-hint">Captura arriba las prendas con sus tallas y cantidades; aquí les pones precio.</p>
  }
  return (
    <div className="precio-prendas">
      {prendas.map((p) => (
        <PrendaPrecio
          key={p.key}
          prenda={p}
          estado={estados[p.key]}
          onChange={(e) => onChange(p.key, e)}
          disabled={disabled}
          marcarFaltantes={marcarFaltantes}
        />
      ))}
    </div>
  )
}

function PrendaPrecio({ prenda, estado, onChange, disabled, marcarFaltantes }) {
  if (!estado) return null
  const nombresTallas = prenda.tallas.map((t) => t.talla)
  const sinPrecio = tallasSinPrecio(estado, nombresTallas)
  const piezas = prenda.tallas.reduce((s, t) => s + (Number(t.cantidad) || 0), 0)
  const extras = Number(prenda.extrasPorPieza) || 0
  const subtotal = prenda.tallas.reduce((s, t) => {
    const precio = precioNumero(precioDeTalla(estado, t.talla))
    return precio > 0 ? s + t.cantidad * (precio + extras) : s
  }, 0)
  const resaltar = marcarFaltantes && !disabled
  const etiquetaTalla = (t) => `T. ${t}`

  return (
    <div className="precio-prenda">
      <div className="precio-prenda__head">
        <div>
          <b>{prenda.nombre}</b>
          <span className="precio-prenda__meta">
            {piezas} pzs{extras > 0 ? ` · extras ${formatMxn(extras)}/pza` : ''}
          </span>
        </div>
        <span className="precio-prenda__subtotal">{formatMxn(Math.round(subtotal * 100) / 100)}</span>
      </div>

      {prenda.tallas.length === 0 ? (
        <p className="pantone-hint" style={{ margin: 0 }}>
          {(prenda.mostradorPrevio || []).length > 0 ? 'Todas sus tallas son de venta de mostrador.' : 'Sin tallas con cantidad.'}
        </p>
      ) : (
        <>
          <div className="seg" role="group" aria-label={`Forma de precio de ${prenda.nombre}`}>
            <button
              type="button"
              className={'seg__btn' + (estado.modo === 'mismo' ? ' seg__btn--on' : '')}
              disabled={disabled}
              aria-pressed={estado.modo === 'mismo'}
              onClick={() => onChange(cambiarModo(estado, 'mismo', nombresTallas))}
            >
              Mismo precio
            </button>
            <button
              type="button"
              className={'seg__btn' + (estado.modo === 'tallas' ? ' seg__btn--on' : '')}
              disabled={disabled}
              aria-pressed={estado.modo === 'tallas'}
              onClick={() => onChange(cambiarModo(estado, 'tallas', nombresTallas))}
            >
              Precios por talla
            </button>
          </div>

          {estado.modo === 'mismo' ? (
            <div className="precio-prenda__unico">
              <label>
                Precio unitario
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  className={'input' + (resaltar && sinPrecio.length > 0 ? ' input--error' : '')}
                  value={estado.unico}
                  disabled={disabled}
                  placeholder="0.00"
                  aria-label={`Precio unitario ${prenda.nombre}`}
                  onChange={(e) => onChange(cambiarPrecioUnico(estado, e.target.value))}
                />
              </label>
              <span className="pantone-hint" style={{ margin: 0 }}>
                Para {prenda.tallas.map((t) => etiquetaTalla(t.talla)).join(', ')}
              </span>
            </div>
          ) : (
            <div className="precio-grupos">
              {estado.grupos.map((g, gi) => (
                <div key={gi} className="precio-grupo">
                  <div className="precio-grupo__fila">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      className={'input precio-grupo__precio' + (resaltar && g.tallas.length > 0 && !(precioNumero(g.precio) > 0) ? ' input--error' : '')}
                      value={g.precio}
                      disabled={disabled}
                      placeholder="Precio"
                      aria-label={`Precio ${gi + 1} de ${prenda.nombre}`}
                      onChange={(e) => onChange(cambiarPrecioGrupo(estado, gi, e.target.value))}
                    />
                    <div className="precio-grupo__chips">
                      {prenda.tallas.map((t) => {
                        const en = grupoDeTalla(estado, t.talla)
                        const mia = en === gi
                        const otra = en !== -1 && !mia
                        return (
                          <button
                            key={t.talla}
                            type="button"
                            className={'chip precio-chip' + (mia ? ' chip--active' : '') + (otra ? ' precio-chip--otra' : '')}
                            disabled={disabled || otra}
                            aria-pressed={mia}
                            title={otra ? `Ya tiene el precio ${en + 1}` : undefined}
                            aria-label={`${etiquetaTalla(t.talla)}, ${t.cantidad} piezas${otra ? ` (ya tiene el precio ${en + 1})` : ''}`}
                            onClick={() => onChange(alternarTalla(estado, gi, t.talla))}
                          >
                            {etiquetaTalla(t.talla)} <span className="precio-chip__cant">×{t.cantidad}</span>
                          </button>
                        )
                      })}
                    </div>
                    {estado.grupos.length > 1 && !disabled && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small precio-grupo__quitar"
                        aria-label={`Quitar precio ${gi + 1}`}
                        onClick={() => onChange(quitarGrupo(estado, gi))}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!disabled && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(agregarGrupo(estado))}>
                  + otro precio
                </button>
              )}
            </div>
          )}

          {resaltar && sinPrecio.length > 0 && (
            <p className="fin-missing" style={{ margin: 0 }}>
              Sin precio: {sinPrecio.map(etiquetaTalla).join(', ')}
            </p>
          )}
        </>
      )}

      {(prenda.mostradorPrevio || []).length > 0 && (
        <p className="pantone-hint" style={{ margin: 0 }}>
          <span className="badge badge--mostrador">Mostrador</span> {prenda.mostradorPrevio.map(etiquetaTalla).join(', ')} (marcadas
          antes como venta de mostrador; no llevan precio).
        </p>
      )}
    </div>
  )
}
