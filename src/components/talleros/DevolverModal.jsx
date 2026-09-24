import { useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../../contexts/AuthContext'
import { devolverTallero, ESTADOS_CONTENIDO } from '../../services/tallerosService'

// V63 — al devolver también se puede corregir si regresó completo o con
// tallas faltantes (pasa seguido).
export default function DevolverModal({ tallero, talleros, onClose, onDone }) {
  const { profile } = useAuth()
  const prestados = (talleros || []).filter((t) => t.estado_uso === 'prestado')
  const [id, setId] = useState(tallero?.id || '')
  const actual = tallero || prestados.find((t) => t.id === id)
  const [equipo, setEquipo] = useState(profile?.full_name || '')
  const [externa, setExterna] = useState(tallero?.prestado_a || '')
  const [notas, setNotas] = useState('')
  const [contenido, setContenido] = useState(tallero?.estado_contenido || 'completo')
  const [faltantes, setFaltantes] = useState(tallero?.tallas_faltantes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function pick(nextId) {
    setId(nextId)
    const t = prestados.find((x) => x.id === nextId)
    if (t) {
      setExterna(t.prestado_a || '')
      setContenido(t.estado_contenido)
      setFaltantes(t.tallas_faltantes || '')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await devolverTallero({
      id,
      personaExterna: externa.trim(),
      personaEquipo: equipo.trim(),
      notas: notas.trim(),
      estadoContenido: contenido,
      tallasFaltantes: contenido === 'incompleto' ? faltantes.trim() : '',
    })
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title="Devolver tallero" onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        {tallero ? (
          <p>
            <b>{tallero.codigo}</b> · {tallero.mt_productos?.nombre} {tallero.color || ''}
            {tallero.tallas_prestadas ? ` — parcial: ${tallero.tallas_prestadas}` : ''}
          </p>
        ) : (
          <label>
            Tallero *
            <select className="input" value={id} onChange={(e) => pick(e.target.value)}>
              <option value="">Selecciona…</option>
              {prestados.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.mt_productos?.nombre} {t.color || ''} (con {t.prestado_a}{t.tallas_prestadas ? `, parcial: ${t.tallas_prestadas}` : ''})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-row">
          <label>
            Lo devuelve
            <input type="text" className="input" value={externa} onChange={(e) => setExterna(e.target.value)} />
          </label>
          <label>
            Lo recibe *
            <input type="text" className="input" value={equipo} onChange={(e) => setEquipo(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            ¿Regresó completo?
            <select className="input" value={contenido} onChange={(e) => setContenido(e.target.value)}>
              {ESTADOS_CONTENIDO.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {contenido === 'incompleto' && (
            <label>
              Tallas faltantes
              <input type="text" className="input" value={faltantes} onChange={(e) => setFaltantes(e.target.value)} placeholder="Ej. 2XL, 3XL" />
            </label>
          )}
        </div>
        <label>
          Notas
          <input type="text" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </label>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !actual || !equipo.trim()}>
            {saving ? 'Guardando…' : 'Registrar devolución'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
