import { useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import {
  canViewNotasTienda,
  canEscribirNotasTienda,
  canResolverNotasTienda,
  canViewNotasPersonal,
  canEnteradoNotasPersonal,
  canEscribirNotasPersonal,
  canViewSeccionNotas,
} from '../utils/permissions'
import { fetchNotasPersonal } from '../services/notasPersonalService'
import NotasParaPersonal from '../components/notas/NotasParaPersonal'
import {
  TIPOS_NOTA,
  etiquetaTipo,
  fetchNotasTienda,
  crearNotaTienda,
  resolverNotaTienda,
  uploadNotaFoto,
} from '../services/notasTiendaService'
import { formatDateTime } from '../utils/dates'

// V158 — Notas de tienda: producto faltante, notas del día, errores, otros.
// Escribe el personal de tienda; admin de tienda / admin general las marcan
// como resueltas (se ocultan de "Pendientes" pero quedan en "Resueltas").
// V163 — dos pestañas: "Del personal" (V158) y "Para el personal" (notas de
// los administrativos al personal, con "Enterado").
export default function NotasTiendaPage() {
  return (
    <RequireRole allow={canViewSeccionNotas}>
      <NotasTiendaContent />
    </RequireRole>
  )
}

function NotasTiendaContent() {
  const { role, user } = useAuth()
  const verDel = canViewNotasTienda(role)
  const verPara = canViewNotasPersonal(role)
  const puedeEnterado = canEnteradoNotasPersonal(role)
  const escribePara = canEscribirNotasPersonal(role)
  const userId = user?.id

  // Las notas "Para el personal" se cargan aquí para mostrar cuántas faltan
  // por marcar "Enterado" en la pestaña y abrir ahí si hay pendientes.
  const [para, setPara] = useState({ datos: null, loading: verPara, error: null })
  const cargarPara = useCallback(async () => {
    if (!verPara) return
    setPara((p) => ({ ...p, loading: true, error: null }))
    const { data, error } = await fetchNotasPersonal()
    setPara({ datos: data, loading: false, error })
  }, [verPara])
  useEffect(() => {
    cargarPara()
  }, [cargarPara])

  const sinLeer = useMemo(() => {
    if (!puedeEnterado || !para.datos) return 0
    const mias = new Set(para.datos.enterados.filter((e) => e.usuario_id === userId).map((e) => e.nota_id))
    return para.datos.notas.filter((n) => !mias.has(n.id)).length
  }, [para.datos, puedeEnterado, userId])

  const [pestana, setPestana] = useState(null) // del | para
  useEffect(() => {
    if (pestana) return
    if (!verDel) setPestana('para')
    else if (!verPara) setPestana('del')
    else if (!para.loading) setPestana(sinLeer > 0 ? 'para' : 'del')
  }, [pestana, verDel, verPara, para.loading, sinLeer])

  return (
    <div className="page page--narrow">
      <div className="section-header">
        <h2 className="section-title">Notas de tienda</h2>
      </div>

      {verDel && verPara && (
        <div className="notas-pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={pestana === 'del'} className={'notas-pestana' + (pestana === 'del' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('del')}>
            Del personal
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'para'} className={'notas-pestana' + (pestana === 'para' ? ' notas-pestana--activa' : '')} onClick={() => setPestana('para')}>
            Para el personal
            {sinLeer > 0 && <span className="notas-pestana__contador">{sinLeer}</span>}
          </button>
        </div>
      )}

      {pestana === null ? (
        <Loading label="Cargando notas…" />
      ) : pestana === 'para' ? (
        <NotasParaPersonal
          userId={userId}
          puedeEscribir={escribePara}
          puedeEnterado={puedeEnterado}
          datos={para.datos}
          loading={para.loading}
          error={para.error}
          onRecargar={cargarPara}
          onCambio={cargarPara}
        />
      ) : (
        <NotasDelPersonal role={role} />
      )}
    </div>
  )
}

