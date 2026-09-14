import { useCallback, useEffect, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canManageCatalogs } from '../utils/permissions'
import { PROVEEDORES_HABILITADO } from '../utils/featureFlags'
import { Loading, ErrorState } from '../components/common/States'
import { fetchProveedores, getProveedorDeleteImpact, deleteProveedor } from '../services/proveedoresService'
import { fetchClientes, createCliente, getClienteDeleteImpact, deleteCliente } from '../services/clientesService'
import { fetchTelas, createTela, getTelaDeleteImpact, deleteTela } from '../services/telasService'
import {
  fetchProductosByCliente,
  createProducto,
  uploadProductoFoto,
  deleteProducto,
} from '../services/productosService'
import { GARMENT_COLORS } from '../lib/constants'

// Fila genérica con nombre + botón Eliminar — usada por las 3 secciones
// simples (proveedores/clientes/telas). Pide confirmación en dos pasos y,
// si se pasa `impactFn`, primero consulta cuántas filas dependientes
// existen y las muestra antes de la confirmación (ver FKs verificadas en
// schema_v24_soft_delete.sql: cliente->productos es CASCADE de verdad).
function CatalogRow({ item, deleteFn, impactFn, impactLabel, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [impact, setImpact] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function startConfirm() {
    setError(null)
    if (impactFn) {
      setBusy(true)
      const { data, error: impactError } = await impactFn(item.id)
      setBusy(false)
      if (impactError) {
        setError(impactError)
        return
      }
      setImpact(data)
    }
    setConfirming(true)
  }

  async function confirmDelete() {
    setBusy(true)
    setError(null)
    const { error: deleteError } = await deleteFn(item.id)
    setBusy(false)
    if (deleteError) {
      setError(deleteError)
      return
    }
    onDeleted?.()
  }

  return (
    <div className="document-row">
      <div>
        <span className="document-row__label">{item.nombre}</span>
        {confirming && impact && (
          <p className="form-error" style={{ marginTop: 2 }}>
            {impactLabel?.(impact) || 'Esta acción no se puede deshacer.'}
          </p>
        )}
        {error && <p className="form-error">{error.message}</p>}
      </div>
      {!confirming ? (
        <button type="button" className="btn btn--ghost btn--small" onClick={startConfirm} disabled={busy}>
          Eliminar
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
            onClick={confirmDelete}
            disabled={busy}
          >
            {busy ? 'Eliminando…' : '¿Seguro? Confirmar'}
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// Alta de cliente directo desde Catálogos — mismos campos que se piden
// al crear una orden (nombre/teléfono/correo, ver schema_v30), pero sin
// tener que pasar por "Nueva orden". "Crear o reusar": si ya existe un
// cliente con ese nombre, createCliente regresa el existente (y
// actualiza teléfono/correo si se mandaron) en vez de duplicar.
function AddClienteForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const { error: createError } = await createCliente(nombre.trim(), telefono.trim(), correo.trim())
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setNombre('')
    setTelefono('')
    setCorreo('')
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Cliente nuevo
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} style={{ marginTop: 10 }}>
      <label>
        Nombre del cliente
        <input type="text" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <div className="form-row">
        <label>
          Teléfono
          <input
            type="tel"
            className="input"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label>
          Correo
          <input
            type="email"
            className="input"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="Opcional"
          />
        </label>
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !nombre.trim()}>
          {saving ? 'Guardando…' : 'Guardar cliente'}
        </button>
      </div>
    </form>
  )
}

// Alta de tela directo desde Catálogos — mismo "crear o reusar" que
// TelaSelect ya usa dentro de una orden.
function AddTelaForm({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const { error: createError } = await createTela(nombre.trim())
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setNombre('')
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Tela nueva
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} style={{ marginTop: 10 }}>
      <label>
        Nombre de la tela
        <input type="text" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !nombre.trim()}>
          {saving ? 'Guardando…' : 'Guardar tela'}
        </button>
      </div>
    </form>
  )
}

