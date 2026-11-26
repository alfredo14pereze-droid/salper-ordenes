import { useState } from 'react'
import Modal from '../talleros/Modal'
import { subirAtrOrden } from '../../services/atrService'
import AtrBata from './AtrBata'
import { propuestaSubida } from '../../utils/atrOc'

const n = (x) => Number(x || 0).toLocaleString('es-MX')

// V224 — "Subir a bodega" de una orden de ATR terminada (como en Frisa).
// orden = fila de atr_por_subir: { order_id, order_number, lineas: [{ item_index,
// size_index, producto, color, con_bolsa, talla, pedida, surtida }] }.
// Las piezas vienen con lo surtido en Terminado; se corrigen si subieron menos.
export default function AtrSubirModal({ orden, onClose, onListo }) {
  const clave = (l) => `${l.item_index}|${l.size_index}`
  const [propuesta] = useState(() => propuestaSubida(orden.lineas))
  const [cant, setCant] = useState(() => Object.fromEntries(orden.lineas.map((l, i) => [clave(l), String(propuesta.cantidades[i])])))
  const [notas, setNotas] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const total = orden.lineas.reduce((t, l) => t + (Number(cant[clave(l)]) || 0), 0)
  const invalida = orden.lineas.some((l) => !/^\d+$/.test(String(cant[clave(l)] ?? '').trim()))

  async function guardar(e) {
    e.preventDefault()
    setTrabajando(true)
    setError(null)
    const lineas = orden.lineas.map((l) => ({ item_index: l.item_index, size_index: l.size_index, cantidad: Number(cant[clave(l)]) || 0 }))
    const { error: err } = await subirAtrOrden(orden.order_id, lineas, notas)
    setTrabajando(false)
    if (err) return setError(err.message)
    onListo(`Se subieron ${n(total)} batas de ${orden.order_number} a la bodega: ya están en el inventario de ATR.`)
  }

  return (
    <Modal title={`Subir a bodega · ${orden.order_number}`} onClose={onClose}>
      <form className="atr-subir" onSubmit={guardar}>
        {propuesta.sinSurtido ? (
          <p className="atr-aviso"><span>En Terminado no se capturó lo surtido: vienen las piezas <strong>pedidas</strong>. Revisa que sea lo que de verdad subió.</span></p>
        ) : (
          <p className="atr-muted">Vienen con lo surtido en Terminado. Corrige si subieron menos (merma, defectos).</p>
        )}
        <p className="atr-muted">Al confirmar entran al inventario de ATR.</p>
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-tabla">
            <thead>
              <tr><th>Bata</th><th>Talla</th><th className="atr-num">Pedidas</th><th className="atr-num">Surtidas</th><th className="atr-num">Suben</th></tr>
            </thead>
            <tbody>
              {orden.lineas.map((l) => (
                <tr key={clave(l)}>
                  <td><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} /></td>
                  <td>{l.talla}</td>
                  <td className="atr-num">{n(l.pedida)}</td>
                  <td className="atr-num">{n(l.surtida)}</td>
                  <td className="atr-num">
                    <input className="input atr-subir__input" type="number" min="0" step="1" inputMode="numeric"
                      value={cant[clave(l)]} onChange={(e) => setCant({ ...cant, [clave(l)]: e.target.value })}
                      aria-label={`Batas que suben de ${l.producto} ${l.talla}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label>
          <span className="field-label">Notas (opcional)</span>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="atr-acciones">
          <button type="submit" className="btn btn--primary" disabled={trabajando || total <= 0 || invalida}>
            {trabajando ? 'Guardando…' : `Confirmar: subir ${n(total)} batas`}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
