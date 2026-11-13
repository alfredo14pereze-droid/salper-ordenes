import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { cambiarEstatus, completarSeguimiento, crearSeguimiento, registrarActividad } from '../../services/crmService'
import { CRM_ESTATUS, CRM_TIPOS_ACTIVIDAD, avisarCambioSeguimientos, estaAbierto, hoyMonterrey, sumarDias } from '../../utils/crm'
import { formatDate } from '../../utils/dates'

const SIGUIENTES = [
  { key: 'd7', label: '1 semana', dias: 7 },
  { key: 'd14', label: '2 semanas', dias: 14 },
  { key: 'd30', label: '1 mes', dias: 30 },
  { key: 'd91', label: '3 meses', dias: 91 },
  { key: 'fecha', label: 'Elegir fecha' },
  { key: 'cerrar', label: 'Sin seguimiento (cerrar)' },
]

// Parte 2 — "Registrar contacto" en un solo paso: guarda la llamada (o correo,
// visita…) en la bitácora, marca como hecho el seguimiento actual, programa el
// siguiente y, si hace falta, cambia el estatus. Pensado para < 10 segundos:
// todo viene listo (llamada, hoy, contacto principal, siguiente en 1 semana).
//
// empresa: fila de crm_empresas; contactos: de esa empresa;
// seguimiento: el seguimiento que se está atendiendo (o el pendiente más próximo).
export default function RegistrarContactoModal({ empresa, contactos, seguimiento, onClose, onListo }) {
  const hoy = hoyMonterrey()
  const principal = contactos.find((c) => c.es_principal) || contactos[0] || null
  const [tipo, setTipo] = useState('llamada')
  const [fecha, setFecha] = useState(hoy)
  const [contactoId, setContactoId] = useState(principal?.id || '')
  const [nota, setNota] = useState('')
  const [completar, setCompletar] = useState(true)
  const [siguiente, setSiguiente] = useState(estaAbierto(empresa.estatus) ? 'd7' : 'cerrar')
  const [fechaElegida, setFechaElegida] = useState('')
  const [notaSiguiente, setNotaSiguiente] = useState('')
  const [estatus, setEstatus] = useState(empresa.estatus)
  const [motivo, setMotivo] = useState(empresa.motivo_perdida || '')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cerrado = !estaAbierto(estatus)
  // Cerrar un prospecto abierto obliga a decir cómo terminó.
  const pideCierre = siguiente === 'cerrar' && !cerrado
  const fechaSiguiente = useMemo(() => {
    if (cerrado || siguiente === 'cerrar') return null
    if (siguiente === 'fecha') return fechaElegida || null
    return sumarDias(hoy, SIGUIENTES.find((s) => s.key === siguiente).dias)
  }, [cerrado, siguiente, fechaElegida, hoy])

  function elegirEstatus(v) {
    setEstatus(v)
    if (!estaAbierto(v)) setSiguiente('cerrar')
    else if (siguiente === 'cerrar') setSiguiente('d7')
  }

  async function guardar(ev) {
    ev.preventDefault()
    setError(null)
    if (!fecha) return setError('Elige la fecha del contacto.')
    if (pideCierre) return setError('Para cerrar, elige si se ganó o se perdió.')
    if (estatus === 'perdido' && !motivo.trim()) return setError('Escribe por qué se perdió.')
    if (!cerrado && siguiente === 'fecha' && !fechaElegida) return setError('Elige la fecha del siguiente seguimiento.')
    if (estatus === 'en_pausa' && !fechaSiguiente) return setError('En pausa necesita fecha para volver a contactar.')

    setGuardando(true)
    const pasos = []
    // 1) Bitácora
    pasos.push(() => registrarActividad({ empresaId: empresa.id, tipo, fecha, nota, contactoId: contactoId || null }))
    // 2) El seguimiento que se atendió
    if (seguimiento && completar) pasos.push(() => completarSeguimiento(seguimiento.id, true))
    // 3) Estatus (al pasar a En pausa, el servidor crea él mismo el seguimiento)
    const cambiaEstatus = estatus !== empresa.estatus || (estatus === 'perdido' && motivo.trim() !== (empresa.motivo_perdida || ''))
    if (cambiaEstatus) {
      pasos.push(() =>
        cambiarEstatus(empresa.id, estatus, {
          motivoPerdida: estatus === 'perdido' ? motivo : null,
          fechaSeguimiento: estatus === 'en_pausa' ? fechaSiguiente : null,
          notaSeguimiento: estatus === 'en_pausa' ? notaSiguiente : null,
        }),
      )
    }
    // 4) Siguiente seguimiento
    if (fechaSiguiente && !(cambiaEstatus && estatus === 'en_pausa')) {
      pasos.push(() => crearSeguimiento({ empresaId: empresa.id, fecha: fechaSiguiente, nota: notaSiguiente }))
    }
    for (const [i, paso] of pasos.entries()) {
      const { error: err } = await paso()
      if (err) {
        setGuardando(false)
        avisarCambioSeguimientos()
        return setError(i === 0 ? err.message : `El contacto quedó registrado, pero falló un paso: ${err.message}`)
      }
    }
    setGuardando(false)
    avisarCambioSeguimientos()
    onListo()
  }

  return (
    <Modal title={`Registrar contacto · ${empresa.nombre}`} onClose={onClose}>
      <form className="crm-form crm-registrar" onSubmit={guardar}>
        <div className="crm-atajos" role="radiogroup" aria-label="Tipo de contacto">
          {CRM_TIPOS_ACTIVIDAD.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={tipo === t.key} className={'chip' + (tipo === t.key ? ' chip--active' : '')} onClick={() => setTipo(t.key)}>
              {t.icono} {t.label}
            </button>
          ))}
        </div>

        <div className="form-row">
          <label>
            <span className="field-label">Con quién</span>
            <select className="input" value={contactoId} onChange={(e) => setContactoId(e.target.value)}>
              <option value="">— Nadie en particular —</option>
              {contactos.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Fecha</span>
            <input className="input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>

        <label>
          <span className="field-label">¿Qué pasó?</span>
          <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. No contestó / Pide cotización de 50 playeras" autoFocus />
        </label>

        {seguimiento && (
          <label className="crm-check crm-registrar__completar">
            <input type="checkbox" checked={completar} onChange={(e) => setCompletar(e.target.checked)} />
            <span>
              Marcar como hecho el seguimiento del <strong>{formatDate(seguimiento.fecha)}</strong>
              {seguimiento.nota ? <span className="crm-muted"> · {seguimiento.nota}</span> : null}
            </span>
          </label>
        )}

        <fieldset className="crm-registrar__bloque">
          <legend className="field-label">Siguiente seguimiento</legend>
          {cerrado ? (
            <p className="crm-muted crm-registrar__info">El prospecto queda cerrado ({CRM_ESTATUS.find((s) => s.key === estatus)?.label}); no se programa otro seguimiento.</p>
          ) : (
            <>
              <div className="crm-atajos">
                {SIGUIENTES.map((s) => (
                  <button key={s.key} type="button" className={'chip' + (siguiente === s.key ? ' chip--active' : '') + (s.key === 'cerrar' ? ' crm-chip--cerrar' : '')} onClick={() => setSiguiente(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
              {siguiente === 'fecha' && <input className="input" type="date" min={hoy} value={fechaElegida} onChange={(e) => setFechaElegida(e.target.value)} />}
              {fechaSiguiente && (
                <>
                  <p className="crm-registrar__info">
                    Volver a contactar el <strong>{formatDate(fechaSiguiente, "EEEE d 'de' MMMM")}</strong>
                  </p>
                  <input className="input" value={notaSiguiente} onChange={(e) => setNotaSiguiente(e.target.value)} placeholder="Nota para ese día (opcional)" />
                </>
              )}
              {pideCierre && (
                <div className="crm-aviso crm-aviso--fuerte">
                  <strong>¿Cómo se cerró?</strong>
                  <div className="crm-atajos" style={{ marginTop: 6 }}>
                    <button type="button" className="chip" onClick={() => elegirEstatus('ganado')}>✓ Se ganó</button>
                    <button type="button" className="chip" onClick={() => elegirEstatus('perdido')}>✕ Se perdió</button>
                  </div>
                </div>
              )}
            </>
          )}
        </fieldset>

        <div className="form-row">
          <label>
            <span className="field-label">Estatus</span>
            <select className="input" value={estatus} onChange={(e) => elegirEstatus(e.target.value)}>
              {CRM_ESTATUS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          {estatus === 'perdido' && (
            <label>
              <span className="field-label">¿Por qué se perdió? *</span>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} list="crm-motivos-reg" placeholder="Precio, ya tienen proveedor…" />
              <datalist id="crm-motivos-reg">
                {['Precio', 'Ya tienen proveedor', 'No contestan', 'Tiempo de entrega', 'No les interesa', 'Calidad'].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className="crm-form__botones">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}
