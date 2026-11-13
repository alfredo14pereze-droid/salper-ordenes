import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import Modal from '../components/talleros/Modal'
import { canUsarCrm } from '../utils/permissions'
import {
  cambiarEstatus,
  completarSeguimiento,
  crearSeguimiento,
  eliminarContacto,
  eliminarEmpresa,
  empresasParecidas,
  fetchCrmEmpresa,
  guardarContacto,
  guardarEmpresa,
} from '../services/crmService'
import {
  CRM_ESTATUS,
  CRM_SEGMENTOS,
  MESES,
  formatoMonto,
  segmentoLabel,
  tipoActividad,
  avisarCambioSeguimientos,
  hoyMonterrey,
} from '../utils/crm'
import { formatDate, formatDateTime } from '../utils/dates'
import { EstatusBadge, telLink, useCrmUsuarios, waLink } from '../components/crm/CrmComunes'
import EstatusModal, { AtajosFecha } from '../components/crm/EstatusModal'
import RegistrarContactoModal from '../components/crm/RegistrarContactoModal'
import '../components/crm/crm.css'

// V207 — Ficha de una empresa del CRM: datos, estatus, contactos,
// seguimientos y bitácora.
export default function CrmEmpresaPage() {
  return (
    <RequireRole allow={canUsarCrm}>
      <Ficha />
    </RequireRole>
  )
}

