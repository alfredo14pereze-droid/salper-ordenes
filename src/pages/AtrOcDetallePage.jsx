import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading } from '../components/common/States'
import AyudaModulo from '../components/common/AyudaModulo'
import Modal from '../components/talleros/Modal'
import { useAuth } from '../contexts/AuthContext'
import { canOcAtr, canVerAtr } from '../utils/permissions'
import { cancelarAtrOc, fetchAtrOcDetalle, fetchAtrOcLista, urlPdfOcAtr } from '../services/atrService'
import { ESTADOS_OC, pctSurtido, urgenciaEntrega } from '../utils/atrOc'
import { daysUntil, formatDate, formatDateTime } from '../utils/dates'
import '../components/atr/atr.css'

// V215 — Detalle de una OC de ATR: datos, PDF en vista previa y líneas con
// pedido / surtido / pendiente / existencia actual. Cancelar pide motivo y
// avisa que lo ya surtido NO se revierte solo.
export default function AtrOcDetallePage() {
  return (
    <RequireRole allow={canVerAtr}>
      <AtrOcDetalle />
    </RequireRole>
  )
}

const n = (x) => Number(x || 0).toLocaleString('es-MX')

function AtrOcDetalle() {
  const { id } = useParams()
  const { role } = useAuth()
  const [oc, setOc] = useState(undefined)
  const [lineas, setLineas] = useState(null)
  const [error, setError] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [verPdf, setVerPdf] = useState(false)
  const [errPdf, setErrPdf] = useState(null)
  const [cancelar, setCancelar] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const [l, d] = await Promise.all([fetchAtrOcLista(), fetchAtrOcDetalle(Number(id))])
    if (l.error || d.error) return setError(l.error || d.error)
    setOc((l.data || []).find((x) => String(x.id) === String(id)) || null)
    setLineas(d.data || [])
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function abrirPdf() {
    setErrPdf(null)
    if (verPdf) return setVerPdf(false)
    if (!pdfUrl) {
      const { data, error: e } = await urlPdfOcAtr(oc.pdf_url)
      if (e) return setErrPdf('No se pudo abrir el PDF: ' + e.message)
      setPdfUrl(data)
    }
    setVerPdf(true)
  }

  if (error) return <div className="page"><ErrorState error={error} onRetry={cargar} /></div>
  if (oc === undefined || !lineas) return <div className="page"><Loading /></div>
  if (oc === null) {
    return (
      <div className="page atr">
        <Link to="/atr?tab=oc" className="atr-volver">← Órdenes de compra</Link>
        <p>No existe esa orden de compra.</p>
      </div>
    )
  }

  const urg = urgenciaEntrega(oc.estado, oc.fecha_entrega ? daysUntil(oc.fecha_entrega) : null)
  const pend = lineas.reduce((s, l) => s + l.pendiente, 0)

  return (
    <div className="page atr">
      <Link to="/atr?tab=oc" className="atr-volver">← Órdenes de compra</Link>
      <div className="section-header">
        <h2 className="section-title">OC {oc.numero_oc} <AyudaModulo id="atr" /></h2>
        <div className="atr-acciones">
          {oc.pdf_url && (
            <button type="button" className="btn btn--ghost btn--small" onClick={abrirPdf}>{verPdf ? 'Ocultar PDF' : 'Ver PDF'}</button>
          )}
          {canOcAtr(role) && oc.estado !== 'cancelada' && (
            <button type="button" className="btn btn--ghost btn--small atr-btn-peligro" onClick={() => setCancelar(true)}>Cancelar OC</button>
          )}
        </div>
      </div>

      <div className="atr-oc-cabecera">
        <span className={`atr-chip atr-chip--${oc.estado}`}>{ESTADOS_OC[oc.estado]}</span>
        <span>Fecha OC: <strong>{formatDate(oc.fecha_oc)}</strong></span>
        <span>Entrega: <strong>{oc.fecha_entrega ? formatDate(oc.fecha_entrega) : '—'}</strong></span>
        {oc.estado !== 'cancelada' && <span className={'order-card__due' + (urg.nivel ? ` order-card__due--${urg.nivel}` : '')}>{urg.texto}</span>}
        <span>Surtido: <strong>{n(oc.surtido)} / {n(oc.pedido)}</strong> ({pctSurtido(oc)}%)</span>
      </div>
      <p className="atr-muted atr-oc-meta">
        Subida por {oc.creado_por_nombre || '—'} el {formatDateTime(oc.creado_en)}
        {oc.notas ? <> · Notas: {oc.notas}</> : null}
      </p>
      {oc.estado === 'cancelada' && (
        <p className="atr-aviso">Cancelada el {formatDateTime(oc.cancelada_en)}. Motivo: {oc.motivo_cancelacion}</p>
      )}
      {errPdf && <p className="form-error">{errPdf}</p>}

      <div className={'atr-oc-detalle' + (verPdf && pdfUrl ? ' atr-oc-detalle--con-pdf' : '')}>
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-tabla">
            <thead>
              <tr>
                <th>Bata</th><th>Talla</th>
                <th className="atr-num">Pedido</th><th className="atr-num">Surtido</th>
                <th className="atr-num">Pendiente</th><th className="atr-num">Existencia</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.oc_linea_id} className={l.pendiente > 0 && l.existencia < l.pendiente && oc.estado !== 'cancelada' ? 'atr-oc-fila--falta' : ''}>
                  <td>{l.producto}{l.texto_pdf ? <div className="atr-muted atr-oc-pdf-txt">PDF: {l.texto_pdf}</div> : null}</td>
                  <td>{l.talla}</td>
                  <td className="atr-num">{n(l.pedido)}</td>
                  <td className="atr-num">{n(l.surtido)}</td>
                  <td className="atr-num"><strong>{n(l.pendiente)}</strong></td>
                  <td className={'atr-num' + (l.existencia < 0 ? ' atr-negativo' : '')}>{n(l.existencia)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Total</strong></td>
                <td className="atr-num"><strong>{n(oc.pedido)}</strong></td>
                <td className="atr-num"><strong>{n(oc.surtido)}</strong></td>
                <td className="atr-num"><strong>{n(pend)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {verPdf && pdfUrl && (
          <div className="atr-oc-visor"><iframe title={`PDF OC ${oc.numero_oc}`} src={pdfUrl} /></div>
        )}
      </div>

      {cancelar && <CancelarOc oc={oc} onClose={() => setCancelar(false)} onListo={() => { setCancelar(false); cargar() }} />}
    </div>
  )
}

function CancelarOc({ oc, onClose, onListo }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function confirmar() {
    setError(null)
    if (!motivo.trim()) return setError('Escribe por qué se cancela.')
    setGuardando(true)
    const { error: e } = await cancelarAtrOc(oc.id, motivo.trim())
    setGuardando(false)
    if (e) return setError(e.message)
    onListo()
  }

  return (
    <Modal title={`Cancelar OC ${oc.numero_oc}`} onClose={onClose}>
      <p>La OC dejará de contar en "Qué nos falta" y ya no se podrá surtir.</p>
      {oc.surtido > 0 && (
        <div className="atr-aviso">
          <span>
            Esta OC ya tiene <strong>{n(oc.surtido)} batas surtidas</strong>. Cancelarla <strong>no</strong> las regresa al
            inventario. Si se deben regresar, deshaz el surtido antes de cancelar.
          </span>
        </div>
      )}
      <label className="atr-campo"><span className="field-label">Motivo</span>
        <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="atr-pie">
        <button type="button" className="btn btn--ghost" onClick={onClose}>No cancelar</button>
        <button type="button" className="btn btn--primary atr-btn-peligro--lleno" disabled={guardando} onClick={confirmar}>
          {guardando ? 'Cancelando…' : 'Sí, cancelar OC'}
        </button>
      </div>
    </Modal>
  )
}
