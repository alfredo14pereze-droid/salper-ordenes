import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canViewTareas, canCompletarTareas, canAsignarTareas, canAnotarTareasPropias, ROLE_LABELS } from '../utils/permissions'
import { fetchTareas, fetchDestinatariosTareas, fetchAltasPersonas, crearTarea, crearTareaPropia, marcarTarea, quitarTarea } from '../services/tareasService'
import { estadoDePersona, estadoGeneral, leAplica, estadoParaMi, hoyLocal, meToca, ordenarTareas, resumenDePersona, resumenPorPersona, textoDestino, vencida } from '../utils/tareas'
import { formatDate, formatDateTime } from '../utils/dates'

// Nombres cortos de los roles que reciben tareas ("Tienda", no "Tienda (básico)").
const ROL_CORTO = { tienda: 'Tienda', ventas: 'Ventas', contabilidad: 'Contabilidad' }
const nombreRol = (r) => ROL_CORTO[r] || ROLE_LABELS[r] || r
const ROLES_TAREAS = { ...ROLE_LABELS, ...ROL_CORTO }
// Filtro "Persona" en Asignadas: solo administradores (y solo quien ya ve Asignadas, o sea con ta.asignar).
const ROLES_FILTRO_PERSONA = ['admin_general', 'admin_tienda', 'admin_fabrica']

// V164 — Tareas para el personal. Los administrativos asignan (a todos, a un
// rol o a una persona; en grupo, "cada quien" o "basta con uno"; fecha límite
// opcional) y cada persona marca sus tareas como hechas.
export default function TareasPage() {
  return (
    <RequireRole allow={canViewTareas}>
      <TareasContent />
    </RequireRole>
  )
}

