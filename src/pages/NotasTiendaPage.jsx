import { useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canViewNotasTienda, canEscribirNotasTienda, canResolverNotasTienda } from '../utils/permissions'
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
export default function NotasTiendaPage() {
  return (
    <RequireRole allow={canViewNotasTienda}>
      <NotasTiendaContent />
    </RequireRole>
  )
}

function NotasTiendaContent() {
  const { role } = useAuth()
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
    <div className="page page--narrow">
      <div className="section-header">
        <h2 className="section-title">Notas de tienda</h2>
      </div>

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
    </div>
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
