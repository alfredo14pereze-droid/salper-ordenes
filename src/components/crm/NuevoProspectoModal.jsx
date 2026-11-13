import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { empresasParecidas, guardarContacto, guardarEmpresa } from '../../services/crmService'
import { CRM_SEGMENTOS } from '../../utils/crm'
import { EstatusBadge } from './CrmComunes'

const VACIO = { nombre: '', ubicacion: '', segmento: '', origen: '', responsableId: '', cNombre: '', cPuesto: '', cTelefono: '', cCorreo: '' }

// Alta de prospecto. Antes de guardar busca empresas con nombre parecido
// (sin acentos, mayúsculas, "S.A. de C.V." ni espacios) para no duplicar;
// desde el aviso se puede abrir la existente o agregarle el contacto.
export default function NuevoProspectoModal({ usuarios, onClose, onCreada, onAbrir }) {
  const { user } = useAuth()
  const [f, setF] = useState({ ...VACIO, responsableId: user?.id || '' })
  const [parecidas, setParecidas] = useState([])
  const [confirmarOtra, setConfirmarOtra] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const hayContacto = f.cNombre.trim() !== '' || f.cCorreo.trim() !== '' || f.cTelefono.trim() !== ''

  // Busca parecidas mientras escribe (con una pausa corta).
  useEffect(() => {
    const nombre = f.nombre.trim()
    setConfirmarOtra(false)
    if (nombre.length < 3) {
      setParecidas([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await empresasParecidas(nombre)
      setParecidas(data || [])
    }, 350)
    return () => clearTimeout(t)
  }, [f.nombre])

  function contactoValido() {
    if (hayContacto && !f.cNombre.trim() && !f.cCorreo.trim()) {
      setError(new Error('Escribe el nombre o el correo del contacto.'))
      return false
    }
    return true
  }

  async function crearContacto(empresaId) {
    if (!hayContacto) return { error: null }
    return guardarContacto({
      empresaId,
      nombre: f.cNombre.trim() || f.cCorreo.trim(),
      puesto: f.cPuesto,
      telefono: f.cTelefono,
      correo: f.cCorreo,
    })
  }

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!f.nombre.trim()) return setError(new Error('Escribe el nombre de la empresa.'))
    if (!contactoValido()) return
    if (parecidas.length > 0 && !confirmarOtra) {
      setConfirmarOtra(true)
      return
    }
    setGuardando(true)
    const { data, error: err } = await guardarEmpresa({
      nombre: f.nombre,
      ubicacion: f.ubicacion,
      segmento: f.segmento,
      origen: f.origen,
      responsableId: f.responsableId,
    })
    if (err) {
      setGuardando(false)
      return setError(err)
    }
    const { error: errC } = await crearContacto(data.id)
    setGuardando(false)
    if (errC) return setError(new Error(`La empresa se guardó, pero el contacto no: ${errC.message}`))
    onCreada(data)
  }

  async function agregarAExistente(emp) {
    setError(null)
    if (!hayContacto) return onAbrir(emp.id)
    if (!contactoValido()) return
    setGuardando(true)
    const { error: err } = await crearContacto(emp.id)
    setGuardando(false)
    if (err) return setError(err)
    onAbrir(emp.id)
  }

  return (
    <Modal title="Nuevo prospecto" onClose={onClose}>
      <form className="crm-form" onSubmit={guardar}>
        <label>
          <span className="field-label">Empresa *</span>
          <input className="input" value={f.nombre} onChange={set('nombre')} placeholder="Ej. Grupo Industrial del Norte" autoFocus />
        </label>

        {parecidas.length > 0 && (
          <div className={'crm-aviso' + (confirmarOtra ? ' crm-aviso--fuerte' : '')}>
            <strong>{parecidas.length === 1 ? 'Ya hay una empresa parecida:' : 'Ya hay empresas parecidas:'}</strong>
            <ul className="crm-aviso__lista">
              {parecidas.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.nombre}
                    {p.ubicacion ? <span className="crm-muted"> · {p.ubicacion}</span> : null} <EstatusBadge estatus={p.estatus} />
                  </span>
                  <span className="crm-aviso__acciones">
                    <button type="button" className="btn btn--outline btn--small" disabled={guardando} onClick={() => agregarAExistente(p)}>
                      {hayContacto ? 'Agregarle este contacto' : 'Abrir esta'}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {confirmarOtra && <p className="crm-aviso__pregunta">¿Seguro que es otra empresa? Toca «Sí, es otra empresa» para crearla de todos modos.</p>}
          </div>
        )}

        <div className="form-row">
          <label>
            <span className="field-label">Ubicación</span>
            <input className="input" value={f.ubicacion} onChange={set('ubicacion')} placeholder="Ciudad o zona" />
          </label>
          <label>
            <span className="field-label">Segmento</span>
            <select className="input" value={f.segmento} onChange={set('segmento')}>
              <option value="">— Sin elegir —</option>
              {CRM_SEGMENTOS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            <span className="field-label">¿Cómo llegó?</span>
            <input className="input" value={f.origen} onChange={set('origen')} list="crm-origenes" placeholder="LinkedIn, referido, visita…" />
            <datalist id="crm-origenes">
              {['LinkedIn', 'Correo', 'WhatsApp', 'Referido', 'Visita', 'Llamada', 'Página web'].map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label>
            <span className="field-label">Responsable</span>
            <select className="input" value={f.responsableId} onChange={set('responsableId')}>
              {usuarios.opciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <h4 className="crm-subtitulo">Contacto (opcional)</h4>
        <div className="form-row">
          <label>
            <span className="field-label">Nombre</span>
            <input className="input" value={f.cNombre} onChange={set('cNombre')} />
          </label>
          <label>
            <span className="field-label">Puesto</span>
            <input className="input" value={f.cPuesto} onChange={set('cPuesto')} placeholder="Compras, RH…" />
          </label>
        </div>
        <div className="form-row">
          <label>
            <span className="field-label">Teléfono</span>
            <input className="input" type="tel" value={f.cTelefono} onChange={set('cTelefono')} />
          </label>
          <label>
            <span className="field-label">Correo</span>
            <input className="input" type="email" value={f.cCorreo} onChange={set('cCorreo')} />
          </label>
        </div>

        {error && <p className="form-error">{error.message}</p>}
        <div className="crm-form__botones">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={guardando}>
            {guardando ? 'Guardando…' : confirmarOtra ? 'Sí, es otra empresa' : 'Guardar prospecto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
