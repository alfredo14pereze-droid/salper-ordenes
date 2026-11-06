import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import {
  fetchEventosSurtido, personasSurtido, marcarSurtida, regresarSurtida, entregarSurtido, cancelarSurtido, urlPdfOC,
} from '../../services/frisaSurtidoService'
import { faltantesDeOrden, piezasDe, textoLimite, hoyISO } from '../../utils/frisaSurtido'
import { fechaCorta, NombreFrisa } from '../frisaNiveles/comunes'
import { EstadoSurtido } from './comunes'
import FrisaSurtidoForm from './FrisaSurtidoForm'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
const fechaHora = (d) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const OTRA = '__otra__'

// Detalle de una orden de surtido con sus acciones según estado y permisos.
export default function FrisaSurtidoDetalle({ surtido: s, lineas, inv, permisos, productos, alias, onClose, onCambio }) {
  const [accion, setAccion] = useState(null) // 'surtir' | 'entregar' | 'cancelar' | 'regresar' | 'corregir'
  const [eventos, setEventos] = useState(null)
  const [personas, setPersonas] = useState(null)
  const [form, setForm] = useState({ persona: '', otra: '', remision: '', fecha: hoyISO(), motivo: '' })
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    fetchEventosSurtido(s.id).then(({ data }) => vivo && setEventos(data || []))
    return () => { vivo = false }
  }, [s.id, s.estado])

  useEffect(() => {
    if (accion !== 'surtir' || personas) return
    personasSurtido().then(({ data, error: e }) => {
      if (e) setError(e.message)
      setPersonas(data || [])
    })
  }, [accion, personas])

  const filas = faltantesDeOrden(lineas, inv)
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
                <th>Clave</th>
                <th className="num">Pide</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((l) => {
                const p = productos.find((x) => x.id === l.producto_id)
                return (
                  <tr key={l.id || l.producto_id}>
                    <td><strong>{l.clave}</strong><NombreFrisa producto={p} /></td>
                    <td className="num">
                      <strong>{num(l.cantidad)}</strong>
                      {s.estado === 'pendiente' && (l.falta > 0
                        ? <div className="frisa__falta">hay {num(l.disponible)} · faltan {num(l.falta)}</div>
                        : <div className="frisa__ok frisa__sub">hay {num(l.disponible)} ✓</div>)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num"><strong>{num(piezasDe(lineas))}</strong></td></tr></tfoot>
          </table>
        </div>

        {s.surtido_por_nombre && (
          <p className="frisa__sub">Surtió <strong>{s.surtido_por_nombre}</strong>{s.surtido_en ? ` · ${fechaHora(s.surtido_en)}` : ''}
            {s.surtido_registrado_por && s.surtido_registrado_por !== s.surtido_por_nombre ? ` (lo registró ${s.surtido_registrado_por})` : ''}</p>
        )}
        {s.estado === 'entregada' && (
          <p className="frisa__sub">Salió el chofer · Rem. <strong>{s.remision}</strong> · {fechaCorta(s.fecha_entrega)} · lo marcó {s.entregado_por_nombre}</p>
        )}
        {s.estado === 'cancelada' && <p className="frisa__falta">Cancelada: {s.cancelado_motivo}</p>}

        {/* Acciones */}
        {!accion && (
          <div className="frisa__botones">
            {s.estado === 'pendiente' && permisos.surtir && (
              <button type="button" className="btn btn--primary" disabled={falta} onClick={() => { setError(null); setAccion('surtir') }}
                title={falta ? 'No alcanza el inventario para surtirla completa' : ''}>
                Marcar surtida
              </button>
            )}
            {s.estado === 'surtida' && permisos.entregar && (
              <button type="button" className="btn btn--primary" onClick={() => { setError(null); setAccion('entregar') }}>Salió el chofer</button>
            )}
            {s.estado === 'pendiente' && permisos.oc && (
              <button type="button" className="btn btn--secondary" onClick={() => setAccion('corregir')}>Corregir</button>
            )}
            {s.estado === 'surtida' && permisos.entregar && (
              <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setAccion('regresar') }}>Regresar a pendiente</button>
            )}
            {(s.estado === 'pendiente' || s.estado === 'surtida') && permisos.oc && (
              <button type="button" className="btn btn--ghost" onClick={() => { setError(null); setAccion('cancelar') }}>Cancelar OC</button>
            )}
          </div>
        )}
        {s.estado === 'pendiente' && falta && !accion && (
          <p className="frisa__falta">No alcanza el inventario: Frisa no acepta parciales, hay que esperar a tenerla completa.</p>
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
          <form className="frisa-niveles__captura" onSubmit={(e) => { e.preventDefault(); ejecutar(() => entregarSurtido(s.id, form), `OC ${s.numero_oc} entregada: se descontó del inventario.`) }}>
            <label>
              <span className="field-label">Folio de remisión (Microsip)</span>
              <input className="input" value={form.remision} onChange={(e) => set('remision', e.target.value)} autoFocus required />
            </label>
            <label>
              <span className="field-label">Fecha</span>
              <input className="input" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} required />
            </label>
            <button type="submit" className="btn btn--primary" disabled={trabajando}>{trabajando ? 'Guardando…' : 'Confirmar salida'}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAccion(null)}>Cancelar</button>
            <p className="frisa__sub">Al confirmar se descuentan {num(piezasDe(lineas))} piezas del inventario de la fábrica.</p>
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
                <span><strong>{ev.evento[0].toUpperCase() + ev.evento.slice(1)}</strong>{ev.detalle ? ` · ${ev.detalle}` : ''}</span>
                <span className="frisa__sub">{fechaHora(ev.fecha)}{ev.usuario_nombre ? ` · ${ev.usuario_nombre}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
