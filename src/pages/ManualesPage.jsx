import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import MarkdownManual from '../components/manuales/MarkdownManual'
import { useAuth } from '../contexts/AuthContext'
import { canEditarManuales } from '../utils/permissions'
import { buscarManuales, contarPorSeccion, ordenar } from '../utils/manuales'
import { formatDate } from '../utils/dates'
import {
  fetchManuales, guardarSeccion, eliminarSeccion, guardarManual, eliminarManual, moverManual,
} from '../services/manualesService'

// V196 — Manuales: cómo se hace cada proceso. Sección → manual.
// Leer: todos los roles. Editar (crear, cambiar, eliminar, reordenar): man.editar
// (admin_general). Una sola página con 4 vistas según la ruta:
//   /manuales                     inicio (secciones + buscador)
//   /manuales/seccion/:seccionId  manuales de una sección
//   /manuales/ver/:manualId       un manual
//   /manuales/editar/:manualId    editor (y /manuales/nuevo/:seccionId)
export default function ManualesPage({ vista = 'inicio' }) {
  const params = useParams()
  const { role } = useAuth()
  const puedeEditar = canEditarManuales(role)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    const { data, error: err } = await fetchManuales()
    if (err) setError(err)
    else {
      setError(null)
      setDatos(data)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const secciones = useMemo(() => ordenar(datos?.secciones || []), [datos])
  const manuales = useMemo(() => ordenar(datos?.manuales || []), [datos])

  if (error && !datos) return <div className="page page--narrow"><ErrorState error={error} onRetry={cargar} /></div>
  if (!datos) return <Loading label="Cargando manuales…" />

  const comun = { secciones, manuales, puedeEditar, recargar: cargar }
  if (vista === 'seccion') return <VistaSeccion {...comun} seccionId={params.seccionId} />
  if (vista === 'ver') return <VistaManual {...comun} manualId={params.manualId} />
  if (vista === 'editar' || vista === 'nuevo') {
    if (!puedeEditar) return <div className="page page--narrow"><EmptyState>Solo el administrador general edita los manuales.</EmptyState></div>
    return <EditorManual {...comun} manualId={vista === 'editar' ? params.manualId : null} seccionInicial={params.seccionId} />
  }
  return <VistaInicio {...comun} />
}

// ---------------------------------------------------------------------
// Buscador (arriba de todas las vistas de lectura)
// ---------------------------------------------------------------------
function Buscador({ secciones, manuales, texto, setTexto }) {
  const resultados = useMemo(() => buscarManuales(texto, manuales, secciones), [texto, manuales, secciones])
  const hayTexto = texto.trim().length > 0
  return (
    <div className="manuales-buscador">
      <input
        type="search"
        className="input manuales-buscador__input"
        placeholder="Buscar en todos los manuales…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Buscar en los manuales"
      />
      {hayTexto && (
        <div className="manuales-resultados">
          <div className="manuales-resultados__cuenta">
            {resultados.length === 0 ? 'No se encontró nada.' : `${resultados.length} ${resultados.length === 1 ? 'manual' : 'manuales'}`}
          </div>
          {resultados.map((r) => (
            <Link key={r.manual.id} to={`/manuales/ver/${r.manual.id}`} className="manuales-resultado">
              <span className="manuales-resultado__seccion">{r.seccion.icono ? `${r.seccion.icono} ` : ''}{r.seccion.nombre}</span>
              <span className="manuales-resultado__titulo">{r.manual.titulo}</span>
              {r.fragmento && <span className="manuales-resultado__frag">{r.fragmento}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function useBusqueda() {
  // El texto se guarda en sessionStorage para que al regresar de un manual
  // siga la misma búsqueda.
  const [texto, setTextoState] = useState(() => {
    try { return sessionStorage.getItem('manuales.busqueda') || '' } catch { return '' }
  })
  const setTexto = (t) => {
    setTextoState(t)
    try { sessionStorage.setItem('manuales.busqueda', t) } catch { /* sin storage */ }
  }
  return [texto, setTexto]
}

function Flechas({ onMover, primero, ultimo, ocupado }) {
  return (
    <span className="manuales-flechas">
      <button type="button" className="btn btn--ghost btn--small" disabled={primero || ocupado} onClick={() => onMover(-1)} aria-label="Subir">↑</button>
      <button type="button" className="btn btn--ghost btn--small" disabled={ultimo || ocupado} onClick={() => onMover(1)} aria-label="Bajar">↓</button>
    </span>
  )
}

// ---------------------------------------------------------------------
// Inicio: tarjetas por sección
// ---------------------------------------------------------------------
function VistaInicio({ secciones, manuales, puedeEditar, recargar }) {
  const [texto, setTexto] = useBusqueda()
  const conteo = useMemo(() => contarPorSeccion(manuales), [manuales])
  const [editando, setEditando] = useState(null) // null | 'nueva' | seccion
  const [ocupado, setOcupado] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)

  async function mover(s, dir) {
    setOcupado(true)
    setErrorAccion(null)
    const { error } = await moverManual('seccion', s.id, dir)
    if (error) setErrorAccion(error.message)
    await recargar()
    setOcupado(false)
  }

  async function eliminar(s) {
    if (!window.confirm(`¿Eliminar la sección "${s.nombre}"?`)) return
    setOcupado(true)
    setErrorAccion(null)
    const { error } = await eliminarSeccion(s.id)
    if (error) setErrorAccion(error.message)
    await recargar()
    setOcupado(false)
  }

  return (
    <div className="page page--narrow manuales">
      <div className="section-header">
        <h2 className="section-title">Manuales</h2>
        {puedeEditar && !editando && (
          <button type="button" className="btn btn--primary btn--small" onClick={() => setEditando('nueva')}>+ Nueva sección</button>
        )}
      </div>
      <p className="manuales-intro">Cómo se hace cada proceso, paso a paso.</p>

      <Buscador secciones={secciones} manuales={manuales} texto={texto} setTexto={setTexto} />

      {errorAccion && <div className="form-error">{errorAccion}</div>}

      {editando && (
        <FormSeccion
          seccion={editando === 'nueva' ? null : editando}
          onCancelar={() => setEditando(null)}
          onGuardada={async () => { setEditando(null); await recargar() }}
        />
      )}

      {!texto.trim() && (
        secciones.length === 0 ? (
          <EmptyState>Todavía no hay manuales.</EmptyState>
        ) : (
          <div className="manuales-secciones">
            {secciones.map((s, i) => {
              const n = conteo.get(s.id) || 0
              return (
                <div key={s.id} className="manuales-seccion-card">
                  <Link to={`/manuales/seccion/${s.id}`} className="manuales-seccion-card__link">
                    <span className="manuales-seccion-card__icono" aria-hidden="true">{s.icono || '📘'}</span>
                    <span className="manuales-seccion-card__texto">
                      <span className="manuales-seccion-card__nombre">{s.nombre}</span>
                      {s.descripcion && <span className="manuales-seccion-card__desc">{s.descripcion}</span>}
                      <span className="manuales-seccion-card__conteo">{n} {n === 1 ? 'manual' : 'manuales'}</span>
                    </span>
                  </Link>
                  {puedeEditar && (
                    <div className="manuales-admin-barra">
                      <Flechas onMover={(d) => mover(s, d)} primero={i === 0} ultimo={i === secciones.length - 1} ocupado={ocupado} />
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(s)}>Editar</button>
                      <button type="button" className="btn btn--ghost btn--small manuales-btn-peligro" disabled={ocupado} onClick={() => eliminar(s)}>Eliminar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

function FormSeccion({ seccion, onCancelar, onGuardada }) {
  const [nombre, setNombre] = useState(seccion?.nombre || '')
  const [descripcion, setDescripcion] = useState(seccion?.descripcion || '')
  const [icono, setIcono] = useState(seccion?.icono || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const { error: err } = await guardarSeccion({ id: seccion?.id, nombre, descripcion, icono })
    setGuardando(false)
    if (err) setError(err.message)
    else onGuardada()
  }

  return (
    <form className="card manuales-form" onSubmit={guardar}>
      <h3 className="manuales-form__titulo">{seccion ? 'Editar sección' : 'Nueva sección'}</h3>
      <div className="manuales-form__fila">
        <label className="manuales-form__icono">
          <span className="field-label">Icono</span>
          <input className="input" value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="📦" maxLength={4} />
        </label>
        <label className="manuales-form__nombre">
          <span className="field-label">Nombre</span>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Frisa" autoFocus required />
        </label>
      </div>
      <label>
        <span className="field-label">Descripción (opcional)</span>
        <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="manuales-form__acciones">
        <button type="button" className="btn btn--ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn--primary" disabled={guardando || !nombre.trim()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Sección: lista de manuales
// ---------------------------------------------------------------------
function VistaSeccion({ secciones, manuales, puedeEditar, recargar, seccionId }) {
  const [texto, setTexto] = useBusqueda()
  const seccion = secciones.find((s) => s.id === seccionId)
  const lista = useMemo(() => manuales.filter((m) => m.seccion_id === seccionId), [manuales, seccionId])
  const [ocupado, setOcupado] = useState(false)
  const [errorAccion, setErrorAccion] = useState(null)

  if (!seccion) return <NoExiste que="La sección" />

  async function mover(m, dir) {
    setOcupado(true)
    setErrorAccion(null)
    const { error } = await moverManual('manual', m.id, dir)
    if (error) setErrorAccion(error.message)
    await recargar()
    setOcupado(false)
  }

  return (
    <div className="page page--narrow manuales">
      <Link to="/manuales" className="manuales-regresar">← Manuales</Link>
      <div className="section-header">
        <h2 className="section-title">{seccion.icono ? `${seccion.icono} ` : ''}{seccion.nombre}</h2>
        {puedeEditar && <Link to={`/manuales/nuevo/${seccion.id}`} className="btn btn--primary btn--small">+ Nuevo manual</Link>}
      </div>
      {seccion.descripcion && <p className="manuales-intro">{seccion.descripcion}</p>}

      <Buscador secciones={secciones} manuales={manuales} texto={texto} setTexto={setTexto} />
      {errorAccion && <div className="form-error">{errorAccion}</div>}

      {!texto.trim() && (
        lista.length === 0 ? (
          <EmptyState>Esta sección todavía no tiene manuales.</EmptyState>
        ) : (
          <ol className="manuales-lista">
            {lista.map((m, i) => (
              <li key={m.id} className="manuales-lista__item">
                <Link to={`/manuales/ver/${m.id}`} className="manuales-lista__link">
                  <span className="manuales-lista__num">{i + 1}</span>
                  <span className="manuales-lista__titulo">{m.titulo}</span>
                  <span className="manuales-lista__flecha" aria-hidden="true">›</span>
                </Link>
                {puedeEditar && (
                  <div className="manuales-admin-barra">
                    <Flechas onMover={(d) => mover(m, d)} primero={i === 0} ultimo={i === lista.length - 1} ocupado={ocupado} />
                    <Link to={`/manuales/editar/${m.id}`} className="btn btn--ghost btn--small">Editar</Link>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Un manual
// ---------------------------------------------------------------------
function VistaManual({ secciones, manuales, puedeEditar, recargar, manualId }) {
  const navigate = useNavigate()
  const manual = manuales.find((m) => m.id === manualId)
  const seccion = manual && secciones.find((s) => s.id === manual.seccion_id)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [manualId])

  if (!manual || !seccion) return <NoExiste que="El manual" />

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el manual "${manual.titulo}"?`)) return
    const { error: err } = await eliminarManual(manual.id)
    if (err) return setError(err.message)
    await recargar()
    navigate(`/manuales/seccion/${seccion.id}`, { replace: true })
  }

  return (
    <div className="page page--narrow manuales">
      <Link to={`/manuales/seccion/${seccion.id}`} className="manuales-regresar">← {seccion.nombre}</Link>
      <article className="manual-articulo">
        <h1 className="manual-articulo__titulo">{manual.titulo}</h1>
        <div className="manual-articulo__fecha">Última actualización: {formatDate(manual.actualizado_en)}</div>
        {puedeEditar && (
          <div className="manuales-admin-barra manuales-admin-barra--manual">
            <Link to={`/manuales/editar/${manual.id}`} className="btn btn--secondary btn--small">Editar</Link>
            <button type="button" className="btn btn--ghost btn--small manuales-btn-peligro" onClick={eliminar}>Eliminar</button>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <MarkdownManual texto={manual.contenido} />
      </article>
      <Link to={`/manuales/seccion/${seccion.id}`} className="btn btn--secondary manuales-regresar-abajo">← Regresar a {seccion.nombre}</Link>
    </div>
  )
}

// ---------------------------------------------------------------------
// Editor (solo man.editar)
// ---------------------------------------------------------------------
const AYUDA_MD = [
  ['## Título', 'subtítulo'],
  ['1. Paso', 'pasos numerados'],
  ['- Punto', 'viñetas'],
  ['**texto**', 'negritas'],
  ['> Ojo: …', 'nota en recuadro'],
  ['| A | B |', 'tabla'],
]

function EditorManual({ secciones, manuales, recargar, manualId, seccionInicial }) {
  const navigate = useNavigate()
  const manual = manualId ? manuales.find((m) => m.id === manualId) : null
  const [titulo, setTitulo] = useState(manual?.titulo || '')
  const [contenido, setContenido] = useState(manual?.contenido || '')
  const [seccionId, setSeccionId] = useState(manual?.seccion_id || seccionInicial || secciones[0]?.id || '')
  const [pestana, setPestana] = useState('escribir') // en celular: escribir | vista
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  if (manualId && !manual) return <NoExiste que="El manual" />
  if (!secciones.length) return <div className="page page--narrow"><EmptyState>Primero crea una sección.</EmptyState></div>

  const cambiado = titulo !== (manual?.titulo || '') || contenido !== (manual?.contenido || '') || seccionId !== (manual?.seccion_id || seccionInicial || secciones[0]?.id)
  const volver = manual ? `/manuales/ver/${manual.id}` : `/manuales/seccion/${seccionId}`

  async function guardar() {
    setGuardando(true)
    setError(null)
    const { data, error: err } = await guardarManual({ id: manual?.id, seccionId, titulo, contenido })
    setGuardando(false)
    if (err) return setError(err.message)
    await recargar()
    navigate(`/manuales/ver/${data.id}`, { replace: true })
  }

  function cancelar() {
    if (cambiado && !window.confirm('¿Salir sin guardar los cambios?')) return
    navigate(volver)
  }

  return (
    <div className="page manuales manuales-editor">
      <button type="button" className="manuales-regresar manuales-regresar--btn" onClick={cancelar}>← Regresar</button>
      <h2 className="section-title">{manual ? 'Editar manual' : 'Nuevo manual'}</h2>

      <div className="manuales-editor__datos">
        <label className="manuales-editor__titulo">
          <span className="field-label">Título</span>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Cómo surtir una orden" />
        </label>
        <label>
          <span className="field-label">Sección</span>
          <select className="input" value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
            {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="manuales-editor__pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'escribir'} className={'notas-pestana' + (pestana === 'escribir' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('escribir')}>Escribir</button>
        <button type="button" role="tab" aria-selected={pestana === 'vista'} className={'notas-pestana' + (pestana === 'vista' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('vista')}>Vista previa</button>
      </div>

      <div className={'manuales-editor__lados manuales-editor__lados--' + pestana}>
        <div className="manuales-editor__escribir">
          <textarea
            className="input manuales-editor__texto"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder={'## Antes de empezar\n\nTexto…\n\n## Pasos\n\n1. Primer paso.\n2. Segundo paso.'}
            spellCheck
          />
          <div className="manuales-editor__ayuda">
            {AYUDA_MD.map(([c, d]) => <span key={c}><code>{c}</code> {d}</span>)}
          </div>
        </div>
        <div className="manuales-editor__vista">
          <div className="manuales-editor__vista-etiqueta">Vista previa</div>
          <article className="manual-articulo">
            <h1 className="manual-articulo__titulo">{titulo || 'Sin título'}</h1>
            <MarkdownManual texto={contenido} />
          </article>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      <div className="manuales-form__acciones manuales-editor__acciones">
        <button type="button" className="btn btn--ghost" onClick={cancelar}>Cancelar</button>
        <button type="button" className="btn btn--primary" disabled={guardando || !titulo.trim() || !seccionId} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function NoExiste({ que }) {
  return (
    <div className="page page--narrow manuales">
      <Link to="/manuales" className="manuales-regresar">← Manuales</Link>
      <EmptyState>{`${que} no existe o se eliminó.`}</EmptyState>
    </div>
  )
}
