import { nombreFrisa } from '../../utils/frisaColores'
import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import {
  fetchEventosSurtido, personasSurtido, marcarSurtida, regresarSurtida, entregarSurtido, cancelarSurtido, urlPdfOC, apartarRenglon, cerrarSurtidaParcial,
} from '../../services/frisaSurtidoService'
import { faltantesDeOrden, piezasDe, textoLimite, hoyISO, entregadaDe, porEntregar } from '../../utils/frisaSurtido'
import { fechaCorta, NombreFrisa } from '../frisaNiveles/comunes'
import { EstadoSurtido } from './comunes'
import FrisaSurtidoForm from './FrisaSurtidoForm'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
const fechaHora = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const OTRA = '__otra__'

// Detalle de una orden de surtido con sus acciones según estado y permisos.
export default function FrisaSurtidoDetalle({ surtido: s, lineas, inv, permisos, productos, alias, urgente, onClose, onCambio }) {
  const [accion, setAccion] = useState(null) // 'surtir' | 'entregar' | 'cancelar' | 'regresar' | 'corregir'
  const [eventos, setEventos] = useState(null)
  const [personas, setPersonas] = useState(null)
  const [form, setForm] = useState({ persona: '', otra: '', remision: '', fecha: hoyISO(), motivo: '' })
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  // V202 — piezas apartadas por renglón (se guardan al salir del campo o con Enter).
  const [apartar, setApartar] = useState(() => Object.fromEntries(lineas.map((l) => [l.id, String(Number(l.apartada) || 0)])))

  // Al recargar (después de apartar) se toma lo guardado.
  useEffect(() => {
    setApartar(Object.fromEntries(lineas.map((l) => [l.id, String(Number(l.apartada) || 0)])))
  }, [lineas])

  useEffect(() => {
    let vivo = true
    fetchEventosSurtido(s.id).then(({ data }) => vivo && setEventos(data || []))
    return () => { vivo = false }
  }, [s.id, s.estado, lineas])

  useEffect(() => {
    if (accion !== 'surtir' || personas) return
    personasSurtido().then(({ data, error: e }) => {
      if (e) setError(e.message)
      setPersonas(data || [])
    })
  }, [accion, personas])

  const filas = faltantesDeOrden(lineas, inv)
  // En el historial las claves se cambian por el nombre del producto.
  const sinClaves = (txt) => [...(productos || [])].sort((a, b) => String(b.clave).length - String(a.clave).length).reduce((s, p) => (p.clave && s.includes(p.clave) ? s.split(p.clave).join(nombreFrisa(p.nombre)) : s), String(txt))
  const palomear = s.estado === 'pendiente' && permisos.surtir
  const pendiente = s.estado === 'pendiente'
  const totalApartadas = filas.reduce((t, l) => t + l.apartada, 0)
  const sePuedeApartar = filas.filter((l) => l.necesita > 0 && l.disponible > 0)
  // V204 — entregas parciales de una surtida.
  const entregadas = lineas.reduce((t, l) => t + entregadaDe(l), 0)
  const faltaEntregar = lineas.reduce((t, l) => t + porEntregar(l), 0)
  const yaParcial = s.estado === 'surtida' && entregadas > 0
  const [entParcial, setEntParcial] = useState(false)
  const [entCant, setEntCant] = useState({})
  const cantEnt = (l) => (entCant[l.id] === undefined ? porEntregar(l) : Number(entCant[l.id]))
  const entMal = entParcial && lineas.some((l) => porEntregar(l) > 0 && (!Number.isInteger(cantEnt(l)) || cantEnt(l) < 0 || cantEnt(l) > porEntregar(l)))
  const entPiezas = entParcial ? lineas.reduce((t, l) => t + (porEntregar(l) > 0 ? cantEnt(l) || 0 : 0), 0) : faltaEntregar
  function confirmarEntrega(e) {
    e.preventDefault()
    const lineasEnt = entParcial ? lineas.filter((l) => porEntregar(l) > 0).map((l) => ({ linea_id: l.id, cantidad: cantEnt(l) })) : null
    const queda = faltaEntregar - entPiezas
    ejecutar(() => entregarSurtido(s.id, { remision: form.remision, fecha: form.fecha, lineas: lineasEnt }),
      queda > 0 ? `OC ${s.numero_oc}: se entregaron ${num(entPiezas)} pzas; faltan ${num(queda)} (siguen en Surtidas).` : `OC ${s.numero_oc} entregada: se descontó del inventario y se sumó a la planta.`)
  }

  async function guardarApartado(l, cantidad, msg) {
    setTrabajando(true)
    setError(null)
    const { error: e } = await apartarRenglon(l.id, cantidad)
    setTrabajando(false)
    if (e) {
      setApartar((a) => ({ ...a, [l.id]: String(l.apartada) }))
      return setError(e.message)
    }
    onCambio(msg)
  }
  function tocarRenglon(l) {
    const completo = l.apartada === l.cantidad
    const n = completo ? 0 : l.cantidad
    guardarApartado(l, n, completo ? `OC ${s.numero_oc}: se liberó un renglón.` : `OC ${s.numero_oc}: renglón apartado completo.`)
  }
  function salirDeApartadas(l) {
    const v = apartar[l.id]
    const n = Number(v)
    if (v === '' || !Number.isInteger(n) || n < 0 || n > l.cantidad) {
      setApartar((a) => ({ ...a, [l.id]: String(l.apartada) }))
      return setError(`Escribe de 0 a ${l.cantidad} piezas.`)
    }
    if (n !== l.apartada) guardarApartado(l, n, `OC ${s.numero_oc}: ${num(n)} de ${num(l.cantidad)} apartadas.`)
  }
  async function apartarLoQueHay() {
    setTrabajando(true)
    setError(null)
    let piezas = 0
    for (const l of sePuedeApartar) {
      const n = Math.min(l.cantidad, l.apartada + l.disponible)
      const { error: e } = await apartarRenglon(l.id, n)
      if (e) {
        setTrabajando(false)
        if (piezas) return onCambio(`OC ${s.numero_oc}: se apartaron ${num(piezas)} pzas; otra no se pudo: ${e.message}`)
        return setError(e.message)
      }
      piezas += n - l.apartada
    }
    setTrabajando(false)
    onCambio(`OC ${s.numero_oc}: se apartaron ${num(piezas)} pzas con lo que había.`)
  }
  const falta = filas.some((f) => f.falta > 0)
  const lim = textoLimite(s.fecha_limite)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function ejecutar(fn, msg) {
    setTrabajando(true)
    setError(null)
    const { error: e } = await fn()
    setTrabajando(false)
    if (e) return setError(e.message)
    setAccion(null)
    onCambio(msg)
  }

  async function verPdf() {
    const { data, error: e } = await urlPdfOC(s.pdf_path)
    if (e) return setError(e.message)
    window.open(data, '_blank', 'noopener')
  }

  if (accion === 'corregir') {
    return (
      <FrisaSurtidoForm productos={productos} alias={alias} surtido={s} lineas={lineas} onClose={() => setAccion(null)}
        onGuardada={() => { setAccion(null); onCambio(`Se corrigió la OC ${s.numero_oc}.`) }} />
    )
  }

  function guardarSurtida(e) {
    e.preventDefault()
    const otra = form.persona === OTRA
    const persona = personas?.find((p) => p.id === form.persona)
    if (!form.persona || (otra && !form.otra.trim())) return setError('Elige quién surtió la orden.')
    ejecutar(() => marcarSurtida(s.id, { personaId: otra ? null : form.persona, personaNombre: otra ? form.otra.trim() : persona?.nombre }),
      `OC ${s.numero_oc} surtida: las piezas quedaron apartadas.`)
  }

  return (
    <Modal title={`OC ${s.numero_oc}`} onClose={onClose}>
      <div className="frisa-niveles__detalle">
        <p className="frisa-surtido__fila1"><EstadoSurtido estado={s.estado} /> <strong>{s.planta}</strong></p>
        <p className="frisa__sub">
          {s.fecha_oc ? `OC del ${fechaCorta(s.fecha_oc)} · ` : ''}
          {s.fecha_limite ? `Límite ${fechaCorta(s.fecha_limite)}` : 'Sin fecha límite'}
          {(s.estado === 'pendiente' || s.estado === 'surtida') && s.fecha_limite && <> · <span className={lim.urgente ? 'frisa__falta' : ''}>{lim.texto}</span></>}
        </p>
        {s.pdf_path && <p><button type="button" className="btn btn--ghost btn--small" onClick={verPdf}>Ver PDF de la orden de compra</button></p>}
        {s.notas && <p className="frisa-niveles__notatxt">{s.notas}</p>}

        <div className="revision__tabla-wrap frisa-surtido__lineas">
          <table className="simple-table frisa-tabla">
            <thead>
              <tr>
                {palomear && <th aria-label="Apartado completo">✓</th>}
                <th>Producto</th>
                <th className="num">Pide</th>
                {pendiente && <th className="num">Apartadas</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((l) => {
                const p = productos.find((x) => x.id === l.producto_id)
                return (
                  <tr key={l.id || l.producto_id} className={pendiente && l.apartada === l.cantidad ? 'frisa-surtido__embolsada' : ''}>
                    {palomear && (
                      <td className="frisa-surtido__check">
                        <input type="checkbox" checked={l.apartada === l.cantidad} disabled={trabajando} onChange={() => tocarRenglon(l)} aria-label={`Apartar completo ${nombreFrisa(p?.nombre)}`} />
                      </td>
                    )}
                    <td><NombreFrisa producto={p} className="frisa__prod" /></td>
                    <td className="num"><strong>{num(l.cantidad)}</strong></td>
                    {pendiente && (
                      <td className="num frisa-surtido__apartadas">
                        {palomear
                          ? <input className="input frisa-input" type="number" min="0" max={l.cantidad} step="1" inputMode="numeric" disabled={trabajando}
                              value={apartar[l.id] ?? ''} onFocus={(e) => e.target.select()}
                              onChange={(e) => setApartar((a) => ({ ...a, [l.id]: e.target.value }))}
                              onBlur={() => salirDeApartadas(l)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              aria-label={`Apartadas ${nombreFrisa(p?.nombre)}`} />
                          : <strong>{num(l.apartada)}</strong>}
                        {l.necesita === 0
                          ? <div className="frisa__ok frisa__sub">completo ✓</div>
                          : l.falta > 0
                            ? <div className="frisa__falta">hay {num(Math.max(0, l.disponible))} · faltan {num(l.falta)}</div>
                            : <div className="frisa__ok frisa__sub">hay {num(l.disponible)} ✓</div>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr>{palomear && <td />}<td>Total</td><td className="num"><strong>{num(piezasDe(lineas))}</strong></td>{pendiente && <td className="num"><strong>{num(totalApartadas)}</strong></td>}</tr></tfoot>
          </table>
        </div>

        {pendiente && (
          <p className="frisa__sub">
            {totalApartadas === 0 ? 'Nada apartado todavía.' : totalApartadas === piezasDe(lineas)
              ? <strong className="frisa__ok">Todo apartado ✓ · ya se puede marcar Surtida toda.</strong>
              : <><strong>Apartadas {num(totalApartadas)} de {num(piezasDe(lineas))} pzas.</strong> Esas piezas ya no se usan para otras órdenes.</>}
            {palomear ? ' Escribe cuántas apartas de cada renglón (o palomea para apartarlo completo).' : ''}
          </p>
        )}
        {s.surtido_por_nombre && (
          <p className="frisa__sub">Surtió <strong>{s.surtido_por_nombre}</strong>{s.surtido_en ? ` · ${fechaHora(s.surtido_en)}` : ''}
            {s.surtido_registrado_por && s.surtido_registrado_por !== s.surtido_por_nombre ? ` (lo registró ${s.surtido_registrado_por})` : ''}</p>
        )}
        {yaParcial && (
          <p className="frisa__nota"><strong>Entrega parcial:</strong> se entregaron {num(entregadas)} de {num(piezasDe(lineas))} pzas. Faltan {num(faltaEntregar)} (siguen apartadas para el siguiente viaje).</p>
        )}
        {s.estado === 'entregada' && (
          <p className="frisa__sub">Entregada por el chofer{s.remision ? <> · Rem. <strong>{s.remision}</strong></> : ''} · {fechaCorta(s.fecha_entrega)} · lo marcó {s.entregado_por_nombre}
            {entregadas < piezasDe(lineas) ? ` · se entregaron ${num(entregadas)} de ${num(piezasDe(lineas))} pzas` : ''}</p>
        )}
        {s.estado === 'cancelada' && <p className="frisa__falta">Cancelada: {s.cancelado_motivo}</p>}

        {/* Acciones */}
        {!accion && (
          <div className="frisa__botones">
            {pendiente && permisos.surtir && sePuedeApartar.length > 0 && (falta || totalApartadas > 0) && (
              <button type="button" className="btn btn--secondary" disabled={trabajando} onClick={apartarLoQueHay}>
                Apartar lo que hay
              </button>
            )}
            {s.estado === 'pendiente' && permisos.surtir && (
              <button type="button" className="btn btn--primary" disabled={falta} onClick={() => { setError(null); setAccion('surtir') }}
                title={falta ? 'No alcanza el inventario para surtirla completa' : ''}>
                Surtida toda
              </button>
            )}
            {s.estado === 'surtida' && permisos.entregar && (
              <button type="button" className="btn btn--primary" onClick={() => { setError(null); setAccion('entregar') }}>Ya entregó el chofer</button>
            )}
            {s.estado === 'pendiente' && permisos.oc && (
              <button type="button" className="btn btn--secondary" onClick={() => setAccion('corregir')}>Corregir</button>
            )}
            {yaParcial && permisos.entregar && (
              <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setAccion('cerrar') }}>Cerrar con lo entregado</button>
            )}
            {s.estado === 'surtida' && !yaParcial && permisos.entregar && (
              <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setAccion('regresar') }}>Regresar a pendiente</button>
            )}
            {(s.estado === 'pendiente' || (s.estado === 'surtida' && !yaParcial)) && permisos.oc && (
              <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setAccion('cancelar') }}>Cancelar OC</button>
            )}
          </div>
        )}
        {s.estado === 'pendiente' && !falta && urgente && !urgente.completa && !accion && (
          <p className="frisa__nota">
            <strong>Ojo:</strong> sí alcanza para esta orden, pero {urgente.compiteCon.length ? `la OC ${urgente.compiteCon.join(', OC ')} vence antes y usa` : 'otra OC que vence antes usa'} las
            mismas piezas. Si surtes esta primero, a esa le van a faltar.
          </p>
        )}
        {s.estado === 'pendiente' && falta && !accion && (
          <p className="frisa__falta">No alcanza para entregarla completa (Frisa no acepta parciales). Mientras, aparta lo que hay para que no se use en otras órdenes; cuando llegue lo que falta, márcala Surtida toda.</p>
        )}

        {accion === 'surtir' && (
          <form className="frisa-niveles__captura" onSubmit={guardarSurtida}>
            <label className="frisa-niveles__captura-comentario">
              <span className="field-label">¿Quién la surtió?</span>
              <select className="input" value={form.persona} onChange={(e) => set('persona', e.target.value)} autoFocus>
                <option value="">{personas ? 'Elige…' : 'Cargando…'}</option>
                {(personas || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                <option value={OTRA}>Otra persona…</option>
              </select>
            </label>
            {form.persona === OTRA && (
              <label className="frisa-niveles__captura-comentario">
                <span className="field-label">Nombre</span>
                <input className="input" value={form.otra} onChange={(e) => set('otra', e.target.value)} placeholder="Ej. ayudante de la fábrica" />
              </label>
            )}
            <button type="submit" className="btn btn--primary" disabled={trabajando}>{trabajando ? 'Guardando…' : 'Confirmar: surtida completa'}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAccion(null)}>Cancelar</button>
          </form>
        )}

        {accion === 'entregar' && (
          <form className="frisa-niveles__captura frisa-entrega-form" onSubmit={confirmarEntrega}>
            <span className="order-filters__chips frisa__chips" role="group" aria-label="Cómo se entregó">
              <button type="button" className={'chip' + (!entParcial ? ' chip--active' : '')} onClick={() => setEntParcial(false)}>Se entregó todo</button>
              <button type="button" className={'chip' + (entParcial ? ' chip--active' : '')} onClick={() => setEntParcial(true)}>Entrega parcial</button>
            </span>
            {entParcial && (
              <table className="simple-table frisa-tabla">
                <thead><tr><th>Producto</th><th className="num">Faltaba</th><th className="num">Se entregó</th></tr></thead>
                <tbody>
                  {lineas.filter((l) => porEntregar(l) > 0).map((l) => {
                    const pr = productos.find((x) => x.id === l.producto_id)
                    const n = cantEnt(l)
                    return (
                      <tr key={l.id}>
                        <td>{nombreFrisa(pr?.nombre) || l.clave}</td>
                        <td className="num">{num(porEntregar(l))}</td>
                        <td className="num"><input className="input frisa-input" type="number" min="0" max={porEntregar(l)} step="1" inputMode="numeric"
                          value={entCant[l.id] ?? String(porEntregar(l))} onFocus={(e) => e.target.select()}
                          onChange={(e) => setEntCant({ ...entCant, [l.id]: e.target.value })} aria-label={`Se entregó de ${nombreFrisa(pr?.nombre)}`} />
                          {(!Number.isInteger(n) || n < 0 || n > porEntregar(l)) && <div className="form-error">De 0 a {num(porEntregar(l))}</div>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <label>
              <span className="field-label">Fecha de entrega</span>
              <input className="input" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} required />
            </label>
            <label>
              <span className="field-label">Folio de remisión (opcional)</span>
              <input className="input" value={form.remision} onChange={(e) => set('remision', e.target.value)} placeholder="Se puede ligar después" />
            </label>
            <button type="submit" className="btn btn--primary" disabled={trabajando || entMal || entPiezas <= 0}>{trabajando ? 'Guardando…' : `Confirmar entrega (${num(entPiezas)} pzas)`}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAccion(null)}>Cancelar</button>
            <p className="frisa__sub">Márcala cuando el chofer ya entregó en la planta. Lo entregado se descuenta del inventario de la fábrica y se suma a la planta.{entParcial ? ' Lo que no se entregó sigue en Surtidas para el siguiente viaje.' : ''}</p>
          </form>
        )}
        {accion === 'cerrar' && (
          <form className="frisa-niveles__captura" onSubmit={(e) => { e.preventDefault(); ejecutar(() => cerrarSurtidaParcial(s.id, form.motivo), `OC ${s.numero_oc} cerrada con lo entregado: las ${num(faltaEntregar)} pzas que faltaron regresan a disponible.`) }}>
            <p className="frisa__sub">Úsalo si lo que faltó <strong>ya no se va a entregar</strong>. La orden queda entregada con {num(entregadas)} pzas y las {num(faltaEntregar)} que faltaron regresan a disponible.</p>
            <label className="frisa-niveles__captura-comentario">
              <span className="field-label">¿Por qué no se entregó lo que faltó?</span>
              <input className="input" value={form.motivo} onChange={(e) => set('motivo', e.target.value)} autoFocus required />
            </label>
            <button type="submit" className="btn btn--primary" disabled={trabajando}>{trabajando ? 'Guardando…' : 'Cerrar con lo entregado'}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAccion(null)}>No</button>
          </form>
        )}

        {(accion === 'cancelar' || accion === 'regresar') && (
          <form className="frisa-niveles__captura" onSubmit={(e) => {
            e.preventDefault()
            if (accion === 'cancelar') ejecutar(() => cancelarSurtido(s.id, form.motivo), `OC ${s.numero_oc} cancelada.`)
            else ejecutar(() => regresarSurtida(s.id, form.motivo), `OC ${s.numero_oc} regresó a pendiente: se liberó lo apartado.`)
          }}>
            <label className="frisa-niveles__captura-comentario">
              <span className="field-label">{accion === 'cancelar' ? 'Motivo de la cancelación' : 'Motivo (opcional)'}</span>
              <input className="input" value={form.motivo} onChange={(e) => set('motivo', e.target.value)} autoFocus required={accion === 'cancelar'} />
            </label>
            <button type="submit" className="btn btn--primary" disabled={trabajando}>
              {trabajando ? 'Guardando…' : accion === 'cancelar' ? 'Cancelar la OC' : 'Regresar a pendiente'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAccion(null)}>No</button>
          </form>
        )}

        {error && <p className="form-error">{error}</p>}

        <h4 className="section-title section-title--small">Historial</h4>
        {!eventos && <p className="frisa__sub">Cargando…</p>}
        {eventos && (
          <ul className="frisa-niveles__historial">
            {eventos.map((ev) => (
              <li key={ev.id}>
                <span><strong>{ev.evento[0].toUpperCase() + ev.evento.slice(1)}</strong>{ev.detalle ? ` · ${sinClaves(ev.detalle)}` : ''}</span>
                <span className="frisa__sub">{fechaHora(ev.fecha)}{ev.usuario_nombre ? ` · ${ev.usuario_nombre}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
