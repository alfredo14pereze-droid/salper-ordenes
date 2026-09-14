import { useEffect, useState } from 'react'
import { uploadOrderDocument, uploadClienteConstanciaFiscal, getSignedDocumentUrl } from '../../services/documentsService'
import { fetchClienteById } from '../../services/clientesService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrderDocument, canManageClienteDocuments } from '../../utils/permissions'

const DOC_TYPES = [
  { kind: 'cotizacion', label: 'Cotización', field: 'cotizacion_pdf_path' },
  { kind: 'orden_compra', label: 'Orden de compra', field: 'orden_compra_pdf_path' },
  { kind: 'factura', label: 'Factura', field: 'factura_pdf_path' },
]

// Cotización, orden de compra y factura son independientes entre sí —
// puede haber cualquier combinación. El archivo vive en un bucket privado
// (ver documentsService.js): "Ver" pide una URL firmada al momento del
// clic, no hay URL fija guardada. Quién puede subir/reemplazar CADA
// documento se decide por fila (canEditOrderDocument), no para la tarjeta
// completa: la factura se puede subir en cualquier estado de la orden,
// cotización/orden de compra solo mientras sigue en_confirmacion (para
// tienda; admin siempre puede con los tres).
//
// V42: se agrega una fila más — la constancia de situación fiscal, pero
// es del CLIENTE (clientes.constancia_fiscal_path), no de la orden, así
// que vive aparte del resto: se pide con fetchClienteById (order solo
// trae client_id, no los datos del cliente) y solo aparece si esta orden
// tiene un cliente del catálogo (order.client_id) — si no, no hay dónde
// guardarla.
export default function OrderDocumentsCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [busyKind, setBusyKind] = useState(null)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [clienteLoading, setClienteLoading] = useState(!!order.client_id)

  useEffect(() => {
    if (!order.client_id) {
      setCliente(null)
      setClienteLoading(false)
      return
    }
    setClienteLoading(true)
    fetchClienteById(order.client_id).then(({ data }) => {
      setCliente(data || null)
      setClienteLoading(false)
    })
  }, [order.client_id])

  async function handleUpload(kind, file) {
    if (!file) return
    setBusyKind(kind)
    setError(null)

    const { error: uploadError } = await uploadOrderDocument(order.id, kind, file)
    setBusyKind(null)

    if (uploadError) {
      setError(uploadError)
      return
    }
    onUpdated?.()
  }

  async function handleUploadConstancia(file) {
    if (!file || !order.client_id) return
    setBusyKind('constancia')
    setError(null)

    const { data, error: uploadError } = await uploadClienteConstanciaFiscal(order.client_id, file)
    setBusyKind(null)

    if (uploadError) {
      setError(uploadError)
      return
    }
    setCliente(data)
  }

  async function handleView(path) {
    setError(null)
    const { data: url, error: signError } = await getSignedDocumentUrl(path)
    if (signError) {
      setError(signError)
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  const constanciaEditable = canManageClienteDocuments(role) && !order.eliminada_en

  return (
    <div>
      <h3 className="section-title section-title--small">Documentos</h3>

      <div className="document-list">
        {DOC_TYPES.map(({ kind, label, field }) => {
          const path = order[field]
          const busy = busyKind === kind
          const editable = canEditOrderDocument(role, order, kind) && !order.eliminada_en

          return (
            <div key={kind} className="document-row">
              <span className="document-row__label">{label}</span>

              <div className="document-row__actions">
                {path && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => handleView(path)}>
                    Ver
                  </button>
                )}
                {editable && (
                  <label className="btn btn--secondary btn--small">
                    <input
                      type="file"
                      accept="application/pdf"
                      hidden
                      disabled={busy}
                      onChange={(e) => handleUpload(kind, e.target.files?.[0])}
                    />
                    {busy ? 'Subiendo…' : path ? 'Reemplazar' : 'Subir PDF'}
                  </label>
                )}
                {!path && !editable && <span className="document-row__empty">Sin documento</span>}
              </div>
            </div>
          )
        })}

        {order.client_id && !clienteLoading && (
          <div className="document-row">
            <span className="document-row__label">Constancia de situación fiscal (del cliente)</span>

            <div className="document-row__actions">
              {cliente?.constancia_fiscal_path && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => handleView(cliente.constancia_fiscal_path)}>
                  Ver
                </button>
              )}
              {constanciaEditable && (
                <label className="btn btn--secondary btn--small">
                  <input
                    type="file"
                    accept="application/pdf"
                    hidden
                    disabled={busyKind === 'constancia'}
                    onChange={(e) => handleUploadConstancia(e.target.files?.[0])}
                  />
                  {busyKind === 'constancia' ? 'Subiendo…' : cliente?.constancia_fiscal_path ? 'Reemplazar' : 'Subir PDF'}
                </label>
              )}
              {!cliente?.constancia_fiscal_path && !constanciaEditable && <span className="document-row__empty">Sin documento</span>}
            </div>
          </div>
        )}
      </div>
      {order.client_id && (
        <p className="pantone-hint" style={{ marginTop: 8 }}>
          La constancia se guarda en el cliente "{order.client_name}" — al subirla aquí queda disponible en todas
          sus órdenes, no solo en esta.
        </p>
      )}

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
