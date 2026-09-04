import { useState } from 'react'
import { uploadOrderDocument, getSignedDocumentUrl } from '../../services/documentsService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrderDocument } from '../../utils/permissions'

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
export default function OrderDocumentsCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [busyKind, setBusyKind] = useState(null)
  const [error, setError] = useState(null)

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

  async function handleView(path) {
    setError(null)
    const { data: url, error: signError } = await getSignedDocumentUrl(path)
    if (signError) {
      setError(signError)
      return
    }
    window.open(url, '_blank', 'noopener')
  }

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
      </div>

      {error && <p className="form-error">{error.message}</p>}
    </div>
  )
}
