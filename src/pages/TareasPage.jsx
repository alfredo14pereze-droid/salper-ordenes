import { useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canViewTareas, canCompletarTareas, canAsignarTareas, ROLE_LABELS } from '../utils/permissions'
import { fetchTareas, fetchDestinatariosTareas, crearTarea, marcarTarea, quitarTarea } from '../services/tareasService'
import { estadoGeneral, estadoParaMi, hoyLocal, meToca, ordenarTareas, textoDestino, vencida } from '../utils/tareas'
import { formatDate, formatDateTime } from '../utils/dates'

// Nombres cortos de los roles que reciben tareas ("Tienda", no "Tienda (básico)").
const ROL_CORTO = { tienda: 'Tienda', ventas: 'Ventas', contabilidad: 'Contabilidad' }
const nombreRol = (r) => ROL_CORTO[r] || ROLE_LABELS[r] || r
const ROLES_TAREAS = { ...ROLE_LABELS, ...ROL_CORTO }

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
  const seccion = seccionElegida ?? (misPendientes > 0 ? 'mis' : 'asignadas')
  const enAsignadas = puedeAsignar && seccion === 'asignadas'
  const asignadas = filas.map((f) => ({ ...f, hecha: f.hechaGeneral }))
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
              ? 'No hay tareas asignadas pendientes.'
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

function TareaCard({ fila, hoy, userId, puedeAsignar, ocupada, onMarcar, onQuitar }) {
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
        Asignada por {t.creado_por_nombre || 'Administración'} · {formatDateTime(t.creado_en)}
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

      {puedeAsignar && general && <Avance tarea={t} general={general} />}
      {puedeAsignar && (
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
function Avance({ tarea, general }) {
  const nombres = (l) => l.map((x) => x.nombre || 'Sin nombre').join(', ')
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
