import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos } from '../hooks/useInventario'
import {
  fetchArticulosAdmin,
  guardarSeccion,
  guardarUbicacion,
  guardarMotivo,
  guardarArticulo,
} from '../services/inventarioService'
import { formatTalla } from '../utils/inventarioTallas'

// V89 — Administración de catálogos de Inventario: alta/edición/baja
// (siempre "desactivar", nunca borrar — no hay RPC de delete para ninguno
// de estos catálogos, así que un artículo con movimientos nunca se puede
// perder). admin_tienda/admin_general (ver canEditarInventario).

function SimpleCatalogRow({ item, activeField, guardarFn, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [nombre, setNombre] = useState(item.nombre)
  const [orden, setOrden] = useState(item.orden ?? 50)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function toggleActivo() {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarFn({ id: item.id, nombre: item.nombre, [activeField]: !item[activeField], orden: item.orden })
    setSaving(false)
    if (err) return setError(err)
    onSaved()
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarFn({ id: item.id, nombre, [activeField]: item[activeField], orden: Number(orden) })
    setSaving(false)
    if (err) return setError(err)
    setEditing(false)
    onSaved()
  }

  return (
    <div className="document-row">
      <div>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" className="input input--small" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <input
              type="number"
              className="input input--small"
              style={{ width: 70 }}
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              title="Orden"
            />
          </div>
        ) : (
          <span className="document-row__label" style={{ opacity: item[activeField] ? 1 : 0.5 }}>
            {item.nombre} {!item[activeField] && '(inactiva)'}
          </span>
        )}
        {error && <p className="form-error">{error.message}</p>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {editing ? (
          <>
            <button type="button" className="btn btn--primary btn--small" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={toggleActivo} disabled={saving}>
              {item[activeField] ? 'Desactivar' : 'Activar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddSimpleCatalog({ guardarFn, activeField, placeholder, onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await guardarFn({ id: null, nombre: nombre.trim(), [activeField]: true, orden: 50 })
    setSaving(false)
    if (err) return setError(err)
    setNombre('')
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Nuevo
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6, marginTop: 10 }}>
      <input type="text" className="input" placeholder={placeholder} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <button type="submit" className="btn btn--primary btn--small" disabled={saving || !nombre.trim()}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)} disabled={saving}>
        Cancelar
      </button>
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}

