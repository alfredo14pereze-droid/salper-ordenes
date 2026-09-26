import { useCallback, useEffect, useState } from 'react'
import {
  fetchRazonesSociales,
  guardarRazonSocial,
  REGIMENES_FISCALES,
  USOS_CFDI,
} from '../../services/finanzasService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditRazones } from '../../utils/permissions'

const EMPTY = { id: null, razonSocial: '', rfc: '', regimen: '', cp: '', usoCfdi: '', correo: '', predeterminada: false }

function toForm(r) {
  return {
    id: r.id,
    razonSocial: r.razon_social,
    rfc: r.rfc,
    regimen: r.regimen_fiscal,
    cp: r.cp_fiscal,
    usoCfdi: r.uso_cfdi,
    correo: r.correo_factura || '',
    predeterminada: r.predeterminada,
  }
}

// Razones sociales de un cliente (alta y edición). Se usa en Catálogos (desde
// el cliente) y dentro de la orden (modal, sin salir de ella): `onSaved`
// avisa a quien la monte con la razón social guardada.
export default function RazonesSocialesManager({ clienteId, onSaved, startNew = false }) {
  const { role } = useAuth()
  const canEdit = canEditRazones(role)
  const [razones, setRazones] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(startNew ? EMPTY : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: e } = await fetchRazonesSociales(clienteId)
    if (e) setError(e)
    else setRazones(data || [])
    setLoading(false)
  }, [clienteId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { data, error: saveError } = await guardarRazonSocial({ ...form, clienteId })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setForm(null)
    await load()
    onSaved?.(data)
  }

  async function handleDeactivate(r) {
    if (!window.confirm(`¿Quitar la razón social "${r.razon_social}"? Las órdenes que ya la usan conservan sus datos.`)) return
    const { error: e } = await guardarRazonSocial({ ...toForm(r), clienteId, activa: false })
    if (e) setError(e)
    else await load()
  }

  if (loading) return <p className="page-subtitle">Cargando razones sociales…</p>

  return (
    <div className="razones">
      {razones.length === 0 && !form && <p className="page-subtitle">Este cliente todavía no tiene razones sociales.</p>}
      {razones.map((r) => (
        <div key={r.id} className="razon-row">
          <div>
            <strong>{r.razon_social}</strong> {r.predeterminada && <span className="badge badge--ready">Predeterminada</span>}
            <div className="razon-row__meta">
              {r.rfc} · {r.regimen_fiscal} · CP {r.cp_fiscal} · {r.uso_cfdi}
              {r.correo_factura ? ` · ${r.correo_factura}` : ''}
            </div>
          </div>
          {canEdit && (
            <div className="razon-row__actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setForm(toForm(r))}>
                Editar
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => handleDeactivate(r)}>
                Quitar
              </button>
            </div>
          )}
        </div>
      ))}

      {canEdit && !form && (
        <button type="button" className="btn btn--secondary" onClick={() => setForm(EMPTY)}>
          + Razón social
        </button>
      )}

      {form && (
        <form onSubmit={handleSubmit} className="order-form razon-form">
          <label>
            Razón social * <span className="page-subtitle">(exacta, como aparece en la constancia)</span>
            <input className="input" value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} required autoFocus />
          </label>
          <div className="form-row">
            <label>
              RFC *
              <input className="input" value={form.rfc} onChange={(e) => set('rfc', e.target.value.toUpperCase())} required maxLength={13} />
            </label>
            <label>
              Código postal fiscal *
              <input className="input" value={form.cp} onChange={(e) => set('cp', e.target.value)} required inputMode="numeric" maxLength={5} />
            </label>
          </div>
          <label>
            Régimen fiscal *
            <select className="input" value={form.regimen} onChange={(e) => set('regimen', e.target.value)} required>
              <option value="">Selecciona…</option>
              {form.regimen && !REGIMENES_FISCALES.includes(form.regimen) && <option value={form.regimen}>{form.regimen}</option>}
              {REGIMENES_FISCALES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Uso de CFDI *
              <select className="input" value={form.usoCfdi} onChange={(e) => set('usoCfdi', e.target.value)} required>
                <option value="">Selecciona…</option>
                {form.usoCfdi && !USOS_CFDI.includes(form.usoCfdi) && <option value={form.usoCfdi}>{form.usoCfdi}</option>}
                {USOS_CFDI.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Correo para factura
              <input type="email" className="input" value={form.correo} onChange={(e) => set('correo', e.target.value)} />
            </label>
          </div>
          <label className="fin-check">
            <input type="checkbox" checked={form.predeterminada} onChange={(e) => set('predeterminada', e.target.checked)} />
            Razón social predeterminada de este cliente
          </label>
          {error && <p className="form-error">{error.message}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar razón social'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => { setForm(null); setError(null) }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {!form && error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
