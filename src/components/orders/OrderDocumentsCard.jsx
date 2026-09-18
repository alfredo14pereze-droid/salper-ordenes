import { useCallback, useEffect, useState } from 'react'
import {
  fetchOrderDocumentos,
  uploadOrderDocument,
  deleteOrderDocumento,
  uploadClienteConstanciaFiscal,
  getSignedDocumentUrl,
} from '../../services/documentsService'
import { fetchClienteById } from '../../services/clientesService'
import { useAuth } from '../../contexts/AuthContext'
import { canEditOrderDocument, canManageClienteDocuments } from '../../utils/permissions'
import FileDropLabel from '../common/FileDropLabel'

const DOC_TYPES = [
  { kind: 'cotizacion', label: 'Cotización' },
  { kind: 'orden_compra', label: 'Orden de compra' },
  { kind: 'factura', label: 'Factura' },
]

// Cotización, orden de compra y factura son independientes entre sí, y
// desde V58 de cada tipo puede haber VARIOS archivos (tabla
// order_documentos) — se listan todos, y quien tenga permiso puede
// agregar más o quitar alguno. El archivo vive en un bucket privado (ver
// documentsService.js): "Ver" pide una URL firmada al momento del clic, no
// hay URL fija guardada. Quién puede subir/quitar CADA tipo se decide por
// fila (canEditOrderDocument): ventas y contabilidad pueden con
// cotización/orden de compra en cualquier momento (V58: antes solo
// mientras la orden estaba en_confirmacion); la factura solo
// contabilidad/admin_tienda/admin_general.
//
// V42: se agrega una fila más — la constancia de situación fiscal, pero
// es del CLIENTE (clientes.constancia_fiscal_path), no de la orden, así
// que vive aparte del resto: se pide con fetchClienteById (order solo
// trae client_id, no los datos del cliente) y solo aparece si esta orden
// tiene un cliente del catálogo (order.client_id) — si no, no hay dónde
// guardarla. Sigue siendo un solo archivo (reemplazable).
export default function OrderDocumentsCard({ order, onUpdated }) {
  const { role } = useAuth()
  const [documentos, setDocumentos] = useState([])
  const [busyKind, setBusyKind] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [clienteLoading, setClienteLoading] = useState(!!order.client_id)

  const loadDocumentos = useCallback(async () => {
    const { data, error: fetchError } = await fetchOrderDocumentos(order.id)
    if (fetchError) {
      setError(fetchError)
      return
    }
    setDocumentos(data || [])
  }, [order.id])

  useEffect(() => {
    loadDocumentos()
  }, [loadDocumentos])

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

  // Sube uno o varios PDFs seguidos; si alguno falla se avisa cuál, y los
  // que sí se subieron quedan registrados.
  async function handleUpload(kind, files) {
    if (!files || files.length === 0) return
    setBusyKind(kind)
    setError(null)

    for (const file of files) {
      const { error: uploadError } = await uploadOrderDocument(order.id, kind, file)
      if (uploadError) {
        setError(uploadError)
        break
      }
    }

    setBusyKind(null)
    await loadDocumentos()
    onUpdated?.()
  }

  async function handleDelete(documento) {
    setDeletingId(documento.id)
    setError(null)
    const { error: deleteError } = await deleteOrderDocumento(documento)
    setDeletingId(null)
    if (deleteError) {
      setError(deleteError)
      return
    }
    await loadDocumentos()
    onUpdated?.()
  }

  async function handleUploadConstancia(files) {
    const file = files?.[0]
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
        {DOC_TYPES.map(({ kind, label }) => {
          const docs = documentos.filter((d) => d.kind === kind)
          const busy = busyKind === kind
          const editable = canEditOrderDocument(role, order, kind) && !order.eliminada_en

          return (
            <div key={kind} className="document-row document-row--stacked">
              <div className="document-row__head">
                <span className="document-row__label">{label}</span>
                {editable ? (
                  <FileDropLabel
                    className="btn btn--secondary btn--small"
                    accept="application/pdf"
                    multiple
                    disabled={busy}
                    onFiles={(files) => handleUpload(kind, files)}
                  >
                    {busy ? 'Subiendo…' : docs.length > 0 ? '+ Agregar otro' : 'Subir PDF (o arrastra aquí)'}
                  </FileDropLabel>
                ) : (
                  docs.length === 0 && <span className="document-row__empty">Sin documento</span>
                )}
              </div>

              {docs.length > 0 && (
                <ul className="document-files">
                  {docs.map((doc, i) => (
                    <li key={doc.id} className="document-files__item">
                      <span className="document-files__name" title={doc.nombre || undefined}>
                        {doc.nombre || `${label} ${i + 1}`}
                      </span>
                      <span className="document-row__actions">
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => handleView(doc.path)}>
                          Ver
                        </button>
                        {editable && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={deletingId === doc.id}
                            onClick={() => handleDelete(doc)}
                          >
                            {deletingId === doc.id ? 'Quitando…' : 'Quitar'}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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
                <FileDropLabel
                  className="btn btn--secondary btn--small"
                  accept="application/pdf"
                  disabled={busyKind === 'constancia'}
                  onFiles={handleUploadConstancia}
                >
                  {busyKind === 'constancia'
                    ? 'Subiendo…'
                    : cliente?.constancia_fiscal_path
                      ? 'Reemplazar'
                      : 'Subir PDF (o arrastra aquí)'}
                </FileDropLabel>
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
