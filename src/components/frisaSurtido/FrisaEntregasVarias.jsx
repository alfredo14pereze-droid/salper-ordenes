import { useState } from 'react'
import { entregarSurtido } from '../../services/frisaSurtidoService'
import { hoyISO, piezasDe } from '../../utils/frisaSurtido'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// 2026-11-09 — Confirmar varias entregas de Leo de una vez: una remisión por OC.
// Se escribe el folio de cada orden que se entregó (las que se dejan en blanco
// no se tocan) y se confirman todas con la misma fecha. Cada una baja la bodega
// y suma a su planta, igual que "Ya entregó el chofer" de una por una.
export default function FrisaEntregasVarias({ ordenes, porSurtido, onListo }) {
  const [folios, setFolios] = useState({})
  const [fecha, setFecha] = useState(hoyISO())
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState(null) // { ok: [], errores: [] }
  const conFolio = ordenes.filter((s) => (folios[s.id] || '').trim())
  const piezas = conFolio.reduce((t, s) => t + piezasDe(porSurtido.get(s.id) || []), 0)
  const repetidos = (() => {
    const c = {}
    for (const s of conFolio) { const f = folios[s.id].trim().toUpperCase(); c[f] = (c[f] || 0) + 1 }
    return new Set(Object.keys(c).filter((k) => c[k] > 1))
  })()

  async function confirmar() {
    setTrabajando(true)
    const ok = []
    const errores = []
    for (const s of conFolio) {
      const { error } = await entregarSurtido(s.id, { remision: folios[s.id].trim(), fecha })
      if (error) errores.push(`OC ${s.numero_oc}: ${error.message}`)
      else ok.push(s.numero_oc)
    }
    setTrabajando(false)
    setResultado({ ok, errores })
    setFolios((f) => Object.fromEntries(Object.entries(f).filter(([id]) => !ok.includes(ordenes.find((o) => o.id === id)?.numero_oc))))
    if (ok.length) onListo(`Se confirmaron ${ok.length} entregas (${ok.map((x) => 'OC ' + x).join(', ')}).`)
  }

  return (
    <section className="card frisa-restock__propuesta">
      <h2 className="section-title section-title--small">Confirmar entregas de Leo (varias a la vez)</h2>
      <p className="frisa__sub">
        Cuando Leo regresa: escribe el <strong>folio de remisión de Microsip</strong> de cada orden que <strong>sí entregó</strong> (una remisión por
        OC). Las que dejes en blanco se quedan en Surtidas. Al confirmar, cada una se descuenta de la bodega y se suma a su planta.
      </p>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla frisa-niveles__tabla">
          <thead><tr><th>OC</th><th>Planta</th><th className="num">Piezas</th><th>Folio de remisión</th></tr></thead>
          <tbody>
            {ordenes.map((s) => {
              const f = (folios[s.id] || '').trim().toUpperCase()
              return (
                <tr key={s.id} className={f ? 'frisa-niveles__fila--ok' : ''}>
                  <td data-label="OC"><strong>{s.numero_oc}</strong></td>
                  <td data-label="Planta">{s.planta}</td>
                  <td data-label="Piezas" className="num">{num(piezasDe(porSurtido.get(s.id) || []))}</td>
                  <td data-label="Folio de remisión">
                    <input className="input" value={folios[s.id] || ''} placeholder="Ej. 863" disabled={trabajando}
                      onChange={(e) => setFolios({ ...folios, [s.id]: e.target.value })} aria-label={`Folio de remisión de la OC ${s.numero_oc}`} />
                    {f && repetidos.has(f) && <div className="form-error">Ese folio está en otra orden.</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="frisa-form__fila">
        <label><span className="field-label">Fecha de entrega</span>
          <input className="input" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} disabled={trabajando} /></label>
      </div>
      {resultado?.errores.length > 0 && (
        <div className="form-error">No se pudieron confirmar: {resultado.errores.join(' · ')}</div>
      )}
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary" disabled={trabajando || !conFolio.length || repetidos.size > 0} onClick={confirmar}>
          {trabajando ? 'Confirmando…' : conFolio.length ? `Confirmar ${conFolio.length} entrega${conFolio.length === 1 ? '' : 's'} (${num(piezas)} pzas)` : 'Escribe al menos un folio'}
        </button>
      </div>
    </section>
  )
}
