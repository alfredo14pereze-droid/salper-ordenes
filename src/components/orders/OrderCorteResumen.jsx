import { useEffect, useState } from 'react'
import { fetchMovimientosPorOrden } from '../../services/movimientosTelaService'
import { fetchOrdenEtapas } from '../../services/ordersService'
import { CorteTerminado } from './CorteRegistro'

// V102 — Parte 4: consumo estimado vs. real de corte, exclusivo
// admin_fabrica/admin_general (gateado por el padre en OrderDetailPage).
// Solo aparece si esta orden YA fue cortada (tiene movimientos
// consumo_corte) — antes de eso no hay nada que comparar.
//
// V153 — si la orden ya se marcó cortada SIN registrar la tela, aquí mismo se
// puede registrar el corte (el mismo formulario de la pantalla de corte).
export default function OrderCorteResumen({ order, onUpdated }) {
  const orderId = order.id
  const [movimientos, setMovimientos] = useState(null)
  const [corte, setCorte] = useState(null)

  useEffect(() => {
    fetchMovimientosPorOrden(orderId).then(({ data }) => setMovimientos((data || []).filter((m) => m.tipo === 'consumo_corte')))
    fetchOrdenEtapas(orderId).then(({ data }) => setCorte((data || []).find((e) => e.etapa === 'corte') || false))
  }, [orderId])

  if (!movimientos) return null
  if (movimientos.length === 0) {
    if (!corte || corte.estado !== 'completado') return null
    return (
      <div>
        <h3 className="section-title section-title--small">Corte</h3>
        <CorteTerminado order={order} onRegistrado={onUpdated} />
      </div>
    )
  }

  return (
    <div>
      <h3 className="section-title section-title--small">Consumo real de corte</h3>
      <div className="revision__tabla-wrap">
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tela</th>
              <th>Real</th>
              <th>Estimado</th>
              <th>Diferencia</th>
              <th>Cortes</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => {
              const real = Math.abs(Number(m.cantidad))
              const estimado = m.consumo_estimado != null ? Number(m.consumo_estimado) : null
              const diferenciaPct = estimado ? ((real - estimado) / estimado) * 100 : null
              return (
                <tr key={m.id}>
                  <td>{m.tela_nombre || '—'}</td>
                  <td>
                    {real} {m.unidad}
                  </td>
                  <td>{estimado != null ? `${estimado.toFixed(2)} ${m.unidad}` : 'Sin estimado'}</td>
                  <td className={diferenciaPct != null && Math.abs(diferenciaPct) > 10 ? 'form-error' : ''}>
                    {diferenciaPct != null ? `${diferenciaPct > 0 ? '+' : ''}${diferenciaPct.toFixed(1)}%` : '—'}
                  </td>
                  <td>{m.nota || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
