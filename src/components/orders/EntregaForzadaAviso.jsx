import { useEffect, useState } from 'react'
import { fetchEntregasForzadas } from '../../services/ordersService'
import { formatDateTime } from '../../utils/dates'

// V160 — si la orden se entregó "de todos modos" (faltaba precio o factura),
// muestra quién, cuándo, qué faltaba y el motivo (tabla orden_entregas_forzadas,
// la leen quienes pueden entregar o ver precios). Si no hay, no muestra nada.
export default function EntregaForzadaAviso({ order }) {
  const [filas, setFilas] = useState([])
  useEffect(() => {
    if (order.status !== 'completado') {
      setFilas([])
      return
    }
    fetchEntregasForzadas(order.id).then(({ data }) => setFilas(data || []))
  }, [order.id, order.status])

  if (filas.length === 0) return null
  return (
    <section className="card">
      {filas.map((f) => (
        <p key={f.id} className="entrega-forzada-aviso">
          <b>Entregada de todos modos</b> por {f.forzada_por_nombre || 'un administrador'} el {formatDateTime(f.creada_en)}.
          <br />
          Faltaba: {f.bloqueo.replace(/^No se puede marcar como entregada\.\s*/, '')}
          <br />
          Motivo: {f.motivo}
        </p>
      ))}
    </section>
  )
}
