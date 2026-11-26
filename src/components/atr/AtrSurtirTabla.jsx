import { useEffect, useState } from 'react'
import { apartarRenglonAtr, fetchAtrSurtidoPersonas, terminarSurtidoAtr } from '../../services/atrService'
import AtrBata from './AtrBata'

// V222 — Surtir una OC de ATR igual que una orden de surtido de Frisa: en cada
// renglón se escribe cuántas batas se apartan (o se palomea para apartar todo
// lo pendiente); se guarda al salir del campo. "Surtir lo apartado" elige
// quién surtió y manda ese surtido a contabilidad (Por facturar). Se puede
// surtir parcial y volver a apartar cuando salgan más batas.
const n = (x) => Number(x || 0).toLocaleString('es-MX')
const OTRA = '__otra__'

// Cuentas de un renglón a partir de atr_oc_detalle (V222).
export function renglonSurtir(l) {
  const apartando = Number(l.apartando || 0)
  const pendiente = Number(l.pendiente || 0) // sin lo que se está apartando
  const disponible = Number(l.disponible ?? l.existencia ?? 0) // ya sin ningún apartado
  const max = pendiente + apartando
  const yaSurtido = Number(l.entregado || 0) + Number(l.apartado || 0) - apartando
  return { apartando, pendiente, disponible, max, yaSurtido, falta: Math.max(0, pendiente - Math.max(0, disponible)) }
}

