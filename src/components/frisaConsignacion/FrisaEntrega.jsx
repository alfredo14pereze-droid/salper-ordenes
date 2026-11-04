import { useMemo, useState } from 'react'
import { calcularStock, stockPlanta, mapaMaximos, aReponer, revisarEntrega, lineasEntrega, formatNum, formatFecha, hoyISO } from '../../utils/frisaConsignacion'
import { registrarEntrega } from '../../services/frisaConsignacionService'

// Pantalla 3 — armar la entrega del viaje (todas las plantas juntas). Sin
// parciales: si la bodega no alcanza para algún SKU no se puede confirmar
// (y el servidor lo vuelve a revisar).
export default function FrisaEntrega({ datos, recargar }) {
  const plantas = datos.plantas.filter((p) => p.activa !== false)
  const productos = datos.productos.filter((p) => p.activo !== false)
  const stock = useMemo(() => calcularStock(datos.movimientos), [datos])
  const maximos = useMemo(() => mapaMaximos(datos.maximos), [datos])
  const [cant, setCant] = useState({})
  const [fecha, setFecha] = useState(hoyISO())
  const [referencia, setReferencia] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)

  const revision = revisarEntrega(cant, stock, productos)
  const faltaDe = Object.fromEntries(revision.faltantes.map((f) => [f.producto.id, f]))
  const valor = (pl, pr) => cant[pl]?.[pr] ?? ''
  const poner = (pl, pr, v) => setCant((c) => ({ ...c, [pl]: { ...(c[pl] || {}), [pr]: v.replace(/[^0-9]/g, '') } }))

  function llenarHastaMaximo() {
    const c = {}
    for (const pl of plantas) {
      c[pl.id] = {}
      for (const pr of productos) {
        const r = aReponer(stockPlanta(stock, pl.id, pr.id), maximos[pl.id]?.[pr.id])
        if (r) c[pl.id][pr.id] = String(r)
      }
    }
    setCant(c)
    setOk(null)
  }

  async function confirmar() {
    const lineas = lineasEntrega(cant)
    const resumen = plantas
      .map((pl) => {
        const n = lineas.filter((l) => l.planta_id === pl.id).reduce((s, l) => s + l.cantidad, 0)
        return n ? `${pl.nombre}: ${formatNum(n)} pzas` : null
      })
      .filter(Boolean)
      .join('\n')
    if (!window.confirm(`¿Confirmar la entrega del ${formatFecha(fecha)}?\n\n${resumen}\n\nTotal: ${formatNum(revision.totalPiezas)} pzas`)) return
    setGuardando(true)
    setError(null)
    const { error: e } = await registrarEntrega({ fecha, lineas, referencia: referencia || `Viaje ${formatFecha(fecha)}` })
    setGuardando(false)
    if (e) return setError(e.message)
    setOk(`Entrega registrada: ${formatNum(revision.totalPiezas)} pzas a ${resumen.split('\n').length} planta(s).`)
    setCant({})
    recargar()
  }

  return (
    <div>
      <div className="frisa-form__fila">
        <label>
          <span className="field-label">Fecha del viaje</span>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label>
          <span className="field-label">Referencia (opcional)</span>
          <input className="input" value={referencia} placeholder={`Viaje ${formatFecha(fecha)}`} onChange={(e) => setReferencia(e.target.value)} />
        </label>
        <div className="frisa__botones">
          <button type="button" className="btn btn--secondary btn--small" onClick={llenarHastaMaximo}>Llenar hasta máximo</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setCant({})}>Limpiar</button>
        </div>
      </div>

      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla frisa-matriz">
          <thead>
            <tr>
              <th>SKU</th>
              {plantas.map((p) => <th key={p.id} className="num">{p.nombre}</th>)}
              <th className="num">Total</th>
              <th className="num">Bodega</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((pr) => {
              const falta = faltaDe[pr.id]
              return (
                <tr key={pr.id} className={falta ? 'frisa-fila--rojo' : ''}>
                  <td><strong>{pr.sku}</strong></td>
                  {plantas.map((pl) => (
                    <td key={pl.id} className="num">
                      <input className="input frisa-input" inputMode="numeric" value={valor(pl.id, pr.id)} placeholder="0"
                        aria-label={`${pr.sku} para ${pl.nombre}`} onChange={(e) => poner(pl.id, pr.id, e.target.value)} />
                      <div className="frisa__sub">tiene {formatNum(stockPlanta(stock, pl.id, pr.id))}</div>
                    </td>
                  ))}
                  <td className="num"><strong>{formatNum(revision.pedido[pr.id] || 0)}</strong></td>
                  <td className="num">
                    {formatNum(stock.bodega[pr.id] || 0)}
                    {falta && <div className="frisa__falta">faltan {formatNum(falta.falta)}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!revision.completa && (
        <p className="form-error">
          La bodega no alcanza para completar esta entrega ({revision.faltantes.map((f) => `${f.producto.sku}: faltan ${formatNum(f.falta)}`).join(', ')}).
          No se aceptan entregas parciales: baja las cantidades o registra producción primero.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="frisa__ok">{ok}</p>}
      <button type="button" className="btn btn--primary" disabled={guardando || !revision.completa || revision.totalPiezas === 0} onClick={confirmar}>
        {guardando ? 'Guardando…' : `Confirmar entrega (${formatNum(revision.totalPiezas)} pzas)`}
      </button>
    </div>
  )
}
