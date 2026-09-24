import { useEffect, useState } from 'react'
import Modal from './Modal'
import { useAuth } from '../../contexts/AuthContext'
import { prestarTallero, fetchOrdenesParaVincular } from '../../services/tallerosService'

// V63 — quién recibe es TEXTO LIBRE (colegio/cliente), sin catálogo. Si el
// tallero ya viene elegido (desde su detalle o tarjeta) no se muestra el
// selector.
export default function PrestarModal({ tallero, talleros, onClose, onDone }) {
  const { profile } = useAuth()
  const disponibles = (talleros || []).filter((t) => t.estado_uso === 'disponible')
  const [id, setId] = useState(tallero?.id || '')
  const [equipo, setEquipo] = useState(profile?.full_name || '')
  const [externa, setExterna] = useState('')
  const [notas, setNotas] = useState('')
  const [vincular, setVincular] = useState(false)
  const [ordenId, setOrdenId] = useState('')
  const [ordenes, setOrdenes] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!vincular || ordenes.length > 0) return
    fetchOrdenesParaVincular().then(({ data }) => setOrdenes(data || []))
  }, [vincular, ordenes.length])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await prestarTallero({
      id,
      personaEquipo: equipo.trim(),
      personaExterna: externa.trim(),
      ordenId: vincular ? ordenId : null,
      notas: notas.trim(),
    })
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title="Prestar tallero" onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        {tallero ? (
          <p>
            <b>{tallero.codigo}</b> · {tallero.mt_productos?.nombre} {tallero.color || ''}
          </p>
        ) : (
          <label>
            Tallero *
            <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Selecciona…</option>
              {disponibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.codigo} — {t.mt_productos?.nombre} {t.color || ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-row">
          <label>
            Lo presta *
            <input type="text" className="input" value={equipo} onChange={(e) => setEquipo(e.target.value)} />
          </label>
          <label>
            Se lo lleva (colegio o cliente) *
            <input type="text" className="input" value={externa} onChange={(e) => setExterna(e.target.value)} autoFocus />
          </label>
        </div>
        <label>
          Notas
          <input type="text" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={vincular} onChange={(e) => setVincular(e.target.checked)} />
          Vincular a una orden
        </label>
        {vincular && (
          <select className="input" value={ordenId} onChange={(e) => setOrdenId(e.target.value)}>
            <option value="">Selecciona la orden…</option>
            {ordenes.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.order_number} — {o.client_name}
              </option>
            ))}
          </select>
        )}
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !id || !equipo.trim() || !externa.trim()}>
            {saving ? 'Guardando…' : 'Registrar préstamo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
