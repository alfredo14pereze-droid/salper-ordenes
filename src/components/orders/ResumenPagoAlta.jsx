import { METODOS_PAGO } from '../../services/anticiposService'
import { formatMxn } from '../../services/finanzasService'

// V159 — Debajo de las líneas del alta: total (calculado), anticipo y saldo.
// `resumen` sale de resumenPago() (utils/preciosLineas.js). Si todas las
// líneas son de venta de mostrador no hay nada que cobrar y el anticipo no
// aplica.
export default function ResumenPagoAlta({ resumen, anticipo, onAnticipo, obligatorio = true }) {
  const { monto, metodo, recibidoPor, notas } = anticipo
  const set = (patch) => onAnticipo({ ...anticipo, ...patch })

  return (
    <div className="resumen-pago-alta">
      <div className="totales-box">
        <div className="totales-box__row totales-box__row--total">
          <span>Total</span>
          <span>{formatMxn(resumen.total)}</span>
        </div>
        {resumen.hayCobro && (
          <>
            <div className="totales-box__row">
              <span>Anticipo</span>
              <span>− {formatMxn(resumen.anticipo)}</span>
            </div>
            <div
              className="totales-box__row totales-box__row--saldo"
              style={{ color: resumen.saldo > 0 ? 'var(--color-danger)' : 'var(--color-good)' }}
            >
              <span>Saldo</span>
              <span>{formatMxn(resumen.saldo)}</span>
            </div>
          </>
        )}
      </div>

      {resumen.sinPrecio.length > 0 && !obligatorio && (
        <p className="pantone-hint">
          Sin precio todavía: {resumen.sinPrecio.map((f) => `${f.prenda} ${f.talla}`).join(', ')}. Puedes crear la orden y
          capturarlo después en el detalle (se necesita para entregarla).
        </p>
      )}
      {resumen.sinPrecio.length > 0 && obligatorio && (
        <p className="fin-missing">
          Falta precio en: {resumen.sinPrecio.map((f) => `${f.prenda} ${f.talla}`).join(', ')}. Captúralo o márcalo como venta de
          mostrador.
        </p>
      )}

      {resumen.hayCobro ? (
        <div className="resumen-pago-alta__anticipo">
          <span className="field-label" style={{ display: 'block', margin: '14px 0 6px' }}>
            Anticipo
          </span>
          <div className="form-row">
            <label>
              Anticipo recibido
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                className="input"
                value={monto}
                onChange={(e) => set({ monto: e.target.value })}
                placeholder="0.00"
              />
            </label>
            {monto && (
              <label>
                Método de pago
                <select className="input" value={metodo} onChange={(e) => set({ metodo: e.target.value })}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {monto && (
            <div className="form-row">
              <label>
                Quién lo recibió *
                <input type="text" className="input" value={recibidoPor} onChange={(e) => set({ recibidoPor: e.target.value })} />
              </label>
              <label>
                Notas del anticipo
                <input type="text" className="input" value={notas} onChange={(e) => set({ notas: e.target.value })} />
              </label>
            </div>
          )}
          {resumen.anticipo > resumen.total && resumen.total > 0 && (
            <p className="pantone-hint">Ojo: el anticipo es mayor que el total.</p>
          )}
        </div>
      ) : (
        <p className="pantone-hint">Todas las líneas son de venta de mostrador: no hay total que cobrar ni anticipo.</p>
      )}
    </div>
  )
}
