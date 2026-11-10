import { useState } from 'react'
import { entregarSurtido } from '../../services/frisaSurtidoService'
import { hoyISO, porEntregar } from '../../utils/frisaSurtido'
import { nombreFrisa } from '../../utils/frisaColores'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// V204 (2026-11-10) — Confirmar las entregas de Leo de una vez, sin remisión.
// Todas vienen marcadas "Entregada"; solo se cambian las excepciones:
//   · Parcial: se escribe cuánto se entregó de cada renglón (lo demás sigue en Surtidas).
//   · No se entregó: no se toca (sigue en Surtidas).
// Cada entrega baja la bodega y suma a su planta. Las remisiones se ligan después.
const OPCIONES = [
  { key: 'toda', label: 'Entregada' },
  { key: 'parcial', label: 'Parcial' },
  { key: 'no', label: 'No se entregó' },
]

export default function FrisaEntregasVarias({ ordenes, porSurtido, productos = [], onListo }) {
  const [como, setComo] = useState({}) // id → 'toda' | 'parcial' | 'no'
  const [parcial, setParcial] = useState({}) // linea_id → texto
  const [fecha, setFecha] = useState(hoyISO())
  const [trabajando, setTrabajando] = useState(false)
  const [errores, setErrores] = useState([])
  const prod = new Map(productos.map((p) => [p.id, p]))

  const lineasDe = (s) => (porSurtido.get(s.id) || []).filter((l) => porEntregar(l) > 0)
  const opcion = (s) => como[s.id] || 'toda'
  const cantParcial = (l) => {
    const v = parcial[l.id]
    return v === undefined ? porEntregar(l) : Number(v)
  }
  const piezasDe = (s) => {
    const o = opcion(s)
    if (o === 'no') return 0
    return lineasDe(s).reduce((t, l) => t + (o === 'toda' ? porEntregar(l) : cantParcial(l) || 0), 0)
  }
  const malas = ordenes.filter((s) => opcion(s) === 'parcial' && lineasDe(s).some((l) => {
    const n = cantParcial(l)
    return !Number.isInteger(n) || n < 0 || n > porEntregar(l)
  }))
  const aEntregar = ordenes.filter((s) => opcion(s) !== 'no' && piezasDe(s) > 0)
  const piezas = aEntregar.reduce((t, s) => t + piezasDe(s), 0)
  const noSe = ordenes.filter((s) => opcion(s) === 'no').length

  async function confirmar() {
    setTrabajando(true)
    const ok = []
    const errs = []
    for (const s of aEntregar) {
      const lineas = opcion(s) === 'parcial' ? lineasDe(s).map((l) => ({ linea_id: l.id, cantidad: cantParcial(l) })) : null
      const { error } = await entregarSurtido(s.id, { fecha, lineas })
      if (error) errs.push(`OC ${s.numero_oc}: ${error.message}`)
      else ok.push(s)
    }
    setTrabajando(false)
    setErrores(errs)
    if (ok.length) {
      const parciales = ok.filter((s) => opcion(s) === 'parcial').length
      onListo(`Se confirmaron ${ok.length} entrega${ok.length === 1 ? '' : 's'}${parciales ? ` (${parciales} parcial${parciales === 1 ? '' : 'es'}: lo que faltó sigue en Surtidas)` : ''}.`)
    }
  }

  return (
    <section className="card frisa-restock__propuesta">
      <h2 className="section-title section-title--small">Confirmar entregas de Leo</h2>
      <p className="frisa__sub">
        Cuando Leo regresa: todas vienen marcadas <strong>Entregada</strong>. Si alguna no se entregó completa, márcala <strong>Parcial</strong> y escribe
        cuánto se entregó; si no se entregó, márcala <strong>No se entregó</strong> (se queda en Surtidas). Al confirmar, cada una se descuenta de la
        bodega y se suma a su planta.
      </p>
      <div className="frisa-entregas">
        {ordenes.map((s) => {
          const o = opcion(s)
          const ls = lineasDe(s)
          const yaParcial = (porSurtido.get(s.id) || []).some((l) => Number(l.entregada) > 0)
          return (
            <div key={s.id} className={'frisa-entregas__orden frisa-entregas__orden--' + o}>
              <div className="frisa-entregas__fila">
                <span><strong>OC {s.numero_oc}</strong> · {s.planta} · {num(ls.reduce((t, l) => t + porEntregar(l), 0))} pzas{yaParcial ? ' (lo que faltó de un viaje anterior)' : ''}</span>
                <span className="order-filters__chips frisa__chips" role="group" aria-label={`Entrega de la OC ${s.numero_oc}`}>
                  {OPCIONES.map((x) => (
                    <button key={x.key} type="button" disabled={trabajando} className={'chip' + (o === x.key ? ' chip--active' : '')}
                      onClick={() => setComo({ ...como, [s.id]: x.key })}>{x.label}</button>
                  ))}
                </span>
              </div>
              {o === 'parcial' && (
                <table className="simple-table frisa-tabla">
                  <thead><tr><th>Producto</th><th className="num">Faltaba</th><th className="num">Se entregó</th></tr></thead>
                  <tbody>
                    {ls.map((l) => {
                      const n = cantParcial(l)
                      const mal = !Number.isInteger(n) || n < 0 || n > porEntregar(l)
                      return (
                        <tr key={l.id}>
                          <td>{nombreFrisa(prod.get(l.producto_id)?.nombre) || l.clave}</td>
                          <td className="num">{num(porEntregar(l))}</td>
                          <td className="num">
                            <input className="input frisa-input" type="number" min="0" max={porEntregar(l)} step="1" inputMode="numeric" disabled={trabajando}
                              value={parcial[l.id] ?? String(porEntregar(l))} onFocus={(e) => e.target.select()}
                              onChange={(e) => setParcial({ ...parcial, [l.id]: e.target.value })} aria-label={`Se entregó de ${nombreFrisa(prod.get(l.producto_id)?.nombre)}`} />
                            {mal && <div className="form-error">De 0 a {num(porEntregar(l))}</div>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
      <div className="frisa-form__fila">
        <label><span className="field-label">Fecha de entrega</span>
          <input className="input" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} disabled={trabajando} /></label>
      </div>
      {errores.length > 0 && <div className="form-error">No se pudieron confirmar: {errores.join(' · ')}</div>}
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary" disabled={trabajando || !aEntregar.length || malas.length > 0} onClick={confirmar}>
          {trabajando ? 'Confirmando…' : aEntregar.length ? `Confirmar ${aEntregar.length} entrega${aEntregar.length === 1 ? '' : 's'} (${num(piezas)} pzas)` : 'No hay nada que confirmar'}
        </button>
        {noSe > 0 && <span className="frisa__sub">{noSe} no se entregó{noSe === 1 ? '' : 'n'}: se queda{noSe === 1 ? '' : 'n'} en Surtidas.</span>}
      </div>
    </section>
  )
}
