import { useCallback, useEffect, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canGestionarInventarioTela } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import { fetchTelas } from '../services/telasService'
import { fetchInventarioTelas, registrarEntradaTela, registrarAjusteTela } from '../services/movimientosTelaService'

// V100 — Entrada de tela / Ajuste de inventario. Exclusivo admin_fabrica y
// admin_general (ver canGestionarInventarioTela). El inventario que se ve
// aquí y en Catálogos siempre es calculado (suma de movimientos_tela) — no
// hay ningún número editable a mano salvo a través de estos dos formularios.
export default function InventarioTelaPage() {
  return (
    <RequireRole allow={canGestionarInventarioTela}>
      <InventarioTelaContent />
    </RequireRole>
  )
}

function TelaSelectSimple({ telas, value, onChange }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Selecciona una tela…</option>
      {telas.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nombre}
          {t.unidad ? ` (${t.unidad})` : ' — sin unidad definida'}
        </option>
      ))}
    </select>
  )
}

function EntradaForm({ telas, onDone }) {
  const [telaId, setTelaId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  const telaElegida = telas.find((t) => t.id === telaId)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOk(false)
    const { error: err } = await registrarEntradaTela(telaId, Number(cantidad), nota.trim() || null)
    setSaving(false)
    if (err) return setError(err)
    setCantidad('')
    setNota('')
    setOk(true)
    onDone?.()
  }

  return (
    <form className="order-form card" onSubmit={handleSubmit}>
      <h3 className="section-title section-title--small">Entrada de tela</h3>
      <label>
        Tela
        <TelaSelectSimple telas={telas} value={telaId} onChange={setTelaId} />
      </label>
      <label>
        Cantidad recibida{telaElegida?.unidad ? ` (${telaElegida.unidad})` : ''}
        <input
          className="input"
          type="number"
          min="0.01"
          step="0.01"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          required
        />
      </label>
      <label>
        Nota (opcional)
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. factura del proveedor" />
      </label>
      {error && <p className="form-error">{error.message}</p>}
      {ok && <p className="form-hint">Entrada registrada.</p>}
      <div className="order-form__actions">
        <button type="submit" className="btn btn--primary" disabled={saving || !telaId || !cantidad}>
          {saving ? 'Registrando…' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  )
}

function AjusteForm({ telas, onDone }) {
  const [telaId, setTelaId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  const telaElegida = telas.find((t) => t.id === telaId)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOk(false)
    const { error: err } = await registrarAjusteTela(telaId, Number(cantidad), nota.trim())
    setSaving(false)
    if (err) return setError(err)
    setCantidad('')
    setNota('')
    setOk(true)
    onDone?.()
  }

  return (
    <form className="order-form card" onSubmit={handleSubmit}>
      <h3 className="section-title section-title--small">Ajuste de inventario</h3>
      <p className="form-hint">Para corregir diferencias de un conteo físico. Usa un número negativo si el conteo salió por debajo de lo esperado.</p>
      <label>
        Tela
        <TelaSelectSimple telas={telas} value={telaId} onChange={setTelaId} />
      </label>
      <label>
        Diferencia{telaElegida?.unidad ? ` (${telaElegida.unidad})` : ''}
        <input className="input" type="number" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Ej. -3.5" required />
      </label>
      <label>
        Motivo del ajuste *
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. conteo físico del 29/09" required />
      </label>
      {error && <p className="form-error">{error.message}</p>}
      {ok && <p className="form-hint">Ajuste registrado.</p>}
      <div className="order-form__actions">
        <button type="submit" className="btn btn--primary" disabled={saving || !telaId || !cantidad || !nota.trim()}>
          {saving ? 'Registrando…' : 'Registrar ajuste'}
        </button>
      </div>
    </form>
  )
}

function InventarioTelaContent() {
  const [telas, setTelas] = useState([])
  const [inventario, setInventario] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [telasRes, invRes] = await Promise.all([fetchTelas(), fetchInventarioTelas()])
    if (telasRes.error || invRes.error) {
      setError(telasRes.error || invRes.error)
    } else {
      setTelas(telasRes.data || [])
      setInventario(invRes.data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Inventario de tela</h2>
      <p className="page-subtitle">
        El inventario de cada tela es la suma de sus movimientos — nunca un número editable directamente. Si una tela no tiene
        unidad definida, primero configúrala desde Catálogos.
      </p>

      <div className="form-row" style={{ alignItems: 'flex-start' }}>
        <EntradaForm telas={telas} onDone={load} />
        <AjusteForm telas={telas} onDone={load} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-title section-title--small">Inventario actual</h3>
        {loading && <Loading label="Cargando…" />}
        {error && <ErrorState error={error} onRetry={load} />}
        {!loading && !error && inventario.length === 0 && <p className="page-subtitle">No hay telas en el catálogo todavía.</p>}
        {!loading && !error && inventario.length > 0 && (
          <div className="revision__tabla-wrap">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Tela</th>
                  <th>Unidad</th>
                  <th>Inventario actual</th>
                  <th>Comprometido</th>
                  <th>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {inventario.map((t) => (
                  <tr key={t.tela_id}>
                    <td>{t.nombre}</td>
                    <td>{t.unidad || '—'}</td>
                    <td>{t.inventario_actual}</td>
                    <td>{t.comprometido}</td>
                    <td className={Number(t.disponible) < 0 ? 'form-error' : ''}>{t.disponible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
