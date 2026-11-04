import { useMemo, useState } from 'react'
import { calcularStock, stockPlanta, mapaMaximos, aReponer, formatNum } from '../../utils/frisaConsignacion'
import { setMaximo } from '../../services/frisaConsignacionService'

// Pantalla 2 — matriz planta × SKU: stock actual vs máximo de Frisa y "a
// reponer hasta máximo" (informativo; la entrega real es libre).
export default function FrisaPorPlanta({ datos, recargar }) {
  const plantas = datos.plantas.filter((p) => p.activa !== false)
  const productos = datos.productos.filter((p) => p.activo !== false)
  const stock = useMemo(() => calcularStock(datos.movimientos), [datos])
  const maximos = useMemo(() => mapaMaximos(datos.maximos), [datos])
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState(null)

  async function guardarMaximo(plantaId, productoId, valor, actual) {
    const n = valor === '' ? null : Number(valor)
    if (n === (actual ?? null)) return
    if (n != null && (!Number.isInteger(n) || n < 0)) return setError('El máximo debe ser un número entero, 0 o más.')
    setError(null)
    const { error: e } = await setMaximo(plantaId, productoId, n)
    if (e) return setError(e.message)
    recargar()
  }

  return (
    <div>
      <div className="frisa__barra">
        <p className="frisa__nota">
          Cada celda: <strong>stock / máximo</strong> y, abajo, lo que faltaría para llegar al máximo. Los máximos los define Frisa.
        </p>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando((v) => !v)}>
          {editando ? 'Listo' : 'Editar máximos'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla frisa-matriz">
          <thead>
            <tr>
              <th>SKU</th>
              {plantas.map((p) => <th key={p.id} className="num">{p.nombre}</th>)}
              <th className="num">A reponer total</th>
              <th className="num">Bodega</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((pr) => {
              let totalReponer = 0
              return (
                <tr key={pr.id}>
                  <td><strong>{pr.sku}</strong><div className="frisa__sub">{pr.nombre}</div></td>
                  {plantas.map((pl) => {
                    const s = stockPlanta(stock, pl.id, pr.id)
                    const mx = maximos[pl.id]?.[pr.id]
                    const rep = aReponer(s, mx)
                    totalReponer += rep || 0
                    return (
                      <td key={pl.id} className="num">
                        {editando ? (
                          <input className="input frisa-input" type="number" min="0" step="1" defaultValue={mx ?? ''} aria-label={`Máximo ${pr.sku} en ${pl.nombre}`}
                            onBlur={(e) => guardarMaximo(pl.id, pr.id, e.target.value, mx)} />
                        ) : (
                          <>
                            <span className={mx != null && s > mx ? 'frisa__exceso' : ''}>{formatNum(s)}</span>
                            <span className="frisa__sub"> / {mx ?? '—'}</span>
                            {rep > 0 && <div className="frisa__reponer">+{formatNum(rep)}</div>}
                          </>
                        )}
                      </td>
                    )
                  })}
                  <td className="num"><strong>{formatNum(totalReponer)}</strong></td>
                  <td className={'num' + (totalReponer > (stock.bodega[pr.id] || 0) ? ' frisa__falta' : '')}>{formatNum(stock.bodega[pr.id] || 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
