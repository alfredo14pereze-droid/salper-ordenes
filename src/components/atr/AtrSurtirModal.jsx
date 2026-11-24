import { useState } from 'react'
import Modal from '../talleros/Modal'
import { surtirAtrOc } from '../../services/atrService'
import { cantidadPropuesta, revisarSurtido } from '../../utils/atrOc'
import AtrBata from './AtrBata'

// V215 — Surtir una OC de ATR (parcial o total). Por línea: pedido, ya
// surtido, pendiente y existencia; la cantidad propuesta es
// min(pendiente, existencia). No deja surtir más que lo pendiente; si alguna
// talla quedaría en negativo pide confirmación explícita.
const n = (x) => Number(x || 0).toLocaleString('es-MX')

export default function AtrSurtirModal({ oc, lineas, onClose, onListo }) {
  // V220: lo que se puede surtir es lo disponible (existencia − apartado por facturar).
  const pendientes = lineas.filter((l) => l.pendiente > 0).map((l) => ({ ...l, existencia: l.disponible ?? l.existencia }))
  const [cant, setCant] = useState(() => Object.fromEntries(pendientes.map((l) => [l.oc_linea_id, String(cantidadPropuesta(l))])))
  const [nota, setNota] = useState('')
  const [error, setError] = useState(null)
  const [confirmarNegativo, setConfirmarNegativo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const r = revisarSurtido(pendientes, cant)

  async function guardar() {
    setError(null)
    if (r.errores.length) return setError(r.errores.join('; '))
    if (!r.lineas.length) return setError('Captura al menos una cantidad a surtir.')
    if (r.negativos.length && !confirmarNegativo) return setError('Hay tallas que quedarían en negativo: confírmalo abajo o baja la cantidad.')
    setGuardando(true)
    const { data, error: e } = await surtirAtrOc(oc.id, r.lineas, nota.trim(), confirmarNegativo)
    setGuardando(false)
    if (e) {
      if (e.message.startsWith('NEGATIVO:')) {
        setConfirmarNegativo(false)
        return setError('La existencia cambió mientras capturabas: ' + e.message.replace('NEGATIVO:', '').trim() + '. Confirma abajo si de todos modos sale.')
      }
      return setError(e.message)
    }
    onListo(data)
  }

  const llenar = (modo) =>
    setCant(Object.fromEntries(pendientes.map((l) => [l.oc_linea_id, modo === 'pendiente' ? String(l.pendiente) : modo === 'cero' ? '' : String(cantidadPropuesta(l))])))

  return (
    <Modal title={`Surtir OC ${oc.numero_oc}`} onClose={onClose}>
      <div className="atr-surtir">
        <p className="atr-muted">
          Se propone lo que alcanza con lo disponible. Puedes surtir parcial: la OC queda "Parcial" hasta completar.
          Las batas quedan <strong>apartadas</strong>; se descuentan del inventario cuando contabilidad confirme la entrega con la factura.
        </p>
        <div className="atr-acciones atr-surtir-llenar">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => llenar('propuesta')}>Lo que alcanza</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => llenar('pendiente')}>Todo lo pendiente</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => llenar('cero')}>Borrar</button>
        </div>
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-tabla atr-surtir-tabla">
            <thead>
              <tr>
                <th>Bata</th><th>Talla</th><th className="atr-num atr-surtir-opc">Pedido</th><th className="atr-num atr-surtir-opc">Surtido</th>
                <th className="atr-num"><span className="atr-largo">Pendiente</span><span className="atr-corto">Pend.</span></th><th className="atr-num"><span className="atr-largo">Disponible</span><span className="atr-corto">Disp.</span></th><th className="atr-num">Surtir</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((l) => {
                const v = cant[l.oc_linea_id] ?? ''
                const num = /^\d+$/.test(v) ? Number(v) : 0
                const mal = v !== '' && (!/^\d+$/.test(v) || num > l.pendiente)
                const neg = !mal && num > 0 && l.existencia - num < 0
                return (
                  <tr key={l.oc_linea_id}>
                    <td><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} /></td>
                    <td>{l.talla}</td>
                    <td className="atr-num atr-surtir-opc">{n(l.pedido)}</td>
                    <td className="atr-num atr-surtir-opc">{n(l.surtido)}</td>
                    <td className="atr-num"><strong>{n(l.pendiente)}</strong></td>
                    <td className={'atr-num' + (l.existencia <= 0 ? ' atr-negativo' : '')}>{n(l.existencia)}</td>
                    <td className="atr-num">
                      <input
                        className={'input atr-surtir-input' + (mal || neg ? ' atr-input--negativo' : '')}
                        type="number" min="0" max={l.pendiente} step="1" inputMode="numeric"
                        value={v} onChange={(e) => { setCant({ ...cant, [l.oc_linea_id]: e.target.value }); setConfirmarNegativo(false) }}
                        aria-label={`Surtir ${l.producto} ${l.talla}`}
                      />
                      {mal && <div className="atr-negativo atr-surtir-msg">Máx. {l.pendiente}</div>}
                      {neg && <div className="atr-negativo atr-surtir-msg">Queda {l.existencia - num}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <label className="atr-campo"><span className="field-label">Nota (opcional)</span>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. se mandó con el chofer" />
        </label>

        {r.negativos.length > 0 && (
          <div className="atr-aviso">
            <span>Estas tallas quedarían en <strong>negativo</strong> en el inventario: {r.negativos.join('; ')}.</span>
            <label className="atr-check" style={{ whiteSpace: 'normal' }}>
              <input type="checkbox" checked={confirmarNegativo} onChange={(e) => setConfirmarNegativo(e.target.checked)} />
              Sí, sí salen (el inventario está atrasado y se corrige después)
            </label>
          </div>
        )}

        <p className="atr-conteo">Se surten <strong>{n(r.piezas)} batas</strong> en {r.lineas.length} líneas.</p>
        {error && <p className="form-error">{error}</p>}
        <div className="atr-pie">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn--primary" disabled={guardando || !r.lineas.length || r.errores.length > 0 || (r.negativos.length > 0 && !confirmarNegativo)} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Apartar y ver hoja'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