function TareasContent() {
  const { role, user } = useAuth()
  const userId = user?.id
  const puedeAsignar = canAsignarTareas(role)
  const puedeCompletar = canCompletarTareas(role)
  const puedeAnotar = canAnotarTareasPropias(role)
  const [anotando, setAnotando] = useState(false)
  const puedeFiltrar = puedeAsignar && ROLES_FILTRO_PERSONA.includes(role)
  // Persona elegida en la URL (#/tareas?persona=<id>) para compartir o recargar.
  const [searchParams, setSearchParams] = useSearchParams()
  const personaId = puedeFiltrar ? searchParams.get('persona') || '' : ''
  const [altas, setAltas] = useState({})

  const [datos, setDatos] = useState({ tareas: [], completadas: [] })
  const [destinatarios, setDestinatarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [ocupada, setOcupada] = useState(null)
  const [vista, setVista] = useState('pendientes') // pendientes | hechas

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: err } = await fetchTareas()
    if (err) setError(err)
    else setDatos(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!puedeAsignar) return
    fetchDestinatariosTareas().then(({ data }) => setDestinatarios(data || []))
  }, [puedeAsignar])

  useEffect(() => {
    if (!puedeFiltrar || !destinatarios.length) return
    fetchAltasPersonas(destinatarios.map((d) => d.id)).then(({ data }) =>
      setAltas(Object.fromEntries((data || []).map((p) => [p.id, p.created_at]))),
    )
  }, [puedeFiltrar, destinatarios])

  // Personas para el filtro (ya vienen ordenadas por nombre) con su fecha de alta.
  const personas = useMemo(() => destinatarios.map((d) => ({ ...d, alta_en: altas[d.id] || null })), [destinatarios, altas])
  const persona = personaId ? personas.find((p) => p.id === personaId) || null : null
  function elegirPersona(id) {
    const sp = new URLSearchParams(searchParams)
    if (id) sp.set('persona', id)
    else sp.delete('persona')
    setSearchParams(sp, { replace: true })
  }

  const porTarea = useMemo(() => {
    const m = new Map()
    for (const c of datos.completadas) {
      if (!m.has(c.tarea_id)) m.set(c.tarea_id, [])
      m.get(c.tarea_id).push(c)
    }
    return m
  }, [datos])

  const hoy = hoyLocal()
  // V166 — dos vistas: "Mis tareas" (solo las que le tocan a uno; para
  // todos) y "Asignadas" (todas, con el avance; solo quien asigna).
  // null = todavía no se elige: abre en "Mis tareas" si hay pendientes propias,
  // si no en "Asignadas" (donde está el formulario).
  const [seccionElegida, setSeccion] = useState(null) // mis | asignadas

  const filas = useMemo(
    () =>
      datos.tareas.map((t) => {
        const comps = porTarea.get(t.id) || []
        const general = puedeAsignar ? estadoGeneral(t, comps, destinatarios) : null
        const toca = puedeCompletar && meToca(t, { userId, role, asigna: puedeAsignar })
        const mio = toca ? estadoParaMi(t, comps, userId) : null
        // Quien solo consulta no ve a todos los del grupo: "cada quien" se queda
        // pendiente; "basta con uno" está hecha en cuanto alguien la hace.
        const hechaMia = mio ? mio.hecha : t.modo === 'uno' && comps.length > 0
        return { t, comps, general, mio, toca, hechaMia, hechaGeneral: general?.hecha ?? hechaMia }
      }),
    [datos, porTarea, puedeAsignar, puedeCompletar, destinatarios, userId, role],
  )

  // Mis tareas: las que me tocan (quien no puede completar —solo consulta— ve
  // las que la base ya le deja leer, que son las suyas).
  const mias = filas.filter((f) => !puedeCompletar || f.toca).map((f) => ({ ...f, hecha: f.hechaMia }))
  const misPendientes = mias.filter((f) => !f.hecha).length
  const seccion = seccionElegida ?? (personaId || misPendientes === 0 ? 'asignadas' : 'mis')
  const enAsignadas = puedeAsignar && seccion === 'asignadas'
  // Con persona elegida: solo las que le cuentan (hechas por ella o pendientes suyas; ver estadoDePersona).
  const asignadas = persona
    ? filas
        .map((f) => ({ ...f, deX: estadoDePersona(f.t, f.comps, persona) }))
        .filter((f) => f.deX)
        .map((f) => ({ ...f, hecha: f.deX === 'hecha' }))
    : filas.map((f) => ({ ...f, hecha: f.hechaGeneral }))
  const verResumen = enAsignadas && puedeFiltrar
  const resumenX = verResumen && persona ? resumenDePersona(datos.tareas, porTarea, persona, hoy) : null
  const tablaPersonas = verResumen && !persona ? resumenPorPersona(datos.tareas, porTarea, personas, hoy) : null
  const base = enAsignadas ? asignadas : mias
  const ordenar = (l) => ordenarTareas(l.map((f) => f.t), hoy).map((t) => l.find((f) => f.t.id === t.id))
  const pendientes = ordenar(base.filter((f) => !f.hecha))
  const hechas = base.filter((f) => f.hecha)
  const visibles = vista === 'pendientes' ? pendientes : hechas

  async function accion(id, fn) {
    setActionError(null)
    setOcupada(id)
    const { error: err } = await fn()
    setOcupada(null)
    if (err) setActionError(err)
    await cargar()
  }

  function quitar(t) {
    if (!window.confirm(`¿Quitar la tarea "${t.titulo}"? Ya no la verá nadie.`)) return
    accion(t.id, () => quitarTarea(t.id))
  }

  if (loading) return <Loading label="Cargando tareas…" />
  if (error) return <ErrorState error={error} onRetry={cargar} />

  return (
    <div className="page page--narrow">
      <div className="section-header">
        <h2 className="section-title">Tareas</h2>
      </div>

      {puedeAsignar && (
        <div className="notas-pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={!enAsignadas} className={'notas-pestana' + (!enAsignadas ? ' notas-pestana--activa' : '')} onClick={() => setSeccion('mis')}>
            Mis tareas
            {misPendientes > 0 && <span className="notas-pestana__contador">{misPendientes}</span>}
          </button>
          <button type="button" role="tab" aria-selected={enAsignadas} className={'notas-pestana' + (enAsignadas ? ' notas-pestana--activa' : '')} onClick={() => setSeccion('asignadas')}>
            Asignadas
          </button>
        </div>
      )}

      {puedeCompletar && !enAsignadas && (
        <p className={'tareas-resumen' + (misPendientes ? ' tareas-resumen--pend' : '')}>
          {misPendientes === 0
            ? '✓ No tienes tareas pendientes.'
            : `Tienes ${misPendientes} tarea${misPendientes === 1 ? '' : 's'} pendiente${misPendientes === 1 ? '' : 's'}.`}
        </p>
      )}

      {enAsignadas && <TareaForm destinatarios={destinatarios} onCreated={cargar} />}

      {/* V171 — cada quien se anota sus tareas (solo las ven él y admin_general). */}
      {puedeAnotar && !enAsignadas &&
        (anotando ? (
          <TareaPropiaForm
            onCancelar={() => setAnotando(false)}
            onCreated={() => {
              setAnotando(false)
              setVista('pendientes')
              cargar()
            }}
          />
        ) : (
          <div>
            <button type="button" className="btn btn--secondary" onClick={() => setAnotando(true)}>
              + Anotarme una tarea
            </button>
          </div>
        ))}

      {verResumen && (
        <div className="tareas-persona">
          <label className="tareas-persona__filtro">
            <span className="field-label">Persona</span>
            <select className="input" value={persona ? persona.id : ''} onChange={(e) => elegirPersona(e.target.value)}>
              <option value="">Todas las personas</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || 'Sin nombre'}
                </option>
              ))}
            </select>
          </label>
          {personaId && !persona && destinatarios.length > 0 && (
            <p className="form-error">Esa persona ya no recibe tareas. <button type="button" className="btn btn--ghost btn--small" onClick={() => elegirPersona('')}>Ver todas</button></p>
          )}
          {resumenX && (
            <div className="tareas-persona__resumen" aria-label={`Resumen de ${persona.nombre}`}>
              <div><strong>{resumenX.hechas}</strong> Hechas</div>
              <div><strong>{resumenX.pendientes}</strong> Pendientes</div>
              <div className={resumenX.vencidas ? 'tareas-persona__vencidas' : ''}><strong>{resumenX.vencidas}</strong> Vencidas</div>
            </div>
          )}
          {tablaPersonas && tablaPersonas.length > 0 && (
            <div className="table-scroll">
              <table className="stats-table tareas-persona__tabla">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Hechas</th>
                    <th>Pendientes</th>
                    <th>Vencidas</th>
                  </tr>
                </thead>
                <tbody>
                  {tablaPersonas.map((r) => (
                    <tr key={r.persona.id} onClick={() => elegirPersona(r.persona.id)} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), elegirPersona(r.persona.id))} title={`Ver las tareas de ${r.persona.nombre || 'esta persona'}`}>
                      <td>{r.persona.nombre || 'Sin nombre'}</td>
                      <td>{r.hechas}</td>
                      <td>{r.pendientes}</td>
                      <td className={r.vencidas ? 'tareas-persona__vencidas' : ''}>{r.vencidas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="notas-filtros">
        <div className="notas-filtros__grupo">
          <button type="button" className={'chip' + (vista === 'pendientes' ? ' chip--active' : '')} onClick={() => setVista('pendientes')}>
            Pendientes ({pendientes.length})
          </button>
          <button type="button" className={'chip' + (vista === 'hechas' ? ' chip--active' : '')} onClick={() => setVista('hechas')}>
            Hechas ({hechas.length})
          </button>
        </div>
      </div>

      {actionError && <p className="form-error">{actionError.message}</p>}

      {visibles.length === 0 ? (
        <EmptyState>
          {vista === 'pendientes'
            ? enAsignadas
              ? persona
                ? `${persona.nombre || 'Esta persona'} no tiene tareas pendientes.`
                : 'No hay tareas asignadas pendientes.'
              : 'No tienes tareas pendientes. 🎉'
            : 'Todavía no hay tareas hechas.'}
        </EmptyState>
      ) : (
        <div className="notas-lista">
          {visibles.map((f) => (
            <TareaCard
              key={f.t.id}
              fila={f}
              hoy={hoy}
              userId={userId}
              puedeAsignar={enAsignadas}
              persona={enAsignadas ? persona : null}
              personas={personas}
              ocupada={ocupada === f.t.id}
              onMarcar={(hecha) => accion(f.t.id, () => marcarTarea(f.t.id, hecha))}
              onQuitar={() => quitar(f.t)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TareaCard({ fila, hoy, userId, puedeAsignar, persona, personas, ocupada, onMarcar, onQuitar }) {
  const { t, general, mio, toca, hecha } = fila
  const venc = vencida(t, hecha, hoy)
  return (
    <article className={'nota-card tarea-card' + (hecha ? ' tarea-card--hecha' : '') + (venc ? ' tarea-card--vencida' : '')}>
      <div className="nota-card__top">
        <span className={'badge nota-tipo ' + (t.destino_tipo === 'persona' ? 'nota-tipo--persona' : 'nota-tipo--todos')}>
          {textoDestino(t, { userId, roleLabels: ROLES_TAREAS })}
        </span>
        {t.destino_tipo !== 'persona' && (
          <span className="badge nota-tipo nota-tipo--otro">{t.modo === 'uno' ? 'Basta con que uno la haga' : 'Cada quien la hace'}</span>
        )}
        {t.fecha_limite && (
          <span className={'tarea-fecha' + (venc ? ' tarea-fecha--vencida' : '')}>
            {venc ? 'Venció el ' : 'Para el '}
            {formatDate(t.fecha_limite, "EEEE d 'de' MMMM")}
          </span>
        )}
      </div>
      <h3 className="tarea-card__titulo">{t.titulo}</h3>
      {t.descripcion && <p className="nota-card__texto">{t.descripcion}</p>}
      <p className="nota-card__meta">
        {!t.propia
          ? `Asignada por ${t.creado_por_nombre || 'Administración'}`
          : t.creado_por === userId
            ? 'Anotada por ti · solo la ven tú y el administrador'
            : `Se la anotó ${t.creado_por_nombre || 'la persona'} · solo la ven esa persona y tú`}{' '}
        · {formatDateTime(t.creado_en)}
      </p>

      {toca && mio && (
        <div className="tarea-card__accion">
          {mio.mia ? (
            <>
              <span className="nota-card__resuelta">✓ La hiciste · {formatDateTime(mio.mia.completada_en)}</span>
              <button type="button" className="btn btn--ghost btn--small" disabled={ocupada} onClick={() => onMarcar(false)}>
                Deshacer
              </button>
            </>
          ) : mio.porOtro ? (
            <span className="nota-card__resuelta">
              ✓ La hizo {mio.porOtro.nombre || 'alguien más'} · {formatDateTime(mio.porOtro.completada_en)}
            </span>
          ) : (
            <button type="button" className="btn btn--primary" disabled={ocupada} onClick={() => onMarcar(true)}>
              {ocupada ? 'Guardando…' : '✓ Marcar como hecha'}
            </button>
          )}
        </div>
      )}

      {puedeAsignar && general && <Avance tarea={t} general={general} persona={persona} personas={personas} />}
      {(puedeAsignar || (t.propia && t.creado_por === userId)) && (
        <div>
          <button type="button" className="btn btn--ghost btn--small" disabled={ocupada} onClick={onQuitar}>
            Quitar tarea
          </button>
        </div>
      )}
    </article>
  )
}

// Para quien asigna: quién ya la hizo y quién falta.
function Avance({ tarea, general, persona, personas = [] }) {
  const nombres = (l) => l.map((x) => x.nombre || 'Sin nombre').join(', ')
  // Con persona elegida, en "cada quien" para varios: cómo va ella y cuántos ya.
  if (persona && tarea.modo !== 'uno' && tarea.destino_tipo !== 'persona') {
    const suya = general.hechos.find((c) => c.usuario_id === persona.id)
    // Misma regla que el filtro: en "todo el personal" no cuenta quien entró después.
    const ya = new Set(general.hechos.map((c) => c.usuario_id))
    const aplican = personas.filter((p) => leAplica(tarea, p) || ya.has(p.id))
    const hicieron = aplican.filter((p) => ya.has(p.id))
    const faltan = aplican.filter((p) => !ya.has(p.id))
    return (
      <div className="nota-leido">
        <div className={suya ? 'nota-leido--ok' : ''}>
          {suya ? `✓ ${persona.nombre || 'La persona'} la hizo · ${formatDateTime(suya.completada_en)}` : `${persona.nombre || 'La persona'} aún no la hace`}
        </div>
        {aplican.length > 1 && (
          <>
            <strong>
              {hicieron.length} de {aplican.length} ya la hicieron
            </strong>
            {faltan.length > 0 && <div>Faltan: {nombres(faltan)}</div>}
          </>
        )}
      </div>
    )
  }
  if (tarea.modo === 'uno') {
    const c = general.hechos[0]
    return (
      <p className={'nota-leido' + (c ? ' nota-leido--ok' : '')}>
        {c ? `✓ La hizo ${c.nombre || 'alguien'} · ${formatDateTime(c.completada_en)}` : 'Nadie la ha hecho todavía'}
      </p>
    )
  }
  if (tarea.destino_tipo === 'persona') {
    const c = general.hechos[0]
    return (
      <p className={'nota-leido' + (c ? ' nota-leido--ok' : '')}>
        {c ? `✓ La hizo · ${formatDateTime(c.completada_en)}` : `${tarea.destino_nombre || 'La persona'} aún no la hace`}
      </p>
    )
  }
  return (
    <div className="nota-leido">
      <strong>
        {general.hechos.length} de {general.total} la hicieron
      </strong>
      {general.hechos.length > 0 && <div className="nota-leido--ok">✓ {nombres(general.hechos)}</div>}
      {general.faltan.length > 0 && <div>Faltan: {nombres(general.faltan)}</div>}
      {general.total === 0 && <div>Nadie tiene ese rol todavía.</div>}
    </div>
  )
}

// V171 — tarea para uno mismo.
function TareaPropiaForm({ onCreated, onCancelar }) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!titulo.trim()) {
      setError(new Error('Escribe la tarea.'))
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await crearTareaPropia({ titulo: titulo.trim(), descripcion: descripcion.trim(), fechaLimite: fecha })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    onCreated?.()
  }

  return (
    <form className="nota-form" onSubmit={handleSubmit}>
      <label>
        Tarea *
        <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Llamar al proveedor de hilos" autoFocus />
      </label>
      <label>
        Detalles (opcional)
        <textarea className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <label>
        Fecha límite (opcional)
        <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <p className="nota-card__meta">Solo la ven tú y el administrador.</p>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Agregar tarea'}
        </button>
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function TareaForm({ destinatarios, onCreated }) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [para, setPara] = useState('todos') // todos | rol:<rol> | persona:<id>
  const [modo, setModo] = useState('cada_quien')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const roles = useMemo(() => [...new Set(destinatarios.map((d) => d.rol))].sort(), [destinatarios])
  const esPersona = para.startsWith('persona:')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!titulo.trim()) {
      setError(new Error('Escribe la tarea.'))
      return
    }
    const destino = para === 'todos'
      ? { tipo: 'todos' }
      : para.startsWith('rol:')
        ? { tipo: 'rol', rol: para.slice(4) }
        : { tipo: 'persona', personaId: para.slice(8) }
    setSaving(true)
    setError(null)
    const { error: err } = await crearTarea({ titulo: titulo.trim(), descripcion: descripcion.trim(), destino, modo, fechaLimite: fecha })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setTitulo('')
    setDescripcion('')
    setFecha('')
    onCreated?.()
  }

  return (
    <form className="nota-form" onSubmit={handleSubmit}>
      <label>
        Tarea *
        <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Acomodar el aparador de playeras" />
      </label>
      <label>
        Detalles (opcional)
        <textarea className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Instrucciones, dónde está, a quién preguntar…" />
      </label>
      <div className="tarea-form__fila">
        <label>
          Para
          <select className="input" value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="todos">Todo el personal</option>
            {roles.length > 0 && (
              <optgroup label="Por rol">
                {roles.map((r) => (
                  <option key={r} value={`rol:${r}`}>
                    {nombreRol(r)}
                  </option>
                ))}
              </optgroup>
            )}
            {destinatarios.length > 0 && (
              <optgroup label="Una persona">
                {destinatarios.map((d) => (
                  <option key={d.id} value={`persona:${d.id}`}>
                    {d.nombre || 'Sin nombre'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          Fecha límite (opcional)
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>
      {!esPersona && (
        <div>
          <span className="field-label">¿Cómo se completa?</span>
          <div className="notas-filtros__grupo">
            <button type="button" className={'chip' + (modo === 'cada_quien' ? ' chip--active' : '')} onClick={() => setModo('cada_quien')}>
              Cada quien la hace
            </button>
            <button type="button" className={'chip' + (modo === 'uno' ? ' chip--active' : '')} onClick={() => setModo('uno')}>
              Basta con que uno la haga
            </button>
          </div>
        </div>
      )}
      {error && <p className="form-error">{error.message}</p>}
      <div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Asignar tarea'}
        </button>
      </div>
    </form>
  )
}
