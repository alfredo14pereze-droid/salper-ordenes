import { useState } from 'react'
import Modal from '../talleros/Modal'
import { marcarEntregado } from '../../services/pendientesService'

// V94 — confirmación simple antes de marcar un pendiente de cliente como
// entregado. Nada obligatorio además de confirmar; "¿Quién recogió?" es
// texto libre opcional.
export default function EntregarModal({ pendiente, onClose, onDone }) {
  const [recogio, setRecogio] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const { error: err } = await marcarEntregado(pendiente.id, recogio)
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title={`Marcar como entregado · ${pendiente.folio}`} onClose={onClose}>
      <div className="order-form">
        <p className="pantone-hint">
          {pendiente.cliente_nombre} · {pendiente.cliente_telefono}
        </p>
        <label>
          ¿Quién recogió? <span className="pantone-hint">(opcional)</span>
          <input type="text" className="input" value={recogio} onChange={(e) => setRecogio(e.target.value)} autoFocus />
        </label>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Guardando…' : 'Confirmar entrega'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