function NotasDelPersonal({ role }) {
  const puedeEscribir = canEscribirNotasTienda(role)
  const puedeResolver = canResolverNotasTienda(role)

  const [vista, setVista] = useState('pendientes') // pendientes | resueltas
  const [filtroTipo, setFiltroTipo] = useState('')
  const [notas, setNotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [ocupada, setOcupada] = useState(null) // id de la nota que se está resolviendo

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await fetchNotasTienda({ resueltas: vista === 'resueltas' })
    if (err) setError(err)
    else setNotas(data || [])
    setLoading(false)
  }, [vista])

  useEffect(() => {
    cargar()
  }, [cargar])

  const conteo = useMemo(() => {
    const c = {}
    notas.forEach((n) => (c[n.tipo] = (c[n.tipo] || 0) + 1))
    return c
  }, [notas])

  const visibles = useMemo(() => (filtroTipo ? notas.filter((n) => n.tipo === filtroTipo) : notas), [notas, filtroTipo])

  async function cambiarResuelta(nota, resuelta) {
    setActionError(null)
    setOcupada(nota.id)
    const { error: err } = await resolverNotaTienda(nota.id, resuelta)
    setOcupada(null)
    if (err) {
      setActionError(err)
      return
    }
    // Sale de la vista actual (pendientes ↔ resueltas).
    setNotas((ns) => ns.filter((n) => n.id !== nota.id))
  }

  return (
    <>
      {puedeEscribir && <NotaForm onCreated={() => (vista === 'pendientes' ? cargar() : setVista('pendientes'))} />}

      <div className="notas-filtros">
        <div className="notas-filtros__grupo">
          <button type="button" className={'chip' + (vista === 'pendientes' ? ' chip--active' : '')} onClick={() => setVista('pendientes')}>
            Pendientes
          </button>
          <button type="button" className={'chip' + (vista === 'resueltas' ? ' chip--active' : '')} onClick={() => setVista('resueltas')}>
            Resueltas
          </button>
        </div>
        <div className="notas-filtros__grupo">
          <button type="button" className={'chip' + (!filtroTipo ? ' chip--active' : '')} onClick={() => setFiltroTipo('')}>
            Todas{!loading ? ` (${notas.length})` : ''}
          </button>
          {TIPOS_NOTA.map((t) => (
            <button
              key={t.key}
              type="button"
              className={'chip' + (filtroTipo === t.key ? ' chip--active' : '')}
              onClick={() => setFiltroTipo(t.key)}
            >
              {t.label}
              {!loading && conteo[t.key] ? ` (${conteo[t.key]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {actionError && <p className="form-error">{actionError.message}</p>}

      {loading ? (
        <Loading label="Cargando notas…" />
      ) : error ? (
        <ErrorState error={error} onRetry={cargar} />
      ) : visibles.length === 0 ? (
        <EmptyState>
          {vista === 'pendientes' ? 'No hay notas pendientes.' : 'Todavía no hay notas resueltas.'}
        </EmptyState>
      ) : (
        <div className="notas-lista">
          {visibles.map((n) => (
            <NotaCard
              key={n.id}
              nota={n}
              puedeResolver={puedeResolver}
              ocupada={ocupada === n.id}
              onResolver={() => cambiarResuelta(n, true)}
              onReabrir={() => cambiarResuelta(n, false)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function NotaForm({ onCreated }) {
  const [tipo, setTipo] = useState('faltante')
  const [texto, setTexto] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!texto.trim()) {
      setError(new Error('Escribe la nota.'))
      return
    }
    setSaving(true)
    setError(null)
    let foto = null
    if (file) {
      const { data, error: upErr } = await uploadNotaFoto(file)
      if (upErr) {
        setSaving(false)
        setError(upErr)
        return
      }
      foto = data
    }
    const { error: err } = await crearNotaTienda({ tipo, texto: texto.trim(), foto })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setTexto('')
    setFile(null)
    onCreated?.()
  }

  const placeholder = TIPOS_NOTA.find((t) => t.key === tipo)?.placeholder

  return (
    <form className="nota-form" onSubmit={handleSubmit}>
      <span className="field-label">Tipo de nota</span>
      <div className="notas-filtros__grupo">
        {TIPOS_NOTA.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'chip' + (tipo === t.key ? ' chip--active' : '')}
            onClick={() => setTipo(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label>
        Nota *
        <textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} />
      </label>
      <div className="nota-form__foto">
        {preview ? (
          <>
            <img src={preview} alt="Foto de la nota" />
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setFile(null)}>
              Quitar foto
            </button>
          </>
        ) : (
          <label className="btn btn--ghost btn--small">
            + Agregar foto (opcional)
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar nota'}
        </button>
      </div>
    </form>
  )
}

function NotaCard({ nota, puedeResolver, ocupada, onResolver, onReabrir }) {
  const resuelta = !!nota.resuelta_en
  return (
    <article className={'nota-card nota-card--' + nota.tipo + (resuelta ? ' nota-card--resuelta' : '')}>
      <div className="nota-card__top">
        <span className={'badge nota-tipo nota-tipo--' + nota.tipo}>{etiquetaTipo(nota.tipo)}</span>
        <span className="nota-card__meta">
          {nota.creado_por_nombre || 'Alguien'} · {formatDateTime(nota.creado_en)}
        </span>
      </div>
      <p className="nota-card__texto">{nota.texto}</p>
      {nota.foto_url && (
        <a href={nota.foto_url} target="_blank" rel="noreferrer" className="nota-card__foto">
          <img src={nota.foto_url} alt="Foto de la nota" loading="lazy" />
        </a>
      )}
      {resuelta && (
        <p className="nota-card__resuelta">
          ✓ Resuelta{nota.resuelta_por_nombre ? ` por ${nota.resuelta_por_nombre}` : ''} · {formatDateTime(nota.resuelta_en)}
        </p>
      )}
      {puedeResolver && (
        <div>
          {resuelta ? (
            <button type="button" className="btn btn--ghost btn--small" disabled={ocupada} onClick={onReabrir}>
              Volver a abrir
            </button>
          ) : (
            <button type="button" className="btn btn--secondary btn--small" disabled={ocupada} onClick={onResolver}>
              {ocupada ? 'Guardando…' : '✓ Marcar resuelta'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}
