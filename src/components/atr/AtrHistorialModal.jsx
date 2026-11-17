import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../talleros/Modal'
import { ErrorState, Loading } from '../common/States'
import { fetchAtrHistorial } from '../../services/atrService'
import { formatDateTime, formatDate } from '../../utils/dates'

export const TIPOS_ATR = {
  carga_inicial: 'Carga inicial',
  entrada_produccion: 'Entrada de producción',
  reversa_produccion: 'Reversa (se reabrió Terminado)',
  salida_entrega: 'Entrega a ATR',
  ajuste: 'Ajuste',
}

export default function AtrHistorialModal({ fila, onClose, onAjuste }) {
  const [movs, setMovs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAtrHistorial(fila.producto_id, fila.talla).then(({ data, error: e }) => (e ? setError(e) : setMovs(data)))
  }, [fila])

  return (
    <Modal title={`${fila.producto} · ${fila.talla}`} onClose={onClose}>
      <p className="atr-muted">Existencia: <strong>{fila.existencia}</strong></p>
      {error && <ErrorState error={error} />}
      {!movs && !error && <Loading />}
      {movs && (
        <div className="atr-tabla-wrap">
          <table className="simple-table atr-historial">
            <thead>
              <tr><th>Fecha</th><th>Movimiento</th><th className="atr-num">Cant.</th><th>Orden</th><th>Quién</th><th>Nota</th></tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id} className={m.revertido_en ? 'atr-revertido' : ''}>
                  <td>{formatDateTime(m.creado_en)}</td>
                  <td>
                    {TIPOS_ATR[m.tipo] || m.tipo}
                    {m.tipo === 'carga_inicial' && m.fecha_corte ? <span className="atr-muted"> · corte {formatDate(m.fecha_corte)}</span> : null}
                    {m.revertido_en ? <span className="atr-muted"> · revertida</span> : null}
                  </td>
                  <td className={'atr-num' + (m.cantidad < 0 ? ' atr-negativo' : '')}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
                  <td>{m.order_id ? <Link to={`/orden/${m.order_id}`}>{m.folio || 'Ver orden'}</Link> : '—'}</td>
                  <td>{m.usuario_nombre || (m.tipo.endsWith('produccion') ? 'Automático' : '—')}</td>
                  <td>{m.nota || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {onAjuste && (
        <div className="atr-pie">
          <button type="button" className="btn btn--ghost btn--small" onClick={onAjuste}>Hacer un ajuste de esta línea</button>
        </div>
      )}
    </Modal>
  )
}
