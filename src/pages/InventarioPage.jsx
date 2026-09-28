import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canMoverInventario, canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos, useInventarioExistencias } from '../hooks/useInventario'
import MovimientoModal from '../components/inventario/MovimientoModal'
import HistorialModal from '../components/inventario/HistorialModal'

// V89 — Inventario (artículos por fuera de Microsip), pantalla principal:
// secciones como pestañas, prendas agrupadas por talla (orden del
// catálogo), existencia por ubicación o total, +/- rápido y buscador. En
// modo prueba: RequireInventarioAccess ya filtró rol + correo antes de
// llegar aquí.
function buildArticulos(filas) {
  const map = new Map()
  for (const f of filas) {
    let a = map.get(f.articulo_id)
    if (!a) {
      a = {
        articuloId: f.articulo_id,
        prenda: f.prenda,
        talla: f.talla,
        tallaOrden: f.talla_orden,
        minimo: f.minimo,
        porUbicacion: {},
        total: 0,
      }
      map.set(f.articulo_id, a)
    }
    a.porUbicacion[f.ubicacion_id] = f.existencia
    a.total += f.existencia
  }
  return [...map.values()]
}

function groupByPrenda(articulos) {
  const groups = new Map()
  for (const a of articulos) {
    if (!groups.has(a.prenda)) groups.set(a.prenda, [])
    groups.get(a.prenda).push(a)
  }
  return [...groups.entries()]
    .map(([prenda, items]) => ({ prenda, items: [...items].sort((x, y) => x.tallaOrden - y.tallaOrden) }))
    .sort((x, y) => x.prenda.localeCompare(y.prenda, 'es'))
}

export default function InventarioPage() {
  return (
    <RequireInventarioAccess>
      <InventarioContent />
    </RequireInventarioAccess>
  )
}

function InventarioContent() {
  const { role } = useAuth()
  const canMover = canMoverInventario(role)
  const canEditar = canEditarInventario(role)
  const { secciones, ubicaciones, motivos, loading: loadingCatalogos, error: catalogosError, refresh: refreshCatalogos } = useInventarioCatalogos()
  const [seccionId, setSeccionId] = useState(null)
  const [viewMode, setViewMode] = useState('total') // 'total' | ubicacion_id
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { kind: 'movimiento' | 'historial', articulo, tipo? }

  const seccionesActivas = useMemo(() => secciones.filter((s) => s.activa), [secciones])
  const ubicacionesActivas = useMemo(() => ubicaciones.filter((u) => u.activa), [ubicaciones])
  const motivosDisponibles = useMemo(() => motivos.filter((m) => m.activo && !m.sistema), [motivos])

  const seccionActivaId = seccionId ?? (loadingCatalogos ? undefined : seccionesActivas[0]?.id ?? null)

  const { filas, loading: loadingExistencias, error: existenciasError, refresh: refreshExistencias } = useInventarioExistencias(seccionActivaId)

  const grupos = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const articulos = buildArticulos(filas).filter((a) => !needle || a.prenda.toLowerCase().includes(needle))
    return groupByPrenda(articulos)
  }, [filas, q])

  function closeAndRefresh() {
    setModal(null)
    refreshExistencias()
  }

  if (loadingCatalogos) return <Loading label="Cargando inventario…" />
  if (catalogosError) return <ErrorState error={catalogosError} onRetry={refreshCatalogos} />

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Inventario</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canMover && (
            <Link to="/inventario/traspasos" className="btn btn--secondary btn--small">
              Traspasos
            </Link>
          )}
          {canMover && (
            <Link to="/inventario/conteos" className="btn btn--secondary btn--small">
              Conteo físico
            </Link>
          )}
          {canEditar && (
            <Link to="/inventario/admin" className="btn btn--ghost btn--small">
              Administración
            </Link>
          )}
        </div>
      </div>

      {seccionesActivas.length === 0 ? (
        <EmptyState>Todavía no hay secciones dadas de alta.</EmptyState>
      ) : (
        <>
          <div className="type-tabs" style={{ marginBottom: 10 }}>
            {seccionesActivas.map((s) => (
              <button
                key={s.id}
                type="button"
                className={'type-tab' + (s.id === seccionActivaId ? ' type-tab--active' : '')}
                onClick={() => setSeccionId(s.id)}
              >
                {s.nombre}
              </button>
            ))}
          </div>

          <div className="inv-toolbar">
            <input
              type="search"
              className="input"
              placeholder="Buscar prenda…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="type-tabs">
              <button
                type="button"
                className={'type-tab' + (viewMode === 'total' ? ' type-tab--active' : '')}
                onClick={() => setViewMode('total')}
              >
                Total
              </button>
              {ubicacionesActivas.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={'type-tab' + (viewMode === u.id ? ' type-tab--active' : '')}
                  onClick={() => setViewMode(u.id)}
                >
                  {u.nombre}
                </button>
              ))}
            </div>
          </div>

          {loadingExistencias && <Loading label="Cargando existencias…" />}
          {existenciasError && <ErrorState error={existenciasError} onRetry={refreshExistencias} />}

          {!loadingExistencias && !existenciasError && grupos.length === 0 && (
            <EmptyState>No hay artículos con esos filtros.</EmptyState>
          )}

          {!loadingExistencias && !existenciasError && grupos.length > 0 && (
            <div className="inv-prenda-list">
              {grupos.map((g) => (
                <div key={g.prenda} className="card inv-prenda-card">
                  <h3 className="section-title section-title--small">{g.prenda}</h3>
                  <div className="inv-chip-row">
                    {g.items.map((a) => {
                      const valor = viewMode === 'total' ? a.total : a.porUbicacion[viewMode] ?? 0
                      const bajoMinimo = a.minimo != null && a.total < a.minimo
                      return (
                        <div key={a.articuloId} className={'inv-chip' + (bajoMinimo ? ' inv-chip--low' : '')}>
                          <button
                            type="button"
                            className="inv-chip__main"
                            onClick={() => setModal({ kind: 'historial', articulo: a })}
                            title="Ver historial"
                          >
                            <span className="inv-chip__talla">{a.talla}</span>
                            <span className="inv-chip__valor">{valor}</span>
                            {a.minimo != null && <span className="inv-chip__minimo">mín. {a.minimo}</span>}
                          </button>
                          {canMover && (
                            <div className="inv-chip__actions">
                              <button
                                type="button"
                                className="inv-chip__btn"
                                aria-label={`Salida de ${g.prenda} ${a.talla}`}
                                onClick={() =>
                                  setModal({
                                    kind: 'movimiento',
                                    tipo: 'salida',
                                    articulo: a,
                                  })
                                }
                              >
                                −
                              </button>
                              <button
                                type="button"
                                className="inv-chip__btn"
                                aria-label={`Entrada de ${g.prenda} ${a.talla}`}
                                onClick={() =>
                                  setModal({
                                    kind: 'movimiento',
                                    tipo: 'entrada',
                                    articulo: a,
                                  })
                                }
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal?.kind === 'movimiento' && (
        <MovimientoModal
          articulo={modal.articulo}
          tipo={modal.tipo}
          ubicaciones={ubicacionesActivas}
          motivos={motivosDisponibles}
          defaultUbicacionId={viewMode !== 'total' ? viewMode : ubicacionesActivas[0]?.id}
          onClose={() => setModal(null)}
          onDone={closeAndRefresh}
        />
      )}
      {modal?.kind === 'historial' && <HistorialModal articulo={modal.articulo} onClose={() => setModal(null)} />}
    </div>
  )
}