function SeccionesTab({ secciones, refresh }) {
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Secciones</h3>
      <div className="document-list">
        {secciones.map((s) => (
          <SimpleCatalogRow key={s.id} item={s} activeField="activa" guardarFn={guardarSeccion} onSaved={refresh} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarSeccion} activeField="activa" placeholder="Nombre de la sección" onCreated={refresh} />
      </div>
    </div>
  )
}

function UbicacionesTab({ ubicaciones, refresh }) {
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Ubicaciones</h3>
      <div className="document-list">
        {ubicaciones.map((u) => (
          <SimpleCatalogRow key={u.id} item={u} activeField="activa" guardarFn={guardarUbicacion} onSaved={refresh} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarUbicacion} activeField="activa" placeholder="Nombre de la ubicación" onCreated={refresh} />
      </div>
    </div>
  )
}

function MotivosTab({ motivos, refresh }) {
  const editables = motivos.filter((m) => !m.sistema)
  const sistema = motivos.filter((m) => m.sistema)
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Motivos</h3>
      <div className="document-list">
        {editables.map((m) => (
          <SimpleCatalogRow key={m.id} item={m} activeField="activo" guardarFn={guardarMotivo} onSaved={refresh} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarMotivo} activeField="activo" placeholder="Nombre del motivo" onCreated={refresh} />
      </div>
      {sistema.length > 0 && (
        <>
          <p className="pantone-hint" style={{ marginTop: 14 }}>
            De uso interno del sistema (no editables):
          </p>
          <p className="pantone-hint">{sistema.map((m) => m.nombre).join(' · ')}</p>
        </>
      )}
    </div>
  )
}

function ArticuloRow({ articulo, secciones, tallas, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [prenda, setPrenda] = useState(articulo.prenda)
  const [tallaId, setTallaId] = useState(articulo.talla_id)
  const [minimo, setMinimo] = useState(articulo.minimo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function toggleActivo() {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarArticulo({
      id: articulo.id,
      seccionId: articulo.seccion_id,
      prenda: articulo.prenda,
      tallaId: articulo.talla_id,
      minimo: articulo.minimo,
      activo: !articulo.activo,
    })
    setSaving(false)
    if (err) return setError(err)
    onSaved()
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarArticulo({
      id: articulo.id,
      seccionId: articulo.seccion_id,
      prenda,
      tallaId,
      minimo,
      activo: articulo.activo,
    })
    setSaving(false)
    if (err) return setError(err)
    setEditing(false)
    onSaved()
  }

  return (
    <div className="document-row">
      <div>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" className="input input--small" value={prenda} onChange={(e) => setPrenda(e.target.value)} />
            <select className="input input--small" value={tallaId} onChange={(e) => setTallaId(e.target.value)}>
              {tallas.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTalla(t.nombre)}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="input input--small"
              style={{ width: 70 }}
              placeholder="Mínimo"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
            />
          </div>
        ) : (
          <span className="document-row__label" style={{ opacity: articulo.activo ? 1 : 0.5 }}>
            {articulo.prenda} · {formatTalla(articulo.inv_tallas?.nombre)} {articulo.minimo != null && `· mín. ${articulo.minimo}`}
            {!articulo.activo && ' (inactivo)'}
          </span>
        )}
        {error && <p className="form-error">{error.message}</p>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {editing ? (
          <>
            <button type="button" className="btn btn--primary btn--small" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={toggleActivo} disabled={saving}>
              {articulo.activo ? 'Desactivar' : 'Activar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function AddArticulo({ seccionId, tallas, onCreated }) {
  const [open, setOpen] = useState(false)
  const [prenda, setPrenda] = useState('')
  const [tallaId, setTallaId] = useState(tallas[0]?.id || '')
  const [minimo, setMinimo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!prenda.trim() || !tallaId) return
    setSaving(true)
    setError(null)
    const { error: err } = await guardarArticulo({ id: null, seccionId, prenda: prenda.trim(), tallaId, minimo, activo: true })
    setSaving(false)
    if (err) return setError(err)
    setPrenda('')
    setMinimo('')
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Nuevo artículo
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      <input type="text" className="input" placeholder="Prenda" value={prenda} onChange={(e) => setPrenda(e.target.value)} autoFocus />
      <select className="input" value={tallaId} onChange={(e) => setTallaId(e.target.value)}>
        {tallas.map((t) => (
          <option key={t.id} value={t.id}>
            {formatTalla(t.nombre)}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="input"
        style={{ width: 90 }}
        placeholder="Mínimo"
        value={minimo}
        onChange={(e) => setMinimo(e.target.value)}
      />
      <button type="submit" className="btn btn--primary btn--small" disabled={saving || !prenda.trim()}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)} disabled={saving}>
        Cancelar
      </button>
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}

function ArticulosTab({ secciones, tallas }) {
  const [seccionId, setSeccionId] = useState(secciones[0]?.id || '')
  const [articulos, setArticulos] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!seccionId) {
      setArticulos([])
      return
    }
    setLoading(true)
    const { data } = await fetchArticulosAdmin(seccionId)
    setArticulos(data || [])
    setLoading(false)
  }, [seccionId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card">
      <h3 className="section-title section-title--small">Artículos</h3>
      <select className="input" value={seccionId} onChange={(e) => setSeccionId(e.target.value)} style={{ marginBottom: 10 }}>
        {secciones.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
      {loading && <Loading label="Cargando…" />}
      {!loading && articulos.length === 0 && <p className="page-subtitle">Esta sección no tiene artículos todavía.</p>}
      {!loading && articulos.length > 0 && (
        <div className="document-list">
          {articulos.map((a) => (
            <ArticuloRow key={a.id} articulo={a} secciones={secciones} tallas={tallas} onSaved={load} />
          ))}
        </div>
      )}
      {seccionId && (
        <div style={{ marginTop: 12 }}>
          <AddArticulo seccionId={seccionId} tallas={tallas} onCreated={load} />
        </div>
      )}
    </div>
  )
}

export default function InventarioAdminPage() {
  return (
    <RequireInventarioAccess>
      <InventarioAdminGate />
    </RequireInventarioAccess>
  )
}

function InventarioAdminGate() {
  const { role } = useAuth()
  if (!canEditarInventario(role)) {
    return (
      <div className="page page--narrow">
        <p className="page-subtitle">No tienes permiso para administrar los catálogos de Inventario.</p>
        <Link to="/inventario" className="btn btn--ghost btn--small">
          ← Inventario
        </Link>
      </div>
    )
  }
  return <InventarioAdminContent />
}

function InventarioAdminContent() {
  const { secciones, ubicaciones, tallas, motivos, loading, error, refresh } = useInventarioCatalogos()
  const [tab, setTab] = useState('secciones')

  if (loading) return <Loading label="Cargando administración de inventario…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Administración de inventario</h2>
        <Link to="/inventario" className="btn btn--ghost btn--small">
          ← Inventario
        </Link>
      </div>

      <div className="type-tabs" style={{ marginBottom: 14 }}>
        {[
          { key: 'secciones', label: 'Secciones' },
          { key: 'ubicaciones', label: 'Ubicaciones' },
          { key: 'motivos', label: 'Motivos' },
          { key: 'articulos', label: 'Artículos' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={'type-tab' + (tab === t.key ? ' type-tab--active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'secciones' && <SeccionesTab secciones={secciones} refresh={refresh} />}
      {tab === 'ubicaciones' && <UbicacionesTab ubicaciones={ubicaciones} refresh={refresh} />}
      {tab === 'motivos' && <MotivosTab motivos={motivos} refresh={refresh} />}
      {tab === 'articulos' && <ArticulosTab secciones={secciones} tallas={tallas} />}
    </div>
  )
}
