import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { useAuth } from '../contexts/AuthContext'
import {
  canManageCatalogs,
  canCreateCliente,
  canCreateTela,
  canViewCatalogos,
  canViewFinanzas,
  canVerComprometidoTela,
} from '../utils/permissions'
import RazonesSocialesManager from '../components/finanzas/RazonesSocialesManager'
import { PROVEEDORES_HABILITADO } from '../utils/featureFlags'
import { Loading, ErrorState } from '../components/common/States'
import { fetchProveedores, getProveedorDeleteImpact, deleteProveedor } from '../services/proveedoresService'
import {
  fetchClientes,
  createCliente,
  getClienteDeleteImpact,
  deleteCliente,
  setClienteTipoOrden,
} from '../services/clientesService'
import { fetchTelas, createTela, updateTela, getTelaDeleteImpact, deleteTela } from '../services/telasService'
import { fetchInventarioTelas, fetchMovimientosPorTela } from '../services/movimientosTelaService'
import { fetchProductosResumen } from '../services/productosService'
import { CLIENTE_TIPO_ORDEN_OPTIONS } from '../lib/constants'

// Fila genérica con nombre + botón Eliminar — usada por las 3 secciones
// simples (proveedores/clientes/telas). Pide confirmación en dos pasos y,
// si se pasa `impactFn`, primero consulta cuántas filas dependientes
// existen y las muestra antes de la confirmación (ver FKs verificadas en
// schema_v24_soft_delete.sql: cliente->productos es CASCADE de verdad).
function CatalogRow({ item, deleteFn, impactFn, impactLabel, onDeleted, canDelete = true, extra }) {
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
        {extra?.(item)}
        {confirming && impact && (
          <p className="form-error" style={{ marginTop: 2 }}>
            {impactLabel?.(impact) || 'Esta acción no se puede deshacer.'}
          </p>
        )}
        {error && <p className="form-error">{error.message}</p>}
      </div>
      {!canDelete ? null : !confirming ? (
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
  const [tipoOrden, setTipoOrden] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function toggleTipoOrden(key) {
    setTipoOrden((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const { error: createError } = await createCliente(nombre.trim(), telefono.trim(), correo.trim(), tipoOrden)
    setSaving(false)
    if (createError) {
      setError(createError)
      return
    }
    setNombre('')
    setTelefono('')
    setCorreo('')
    setTipoOrden([])
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
      <div>
        <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
          Categoría del cliente (puede ser más de una)
        </span>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {CLIENTE_TIPO_ORDEN_OPTIONS.map((opt) => (
            <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={tipoOrden.includes(opt.key)} onChange={() => toggleTipoOrden(opt.key)} />
              {opt.label}
            </label>
          ))}
        </div>
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

// V77 — razones sociales (datos fiscales) del cliente, plegable dentro de la
// fila del cliente. Solo lo montan los roles que ven dinero.
function ClienteRazonesSociales({ cliente }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen((v) => !v)}>
        {open ? 'Ocultar razones sociales' : 'Razones sociales (facturación)'}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <RazonesSocialesManager clienteId={cliente.id} />
        </div>
      )}
    </div>
  )
}

// V45 — categoría de un cliente que ya existe (los de antes de este
// cambio quedan sin categoría, ver schema_v45_categorias_cliente.sql).
// Muestra chips de solo lectura + un lápiz para abrir las casillas y
// guardar con set_cliente_tipo_orden.
function ClienteTipoOrdenEditor({ cliente, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [tipoOrden, setTipoOrden] = useState(cliente.tipo_orden || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function toggleTipoOrden(key) {
    setTipoOrden((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: saveError } = await setClienteTipoOrden(cliente.id, tipoOrden)
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    const labels = CLIENTE_TIPO_ORDEN_OPTIONS.filter((opt) => cliente.tipo_orden?.includes(opt.key)).map((opt) => opt.label)
    return (
      <p className="pantone-hint" style={{ marginTop: 2 }}>
        {labels.length > 0 ? labels.join(' · ') : 'Sin categoría'}{' '}
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
          Editar categoría
        </button>
      </p>
    )
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {CLIENTE_TIPO_ORDEN_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
            <input type="checkbox" checked={tipoOrden.includes(opt.key)} onChange={() => toggleTipoOrden(opt.key)} />
            {opt.label}
          </label>
        ))}
      </div>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button type="button" className="btn btn--primary btn--small" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
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

// V100 — unidad de medida de la tela (metro/kilo). Antes no existía ninguna
// edición de tela, solo alta/baja — se agrega inline, mismo patrón que
// ClienteTipoOrdenEditor.
function TelaUnidadEditor({ tela, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [unidad, setUnidad] = useState(tela.unidad || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await updateTela(tela.id, tela.nombre, unidad || null)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setEditing(false)
    onSaved?.()
  }

  if (!editing) {
    return (
      <p className="pantone-hint" style={{ marginTop: 2 }}>
        Unidad: {tela.unidad || 'sin definir'}
        {canEdit && (
          <>
            {' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
              Editar unidad
            </button>
          </>
        )}
      </p>
    )
  }

  return (
    <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ width: 'auto' }}>
        <option value="">Sin definir</option>
        <option value="metro">Metro</option>
        <option value="kilo">Kilo</option>
      </select>
      <button type="button" className="btn btn--primary btn--small" onClick={handleSave} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(false)} disabled={saving}>
        Cancelar
      </button>
      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}

// V100 — inventario_actual siempre viene de v_inventario_telas (suma de
// movimientos, nunca un número editable). "Comprometido" queda en 0 hasta
// que se conecte con órdenes en la Parte 3.
function TelaInventarioInfo({ inv, verComprometido }) {
  if (!inv) return null
  return (
    <p className="pantone-hint" style={{ marginTop: 2 }}>
      Inventario: {inv.inventario_actual} {inv.unidad || ''}
      {verComprometido && (
        <>
          {' '}
          · Comprometido: {inv.comprometido} {inv.unidad || ''} · Disponible: {inv.disponible} {inv.unidad || ''}
        </>
      )}
    </p>
  )
}

const MOVIMIENTO_TIPO_LABELS = { entrada: 'Entrada', consumo_corte: 'Consumo (corte)', ajuste: 'Ajuste' }

function TelaHistorial({ telaId }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (items) return
    setLoading(true)
    const { data, error: err } = await fetchMovimientosPorTela(telaId)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setItems(data || [])
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className="btn btn--ghost btn--small" onClick={toggle}>
        {open ? 'Ocultar historial' : 'Ver historial'}
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          {loading && <Loading label="Cargando…" />}
          {error && <p className="form-error">{error.message}</p>}
          {items && items.length === 0 && <p className="page-subtitle">Sin movimientos todavía.</p>}
          {items && items.length > 0 && (
            <div className="revision__tabla-wrap">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Usuario</th>
                    <th>Orden</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.fecha).toLocaleString('es-MX')}</td>
                      <td>{MOVIMIENTO_TIPO_LABELS[m.tipo] || m.tipo}</td>
                      <td>
                        {m.cantidad > 0 ? '+' : ''}
                        {m.cantidad} {m.unidad}
                      </td>
                      <td>{m.usuario_nombre || '—'}</td>
                      <td>{m.orden_id || '—'}</td>
                      <td>{m.nota || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CatalogSection({ title, fetchFn, deleteFn, impactFn, impactLabel, addForm, canDelete = true, renderExtra }) {
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
              canDelete={canDelete}
              extra={renderExtra ? (i) => renderExtra(i, load) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// V133 — Productos por cliente: aquí solo se elige el cliente (colegio); sus
// productos se ven y se editan en su propia página (CatalogoClientePage.jsx).
// "Solo con pendientes" deja a la vista los que tienen fichas por validar.
function ProductosSection() {
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchClientes(), fetchProductosResumen()]).then(([c, p]) => {
      setClientes(c.data || [])
      setProductos(p.data || [])
      setLoading(false)
    })
  }, [])

  const porCliente = new Map()
  for (const p of productos) {
    const r = porCliente.get(p.cliente_id) || { total: 0, pendientes: 0, foto: null }
    r.total += 1
    if (p.pendiente_validar) r.pendientes += 1
    if (!r.foto && p.foto_url) r.foto = p.foto_url
    porCliente.set(p.cliente_id, r)
  }
  const totalPendientes = productos.filter((p) => p.pendiente_validar).length
  // Primero los que ya tienen productos; los demás quedan abajo para poder
  // entrar a darles de alta el primero.
  const lista = clientes
    .map((c) => ({ ...c, ...(porCliente.get(c.id) || { total: 0, pendientes: 0, foto: null }) }))
    .filter((c) => !soloPendientes || c.pendientes > 0)
    .sort((a, b) => (b.total > 0) - (a.total > 0) || a.nombre.localeCompare(b.nombre))

  return (
    <div className="card">
      <h3 className="section-title section-title--small">Productos por cliente</h3>
      <p className="page-subtitle">Entra a un cliente para ver, agregar o editar sus productos.</p>
      <label className="producto-validado" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
        Solo clientes con productos por validar ({totalPendientes} productos)
      </label>
      {loading && <Loading label="Cargando…" />}
      {!loading && lista.length === 0 && <p className="page-subtitle">No hay productos pendientes de validar.</p>}
      <div className="document-list">
        {lista.map((c) => (
          <Link key={c.id} to={`/catalogos/cliente/${c.id}`} className="document-row cliente-catalogo">
            {c.foto ? <img src={c.foto} alt="" loading="lazy" /> : <span className="cliente-catalogo__sin-foto" />}
            <div>
              <span className="document-row__label">{c.nombre}</span>
              <span className="cliente-catalogo__meta">
                {c.total === 0 ? 'Sin productos' : `${c.total} producto(s)`}
                {c.pendientes > 0 && <span className="producto-aviso"> · ⚠️ {c.pendientes} por validar</span>}
              </span>
            </div>
            <span className="cliente-catalogo__flecha">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function CatalogosPageContent() {
  const { role } = useAuth()
  // V36: quién puede BORRAR (hard-delete) sigue exclusivo de admin_general,
  // sin excepción — lo que se abrió fue quién puede DAR DE ALTA cada
  // catálogo (ver canCreateCliente/canCreateTela en utils/permissions.js).
  const canDelete = canManageCatalogs(role)
  const showAddCliente = canCreateCliente(role)
  const showAddTela = canCreateTela(role)

  // V100 — inventario_actual por tela (suma de movimientos), cargado aparte
  // del catálogo mismo para no acoplar CatalogSection a inventario.
  const [inventarioMap, setInventarioMap] = useState({})
  const loadInventario = useCallback(async () => {
    const { data } = await fetchInventarioTelas()
    const map = {}
    for (const row of data || []) map[row.tela_id] = row
    setInventarioMap(map)
  }, [])
  useEffect(() => {
    loadInventario()
  }, [loadInventario])

  return (
    <div className="page page--narrow">
      <h2 className="section-title">Catálogos</h2>
      <p className="page-subtitle">
        Dar de alta depende del catálogo: Clientes y Productos son de ventas y administrador general; Telas es de
        ventas, administrador de fábrica y administrador general. Eliminar (hard-delete, definitivo) sigue siendo
        exclusivo de administrador general.
      </p>

      {PROVEEDORES_HABILITADO && (
        <CatalogSection
          title="Proveedores"
          fetchFn={fetchProveedores}
          deleteFn={deleteProveedor}
          impactFn={getProveedorDeleteImpact}
          impactLabel={(i) => `${i.pedidos_count} pedido(s) a proveedor perderán esta referencia (no se borran).`}
          canDelete={canDelete}
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
        addForm={showAddCliente ? (onCreated) => <AddClienteForm onCreated={onCreated} /> : undefined}
        canDelete={canDelete}
        renderExtra={
          showAddCliente || canViewFinanzas(role)
            ? (cliente, load) => (
                <>
                  {showAddCliente && <ClienteTipoOrdenEditor cliente={cliente} onSaved={load} />}
                  {canViewFinanzas(role) && <ClienteRazonesSociales cliente={cliente} />}
                </>
              )
            : undefined
        }
      />
      <CatalogSection
        title="Telas"
        fetchFn={fetchTelas}
        deleteFn={deleteTela}
        impactFn={getTelaDeleteImpact}
        impactLabel={(i) =>
          `${i.productos_count} producto(s) perderán esta referencia (no se borran). ${i.movimientos_count > 0 ? 'Tiene movimientos de inventario registrados: no se puede eliminar.' : ''}`
        }
        addForm={showAddTela ? (onCreated) => <AddTelaForm onCreated={onCreated} /> : undefined}
        canDelete={canDelete}
        renderExtra={(tela, load) => (
          <>
            <TelaUnidadEditor
              tela={tela}
              canEdit={showAddTela}
              onSaved={() => {
                load()
                loadInventario()
              }}
            />
            <TelaInventarioInfo inv={inventarioMap[tela.id]} verComprometido={canVerComprometidoTela(role)} />
            <TelaHistorial telaId={tela.id} />
          </>
        )}
      />
      <ProductosSection />
    </div>
  )
}

export default function CatalogosPage() {
  return (
    <RequireRole allow={canViewCatalogos}>
      <CatalogosPageContent />
    </RequireRole>
  )
}
