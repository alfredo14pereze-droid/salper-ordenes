import { useEffect, useState } from 'react'
import { fetchMovimientosPorOrden } from '../../services/movimientosTelaService'

// V102 — Parte 4: consumo estimado vs. real de corte, exclusivo
// admin_fabrica/admin_general (gateado por el padre en OrderDetailPage).
// Solo aparece si esta orden YA fue cortada (tiene movimientos
// consumo_corte) — antes de eso no hay nada que comparar.
export default function OrderCorteResumen({ orderId }) {
  const [movimientos, setMovimientos] = useState(null)

  useEffect(() => {
    fetchMovimientosPorOrden(orderId).then(({ data }) => setMovimientos((data || []).filter((m) => m.tipo === 'consumo_corte')))
  }, [orderId])

  if (!movimientos || movimientos.length === 0) return null

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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
