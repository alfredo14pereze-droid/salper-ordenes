import { useEffect, useMemo, useState } from 'react'
import { Loading, ErrorState, EmptyState } from '../common/States'
import { formatDateTime } from '../../utils/dates'
import { uploadNotaFoto } from '../../services/notasTiendaService'
import { fetchDestinatarios, crearNotaPersonal, marcarEnterado, quitarNotaPersonal } from '../../services/notasPersonalService'

// V163 — pestaña "Para el personal" de Notas de tienda. Los datos (notas y
// "Enterado") los carga NotasTiendaPage para poder mostrar el contador de
// pendientes en la pestaña; aquí solo se pintan y se actúa.
export default function NotasParaPersonal({ userId, puedeEscribir, puedeEnterado, datos, loading, error, onRecargar, onCambio }) {
  const [destinatarios, setDestinatarios] = useState([])
  const [actionError, setActionError] = useState(null)
  const [ocupada, setOcupada] = useState(null)

  useEffect(() => {
    if (!puedeEscribir) return
    fetchDestinatarios().then(({ data }) => setDestinatarios(data || []))
  }, [puedeEscribir])

  const enteradosPorNota = useMemo(() => {
    const m = new Map()
    for (const e of datos?.enterados || []) {
      if (!m.has(e.nota_id)) m.set(e.nota_id, [])
      m.get(e.nota_id).push(e)
    }
    return m
  }, [datos])

  // Para el personal: primero las que aún no marcan "Enterado".
  const notas = useMemo(() => {
    const ns = datos?.notas || []
    if (!puedeEnterado) return ns
    const leida = (n) => (enteradosPorNota.get(n.id) || []).some((e) => e.usuario_id === userId)
    return [...ns].sort((a, b) => Number(leida(a)) - Number(leida(b)))
  }, [datos, puedeEnterado, enteradosPorNota, userId])

  async function accion(id, fn) {
    setActionError(null)
    setOcupada(id)
    const { error: err } = await fn()
    setOcupada(null)
    if (err) setActionError(err)
    else onCambio?.()
  }

  function quitar(n) {
    if (!window.confirm('¿Quitar esta nota? Ya no la verá nadie.')) return
    accion(n.id, () => quitarNotaPersonal(n.id))
  }

  return (
    <>
      {puedeEscribir && <NotaPersonalForm destinatarios={destinatarios} onCreated={onCambio} />}

      {actionError && <p className="form-error">{actionError.message}</p>}

      {loading ? (
        <Loading label="Cargando notas…" />
      ) : error ? (
        <ErrorState error={error} onRetry={onRecargar} />
      ) : notas.length === 0 ? (
        <EmptyState>{puedeEscribir ? 'Todavía no le has dejado notas al personal.' : 'No tienes notas.'}</EmptyState>
      ) : (
        <div className="notas-lista">
          {notas.map((n) => {
            const enterados = enteradosPorNota.get(n.id) || []
            const mio = enterados.find((e) => e.usuario_id === userId)
            return (
              <article key={n.id} className={'nota-card nota-card--personal' + (puedeEnterado && !mio ? ' nota-card--sin-leer' : '')}>
                <div className="nota-card__top">
                  <span className={'badge nota-tipo ' + (n.para_id ? 'nota-tipo--persona' : 'nota-tipo--todos')}>
                    {n.para_id ? (n.para_id === userId ? 'Para ti' : `Para ${n.para_nombre || 'una persona'}`) : 'Para todo el personal'}
                  </span>
                  <span className="nota-card__meta">
                    {n.creado_por_nombre || 'Administración'} · {formatDateTime(n.creado_en)}
                  </span>
                </div>
                <p className="nota-card__texto">{n.texto}</p>
                {n.foto_url && (
                  <a href={n.foto_url} target="_blank" rel="noreferrer" className="nota-card__foto">
                    <img src={n.foto_url} alt="Foto de la nota" loading="lazy" />
                  </a>
                )}

                {puedeEnterado &&
                  (mio ? (
                    <p className="nota-card__resuelta">✓ Enterado · {formatDateTime(mio.enterado_en)}</p>
                  ) : (
                    <div>
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        disabled={ocupada === n.id}
                        onClick={() => accion(n.id, () => marcarEnterado(n.id))}
                      >
                        {ocupada === n.id ? 'Guardando…' : '✓ Enterado'}
                      </button>
                    </div>
                  ))}

                {puedeEscribir && (
                  <QuienLeyo nota={n} enterados={enterados} destinatarios={destinatarios} />
                )}
                {puedeEscribir && (
                  <div>
                    <button type="button" className="btn btn--ghost btn--small" disabled={ocupada === n.id} onClick={() => quitar(n)}>
                      Quitar nota
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

// Para quien escribe: quién ya marcó "Enterado" y quién falta.
function QuienLeyo({ nota, enterados, destinatarios }) {
  const leyeron = new Set(enterados.map((e) => e.usuario_id))
  if (nota.para_id) {
    const e = enterados.find((x) => x.usuario_id === nota.para_id)
    return (
      <p className={'nota-leido' + (e ? ' nota-leido--ok' : '')}>
        {e ? `✓ ${nota.para_nombre || 'La persona'} la leyó · ${formatDateTime(e.enterado_en)}` : `${nota.para_nombre || 'La persona'} aún no la lee`}
      </p>
    )
  }
  const faltan = destinatarios.filter((d) => !leyeron.has(d.id))
  const total = destinatarios.length
  return (
    <div className="nota-leido">
      <strong>
        {enterados.length} de {total || enterados.length} ya la leyeron
      </strong>
      {enterados.length > 0 && <div className="nota-leido--ok">✓ {enterados.map((e) => e.nombre || 'Alguien').join(', ')}</div>}
      {faltan.length > 0 && <div>Faltan: {faltan.map((d) => d.nombre || 'Sin nombre').join(', ')}</div>}
    </div>
  )
}

function NotaPersonalForm({ destinatarios, onCreated }) {
  const [texto, setTexto] = useState('')
  const [paraId, setParaId] = useState('')
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
    const { error: err } = await crearNotaPersonal({ texto: texto.trim(), paraId, foto })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setTexto('')
    setParaId('')
    setFile(null)
    onCreated?.()
  }

  return (
    <form className="nota-form" onSubmit={handleSubmit}>
      <label>
        Para
        <select className="input" value={paraId} onChange={(e) => setParaId(e.target.value)}>
          <option value="">Todo el personal</option>
          {destinatarios.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre || 'Sin nombre'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Nota *
        <textarea
          className="input"
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej. Mañana se abre a las 10. Por favor acomoden el aparador de playeras."
        />
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
          {saving ? 'Guardando…' : 'Enviar nota'}
        </button>
      </div>
    </form>
  )
}