function Ficha() {
  const { id } = useParams()
  const navigate = useNavigate()
  const usuarios = useCrmUsuarios()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [editando, setEditando] = useState(false)
  const [estatusPendiente, setEstatusPendiente] = useState(null) // perdido | en_pausa
  const [contactoEditar, setContactoEditar] = useState(null) // {} nuevo | contacto
  const [registrando, setRegistrando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: err } = await fetchCrmEmpresa(id)
    if (err) setError(err)
    else setDatos(data)
  }, [id])
  useEffect(() => {
    cargar()
  }, [cargar])

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!datos) return <Loading label="Cargando empresa…" />
  if (!datos.empresa)
    return (
      <div className="page page--narrow">
        <EmptyState>
          Esta empresa no existe o se eliminó. <Link to="/crm">Volver al CRM</Link>
        </EmptyState>
      </div>
    )

  const { empresa: e, contactos, actividades, seguimientos } = datos
  const pendientes = seguimientos.filter((s) => !s.completado_en)
  const completados = seguimientos.filter((s) => s.completado_en).sort((a, b) => b.completado_en.localeCompare(a.completado_en))

  async function correr(fn) {
    setActionError(null)
    const { error: err } = await fn()
    if (err) setActionError(err)
    avisarCambioSeguimientos()
    await cargar()
    return !err
  }

  async function elegirEstatus(nuevo) {
    if (nuevo === e.estatus) return
    if (nuevo === 'perdido' || nuevo === 'en_pausa') return setEstatusPendiente(nuevo)
    await correr(() => cambiarEstatus(e.id, nuevo))
  }

  async function borrarEmpresa() {
    if (!window.confirm(`¿Eliminar "${e.nombre}" del CRM? Ya no aparecerá en la lista.`)) return
    const { error: err } = await eliminarEmpresa(e.id)
    if (err) return setActionError(err)
    navigate('/crm')
  }

  return (
    <div className="page crm crm-ficha">
      <Link to="/crm" className="crm-volver">← Prospectos</Link>
      <div className="section-header">
        <h2 className="section-title">{e.nombre}</h2>
        <EstatusBadge estatus={e.estatus} />
        <button type="button" className="btn btn--primary crm-ficha__registrar" onClick={() => setRegistrando(true)}>
          📞 Registrar contacto
        </button>
      </div>

      {actionError && <p className="form-error">{actionError.message}</p>}

      <div className="crm-ficha__grid">
        <div className="crm-ficha__col">
          {/* Estatus */}
          <section className="card crm-card">
            <h3 className="crm-card__titulo">Estatus</h3>
            <div className="crm-estatus-opciones">
              {CRM_ESTATUS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={'chip' + (e.estatus === s.key ? ' chip--active' : '')}
                  onClick={() => elegirEstatus(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {e.estatus === 'perdido' && e.motivo_perdida && (
              <p className="crm-motivo">
                <strong>Por qué se perdió:</strong> {e.motivo_perdida}
              </p>
            )}
          </section>

          {/* Datos generales */}
          <section className="card crm-card">
            <div className="crm-card__head">
              <h3 className="crm-card__titulo">Datos generales</h3>
              {!editando && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(true)}>
                  Editar
                </button>
              )}
            </div>
            {editando ? (
              <DatosForm
                empresa={e}
                usuarios={usuarios}
                onCancel={() => setEditando(false)}
                onGuardar={async (v) => {
                  const ok = await correr(() => guardarEmpresa({ id: e.id, ...v }))
                  if (ok) setEditando(false)
                }}
              />
            ) : (
              <dl className="crm-datos">
                <dt>Ubicación</dt>
                <dd>{e.ubicacion || '—'}</dd>
                <dt>Segmento</dt>
                <dd>{segmentoLabel(e.segmento)}</dd>
                <dt>¿Cómo llegó?</dt>
                <dd>{e.origen || '—'}</dd>
                <dt>Mes en que compran</dt>
                <dd>{e.mes_compra ? MESES[e.mes_compra - 1] : '—'}</dd>
                <dt>Monto cotizado</dt>
                <dd>{formatoMonto(e.monto_cotizado)}</dd>
                <dt>Monto vendido</dt>
                <dd>{formatoMonto(e.monto_vendido)}</dd>
                <dt>Responsable</dt>
                <dd>{usuarios.nombre(e.responsable_id)}</dd>
                <dt>Alta</dt>
                <dd>{formatDate(e.creado_en)}</dd>
              </dl>
            )}
          </section>

          {/* Contactos */}
          <section className="card crm-card">
            <div className="crm-card__head">
              <h3 className="crm-card__titulo">Contactos</h3>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setContactoEditar({})}>
                + Agregar
              </button>
            </div>
            {contactos.length === 0 ? (
              <p className="crm-muted">Sin contactos todavía.</p>
            ) : (
              <ul className="crm-contactos">
                {contactos.map((c) => (
                  <li key={c.id} className="crm-contacto">
                    <div className="crm-contacto__nombre">
                      {c.es_principal && <span className="crm-principal" title="Contacto principal">★</span>}
                      <strong>{c.nombre}</strong>
                      {c.puesto && <span className="crm-muted"> · {c.puesto}</span>}
                    </div>
                    <div className="crm-contacto__medios">
                      {c.telefono && <a href={telLink(c.telefono)}>📞 {c.telefono}</a>}
                      {c.telefono && waLink(c.telefono) && (
                        <a href={waLink(c.telefono)} target="_blank" rel="noreferrer">💬 WhatsApp</a>
                      )}
                      {c.correo && <a href={`mailto:${c.correo}`}>✉️ {c.correo}</a>}
                    </div>
                    {c.notas && <p className="crm-contacto__notas">{c.notas}</p>}
                    <div className="crm-contacto__acciones">
                      {!c.es_principal && (
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => correr(() => guardarContacto({ ...aForm(c), empresaId: e.id, esPrincipal: true }))}>
                          Hacer principal
                        </button>
                      )}
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setContactoEditar(c)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => window.confirm(`¿Borrar a ${c.nombre}? Lo que ya está en la bitácora se queda.`) && correr(() => eliminarContacto(c.id))}
                      >
                        Borrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="crm-ficha__col">
          {/* Seguimientos */}
          <section className="card crm-card">
            <h3 className="crm-card__titulo">Volver a contactar</h3>
            <SeguimientoForm usuarios={usuarios} empresa={e} onCrear={(v) => correr(() => crearSeguimiento({ empresaId: e.id, ...v }))} />
            {pendientes.length === 0 ? (
              <p className="crm-muted">No hay seguimientos pendientes.</p>
            ) : (
              <ul className="crm-seguimientos">
                {pendientes.map((s) => (
                  <SeguimientoItem key={s.id} s={s} usuarios={usuarios} onToggle={() => correr(() => completarSeguimiento(s.id, true))} />
                ))}
              </ul>
            )}
            {completados.length > 0 && (
              <details className="crm-completados">
                <summary>Completados ({completados.length})</summary>
                <ul className="crm-seguimientos">
                  {completados.map((s) => (
                    <SeguimientoItem key={s.id} s={s} usuarios={usuarios} onToggle={() => correr(() => completarSeguimiento(s.id, false))} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* Bitácora */}
          <section className="card crm-card">
            <div className="crm-card__head">
              <h3 className="crm-card__titulo">Bitácora</h3>
              <button type="button" className="btn btn--primary btn--small" onClick={() => setRegistrando(true)}>
                Registrar contacto
              </button>
            </div>
            {actividades.length === 0 ? (
              <p className="crm-muted">Todavía no se ha registrado ningún contacto con esta empresa.</p>
            ) : (
              <ul className="crm-bitacora">
                {actividades.map((a) => {
                  const t = tipoActividad(a.tipo)
                  const c = contactos.find((x) => x.id === a.contacto_id)
                  return (
                    <li key={a.id} className="crm-bitacora__item">
                      <div className="crm-bitacora__head">
                        <span className="crm-bitacora__tipo">
                          {t.icono} {t.label}
                        </span>
                        <span className="crm-muted">
                          {formatDate(a.fecha)}
                          {c ? ` · con ${c.nombre}` : ''}
                          {a.usuario_id ? ` · ${usuarios.nombre(a.usuario_id)}` : ''}
                        </span>
                      </div>
                      {a.nota && <p className="crm-bitacora__nota">{a.nota}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="crm-zona-peligro">
        <button type="button" className="btn btn--ghost btn--small" onClick={borrarEmpresa}>
          Eliminar esta empresa del CRM
        </button>
      </div>

      {estatusPendiente && (
        <EstatusModal
          estatus={estatusPendiente}
          onClose={() => setEstatusPendiente(null)}
          onConfirmar={async (v) => {
            const ok = await correr(() => cambiarEstatus(e.id, estatusPendiente, v))
            if (ok) setEstatusPendiente(null)
          }}
        />
      )}
      {registrando && (
        <RegistrarContactoModal
          empresa={e}
          contactos={contactos}
          seguimiento={pendientes[0] || null}
          onClose={() => setRegistrando(false)}
          onListo={() => {
            setRegistrando(false)
            cargar()
          }}
        />
      )}
      {contactoEditar && (
        <ContactoModal
          contacto={contactoEditar}
          onClose={() => setContactoEditar(null)}
          onGuardar={async (v) => {
            const ok = await correr(() => guardarContacto({ ...v, id: contactoEditar.id, empresaId: e.id }))
            if (ok) setContactoEditar(null)
          }}
        />
      )}
    </div>
  )
}

const aForm = (c) => ({
  id: c.id,
  nombre: c.nombre || '',
  puesto: c.puesto || '',
  telefono: c.telefono || '',
  correo: c.correo || '',
  notas: c.notas || '',
  esPrincipal: !!c.es_principal,
})

function DatosForm({ empresa: e, usuarios, onCancel, onGuardar }) {
  const [f, setF] = useState({
    nombre: e.nombre,
    ubicacion: e.ubicacion || '',
    segmento: e.segmento || '',
    origen: e.origen || '',
    mesCompra: e.mes_compra || '',
    montoCotizado: e.monto_cotizado ?? '',
    montoVendido: e.monto_vendido ?? '',
    responsableId: e.responsable_id || '',
  })
  const [parecidas, setParecidas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }))

  useEffect(() => {
    if (f.nombre.trim() === e.nombre || f.nombre.trim().length < 3) return setParecidas([])
    const t = setTimeout(async () => setParecidas((await empresasParecidas(f.nombre, e.id)).data || []), 350)
    return () => clearTimeout(t)
  }, [f.nombre, e.nombre, e.id])

  return (
    <form
      className="crm-form"
      onSubmit={async (ev) => {
        ev.preventDefault()
        setGuardando(true)
        await onGuardar(f)
        setGuardando(false)
      }}
    >
      <label>
        <span className="field-label">Empresa *</span>
        <input className="input" value={f.nombre} onChange={set('nombre')} />
      </label>
      {parecidas.length > 0 && (
        <p className="crm-aviso">
          Ojo: ya hay {parecidas.length === 1 ? 'una empresa parecida' : 'empresas parecidas'}:{' '}
          {parecidas.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link to={`/crm/${p.id}`}>{p.nombre}</Link>
            </span>
          ))}
        </p>
      )}
      <div className="form-row">
        <label>
          <span className="field-label">Ubicación</span>
          <input className="input" value={f.ubicacion} onChange={set('ubicacion')} />
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
          <input className="input" value={f.origen} onChange={set('origen')} />
        </label>
        <label>
          <span className="field-label">Mes en que compran</span>
          <select className="input" value={f.mesCompra} onChange={set('mesCompra')}>
            <option value="">No se sabe</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          <span className="field-label">Monto cotizado ($)</span>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={f.montoCotizado} onChange={set('montoCotizado')} />
        </label>
        <label>
          <span className="field-label">Monto vendido ($)</span>
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={f.montoVendido} onChange={set('montoVendido')} />
        </label>
      </div>
      <label>
        <span className="field-label">Responsable</span>
        <select className="input" value={f.responsableId} onChange={set('responsableId')}>
          <option value="">Sin responsable</option>
          {usuarios.opciones.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
          {f.responsableId && !usuarios.opciones.some((u) => u.id === f.responsableId) && (
            <option value={f.responsableId}>{usuarios.nombre(f.responsableId)}</option>
          )}
        </select>
      </label>
      <div className="crm-form__botones">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function ContactoModal({ contacto, onClose, onGuardar }) {
  const [f, setF] = useState(contacto.id ? aForm(contacto) : aForm({}))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value }))
  return (
    <Modal title={contacto.id ? 'Editar contacto' : 'Agregar contacto'} onClose={onClose}>
      <form
        className="crm-form"
        onSubmit={async (ev) => {
          ev.preventDefault()
          if (!f.nombre.trim()) return setError('Escribe el nombre del contacto.')
          setGuardando(true)
          await onGuardar(f)
          setGuardando(false)
        }}
      >
        <div className="form-row">
          <label>
            <span className="field-label">Nombre *</span>
            <input className="input" value={f.nombre} onChange={set('nombre')} autoFocus />
          </label>
          <label>
            <span className="field-label">Puesto</span>
            <input className="input" value={f.puesto} onChange={set('puesto')} />
          </label>
        </div>
        <div className="form-row">
          <label>
            <span className="field-label">Teléfono</span>
            <input className="input" type="tel" value={f.telefono} onChange={set('telefono')} />
          </label>
          <label>
            <span className="field-label">Correo</span>
            <input className="input" type="email" value={f.correo} onChange={set('correo')} />
          </label>
        </div>
        <label>
          <span className="field-label">Notas</span>
          <textarea className="input" rows={2} value={f.notas} onChange={set('notas')} />
        </label>
        <label className="crm-check">
          <input type="checkbox" checked={f.esPrincipal} onChange={set('esPrincipal')} /> Es el contacto principal
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="crm-form__botones">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function SeguimientoForm({ usuarios, empresa, onCrear }) {
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [asignado, setAsignado] = useState(empresa.responsable_id || '')
  const [guardando, setGuardando] = useState(false)
  if (!abierto)
    return (
      <button type="button" className="btn btn--secondary btn--small crm-agregar" onClick={() => setAbierto(true)}>
        + Programar seguimiento
      </button>
    )
  return (
    <form
      className="crm-form crm-form--inline"
      onSubmit={async (ev) => {
        ev.preventDefault()
        if (!fecha) return
        setGuardando(true)
        const ok = await onCrear({ fecha, nota, asignadoA: asignado || null })
        setGuardando(false)
        if (ok) {
          setFecha('')
          setNota('')
          setAbierto(false)
        }
      }}
    >
      <AtajosFecha valor={fecha} onElegir={setFecha} />
      <div className="form-row">
        <label>
          <span className="field-label">Fecha *</span>
          <input className="input" type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} required />
        </label>
        <label>
          <span className="field-label">¿Quién?</span>
          <select className="input" value={asignado} onChange={(ev) => setAsignado(ev.target.value)}>
            {usuarios.opciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
            {asignado && !usuarios.opciones.some((u) => u.id === asignado) && <option value={asignado}>{usuarios.nombre(asignado)}</option>}
          </select>
        </label>
      </div>
      <label>
        <span className="field-label">Nota</span>
        <input className="input" value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Ej. preguntar si ya revisaron la cotización" />
      </label>
      <div className="crm-form__botones">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setAbierto(false)}>Cancelar</button>
        <button type="submit" className="btn btn--primary btn--small" disabled={guardando || !fecha}>{guardando ? 'Guardando…' : 'Guardar seguimiento'}</button>
      </div>
    </form>
  )
}

function SeguimientoItem({ s, usuarios, onToggle }) {
  const hoy = hoyMonterrey()
  const hecho = !!s.completado_en
  const clase = hecho ? '' : s.fecha < hoy ? ' crm-vencido' : s.fecha === hoy ? ' crm-hoy' : ''
  return (
    <li className={'crm-seguimiento' + (hecho ? ' crm-seguimiento--hecho' : '')}>
      <label className="crm-check">
        <input type="checkbox" checked={hecho} onChange={onToggle} />
        <span className={'crm-seguimiento__fecha' + clase}>
          {s.fecha === hoy ? 'Hoy' : formatDate(s.fecha)}
          {!hecho && s.fecha < hoy && ' · vencido'}
        </span>
      </label>
      <div className="crm-seguimiento__detalle">
        {s.nota && <span>{s.nota}</span>}
        <span className="crm-muted">
          {' '}
          · {usuarios.nombre(s.asignado_a)}
          {hecho && ` · hecho el ${formatDateTime(s.completado_en)}`}
        </span>
      </div>
    </li>
  )
}
