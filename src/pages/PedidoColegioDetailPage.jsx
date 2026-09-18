import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { Loading, ErrorState } from '../components/common/States'
import { usePedidoColegio } from '../hooks/usePedidosColegio'
import { addAbono, deleteAbono, softDeletePedido } from '../services/pedidosColegioService'
import { buildPedidoColegioPdfBlob, pedidoColegioPdfFileName } from '../utils/generatePedidoColegioPdf'
import { canManagePedidosColegio } from '../utils/permissions'
import { formatDate } from '../utils/dates'
import { formatImporte, formatMonto, calcSaldo, sumAbonos } from '../utils/pedidosColegio'

// V57 — detalle de un Pedido Colegio (BETA, solo admin_general): folio,
// cliente, líneas, anticipo, abonos posteriores (con saldo en vivo) y el
// recibo en PDF.
export default function PedidoColegioDetailPage() {
  return (
    <RequireRole allow={canManagePedidosColegio}>
      <PedidoColegioDetailContent />
    </RequireRole>
  )
}

function todayInputValue() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function PedidoColegioDetailContent() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { pedido, loading, error, refresh } = usePedidoColegio(id)

  // Si venimos de crear el pedido (NewPedidoColegioPage), el recibo ya se
  // generó allá y viaja en location.state — se abre en vista previa. Lazy
  // init: cerrarlo no lo vuelve a abrir aunque location.state persista.
  const [preview, setPreview] = useState(() => location.state?.pdfPreview || null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  const [abonoOpen, setAbonoOpen] = useState(false)
  const [abonoMonto, setAbonoMonto] = useState('')
  const [abonoNota, setAbonoNota] = useState('')
  const [abonoFecha, setAbonoFecha] = useState(todayInputValue)
  const [abonoSaving, setAbonoSaving] = useState(false)
  const [abonoError, setAbonoError] = useState(null)
  const [deletingAbonoId, setDeletingAbonoId] = useState(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  if (loading) return <Loading label="Cargando pedido…" />
  if (error) return <ErrorState error={error} onRetry={refresh} />
  if (!pedido) return <ErrorState error={new Error('Este pedido no existe.')} />

  const eliminado = !!pedido.eliminado_en
  const abonado = sumAbonos(pedido.abonos)
  const saldo = calcSaldo(pedido, pedido.abonos)

  async function handleGeneratePdf() {
    setGeneratingPdf(true)
    setPdfError(null)
    try {
      const blob = await buildPedidoColegioPdfBlob(pedido)
      setPreview({ blob, fileName: pedidoColegioPdfFileName(pedido) })
    } catch (err) {
      setPdfError(err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  async function handleAddAbono(e) {
    e.preventDefault()
    const monto = Number(abonoMonto)
    if (!monto || monto <= 0) return setAbonoError(new Error('El monto del abono debe ser mayor a cero.'))
    if (monto > saldo) return setAbonoError(new Error(`El abono no puede pasar del saldo pendiente (${formatMonto(saldo)}).`))

    setAbonoSaving(true)
    setAbonoError(null)
    const { error: addError } = await addAbono(pedido.id, monto, abonoNota.trim(), abonoFecha)
    setAbonoSaving(false)
    if (addError) return setAbonoError(addError)

    setAbonoMonto('')
    setAbonoNota('')
    setAbonoFecha(todayInputValue())
    setAbonoOpen(false)
    refresh()
  }

  async function handleDeleteAbono(abonoId) {
    setDeletingAbonoId(abonoId)
    setAbonoError(null)
    const { error: delError } = await deleteAbono(abonoId)
    setDeletingAbonoId(null)
    if (delError) return setAbonoError(delError)
    refresh()
  }

  async function handleDeletePedido() {
    setDeleting(true)
    setDeleteError(null)
    const { error: delError } = await softDeletePedido(pedido.id)
    setDeleting(false)
    if (delError) return setDeleteError(delError)
    navigate('/pedidos-colegio')
  }

  return (
    <div className="page page--narrow">
      <Link to="/pedidos-colegio" className="back-link">
        ← Volver a Pedidos Colegio
      </Link>

      <div className="order-detail__header">
        <div>
          <h2 className="order-detail__number">
            Pedido {pedido.folio} <span className="badge badge--outline">Beta</span>
          </h2>
          <p className="order-detail__client">
            {pedido.colegio?.nombre} · {formatDate(pedido.fecha_pedido)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {eliminado && <span className="badge badge--danger">Eliminado</span>}
          <button type="button" className="btn btn--primary" onClick={handleGeneratePdf} disabled={generatingPdf}>
            {generatingPdf ? 'Generando…' : 'Generar recibo PDF'}
          </button>
        </div>
      </div>
      {pdfError && <p className="form-error">No se pudo generar el PDF: {pdfError.message}</p>}
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}

      <div className="order-detail__grid">
        <section className="card">
          <h3 className="section-title section-title--small">Cliente</h3>
          <dl className="detail-list">
            <div>
              <dt>Nombre</dt>
              <dd>{pedido.cliente_nombre}</dd>
            </div>
            {pedido.cliente_referencia && (
              <div>
                <dt>Referencia</dt>
                <dd>{pedido.cliente_referencia}</dd>
              </div>
            )}
            {pedido.cliente_telefono && (
              <div>
                <dt>Teléfono</dt>
                <dd>{pedido.cliente_telefono}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="card">
          <h3 className="section-title section-title--small">Pagos</h3>
          <div className="payments-summary">
            <div className="payments-summary__stat">
              <span className="payments-summary__label">Subtotal</span>
              <span className="payments-summary__value">{formatMonto(pedido.subtotal)}</span>
            </div>
            <div className="payments-summary__stat">
              <span className="payments-summary__label">Anticipo {formatImporte(pedido.anticipo_porcentaje)}%</span>
              <span className="payments-summary__value">{formatMonto(pedido.anticipo_monto)}</span>
            </div>
            <div className="payments-summary__stat">
              <span className="payments-summary__label">Abonos</span>
              <span className="payments-summary__value">{formatMonto(abonado)}</span>
            </div>
            <div className="payments-summary__stat">
              <span className="payments-summary__label">Saldo pendiente</span>
              <span
                className="payments-summary__value"
                style={{ color: saldo > 0 ? 'var(--color-danger)' : 'var(--color-good)' }}
              >
                {formatMonto(saldo)}
              </span>
            </div>
          </div>
        </section>

        <section className="card card--placeholders">
          <h3 className="section-title section-title--small">Artículos</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Talla</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {pedido.articulos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.articulo}</td>
                    <td>{a.talla || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{a.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{formatImporte(a.precio_unitario)}</td>
                    <td style={{ textAlign: 'right' }}>{formatImporte(a.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card card--placeholders">
          <div className="section-header">
            <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
              Abonos posteriores
            </h3>
            {!eliminado && !abonoOpen && saldo > 0 && (
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setAbonoOpen(true)}>
                + Registrar abono
              </button>
            )}
          </div>

          {pedido.abonos.length === 0 ? (
            <p className="pantone-hint">Todavía no hay abonos después del anticipo.</p>
          ) : (
            <div className="document-list">
              {pedido.abonos.map((ab) => (
                <div key={ab.id} className="document-row">
                  <div>
                    <span className="document-row__label">{formatMonto(ab.monto)}</span>
                    <p className="document-row__empty" style={{ marginTop: 2 }}>
                      {formatDate(ab.fecha)}
                      {ab.nota ? ` · ${ab.nota}` : ''}
                    </p>
                  </div>
                  {!eliminado && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={deletingAbonoId === ab.id}
                      onClick={() => handleDeleteAbono(ab.id)}
                    >
                      {deletingAbonoId === ab.id ? 'Borrando…' : 'Borrar'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {abonoOpen && (
            <form className="order-form" onSubmit={handleAddAbono}>
              <div className="form-row-3">
                <label>
                  Fecha
                  <input type="date" className="input" value={abonoFecha} onChange={(e) => setAbonoFecha(e.target.value)} />
                </label>
                <label>
                  Monto *
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="input"
                    value={abonoMonto}
                    onChange={(e) => setAbonoMonto(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                </label>
                <label>
                  Nota
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. efectivo, transferencia"
                    value={abonoNota}
                    onChange={(e) => setAbonoNota(e.target.value)}
                  />
                </label>
              </div>
              <div className="order-form__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setAbonoOpen(false)} disabled={abonoSaving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={abonoSaving}>
                  {abonoSaving ? 'Guardando…' : 'Guardar abono'}
                </button>
              </div>
            </form>
          )}
          {abonoError && <p className="form-error">{abonoError.message}</p>}
        </section>

        {!eliminado && (
          <section className="card card--placeholders">
            {!confirmDelete ? (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar pedido
              </button>
            ) : (
              <div>
                <p className="form-error" style={{ marginTop: 0 }}>
                  ¿Eliminar el pedido {pedido.folio}? Deja de aparecer en la lista y ya no admite abonos. El folio no se
                  vuelve a usar.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn--primary btn--small" onClick={handleDeletePedido} disabled={deleting}>
                    {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
                {deleteError && <p className="form-error">{deleteError.message}</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
