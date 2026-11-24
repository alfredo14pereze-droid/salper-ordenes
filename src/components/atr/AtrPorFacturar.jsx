import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, Loading, EmptyState } from '../common/States'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { fetchAtrOcLista, fetchAtrPorFacturar } from '../../services/atrService'
import { surtidoDesdeRpc } from '../../utils/atrOc'
import { formatDateTime } from '../../utils/dates'
import { atrHojaSurtidoFileName, buildAtrHojaSurtidoBlob } from '../../utils/generateAtrPdf'
import { ConfirmarEntrega } from '../../pages/AtrOcDetallePage'
import AtrBata from './AtrBata'

// V220 — "Por facturar": los surtidos que Terminado ya apartó y que
// contabilidad confirma con el número de factura. Al confirmar, esas batas
// salen del inventario.
const n = (x) => Number(x || 0).toLocaleString('es-MX')

export default function AtrPorFacturar({ puedeConfirmar }) {
  const [lista, setLista] = useState(null)
  const [ocs, setOcs] = useState({})
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [hoja, setHoja] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    const [r, l] = await Promise.all([fetchAtrPorFacturar(), fetchAtrOcLista()])
    if (r.error || l.error) return setError(r.error || l.error)
    setOcs(Object.fromEntries((l.data || []).map((o) => [o.id, o])))
    setLista((r.data || []).map((x) => ({ ...surtidoDesdeRpc(x), oc_id: x.oc_id, numero_oc: x.numero_oc, notas_oc: x.notas_oc })))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function verHoja(s) {
    const oc = ocs[s.oc_id] || { numero_oc: s.numero_oc }
    try {
      setHoja({ blob: await buildAtrHojaSurtidoBlob(oc, s, oc.pedido ? { pedido: oc.pedido, surtido: oc.surtido } : null), fileName: atrHojaSurtidoFileName(oc, s) })
    } catch (e) {
      setError(e)
    }
  }

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!lista) return <Loading />

  const piezas = lista.reduce((t, s) => t + s.piezas, 0)

  return (
    <div>
      <p className="atr-muted atr-oc-meta">
        Terminado surte y las batas quedan <strong>apartadas</strong>. Cuando se hace la factura, contabilidad captura el número y
        confirma la entrega: ahí se descuentan del inventario.
      </p>
      {ok && <p className="atr-ok">{ok}</p>}
      {lista.length === 0 ? (
        <EmptyState>No hay surtidos por facturar.</EmptyState>
      ) : (
        <>
          <p className="atr-conteo"><strong>{lista.length}</strong> surtido{lista.length === 1 ? '' : 's'} por facturar · <strong>{n(piezas)}</strong> batas apartadas</p>
          <div className="atr-facturar-lista">
            {lista.map((s) => (
              <div key={s.surtido_id} className="card atr-bloque atr-surtido">
                <div className="atr-surtido__cab">
                  <span>
                    <span className="frisa-nivel frisa-nivel--amarillo">Apartado · por facturar</span>{' '}
                    <Link to={`/atr/oc/${s.oc_id}`}><strong>OC {s.numero_oc}</strong></Link>
                    {s.notas_oc ? <span className="atr-muted"> · {s.notas_oc}</span> : null}
                  </span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => verHoja(s)}>Hoja de surtido</button>
                </div>
                <div className="atr-muted atr-surtido__lineas">
                  Surtió {s.usuario || '—'} el {formatDateTime(s.fecha)} · <strong>{n(s.piezas)} batas</strong>
                  {s.nota ? <> · Nota: {s.nota}</> : null}
                </div>
                <div className="atr-surtido__lineas atr-surtido__bt">
                  {s.lineas.map((l, i) => (
                    <span key={i} className="atr-surtido__linea"><AtrBata producto={l.producto} color={l.color} conBolsa={l.con_bolsa} /> {l.talla}: <strong>{n(l.cantidad)}</strong></span>
                  ))}
                </div>
                {puedeConfirmar ? (
                  <ConfirmarEntrega surtido={s} onListo={(msg) => { setOk(`OC ${s.numero_oc}: ${msg}`); cargar() }} />
                ) : (
                  <p className="atr-muted atr-surtido__lineas">Contabilidad confirma la entrega con la factura.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {hoja && <PdfPreviewModal blob={hoja.blob} fileName={hoja.fileName} onClose={() => setHoja(null)} />}
    </div>
  )
}
