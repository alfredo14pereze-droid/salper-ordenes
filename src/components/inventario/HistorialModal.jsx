import { useEffect, useState } from 'react'
import Modal from '../talleros/Modal'
import { Loading, ErrorState } from '../common/States'
import { fetchHistorialArticulo } from '../../services/inventarioService'
import { formatTalla } from '../../utils/inventarioTallas'

function formatFecha(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Historial de un artículo (V89): movimientos con ubicación/tipo/cantidad/
// motivo/nota/usuario/fecha, más el folio de traspaso cuando aplica.
export default function HistorialModal({ articulo, onClose }) {
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchHistorialArticulo(articulo.articuloId).then(({ data, error: fetchError }) => {
      if (cancelled) return
      if (fetchError) setError(fetchError)
      else setMovimientos(data || [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [articulo.articuloId])

  return (
    <Modal title={`Historial · ${articulo.prenda} (${formatTalla(articulo.talla)})`} onClose={onClose}>
      {loading && <Loading label="Cargando historial…" />}
      {error && <ErrorState error={error} />}
      {!loading && !error && movimientos.length === 0 && <p className="page-subtitle">Sin movimientos todavía.</p>}
      {!loading && !error && movimientos.length > 0 && (
        <ul className="tallero-timeline">
          {movimientos.map((m) => (
            <li key={m.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <b style={{ color: m.cantidad < 0 ? 'var(--color-danger)' : 'var(--color-good)' }}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </b>{' '}
                  · {m.ubicacion} · {m.motivo}
                  {m.traspaso_folio && ` (${m.traspaso_folio})`}
                </span>
                <span className="pantone-hint" style={{ margin: 0 }}>
                  {formatFecha(m.creado_en)}
                </span>
              </div>
              {m.nota && <p className="pantone-hint" style={{ margin: '2px 0 0' }}>{m.nota}</p>}
              <p className="pantone-hint" style={{ margin: '2px 0 0' }}>{m.usuario || 'Sistema'}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
