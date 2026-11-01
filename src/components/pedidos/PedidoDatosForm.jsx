import { METODOS_PAGO } from '../../services/anticiposService'
import { REGIMENES_FISCALES, USOS_CFDI } from '../../services/finanzasService'
import { faltanDatosFiscales } from '../../utils/pedidos'
import VentaMostradorToggle from '../orders/VentaMostradorToggle'

// V176 — datos de un pedido: venta de mostrador, anticipo y factura.
// La usan "Nuevo pedido" en Nueva orden y la página del pedido.
// value/onChange: formulario de utils/pedidos.js (PEDIDO_VACIO).
export default function PedidoDatosForm({ value, onChange, conCliente = true, conMostrador = true, disabled = false }) {
  const f = value
  const set = (patch) => onChange({ ...f, ...patch })
  const faltan = faltanDatosFiscales(f)

  return (
    <div className="pedido-datos">
      {conCliente && (
        <label>
          Cliente del pedido *
          <input type="text" className="input" value={f.cliente} disabled={disabled} onChange={(e) => set({ cliente: e.target.value, clientId: '' })} />
        </label>
      )}

      {conMostrador && (
        <VentaMostradorToggle
          checked={f.esMostrador}
          disabled={disabled}
          onChange={(v) => set({ esMostrador: v })}
          nota={f.esMostrador ? 'Todo el pedido: sus órdenes van sin precio, anticipo ni factura.' : 'Actívalo si todo el pedido es de mostrador.'}
        />
      )}

      {!f.esMostrador && (
        <>
          <div className="form-row">
            <label>
              Anticipo del pedido
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="input"
                value={f.anticipo}
                disabled={disabled}
                placeholder="0.00"
                onChange={(e) => set({ anticipo: e.target.value })}
              />
            </label>
            {Number(f.anticipo) > 0 && (
              <label>
                Método de pago
                <select className="input" value={f.anticipoMetodo} disabled={disabled} onChange={(e) => set({ anticipoMetodo: e.target.value })}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {Number(f.anticipo) > 0 && (
            <label>
              Quién recibió el anticipo *
              <input type="text" className="input" value={f.anticipoRecibidoPor} disabled={disabled} onChange={(e) => set({ anticipoRecibidoPor: e.target.value })} />
            </label>
          )}

          <label className="fin-check">
            <input type="checkbox" checked={f.requiereFactura} disabled={disabled} onChange={(e) => set({ requiereFactura: e.target.checked })} />
            <strong>¿Requiere factura?</strong>
          </label>
          {f.requiereFactura && (
            <>
              <div className="form-row">
                <label>
                  Razón social *
                  <input type="text" className="input" value={f.razonSocial} disabled={disabled} onChange={(e) => set({ razonSocial: e.target.value })} />
                </label>
                <label>
                  RFC
                  <input type="text" className="input" value={f.rfc} disabled={disabled} onChange={(e) => set({ rfc: e.target.value.toUpperCase() })} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Régimen fiscal
                  <select className="input" value={f.regimenFiscal} disabled={disabled} onChange={(e) => set({ regimenFiscal: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {[...new Set([f.regimenFiscal, ...REGIMENES_FISCALES])].filter(Boolean).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Uso de CFDI
                  <select className="input" value={f.usoCfdi} disabled={disabled} onChange={(e) => set({ usoCfdi: e.target.value })}>
                    <option value="">Selecciona…</option>
                    {[...new Set([f.usoCfdi, ...USOS_CFDI])].filter(Boolean).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Código postal
                  <input type="text" inputMode="numeric" className="input" value={f.codigoPostal} disabled={disabled} onChange={(e) => set({ codigoPostal: e.target.value })} />
                </label>
                <label>
                  Dirección
                  <input type="text" className="input" value={f.direccion} disabled={disabled} onChange={(e) => set({ direccion: e.target.value })} placeholder="Opcional" />
                </label>
              </div>
              {faltan.length > 0 && <p className="aviso-fiscal">Datos fiscales incompletos: falta {faltan.join(', ')}. Puedes guardar y completarlos después.</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
