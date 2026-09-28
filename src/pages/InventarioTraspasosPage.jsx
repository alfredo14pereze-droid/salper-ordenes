import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canMoverInventario } from '../utils/permissions'
import { useInventarioCatalogos } from '../hooks/useInventario'
import { fetchTraspasos, fetchTraspasoDetalle } from '../services/inventarioService'
import TraspasoFormModal from '../components/inventario/TraspasoFormModal'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { buildTraspasoBlob, traspasoFileName } from '../utils/generateInventarioTraspasoPdf'

function formatFecha(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function useTraspasos() {
  const [traspasos, setTraspasos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchTraspasos()
    if (fetchError) setError(fetchError)
    else {
      setTraspasos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { traspasos, loading, error, refresh: load }
}

export default function InventarioTraspasosPage() {
  return (
    <RequireInventarioAccess>
      <InventarioTraspasosContent />
    </RequireInventarioAccess>
  )
}

function InventarioTraspasosContent() {
  const { role } = useAuth()
  const canMover = canMoverInventario(role)
  const { ubicaciones, secciones, loading: loadingCatalogos } = useInventarioCatalogos()
  const { traspasos, loading, error, refresh } = useTraspasos()
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfName, setPdfName] = useState('')
  const [pdfBusyId, setPdfBusyId] = useState(null)

  const ubicacionNombre = useMemo(() => {
    const map = new Map(ubicaciones.map((u) => [u.id, u.nombre]))
    return (id) => map.get(id) || '—'
  }, [ubicaciones])

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return traspasos.filter((t) => !needle || t.folio.toLowerCase().includes(needle))
  }, [traspasos, q])

  async function handleCreated(traspaso, lineas) {
    setShowForm(false)
    refresh()
    const blob = await buildTraspasoBlob({
      traspaso,
      origenNombre: ubicacionNombre(traspaso.origen_id),
      destinoNombre: ubicacionNombre(traspaso.destino_id),
      lineas,
    })
    setPdfBlob(blob)
    setPdfName(traspasoFileName(traspaso))
  }

  async function verPdf(traspaso) {
    setPdfBusyId(traspaso.id)
    const { data: lineasRaw } = await fetchTraspasoDetalle(traspaso.id)
    const lineas = (lineasRaw || []).map((l) => ({ articuloId: l.articulo_id, prenda: l.prenda, talla: l.talla, cantidad: l.cantidad }))
    const blob = await buildTraspasoBlob({
      traspaso,
      origenNombre: ubicacionNombre(traspaso.origen_id),
      destinoNombre: ubicacionNombre(traspaso.destino_id),
      lineas,
    })
    setPdfBusyId(null)
    setPdfBlob(blob)
    setPdfName(traspasoFileName(traspaso))
  }

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Traspasos de inventario</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/inventario" className="btn btn--ghost btn--small">
            ← Inventario
          </Link>
          {canMover && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setShowForm(true)}>
              + Nuevo traspaso
            </button>
          )}
        </div>
      </div>

      <input
        type="search"
        className="input"
        placeholder="Buscar por folio (ej. T-0001)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 14 }}
      />

      {loading && <Loading label="Cargando traspasos…" />}
      {error && <ErrorState error={error} onRetry={refresh} />}
      {!loading && !error && filtrados.length === 0 && <EmptyState>No hay traspasos todavía.</EmptyState>}
      {!loading && !error && filtrados.length > 0 && (
        <div className="document-list">
          {filtrados.map((t) => (
            <div key={t.id} className="document-row">
              <div>
                <span className="document-row__label">{t.folio}</span>
                <p className="pantone-hint" style={{ margin: '2px 0 0' }}>
                  {ubicacionNombre(t.origen_id)} → {ubicacionNombre(t.destino_id)} · {formatFecha(t.creado_en)}
                  {t.creado_por_nombre && ` · ${t.creado_por_nombre}`}
                </p>
                {t.nota && <p className="pantone-hint" style={{ margin: '2px 0 0' }}>{t.nota}</p>}
              </div>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => verPdf(t)} disabled={pdfBusyId === t.id}>
                {pdfBusyId === t.id ? 'Generando…' : 'Ver PDF'}
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && !loadingCatalogos && (
        <TraspasoFormModal ubicaciones={ubicaciones.filter((u) => u.activa)} secciones={secciones} onClose={() => setShowForm(false)} onDone={handleCreated} />
      )}
      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfName} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
