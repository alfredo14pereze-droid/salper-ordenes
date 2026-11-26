import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '../common/States'
import { fetchAtrPorSubir, fetchAtrSubidasRecientes } from '../../services/atrService'
import { formatDate, formatDateTime } from '../../utils/dates'
import AtrSubirModal from './AtrSubirModal'
import { propuestaSubida } from '../../utils/atrOc'

const n = (x) => Number(x || 0).toLocaleString('es-MX')

// V224 — "Por subir" (como Frisa → Restock → Por entrar): órdenes de ATR con
// Terminado completado que todavía no se suben a bodega. Al subirlas entran al
// inventario. Abajo, lo subido en los últimos 15 días.
export default function AtrPorSubir({ puedeSubir = false }) {
  const [filas, setFilas] = useState(null)
  const [recientes, setRecientes] = useState([])
  const [error, setError] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [aviso, setAviso] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    const [a, b] = await Promise.all([fetchAtrPorSubir(), fetchAtrSubidasRecientes(15)])
    if (a.error || b.error) return setError(a.error || b.error)
    setFilas(a.data || [])
    setRecientes(b.data || [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (error) return <ErrorState error={error} onRetry={cargar} />
  if (!filas) return <Loading />

  return (
    <div>
      {aviso && <p className="atr-aviso atr-aviso--ok"><span>{aviso}</span></p>}
      <p className="atr-muted">
        Órdenes de ATR terminadas que falta subir a bodega. Las batas entran al inventario hasta que se toca <strong>Subir a bodega</strong>.
      </p>
      {filas.length === 0 ? (
        <EmptyState>No hay órdenes por subir: todo lo terminado ya está en bodega.</EmptyState>
      ) : (
        <div className="atr-subir-lista">
          {filas.map((f) => (
            <div key={f.order_id} className="card atr-subir-tarjeta">
              <div className="atr-subir-tarjeta__fila1">
                <Link to={`/orden/${f.order_id}`} className="atr-subir-tarjeta__folio">{f.order_number}</Link>
                <span className="atr-subir-tarjeta__estado">Por subir</span>
              </div>
              <span className="atr-muted">
                {propuestaSubida(f.lineas).sinSurtido
                  ? `${n(propuestaSubida(f.lineas).cantidades.reduce((a, b) => a + b, 0))} batas pedidas (sin surtido capturado)`
                  : `${n(f.piezas)} batas surtidas`}
                {f.terminado_en ? ` · terminada ${formatDateTime(f.terminado_en)}` : ''}
                {f.requested_delivery_date ? ` · entrega ${formatDate(f.requested_delivery_date)}` : ''}
              </span>
              {f.prendas_sin_ligar > 0 && (
                <span className="atr-etiqueta__aviso">
                  {f.prendas_sin_ligar === 1 ? '1 prenda no viene' : `${f.prendas_sin_ligar} prendas no vienen`} del catálogo de ATR y no se sube
                  {f.prendas_sin_ligar === 1 ? '' : 'n'}.
                </span>
              )}
              {puedeSubir && (
                <div className="atr-acciones">
                  <button type="button" className="btn btn--primary" onClick={() => { setAviso(null); setAbierta(f) }}>Subir a bodega</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {recientes.length > 0 && (
        <>
          <h3 className="section-title section-title--small atr-subir-recientes__titulo">Subidas en los últimos 15 días</h3>
          <div className="atr-tabla-wrap">
            <table className="simple-table atr-tabla">
              <thead>
                <tr><th>Orden</th><th>Cuándo</th><th>Quién</th><th className="atr-num">Batas</th></tr>
              </thead>
              <tbody>
                {recientes.map((r) => (
                  <tr key={r.order_id}>
                    <td><Link to={`/orden/${r.order_id}`}>{r.order_number}</Link>{r.notas ? <div className="atr-muted">{r.notas}</div> : null}</td>
                    <td>{formatDateTime(r.subido_en)}</td>
                    <td>{r.usuario_nombre || '—'}</td>
                    <td className="atr-num">{n(r.piezas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {abierta && (
        <AtrSubirModal
          orden={abierta}
          onClose={() => setAbierta(null)}
          onListo={(msg) => { setAbierta(null); setAviso(msg); cargar() }}
        />
      )}
    </div>
  )
}
