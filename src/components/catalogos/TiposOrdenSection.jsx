import { useCallback, useEffect, useState } from 'react'
import { Loading, ErrorState } from '../common/States'
import EtapasPlantillaChecks from '../orders/EtapasPlantillaChecks'
import {
  fetchAllOrderTypes,
  fetchPlantillasEtapas,
  createOrderType,
  setOrderTypeEtapas,
  setOrderTypeActive,
} from '../../services/orderTypesService'
import { ETAPA_LABELS, ETAPAS_PLANTILLA_DEFAULT } from '../../lib/constants'

// V136 — Catálogos → Tipos de orden (solo admin_tienda, admin_fabrica y
// admin_general). Cada tipo muestra sus etapas (su plantilla): son las que
// recibe una orden nueva de ese tipo. Un tipo no puede quedar activo sin
// etapas — así nació el problema de "Venta Mostrador".

function AddTipoForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [etapas, setEtapas] = useState(ETAPAS_PLANTILLA_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (etapas.length === 0) {
      setError(new Error('Elige al menos una etapa para el tipo de orden.'))
      return
    }
    setSaving(true)
    setError(null)
    const { error: createError } = await createOrderType(nombre.trim(), etapas)
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setNombre('')
    setEtapas(ETAPAS_PLANTILLA_DEFAULT)
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(true)}>
        + Agregar tipo de orden
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} style={{ width: '100%', marginTop: 10 }}>
      <label>
        Nombre del tipo *
        <input type="text" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <div>
        <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
          Etapas *
        </span>
        <EtapasPlantillaChecks value={etapas} onChange={setEtapas} disabled={saving} />
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
          {saving ? 'Creando…' : 'Crear tipo'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function TipoRow({ tipo, plantilla, onSaved }) {
  // 'bordado' puede venir en la plantilla de los tipos de siempre; no se
  // edita aquí (se decide por orden) y el servidor lo conserva.
  const etapasEditables = plantilla.filter((p) => p.etapa !== 'bordado').map((p) => p.etapa)
  const [editing, setEditing] = useState(false)
  const [etapas, setEtapas] = useState(etapasEditables)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSaveEtapas() {
    if (etapas.length === 0) {
      setError(new Error('Elige al menos una etapa para el tipo de orden.'))
      return
    }
    setBusy(true)
    setError(null)
    const { error: saveError } = await setOrderTypeEtapas(tipo.key, etapas)
    setBusy(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setEditing(false)
    onSaved?.()
  }

  async function handleToggleActive() {
    setBusy(true)
    setError(null)
    const { error: saveError } = await setOrderTypeActive(tipo.key, !tipo.active)
    setBusy(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onSaved?.()
  }

  const sinEtapas = plantilla.length === 0

  return (
    <div className="document-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{tipo.label}</strong>{' '}
        <span className="pantone-hint">
          {tipo.folio_prefix} · {tipo.active ? 'Activo' : 'Desactivado'}
        </span>
        {!editing && (
          <p className="pantone-hint" style={{ marginTop: 2 }}>
            {sinEtapas ? (
              <span className="form-error">Sin etapas — sus órdenes no le aparecerían a fábrica.</span>
            ) : (
              plantilla.map((p) => ETAPA_LABELS[p.etapa] + (p.etapa === 'bordado' ? ' (si la orden lo lleva)' : '')).join(' → ')
            )}
          </p>
        )}
        {editing && (
          <div style={{ marginTop: 6 }}>
            <EtapasPlantillaChecks value={etapas} onChange={setEtapas} disabled={busy} />
            <p className="pantone-hint">El cambio aplica a las órdenes que se creen a partir de ahora; las que ya existen no cambian.</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button type="button" className="btn btn--primary btn--small" onClick={handleSaveEtapas} disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar etapas'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setEtapas(etapasEditables)
                  setError(null)
                  setEditing(false)
                }}
                disabled={busy}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {error && <p className="form-error">{error.message}</p>}
      </div>
      {!editing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)} disabled={busy}>
            Editar etapas
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={handleToggleActive}
            disabled={busy || (!tipo.active && sinEtapas)}
            title={!tipo.active && sinEtapas ? 'Asígnale al menos una etapa para poder activarlo.' : undefined}
          >
            {tipo.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TiposOrdenSection() {
  const [tipos, setTipos] = useState([])
  const [plantillas, setPlantillas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([fetchAllOrderTypes(), fetchPlantillasEtapas()])
    if (t.error || p.error) {
      setError(t.error || p.error)
    } else {
      setTipos(t.data || [])
      setPlantillas(p.data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card">
      <div className="section-header" style={abierto ? undefined : { marginBottom: 0 }}>
        <button type="button" className="catalogo-toggle" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          <span className="catalogo-toggle__flecha">{abierto ? '▾' : '▸'}</span>
          <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
            Tipos de orden
          </h3>
          {!loading && <span className="section-count">{tipos.length}</span>}
        </button>
        {abierto && <AddTipoForm onCreated={load} />}
      </div>
      {abierto && loading && <Loading label="Cargando…" />}
      {abierto && error && <ErrorState error={error} onRetry={load} />}
      {abierto && !loading && !error && (
        <div className="document-list">
          {tipos.map((tipo) => {
            const plantilla = plantillas.filter((p) => p.order_type_key === tipo.key)
            return (
              <TipoRow
                key={tipo.key + ':' + plantilla.map((p) => p.etapa).join(',')}
                tipo={tipo}
                plantilla={plantilla}
                onSaved={load}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
