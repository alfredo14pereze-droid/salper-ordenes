import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchPendiente, fetchHistorial, cambiarEstado, ESTADOS, SIGUIENTE, sinRecibirAlerta, urgenciaFecha } from '../services/pendientesService'
import PendienteForm from '../components/pendientes/PendienteForm'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { buildEtiquetaBlob, etiquetaFileName } from '../utils/generatePendientePdf'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { pfEsTienda, pfEsFabrica } from '../utils/permissions'
import { formatDate, formatDateTime } from '../utils/dates'

export default function PendienteDetailPage() {
  const { id } = useParams()
  const { role } = useAuth()
  const [p, setP] = useState(null)
  const [hist, setHist] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [edit, setEdit] = useState(false)
  const [preview, setPreview] = useState(null)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetchPendiente(id), fetchHistorial(id)])
    if (a.error) setError(a.error)
    else {
      setP(a.data)
      setHist(b.data || [])
      setError(null)
    }
    setLoading(false)
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  async function run(fn) {
    setBusy(true)
    setActionError(null)
    const { error: e } = await fn()
    setBusy(false)
    if (e) setActionError(e)
    else {
      setNota('')
      load()
    }
  }

  async function etiqueta() {
    const blob = await buildEtiquetaBlob(p)
    setPreview({ blob, fileName: etiquetaFileName(p) })
  }

  if (loading) return <Loading label="Cargando pendiente…" />
  if (error) return <ErrorState error={error} onRetry={load} />
  if (!p) return null

  const sig = SIGUIENTE[p.estado]
  const puedeSig = sig && (sig.quien === 'fabrica' ? pfEsFabrica(role) : pfEsTienda(role))
  const puedeEditar = pfEsTienda(role) && (p.estado === 'enviado_a_fabrica' || role === 'admin_general')
  const urg = urgenciaFecha(p)

  return (
    <div className="page page--narrow">
      <Link to="/pendientes" className="back-link">
        ← Volver a pendientes
      </Link>
      <div className="order-detail__header">
        <div>
          <h2 className="order-detail__number">{p.folio}</h2>
          <p className="order-detail__client">
            {p.tipo?.nombre} · × {p.cantidad}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge badge--status">{ESTADOS[p.estado].label}</span>
          <button type="button" className="btn btn--secondary" onClick={etiqueta}>
            Imprimir etiqueta
          </button>
          {puedeEditar && (
            <button type="button" className="btn btn--ghost" onClick={() => setEdit(true)}>
              Editar
            </button>
          )}
        </div>
      </div>
      {sinRecibirAlerta(p) && <p className="pf-alerta pf-alerta--banner">⚠ Enviado a fábrica y sin recibir desde hace más de 1 día</p>}

      <section className="card">
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{p.descripcion}</p>
        <div className="pf-card__meta" style={{ marginTop: 10 }}>
          <span>
            Prenda: {p.prenda} · Talla {p.talla}
          </span>
          {p.es_para_cliente ? (
            <span>{p.pagado ? '💰 Pagado' : 'No pagado'}</span>
          ) : (
            <span>{p.inventariado === null ? 'Inventariado: —' : p.inventariado ? 'Inventariado' : 'No inventariado'}</span>
          )}
          {p.es_para_cliente ? (
            <>
              <span>Cliente: {p.cliente_nombre}</span>
              <span>Teléfono: {p.cliente_telefono}</span>
            </>
          ) : (
            <span>Se queda en la tienda (sin cliente)</span>
          )}
          {p.fecha_requerida && (
            <span className={'pf-due' + (urg?.nivel ? ` pf-due--${urg.nivel}` : '')}>
              Regresa {formatDate(p.fecha_requerida)}
              {urg ? ` · ${urg.label}` : ''}
            </span>
          )}
          <span>Creó: {p.creado_por_nombre || '—'} · {formatDateTime(p.created_at)}</span>
        </div>
        {p.fotos?.length > 0 && (
          <div className="photo-picker__grid" style={{ marginTop: 10 }}>
            {p.fotos.map((f) => (
              <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="photo-picker__thumb">
                <img src={f.url} alt="" />
              </a>
            ))}
          </div>
        )}
      </section>

      {puedeSig && (
        <section className="card order-form">
          <label>
            Nota <span className="pantone-hint">(opcional)</span>
            <textarea className="input" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary pf-big" disabled={busy} onClick={() => run(() => cambiarEstado(p.id, sig.next, nota))}>
              {sig.label}
            </button>
          </div>
          {actionError && <p className="form-error">{actionError.message}</p>}
        </section>
      )}

      <section className="card">
        <h3 className="section-title section-title--small">Historial</h3>
        <ol className="pf-hist">
          {hist.map((h) => (
            <li key={h.id}>
              <strong>{ESTADOS[h.estado_nuevo]?.label || h.estado_nuevo}</strong>
              <span className="pf-hist__meta">
                {' '}
                · {h.cambiado_por_nombre || 'Usuario'}
                {h.rol ? ` (${h.rol})` : ''} · {formatDateTime(h.created_at)}
              </span>
              {h.nota && <div className="pf-hist__nota">“{h.nota}”</div>}
            </li>
          ))}
        </ol>
      </section>

      {edit && (
        <PendienteForm
          pendiente={p}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false)
            load()
          }}
        />
      )}
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </div>
  )
}
