import { useCallback, useEffect, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { canManageCatalogs } from '../utils/permissions'
import { Loading, ErrorState } from '../components/common/States'
import { fetchProveedores, getProveedorDeleteImpact, deleteProveedor } from '../services/proveedoresService'
import { fetchClientes, getClienteDeleteImpact, deleteCliente } from '../services/clientesService'
import { fetchTelas, getTelaDeleteImpact, deleteTela } from '../services/telasService'
import { fetchProductosByCliente, deleteProducto } from '../services/productosService'

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

function CatalogSection({ title, fetchFn, deleteFn, impactFn, impactLabel }) {
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
      <h3 className="section-title section-title--small">{title}</h3>
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

// Productos: a diferencia de proveedores/clientes/telas, están agrupados
// por cliente (no hay un catálogo plano) — se elige un cliente primero.
function ProductosSection() {
  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchClientes().then(({ data }) => setClientes(data || []))
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

      <CatalogSection
        title="Proveedores"
        fetchFn={fetchProveedores}
        deleteFn={deleteProveedor}
        impactFn={getProveedorDeleteImpact}
        impactLabel={(i) => `${i.pedidos_count} pedido(s) a proveedor perderán esta referencia (no se borran).`}
      />
      <CatalogSection
        title="Clientes"
        fetchFn={fetchClientes}
        deleteFn={deleteCliente}
        impactFn={getClienteDeleteImpact}
        impactLabel={(i) =>
          `${i.productos_count} producto(s) guardado(s) de este cliente se eliminarán también. ${i.orders_count} orden(es) perderán esta referencia (no se borran).`
        }
      />
      <CatalogSection
        title="Telas"
        fetchFn={fetchTelas}
        deleteFn={deleteTela}
        impactFn={getTelaDeleteImpact}
        impactLabel={(i) => `${i.productos_count} producto(s) perderán esta referencia (no se borran).`}
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