function CatalogSection({ title, fetchFn, deleteFn, impactFn, impactLabel, addForm }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchFn()
    if (fetchError) {
      setError(fetchError)
    } else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }, [fetchFn])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card">
      <div className="section-header">
        <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
          {title}
        </h3>
        {addForm?.(load)}
      </div>
      {loading && <Loading label="Cargando…" />}
      {error && <ErrorState error={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && <p className="page-subtitle">No hay registros todavía.</p>}
      {!loading && !error && items.length > 0 && (
        <div className="document-list">
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              deleteFn={deleteFn}
              impactFn={impactFn}
              impactLabel={impactLabel}
              onDeleted={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Alta de producto directo desde Catálogos, con foto — a diferencia del
// "guardar como producto" que ya existía dentro de una orden (ver
// ProductoAutocomplete.jsx, que nunca subía una foto real porque las
// prendas de una orden no tienen selector de foto propio), aquí sí se
// sube un archivo real al mismo bucket que las fotos de referencia.
function AddProductoForm({ clienteId, clienteNombre, telas, onCreated }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [garment, setGarment] = useState('')
  const [color, setColor] = useState('')
  const [pantone, setPantone] = useState('')
  const [telaId, setTelaId] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function handleFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function reset() {
    setNombre('')
    setGarment('')
    setColor('')
    setPantone('')
    setTelaId('')
    setFile(null)
    setPreview(null)
    setOpen(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)

    let fotoUrl = null
    let fotoPath = null
    if (file) {
      const { data: uploaded, error: uploadError } = await uploadProductoFoto(clienteId, file)
      if (uploadError) {
        setSaving(false)
        setError(uploadError)
        return
      }
      fotoUrl = uploaded.url
      fotoPath = uploaded.path
    }

    const { error: createError } = await createProducto({
      clienteId,
      nombre: nombre.trim(),
      garment: garment.trim(),
      color,
      pantone: pantone.trim(),
      telaId: telaId || null,
      fotoUrl,
      fotoPath,
    })
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    reset()
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        + Producto nuevo de {clienteNombre}
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} style={{ marginTop: 10 }}>
      <label>
        Nombre del producto
        <input
          type="text"
          className="input"
          placeholder="Ej. Polo manga larga escolar"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
        />
      </label>
      <div className="form-row">
        <label>
          Prenda
          <input
            type="text"
            className="input"
            placeholder="Ej. Polo, Short…"
            value={garment}
            onChange={(e) => setGarment(e.target.value)}
          />
        </label>
        <label>
          Color
          <select className="input" value={color} onChange={(e) => setColor(e.target.value)}>
            <option value="">Selecciona…</option>
            {GARMENT_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Pantone / especificación
          <input
            type="text"
            className="input"
            placeholder="Ej. PMS 289 C"
            value={pantone}
            onChange={(e) => setPantone(e.target.value)}
          />
        </label>
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Tela
          </span>
          <select className="input" value={telaId} onChange={(e) => setTelaId(e.target.value)}>
            <option value="">Sin especificar</option>
            {telas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label>
        Foto del producto
        <input type="file" accept="image/*" onChange={handleFile} className="input" />
      </label>
      {preview && (
        <div className="photo-picker__thumb" style={{ width: 120, marginTop: 8 }}>
          <img src={preview} alt="Vista previa" />
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={reset} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || !nombre.trim()}>
          {saving ? 'Guardando…' : 'Guardar producto'}
        </button>
      </div>
    </form>
  )
}

// Productos: a diferencia de proveedores/clientes/telas, están agrupados
// por cliente (no hay un catálogo plano) — se elige un cliente primero.
function ProductosSection() {
  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [telas, setTelas] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchClientes().then(({ data }) => setClientes(data || []))
    fetchTelas().then(({ data }) => setTelas(data || []))
  }, [])

  const loadProductos = useCallback(async () => {
    if (!clienteId) {
      setProductos([])
      return
    }
    setLoading(true)
    const { data } = await fetchProductosByCliente(clienteId)
    setProductos(data || [])
    setLoading(false)
  }, [clienteId])

  useEffect(() => {
    loadProductos()
  }, [loadProductos])

  const clienteNombre = clientes.find((c) => c.id === clienteId)?.nombre || ''

  return (
    <div className="card">
      <h3 className="section-title section-title--small">Productos por cliente</h3>
      <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ marginBottom: 10 }}>
        <option value="">Selecciona un cliente…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {loading && <Loading label="Cargando…" />}
      {!loading && clienteId && productos.length === 0 && <p className="page-subtitle">Este cliente no tiene productos guardados.</p>}
      {!loading && productos.length > 0 && (
        <div className="document-list">
          {productos.map((p) => (
            <CatalogRow key={p.id} item={p} deleteFn={deleteProducto} onDeleted={loadProductos} />
          ))}
        </div>
      )}
      {clienteId && (
        <div style={{ marginTop: 12 }}>
          <AddProductoForm clienteId={clienteId} clienteNombre={clienteNombre} telas={telas} onCreated={loadProductos} />
        </div>
      )}
    </div>
  )
}

function CatalogosPageContent() {
  return (
    <div className="page page--narrow">
      <h2 className="section-title">Catálogos</h2>
      <p className="page-subtitle">
        Eliminar aquí es definitivo (hard-delete) — a diferencia de eliminar una orden, que solo la marca como
        "Eliminada" sin borrarla. Exclusivo de administrador general.
      </p>

      {PROVEEDORES_HABILITADO && (
        <CatalogSection
          title="Proveedores"
          fetchFn={fetchProveedores}
          deleteFn={deleteProveedor}
          impactFn={getProveedorDeleteImpact}
          impactLabel={(i) => `${i.pedidos_count} pedido(s) a proveedor perderán esta referencia (no se borran).`}
        />
      )}
      <CatalogSection
        title="Clientes"
        fetchFn={fetchClientes}
        deleteFn={deleteCliente}
        impactFn={getClienteDeleteImpact}
        impactLabel={(i) =>
          `${i.productos_count} producto(s) guardado(s) de este cliente se eliminarán también. ${i.orders_count} orden(es) perderán esta referencia (no se borran).`
        }
        addForm={(onCreated) => <AddClienteForm onCreated={onCreated} />}
      />
      <CatalogSection
        title="Telas"
        fetchFn={fetchTelas}
        deleteFn={deleteTela}
        impactFn={getTelaDeleteImpact}
        impactLabel={(i) => `${i.productos_count} producto(s) perderán esta referencia (no se borran).`}
        addForm={(onCreated) => <AddTelaForm onCreated={onCreated} />}
      />
      <ProductosSection />
    </div>
  )
}

export default function CatalogosPage() {
  return (
    <RequireRole allow={canManageCatalogs}>
      <CatalogosPageContent />
    </RequireRole>
  )
}