export default function AtrSurtirTabla({ oc, lineas, puedeSurtir, onCambio, onSurtido }) {
  const [valores, setValores] = useState({})
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const [cerrar, setCerrar] = useState(false)
  const [personas, setPersonas] = useState(null)
  const [form, setForm] = useState({ persona: '', otra: '', nota: '' })

  useEffect(() => {
    setValores(Object.fromEntries(lineas.map((l) => [l.oc_linea_id, String(Number(l.apartando || 0))])))
  }, [lineas])

  useEffect(() => {
    if (!cerrar || personas) return
    fetchAtrSurtidoPersonas().then(({ data, error: e }) => {
      if (e) setError(e.message)
      setPersonas(data || [])
    })
  }, [cerrar, personas])

  const filas = lineas.map((l) => ({ l, r: renglonSurtir(l) }))
  const totalApartando = filas.reduce((t, f) => t + f.r.apartando, 0)
  const totalPedido = filas.reduce((t, f) => t + Number(f.l.pedido || 0), 0)
  const totalYa = filas.reduce((t, f) => t + f.r.yaSurtido, 0)
  const sePuedeApartar = filas.filter((f) => f.r.pendiente > 0 && f.r.disponible > 0)

  async function guardar(l, cantidad, msg) {
    setTrabajando(true)
    setError(null)
    const { error: e } = await apartarRenglonAtr(l.oc_linea_id, cantidad)
    setTrabajando(false)
    if (e) {
      setValores((v) => ({ ...v, [l.oc_linea_id]: String(Number(l.apartando || 0)) }))
      return setError(e.message)
    }
    onCambio(msg)
  }

  function tocar(l, r) {
    const completo = r.max > 0 && r.apartando === r.max
    guardar(l, completo ? 0 : r.max, completo ? `${l.producto} ${l.talla}: se liberó.` : `${l.producto} ${l.talla}: apartado completo.`)
  }

  function salir(l, r) {
    const v = valores[l.oc_linea_id]
    const x = Number(v)
    if (v === '' || !Number.isInteger(x) || x < 0 || x > r.max) {
      setValores((a) => ({ ...a, [l.oc_linea_id]: String(r.apartando) }))
      return setError(`${l.producto} ${l.talla}: escribe de 0 a ${n(r.max)} batas.`)
    }
    if (x !== r.apartando) guardar(l, x, `${l.producto} ${l.talla}: ${n(x)} apartadas.`)
  }

  async function apartarLoQueHay() {
    setTrabajando(true)
    setError(null)
    let piezas = 0
    for (const { l, r } of sePuedeApartar) {
      const x = Math.min(r.max, r.apartando + r.disponible)
      const { error: e } = await apartarRenglonAtr(l.oc_linea_id, x)
      if (e) {
        setTrabajando(false)
        if (piezas) return onCambio(`Se apartaron ${n(piezas)} batas; otra no se pudo: ${e.message}`)
        return setError(e.message)
      }
      piezas += x - r.apartando
    }
    setTrabajando(false)
    onCambio(`Se apartaron ${n(piezas)} batas con lo que había.`)
  }

  async function terminar(e) {
    e.preventDefault()
    const otra = form.persona === OTRA
    const p = personas?.find((x) => x.id === form.persona)
    if (!form.persona || (otra && !form.otra.trim())) return setError('Elige quién surtió.')
    setTrabajando(true)
    setError(null)
    const { data, error: err } = await terminarSurtidoAtr(oc.id, {
      personaId: otra ? null : form.persona, personaNombre: otra ? form.otra.trim() : p?.nombre, nota: form.nota.trim(),
    })
    setTrabajando(false)
    if (err) return setError(err.message)
    setCerrar(false)
    setForm({ persona: '', otra: '', nota: '' })
    onSurtido(data, `Se surtieron ${n(totalApartando)} batas: quedan apartadas por facturar.`)
  }

  return (
    <section className="atr-surtir-frisa">
      <h3 className="atr-surtidos__titulo">Surtir</h3>
      <div className="atr-tabla-wrap">
        <table className="simple-table atr-tabla atr-surtir-tabla">
          <thead>
            <tr>
              {puedeSurtir && <th aria-label="Apartar todo">✓</th>}
              <th>Bata</th><th className="atr-surtir__talla">Talla</th>
              <th className="atr-num">Pide</th>
              <th className="atr-num">Ya<span className="atr-surtir__talla"> surtido</span></th>
              <th className="atr-num">Apartar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ l, r }) => (
              <tr key={l.oc_linea_id} className={r.max > 0 && r.apartando === r.max ? 'atr-surtir--completo' : r.falta > 0 ? 'atr-oc-fila--falta' : ''}>
                {puedeSurtir && (
                  <td className="atr-surtir__check">
                    <input type="checkbox" checked={r.max > 0 && r.apartando === r.max} disabled={trabajando || r.max === 0}
                      onChange={() => tocar(l, r)} aria-label={`Apartar todo ${l.producto} ${l.talla}`} />
                  </td>
                )}
                <td><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} /><strong className="atr-surtir__talla-cel"> {l.talla}</strong></td>
                <td className="atr-surtir__talla">{l.talla}</td>
                <td className="atr-num"><strong>{n(l.pedido)}</strong></td>
                <td className="atr-num">{r.yaSurtido ? n(r.yaSurtido) : '·'}</td>
                <td className="atr-num atr-surtir__apartar">
                  {puedeSurtir && r.max > 0
                    ? <input className="input atr-surtir__input" type="number" min="0" max={r.max} step="1" inputMode="numeric" disabled={trabajando}
                        value={valores[l.oc_linea_id] ?? ''} onFocus={(e) => e.target.select()}
                        onChange={(e) => setValores((v) => ({ ...v, [l.oc_linea_id]: e.target.value }))}
                        onBlur={() => salir(l, r)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        aria-label={`Apartar ${l.producto} ${l.talla}`} />
                    : <strong>{n(r.apartando)}</strong>}
                  {r.max === 0
                    ? <div className="atr-ok-txt">completo ✓</div>
                    : r.pendiente === 0
                      ? <div className="atr-ok-txt">todo apartado ✓</div>
                      : r.falta > 0
                        ? <div className="atr-negativo">hay {n(Math.max(0, r.disponible))} · faltan {n(r.falta)}</div>
                        : <div className="atr-ok-txt">hay {n(r.disponible)} ✓</div>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {puedeSurtir && <td />}
              <td><strong>Total</strong></td>
              <td className="atr-surtir__talla" />
              <td className="atr-num"><strong>{n(totalPedido)}</strong></td>
              <td className="atr-num"><strong>{n(totalYa)}</strong></td>
              <td className="atr-num"><strong>{n(totalApartando)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="atr-muted atr-oc-meta">
        {totalApartando === 0 ? 'Nada apartado todavía.' : <><strong>Apartando {n(totalApartando)} batas.</strong> Esas batas ya no se usan para otras OC.</>}
        {puedeSurtir ? ' Escribe cuántas apartas de cada renglón (o palomea para apartarlo completo). Se puede surtir parcial y seguir surtiendo cuando salgan más.' : ''}
      </p>

      {puedeSurtir && !cerrar && (
        <div className="atr-acciones">
          {sePuedeApartar.length > 0 && (
            <button type="button" className="btn btn--secondary" disabled={trabajando} onClick={apartarLoQueHay}>Apartar lo que hay</button>
          )}
          <button type="button" className="btn btn--primary" disabled={trabajando || totalApartando === 0} onClick={() => { setError(null); setCerrar(true) }}>
            Surtir lo apartado ({n(totalApartando)} batas)
          </button>
        </div>
      )}

      {cerrar && (
        <form className="atr-surtir__cerrar" onSubmit={terminar}>
          <label className="atr-campo">
            <span className="field-label">¿Quién surtió?</span>
            <select className="input" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} autoFocus>
              <option value="">{personas ? 'Elige…' : 'Cargando…'}</option>
              {(personas || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              <option value={OTRA}>Otra persona…</option>
            </select>
          </label>
          {form.persona === OTRA && (
            <label className="atr-campo">
              <span className="field-label">Nombre</span>
              <input className="input" value={form.otra} onChange={(e) => setForm({ ...form, otra: e.target.value })} placeholder="Ej. ayudante de terminado" />
            </label>
          )}
          <label className="atr-campo">
            <span className="field-label">Nota (opcional)</span>
            <input className="input" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
          </label>
          <div className="atr-acciones">
            <button type="submit" className="btn btn--primary" disabled={trabajando}>{trabajando ? 'Guardando…' : `Confirmar: surtir ${n(totalApartando)} batas`}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setCerrar(false)}>Cancelar</button>
          </div>
          <p className="atr-muted">Sale la hoja de surtido. Las batas siguen apartadas hasta que contabilidad confirme la entrega con la factura.</p>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}
    </section>
  )
}
