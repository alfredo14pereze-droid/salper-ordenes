import { useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useTalleros } from '../hooks/useTalleros'
import { useAuth } from '../contexts/AuthContext'
import { canViewTalleros, canLoanTalleros, canManageTalleros } from '../utils/permissions'
import { darDeBajaTallero, ESTADOS_USO } from '../services/tallerosService'
import TalleroCard from '../components/talleros/TalleroCard'
import PrestarModal from '../components/talleros/PrestarModal'
import DevolverModal from '../components/talleros/DevolverModal'
import TalleroFormModal from '../components/talleros/TalleroFormModal'
import CatalogoPrendasPanel from '../components/talleros/CatalogoPrendasPanel'

// V63 — Talleros: listado filtrable + prestar/devolver + (admin) alta,
// edición, baja y catálogo de prendas. Lo ven todos los roles con sesión
// salvo `tienda` (incluye fábrica, solo consulta).
export default function TallerosPage() {
  return (
    <RequireRole allow={canViewTalleros}>
      <TallerosContent />
    </RequireRole>
  )
}

function TallerosContent() {
  const { role } = useAuth()
  const canLoan = canLoanTalleros(role)
  const canManage = canManageTalleros(role)
  const { talleros, productos, loading, error, refresh } = useTalleros()
  const [fProducto, setFProducto] = useState('')
  const [fColor, setFColor] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { kind, tallero? }
  const [showCatalogo, setShowCatalogo] = useState(false)
  const [actionError, setActionError] = useState(null)

  const colores = useMemo(() => [...new Set(talleros.map((t) => t.color).filter(Boolean))].sort(), [talleros])
  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return talleros.filter(
      (t) =>
        (!fProducto || t.producto_id === fProducto) &&
        (!fColor || t.color === fColor) &&
        (!fEstado || t.estado_uso === fEstado) &&
        (!needle || `${t.codigo} ${t.prestado_a || ''} ${t.mt_productos?.nombre || ''}`.toLowerCase().includes(needle))
    )
  }, [talleros, fProducto, fColor, fEstado, q])

  const counts = useMemo(() => {
    const c = { disponible: 0, prestado: 0, en_reparacion: 0 }
    talleros.forEach((t) => (c[t.estado_uso] = (c[t.estado_uso] || 0) + 1))
    return c
  }, [talleros])

  if (loading) return <Loading label="Cargando talleros…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />

  async function handleBaja(t) {
    if (!window.confirm(`¿Dar de baja ${t.codigo}? Su historial se conserva.`)) return
    setActionError(null)
    const { error: err } = await darDeBajaTallero(t.id)
    if (err) return setActionError(err)
    refresh()
  }

  function closeAndRefresh() {
    setModal(null)
    refresh()
  }

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Talleros</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canLoan && (
            <>
              <button type="button" className="btn btn--primary btn--small" onClick={() => setModal({ kind: 'prestar' })}>
                Prestar
              </button>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setModal({ kind: 'prestar', parcial: true })}>
                Prestar parcial
              </button>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setModal({ kind: 'devolver' })}>
                Devolver
              </button>
            </>
          )}
          {canManage && (
            <>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setModal({ kind: 'form' })}>
                + Nuevo tallero
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowCatalogo((s) => !s)}>
                {showCatalogo ? 'Ocultar catálogo' : 'Catálogo de prendas'}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="tallero-summary">
        <b>{counts.disponible}</b> disponibles · <b>{counts.prestado}</b> prestados · <b>{counts.en_reparacion}</b> en reparación
      </p>

      {showCatalogo && canManage && <CatalogoPrendasPanel productos={productos} onChanged={refresh} />}

      <div className="tallero-filters">
        <input type="search" className="input" placeholder="Buscar código o quién lo tiene…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={fProducto} onChange={(e) => setFProducto(e.target.value)}>
          <option value="">Todas las prendas</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select className="input" value={fColor} onChange={(e) => setFColor(e.target.value)}>
          <option value="">Todos los colores</option>
          {colores.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="input" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS_USO.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      {actionError && <p className="form-error">{actionError.message}</p>}

      {filtrados.length === 0 ? (
        <EmptyState>No hay talleros con esos filtros.</EmptyState>
      ) : (
        <div className="tallero-grid">
          {filtrados.map((t) => (
            <TalleroCard
              key={t.id}
              t={t}
              canLoan={canLoan}
              canManage={canManage}
              onPrestar={(x) => setModal({ kind: 'prestar', tallero: x })}
              onPrestarParcial={(x) => setModal({ kind: 'prestar', tallero: x, parcial: true })}
              onDevolver={(x) => setModal({ kind: 'devolver', tallero: x })}
              onEditar={(x) => setModal({ kind: 'form', tallero: x })}
              onBaja={handleBaja}
            />
          ))}
        </div>
      )}

      {modal?.kind === 'prestar' && (
        <PrestarModal tallero={modal.tallero} parcial={!!modal.parcial} talleros={talleros} onClose={() => setModal(null)} onDone={closeAndRefresh} />
      )}
      {modal?.kind === 'devolver' && (
        <DevolverModal tallero={modal.tallero} talleros={talleros} onClose={() => setModal(null)} onDone={closeAndRefresh} />
      )}
      {modal?.kind === 'form' && (
        <TalleroFormModal tallero={modal.tallero} productos={productos} onClose={() => setModal(null)} onDone={closeAndRefresh} />
      )}
    </div>
  )
}
