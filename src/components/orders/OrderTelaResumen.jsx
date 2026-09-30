import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { canVerComprometidoTela } from '../../utils/permissions'
import { fetchInventarioTelas, calcularConsumoOrden } from '../../services/movimientosTelaService'

// V101 — panel "Tela" dentro de crear/editar una orden: una fila por cada
// tela usada en la orden (puede haber más de una), con consumo estimado
// de ESTA orden (calculado en vivo, sin necesidad de guardar primero),
// inventario actual, comprometido en otras órdenes, y disponible después
// de esta orden. Comprometido/disponible se ocultan a los roles de
// estación de fábrica (ver canVerComprometidoTela) — no es un candado de
// seguridad, es la misma capa de UX del resto del sistema.
export default function OrderTelaResumen({ items }) {
  const { role } = useAuth()
  const [inventario, setInventario] = useState([])
  const [calculo, setCalculo] = useState(null)

  const telaIds = useMemo(() => [...new Set((items || []).map((i) => i.tela_id).filter(Boolean))], [items])
  const itemsKey = useMemo(() => JSON.stringify((items || []).map((i) => ({ tela_id: i.tela_id, garment: i.garment, sizes: i.sizes }))), [items])

  useEffect(() => {
    fetchInventarioTelas().then(({ data }) => setInventario(data || []))
  }, [])

  useEffect(() => {
    if (telaIds.length === 0) {
      setCalculo(null)
      return
    }
    let active = true
    calcularConsumoOrden(items).then(({ data }) => {
      if (active) setCalculo(data)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, telaIds.length])

  if (telaIds.length === 0) return null

  const verComprometido = canVerComprometidoTela(role)
  const porTela = calculo?.por_tela || {}
  const sinConsumo = calculo?.sin_consumo || []
  const unidadNoCoincide = calculo?.unidad_no_coincide || []

  const filas = telaIds.map((telaId) => {
    const inv = inventario.find((t) => t.tela_id === telaId)
    const consumoEstaOrden = Number(porTela[telaId] || 0)
    const disponibleDespues = inv ? Number(inv.disponible) - consumoEstaOrden : null
    return { telaId, inv, consumoEstaOrden, disponibleDespues }
  })
  const hayFaltante = verComprometido && filas.some((f) => f.disponibleDespues != null && f.disponibleDespues < 0)

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 className="section-title section-title--small">Tela</h3>
      <div className="revision__tabla-wrap">
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tela</th>
              <th>Consumo estimado de esta orden</th>
              <th>Inventario actual</th>
              {verComprometido && <th>Comprometido en otras órdenes</th>}
              {verComprometido && <th>Disponible después de esta orden</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(({ telaId, inv, consumoEstaOrden, disponibleDespues }) => (
              <tr key={telaId}>
                <td>{inv?.nombre || items.find((i) => i.tela_id === telaId)?.tela_nombre || '—'}</td>
                <td>
                  {consumoEstaOrden.toFixed(2)} {inv?.unidad || ''}
                </td>
                <td>
                  {inv ? inv.inventario_actual : '—'} {inv?.unidad || ''}
                </td>
                {verComprometido && (
                  <td>
                    {inv ? inv.comprometido : '—'} {inv?.unidad || ''}
                  </td>
                )}
                {verComprometido && (
                  <td className={disponibleDespues != null && disponibleDespues < 0 ? 'form-error' : ''}>
                    {disponibleDespues != null ? `${disponibleDespues.toFixed(2)} ${inv?.unidad || ''}` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hayFaltante && (
        <p className="form-error" style={{ marginTop: 8 }}>
          Falta tela: pedir{' '}
          {filas
            .filter((f) => f.disponibleDespues != null && f.disponibleDespues < 0)
            .map((f) => `${Math.abs(f.disponibleDespues).toFixed(2)} ${f.inv?.unidad || ''} de ${f.inv?.nombre || ''}`)
            .join(', ')}
          .
        </p>
      )}
      {sinConsumo.length > 0 && (
        <p style={{ color: 'var(--color-warning)', marginTop: 8 }}>
          Sin consumo registrado: {sinConsumo.map((s) => `${s.garment} (talla ${s.talla})`).join(', ')}. No se sumó al estimado — captúralo en
          "Consumos por prenda".
        </p>
      )}
      {unidadNoCoincide.length > 0 && (
        <p style={{ color: 'var(--color-warning)', marginTop: 8 }}>
          Unidad no coincide con la tela: {unidadNoCoincide.map((s) => `${s.garment} (talla ${s.talla}, consumo en ${s.consumo_unidad}, tela en ${s.tela_unidad})`).join(', ')}. No se sumó al
          estimado.
        </p>
      )}
    </div>
  )
}
