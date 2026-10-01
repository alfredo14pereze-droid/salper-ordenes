import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos, useInventarioEstructura } from '../hooks/useInventario'
import {
  fetchArticulosAdmin,
  guardarSeccion,
  guardarUbicacion,
  guardarMotivo,
  guardarArticulo,
  guardarClasificacion,
  guardarTipoPrenda,
  guardarTalla,
  guardarJuegoTallas,
  clasificarSeccion,
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

// V121 — cada sección ES un "cliente o línea" del catálogo estructurado:
// aquí se le asigna su clasificación (Colegio / Empresa / Marca / Línea).
function SeccionClasificacion({ seccion, clasificaciones, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleChange(e) {
    setSaving(true)
    setError(null)
    const { error: err } = await clasificarSeccion({
      seccionId: seccion.id,
      clasificacionId: e.target.value || null,
      clienteId: seccion.cliente_id,
    })
    setSaving(false)
    if (err) return setError(err)
    onSaved()
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '-4px 0 8px 14px' }}>
      <span className="pantone-hint">Clasificación:</span>
      <select className="input input--small" style={{ width: 'auto' }} value={seccion.clasificacion_id || ''} onChange={handleChange} disabled={saving}>
        <option value="">Sin clasificación</option>
        {clasificaciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {error && <span className="form-error">{error.message}</span>}
    </div>
  )
}

function SeccionesTab({ secciones, clasificaciones, refresh }) {
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Secciones (cliente o línea)</h3>
      <div className="document-list">
        {secciones.map((s) => (
          <div key={s.id}>
            <SimpleCatalogRow item={s} activeField="activa" guardarFn={guardarSeccion} onSaved={refresh} />
            {clasificaciones.length > 0 && <SeccionClasificacion seccion={s} clasificaciones={clasificaciones} onSaved={refresh} />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarSeccion} activeField="activa" placeholder="Nombre de la sección" onCreated={refresh} />
      </div>
    </div>
  )
}

function ClasificacionesTab({ clasificaciones, refresh }) {
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Clasificaciones</h3>
      <div className="document-list">
        {clasificaciones.map((c) => (
          <SimpleCatalogRow key={c.id} item={c} activeField="activa" guardarFn={guardarClasificacion} onSaved={refresh} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarClasificacion} activeField="activa" placeholder="Nombre de la clasificación" onCreated={refresh} />
      </div>
    </div>
  )
}

function TiposPrendaTab({ tipos, refresh }) {
  return (
    <div className="card">
      <h3 className="section-title section-title--small">Tipos de prenda</h3>
      <div className="document-list">
        {tipos.map((t) => (
          <SimpleCatalogRow key={t.id} item={t} activeField="activo" guardarFn={guardarTipoPrenda} onSaved={refresh} />
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <AddSimpleCatalog guardarFn={guardarTipoPrenda} activeField="activo" placeholder="Ej. Sudadera" onCreated={refresh} />
      </div>
    </div>
  )
}

// Juego de tallas: nombre + qué tallas incluye. El orden dentro del juego
// es el del catálogo general de tallas (columna `orden`).
function JuegoRow({ juego, tallas, onSaved }) {
  const esNuevo = !juego.id
  const [editing, setEditing] = useState(esNuevo)
  const [nombre, setNombre] = useState(juego.nombre)
  const [elegidas, setElegidas] = useState(() => new Set(juego.tallaIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(cambios = {}) {
    setSaving(true)
    setError(null)
    const { error: err } = await guardarJuegoTallas({
      id: juego.id || null,
      nombre: nombre.trim(),
      activo: juego.activo,
      orden: juego.orden,
      tallaIds: tallas.filter((t) => elegidas.has(t.id)).map((t) => t.id),
      ...cambios,
    })
    setSaving(false)
    if (err) return setError(err)
    setEditing(false)
    onSaved()
  }

  function toggle(id) {
    setElegidas((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!editing) {
    return (
      <div className="document-row">
        <div style={{ opacity: juego.activo ? 1 : 0.5 }}>
          <span className="document-row__label">
            {juego.nombre} {!juego.activo && '(inactivo)'}
          </span>
          <p className="pantone-hint" style={{ margin: '2px 0 0' }}>
            {tallas.filter((t) => juego.tallaIds.includes(t.id)).map((t) => formatTalla(t.nombre)).join(' · ')}
          </p>
          {error && <p className="form-error">{error.message}</p>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={saving}
            onClick={() => guardar({ nombre: juego.nombre, activo: !juego.activo, tallaIds: juego.tallaIds })}
          >
            {juego.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="document-row document-row--stacked">
      <input type="text" className="input" placeholder="Nombre del juego (ej. Escolar infantil)" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={esNuevo} />
      <div className="inv-checks">
        {tallas.map((t) => (
          <label key={t.id} className="inv-check">
            <input type="checkbox" checked={elegidas.has(t.id)} onChange={() => toggle(t.id)} />
            {formatTalla(t.nombre)}
          </label>
        ))}
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn btn--primary btn--small" onClick={() => guardar()} disabled={saving || !nombre.trim() || elegidas.size === 0}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => (esNuevo ? onSaved() : setEditing(false))} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function AddTalla({ onCreated }) {
  const [nombre, setNombre] = useState('')
  const [orden, setOrden] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Sugerencia de orden: las tallas infantiles numéricas van en número x 10
  // (ej. 18 → 180), la misma convención del catálogo original.
  function handleNombre(value) {
    setNombre(value)
    const n = Number(value)
    if (/^\d+$/.test(value.trim()) && n > 0 && n < 28) setOrden(String(n * 10))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error: err } = await guardarTalla({ id: null, nombre: nombre.trim(), orden })
    setSaving(false)
    if (err) return setError(err)
    setNombre('')
    setOrden('')
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input type="text" className="input" style={{ width: 130 }} placeholder="Talla (ej. 18)" value={nombre} onChange={(e) => handleNombre(e.target.value)} />
      <input type="number" className="input" style={{ width: 110 }} placeholder="Orden" value={orden} onChange={(e) => setOrden(e.target.value)} />
      <button type="submit" className="btn btn--secondary btn--small" disabled={saving || !nombre.trim() || orden === ''}>
        {saving ? 'Guardando…' : '+ Agregar talla'}
      </button>
      {error && <p className="form-error">{error.message}</p>}
    </form>
  )
}

function TallasJuegosTab({ juegos, tallas, refreshEstructura, refreshCatalogos }) {
  const [nuevo, setNuevo] = useState(false)
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 className="section-title section-title--small">Juegos de tallas</h3>
        <p className="pantone-hint" style={{ marginBottom: 10 }}>
          Grupos reutilizables para crear modelos. Cambiar un juego no modifica los modelos que ya se crearon con él.
        </p>
        <div className="document-list">
          {juegos.map((j) => (
            <JuegoRow key={j.id} juego={j} tallas={tallas} onSaved={refreshEstructura} />
          ))}
          {nuevo && (
            <JuegoRow
              juego={{ id: null, nombre: '', activo: true, orden: 50, tallaIds: [] }}
              tallas={tallas}
              onSaved={() => {
                setNuevo(false)
                refreshEstructura()
              }}
            />
          )}
        </div>
        {!nuevo && (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setNuevo(true)}>
              + Nuevo juego
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h3 className="section-title section-title--small">Catálogo de tallas</h3>
        <p className="pantone-hint" style={{ marginBottom: 10 }}>
          {tallas.map((t) => formatTalla(t.nombre)).join(' · ')}
        </p>
        <p className="pantone-hint" style={{ marginBottom: 10 }}>
          El orden decide dónde aparece: infantil = número × 10 (talla 18 → 180), letra entre 1000 y 1999, pantalón de 2000 en adelante.
        </p>
        <AddTalla onCreated={refreshCatalogos} />
      </div>
    </>
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
  // V121 — si la migración todavía no está en la base, estas listas llegan
  // vacías y las pestañas nuevas simplemente no se muestran.
  const { clasificaciones, tipos, juegos, refresh: refreshEstructura } = useInventarioEstructura()
  const [tab, setTab] = useState('secciones')
  const hayEstructura = clasificaciones.length > 0

  if (loading) return <Loading label="Cargando administración de inventario…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Administración de inventario</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hayEstructura && (
            <Link to="/inventario/sin-clasificar" className="btn btn--secondary btn--small">
              Artículos sin clasificar
            </Link>
          )}
          <Link to="/inventario" className="btn btn--ghost btn--small">
            ← Inventario
          </Link>
        </div>
      </div>

      <div className="type-tabs" style={{ marginBottom: 14 }}>
        {[
          { key: 'secciones', label: 'Secciones' },
          ...(hayEstructura
            ? [
                { key: 'clasificaciones', label: 'Clasificaciones' },
                { key: 'tipos', label: 'Tipos de prenda' },
                { key: 'tallas', label: 'Tallas y juegos' },
              ]
            : []),
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

      {tab === 'secciones' && <SeccionesTab secciones={secciones} clasificaciones={clasificaciones} refresh={refresh} />}
      {tab === 'clasificaciones' && <ClasificacionesTab clasificaciones={clasificaciones} refresh={refreshEstructura} />}
      {tab === 'tipos' && <TiposPrendaTab tipos={tipos} refresh={refreshEstructura} />}
      {tab === 'tallas' && (
        <TallasJuegosTab juegos={juegos} tallas={tallas} refreshEstructura={refreshEstructura} refreshCatalogos={refresh} />
      )}
      {tab === 'ubicaciones' && <UbicacionesTab ubicaciones={ubicaciones} refresh={refresh} />}
      {tab === 'motivos' && <MotivosTab motivos={motivos} refresh={refresh} />}
      {tab === 'articulos' && <ArticulosTab secciones={secciones} tallas={tallas} />}
    </div>
  )
}
