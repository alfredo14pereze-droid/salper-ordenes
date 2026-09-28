import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../components/talleros/Modal'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canMoverInventario } from '../utils/permissions'
import { useInventarioCatalogos } from '../hooks/useInventario'
import { fetchConteos, crearConteo, fetchConteoLineas } from '../services/inventarioService'
import ConteoCapturaModal from '../components/inventario/ConteoCapturaModal'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { buildConteoBlob, conteoFileName } from '../utils/generateInventarioConteoPdf'

function formatFecha(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function useConteos() {
  const [conteos, setConteos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchConteos()
    if (fetchError) setError(fetchError)
    else {
      setConteos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { conteos, loading, error, refresh: load }
}

// Elegir sección + ubicación para arrancar un conteo nuevo.
function NuevoConteoModal({ secciones, ubicaciones, onClose, onCreated }) {
  const [seccionId, setSeccionId] = useState(secciones[0]?.id || '')
  const [ubicacionId, setUbicacionId] = useState(ubicaciones[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!seccionId || !ubicacionId) return
    setSaving(true)
    setError(null)
    const { data, error: err } = await crearConteo({ seccionId, ubicacionId })
    setSaving(false)
    if (err) return setError(err)
    onCreated(data)
  }

  return (
    <Modal title="Nuevo conteo físico" onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <label>
          Sección
          <select className="input" value={seccionId} onChange={(e) => setSeccionId(e.target.value)}>
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ubicación
          <select className="input" value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)}>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
        <p className="pantone-hint">
          Se genera una foto de la existencia de hoy para esa sección y ubicación, y se abre el PDF para imprimir.
        </p>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !seccionId || !ubicacionId}>
            {saving ? 'Creando…' : 'Crear e imprimir'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function InventarioConteosPage() {
  return (
    <RequireInventarioAccess>
      <InventarioConteosContent />
    </RequireInventarioAccess>
  )
}

function InventarioConteosContent() {
  const { role } = useAuth()
  const canMover = canMoverInventario(role)
  const { secciones, ubicaciones, loading: loadingCatalogos } = useInventarioCatalogos()
  const { conteos, loading, error, refresh } = useConteos()
  const [showNuevo, setShowNuevo] = useState(false)
  const [captura, setCaptura] = useState(null) // conteo seleccionado para capturar/ver
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfName, setPdfName] = useState('')
  const [pdfBusyId, setPdfBusyId] = useState(null)

  const seccionNombre = useMemo(() => {
    const map = new Map(secciones.map((s) => [s.id, s.nombre]))
    return (id) => map.get(id) || '—'
  }, [secciones])
  const ubicacionNombre = useMemo(() => {
    const map = new Map(ubicaciones.map((u) => [u.id, u.nombre]))
    return (id) => map.get(id) || '—'
  }, [ubicaciones])

  async function handleCreated(conteo) {
    setShowNuevo(false)
    refresh()
    const { data: lineas } = await fetchConteoLineas(conteo.id)
    const blob = await buildConteoBlob({
      seccionNombre: seccionNombre(conteo.seccion_id),
      ubicacionNombre: ubicacionNombre(conteo.ubicacion_id),
      fecha: conteo.creado_en,
      lineas: lineas || [],
    })
    setPdfBlob(blob)
    setPdfName(conteoFileName(seccionNombre(conteo.seccion_id), conteo.creado_en))
  }

  async function verPdf(conteo) {
    setPdfBusyId(conteo.id)
    const { data: lineas } = await fetchConteoLineas(conteo.id)
    const blob = await buildConteoBlob({
      seccionNombre: seccionNombre(conteo.seccion_id),
      ubicacionNombre: ubicacionNombre(conteo.ubicacion_id),
      fecha: conteo.creado_en,
      lineas: lineas || [],
    })
    setPdfBusyId(null)
    setPdfBlob(blob)
    setPdfName(conteoFileName(seccionNombre(conteo.seccion_id), conteo.creado_en))
  }

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Conteos físicos de inventario</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/inventario" className="btn btn--ghost btn--small">
            ← Inventario
          </Link>
          {canMover && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setShowNuevo(true)}>
              + Nuevo conteo
            </button>
          )}
        </div>
      </div>

      {loading && <Loading label="Cargando conteos…" />}
      {error && <ErrorState error={error} onRetry={refresh} />}
      {!loading && !error && conteos.length === 0 && <EmptyState>No hay conteos todavía.</EmptyState>}
      {!loading && !error && conteos.length > 0 && (
        <div className="document-list">
          {conteos.map((c) => (
            <div key={c.id} className="document-row">
              <div>
                <span className="document-row__label">
                  {seccionNombre(c.seccion_id)} · {ubicacionNombre(c.ubicacion_id)}
                </span>
                <p className="pantone-hint" style={{ margin: '2px 0 0' }}>
                  {formatFecha(c.creado_en)}
                  {c.creado_por_nombre && ` · ${c.creado_por_nombre}`}
                  {' · '}
                  {c.confirmado_en ? (
                    <span style={{ color: 'var(--color-good)' }}>Confirmado</span>
                  ) : (
                    <span style={{ color: 'var(--color-warning)' }}>Pendiente de capturar</span>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => verPdf(c)} disabled={pdfBusyId === c.id}>
                  {pdfBusyId === c.id ? 'Generando…' : 'Ver PDF'}
                </button>
                {(canMover || c.confirmado_en) && (
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => setCaptura(c)}>
                    {c.confirmado_en ? 'Ver' : 'Capturar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNuevo && !loadingCatalogos && (
        <NuevoConteoModal
          secciones={secciones.filter((s) => s.activa)}
          ubicaciones={ubicaciones.filter((u) => u.activa)}
          onClose={() => setShowNuevo(false)}
          onCreated={handleCreated}
        />
      )}
      {captura && (
        <ConteoCapturaModal
          conteo={captura}
          seccionNombre={seccionNombre(captura.seccion_id)}
          ubicacionNombre={ubicacionNombre(captura.ubicacion_id)}
          onClose={() => setCaptura(null)}
          onDone={() => {
            setCaptura(null)
            refresh()
          }}
        />
      )}
      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfName} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
