import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { registrarEntregaAtr } from '../../services/atrService'
import { TALLAS_ATR, ordenTalla } from '../../utils/atrCarga'

// Tallas que se muestran para un producto: las de su catálogo + las que ya tienen existencia.
export function tallasDe(producto, existencias) {
  const set = new Set([...(producto?.tallas?.length ? producto.tallas : TALLAS_ATR)])
  for (const e of existencias) if (e.producto_id === producto?.id) set.add(e.talla)
  return [...set].sort((a, b) => ordenTalla(a) - ordenTalla(b))
}

export function existenciaDe(existencias, productoId, talla) {
  return existencias.find((e) => e.producto_id === productoId && e.talla === talla)?.existencia ?? 0
}

// "Registrar entrega a ATR": varios productos, cantidades por talla → salida_entrega.
export default function AtrEntregaModal({ productos, existencias, onClose, onListo }) {
  const [elegidos, setElegidos] = useState([]) // ids de producto en la entrega
  const [cant, setCant] = useState({}) // `${id}|${talla}` → texto
  const [nota, setNota] = useState('')
  const [error, setError] = useState(null)
  const [negativos, setNegativos] = useState(null) // texto del servidor
  const [guardando, setGuardando] = useState(false)

  const lineas = useMemo(
    () =>
      Object.entries(cant)
        .map(([k, v]) => {
          const [producto_id, talla] = k.split('|')
          return { producto_id, talla, cantidad: Number(v) }
        })
        .filter((l) => elegidos.includes(l.producto_id) && Number.isInteger(l.cantidad) && l.cantidad > 0),
    [cant, elegidos],
  )
  const total = lineas.reduce((s, l) => s + l.cantidad, 0)
  const disponibles = productos.filter((p) => !elegidos.includes(p.id))

  async function guardar(permitirNegativo = false) {
    setError(null)
    if (!lineas.length) return setError('Escribe al menos una cantidad.')
    setGuardando(true)
    const { error: e } = await registrarEntregaAtr(lineas, nota, permitirNegativo)
    setGuardando(false)
    if (e) {
      if (e.message?.startsWith('NEGATIVO:')) return setNegativos(e.message.replace('NEGATIVO:', '').trim())
      return setError(e.message)
    }
    onListo()
  }

  return (
    <Modal title="Registrar entrega a ATR" onClose={onClose}>
      <label className="atr-campo">
        <span className="field-label">Agregar producto</span>
        <select className="input" value="" onChange={(e) => e.target.value && setElegidos((x) => [...x, e.target.value])}>
          <option value="">Elige una bata…</option>
          {disponibles.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </label>

      {elegidos.map((id) => {
        const p = productos.find((x) => x.id === id)
        return (
          <fieldset key={id} className="atr-bloque">
            <legend className="field-label">
              {p.nombre}{' '}
              <button type="button" className="atr-quitar" onClick={() => setElegidos((x) => x.filter((y) => y !== id))} aria-label={`Quitar ${p.nombre}`}>×</button>
            </legend>
            <div className="atr-tallas">
              {tallasDe(p, existencias).map((t) => {
                const hay = existenciaDe(existencias, id, t)
                const k = `${id}|${t}`
                const sale = Number(cant[k]) || 0
                return (
                  <label key={t} className="atr-talla">
                    <span className="atr-talla__nombre">{t}</span>
                    <input
                      className={'input input--small' + (sale > hay ? ' atr-input--negativo' : '')}
                      inputMode="numeric"
                      value={cant[k] ?? ''}
                      onChange={(e) => setCant((c) => ({ ...c, [k]: e.target.value.replace(/\D/g, '') }))}
                      placeholder="0"
                    />
                    <span className="atr-muted atr-talla__hay">hay {hay}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}

      <label className="atr-campo">
        <span className="field-label">Nota (opcional)</span>
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Remisión 123, entregó Leo" />
      </label>

      {error && <p className="form-error">{error}</p>}
      {negativos && (
        <div className="atr-aviso">
          <strong>Quedaría en negativo:</strong> {negativos}
          <div className="atr-pie">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setNegativos(null)}>Corregir</button>
            <button type="button" className="btn btn--primary btn--small" disabled={guardando} onClick={() => guardar(true)}>Registrar de todos modos</button>
          </div>
        </div>
      )}

      {!negativos && (
        <div className="atr-pie">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn--primary" disabled={guardando || !total} onClick={() => guardar(false)}>
            {guardando ? 'Guardando…' : `Registrar entrega (${total})`}
          </button>
        </div>
      )}
    </Modal>
  )
}
