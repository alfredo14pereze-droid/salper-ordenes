import { useMemo, useState } from 'react'
import { calcularStock, stockPlanta, formatNum, formatFecha, hoyISO } from '../../utils/frisaConsignacion'
import { registrarConfirmacion } from '../../services/frisaConsignacionService'

const finMesAnterior = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
}

// Pantalla 5 — Frisa confirma su stock por planta; se ven las diferencias
// contra lo calculado y, al confirmar, se guardan los ajustes.
export default function FrisaConfirmacion({ datos, recargar }) {
  const plantas = datos.plantas.filter((p) => p.activa !== false)
  const productos = datos.productos.filter((p) => p.activo !== false)
  const [plantaId, setPlantaId] = useState(plantas[0]?.id || '')
  const [fecha, setFecha] = useState(finMesAnterior(hoyISO()))
  const [conf, setConf] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)

  const stock = useMemo(() => calcularStock(datos.movimientos, fecha), [datos, fecha])
  const planta = plantas.find((p) => p.id === plantaId)
  const filas = productos.map((p) => {
    const calc = stockPlanta(stock, plantaId, p.id)
    const v = conf[p.id]
    const tiene = v != null && v !== ''
    return { p, calc, confirmado: tiene ? Number(v) : null, dif: tiene ? Number(v) - calc : null }
  })
  const capturadas = filas.filter((f) => f.confirmado != null)
  const conDif = capturadas.filter((f) => f.dif !== 0)

  const anteriores = useMemo(() => {
    const m = new Map()
    for (const x of datos.movimientos) {
      if (x.tipo !== 'ajuste_confirmacion') continue
      const k = x.lote_id || x.fecha + '|' + x.planta_id // una fila por captura
      const r = m.get(k) || { k, fecha: x.fecha, planta_id: x.planta_id, skus: 0, conDif: 0, neto: 0 }
      r.skus += 1
      if (x.cantidad) r.conDif += 1
      r.neto += x.cantidad
      m.set(k, r)
    }
    const nombre = Object.fromEntries(datos.plantas.map((p) => [p.id, p.nombre]))
    return [...m.values()].map((r) => ({ ...r, planta: nombre[r.planta_id] })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [datos])

  function cambiar(fn) {
    fn()
    setConf({})
    setOk(null)
    setError(null)
  }

  async function generar() {
    const detalle = conDif.length ? conDif.map((f) => `${f.p.sku}: ${f.dif > 0 ? '+' : ''}${f.dif}`).join('\n') : 'Sin diferencias.'
    if (!window.confirm(`¿Generar los ajustes de ${planta?.nombre} al ${formatFecha(fecha)}?\n\n${detalle}`)) return
    setGuardando(true)
    setError(null)
    const { error: e } = await registrarConfirmacion({ fecha, plantaId, lineas: capturadas.map((f) => ({ producto_id: f.p.id, confirmado: f.confirmado })) })
    setGuardando(false)
    if (e) return setError(e.message)
    setOk(`Confirmación guardada: ${capturadas.length} SKU(s), ${conDif.length} con diferencia.`)
    setConf({})
    recargar()
  }

  return (
    <div>
      <div className="frisa-form__fila">
        <label>
          <span className="field-label">Planta</span>
          <select className="input" value={plantaId} onChange={(e) => cambiar(() => setPlantaId(e.target.value))}>
            {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Stock al día</span>
          <input className="input" type="date" value={fecha} onChange={(e) => cambiar(() => setFecha(e.target.value))} />
        </label>
        <div className="frisa__botones">
          <button type="button" className="btn btn--ghost btn--small"
            onClick={() => setConf(Object.fromEntries(filas.map((f) => [f.p.id, String(f.calc)])))}>
            Copiar lo calculado
          </button>
        </div>
      </div>
      <p className="frisa__nota">Captura lo que Frisa confirma. La diferencia (confirmado − calculado) se guarda como ajuste en esa planta.</p>

      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead><tr><th>SKU</th><th className="num">Calculado</th><th className="num">Confirma Frisa</th><th className="num">Diferencia</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.p.id}>
                <td><strong>{f.p.sku}</strong><div className="frisa__sub">{f.p.nombre}</div></td>
                <td className="num">{formatNum(f.calc)}</td>
                <td className="num">
                  <input className="input frisa-input" inputMode="numeric" value={conf[f.p.id] ?? ''} aria-label={`Confirmado ${f.p.sku}`}
                    onChange={(e) => setConf((c) => ({ ...c, [f.p.id]: e.target.value.replace(/[^0-9]/g, '') }))} />
                </td>
                <td className={'num' + (f.dif ? ' frisa__falta' : '')}>{f.dif == null ? '' : f.dif === 0 ? '✓ igual' : (f.dif > 0 ? '+' : '') + formatNum(f.dif)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="frisa__ok">{ok}</p>}
      <button type="button" className="btn btn--primary" disabled={guardando || capturadas.length === 0} onClick={generar}>
        {guardando ? 'Guardando…' : `Generar ajustes (${conDif.length} con diferencia)`}
      </button>

      <h3 className="section-title section-title--small frisa__titulo">Confirmaciones anteriores</h3>
      {anteriores.length === 0 ? <p className="frisa__sub">Todavía no hay.</p> : (
        <div className="revision__tabla-wrap">
          <table className="simple-table frisa-tabla">
            <thead><tr><th>Fecha</th><th>Planta</th><th className="num">SKUs</th><th className="num">Con diferencia</th><th className="num">Ajuste neto</th></tr></thead>
            <tbody>
              {anteriores.map((r) => (
                <tr key={r.k}>
                  <td>{formatFecha(r.fecha)}</td><td>{r.planta}</td><td className="num">{r.skus}</td><td className="num">{r.conDif}</td>
                  <td className="num">{r.neto > 0 ? '+' : ''}{formatNum(r.neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
