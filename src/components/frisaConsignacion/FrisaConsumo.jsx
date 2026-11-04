import { useMemo, useState } from 'react'
import { calcularStock, stockPlanta, quincenaDe, quincenasHasta, facturacionPorQuincena, formatNum, formatPesos, hoyISO, sumarDias , ordenarProductos } from '../../utils/frisaConsignacion'
import { registrarConsumo } from '../../services/frisaConsignacionService'

// Pantalla 4 — consumo de una quincena por planta, con el monto a facturar
// (cantidad × precio_consumo). El movimiento se guarda con fecha = último día
// de la quincena.
export default function FrisaConsumo({ datos, recargar }) {
  const plantas = datos.plantas.filter((p) => p.activa !== false)
  const productos = ordenarProductos(datos.productos.filter((p) => p.activo !== false))
  const hoy = hoyISO()
  // Solo quincenas ya terminadas (la de hoy cuenta si hoy es su último día):
  // capturar una en curso movería el promedio semanal.
  const qHoy = quincenaDe(hoy)
  const porOmision = hoy === qHoy.fin ? qHoy : quincenaDe(sumarDias(qHoy.inicio, -1))
  const opciones = quincenasHasta(porOmision.fin, 6)
  const [plantaId, setPlantaId] = useState(plantas[0]?.id || '')
  const [clave, setClave] = useState(porOmision.clave)
  const [cant, setCant] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)

  const quincena = opciones.find((q) => q.clave === clave) || porOmision
  const stock = useMemo(() => calcularStock(datos.movimientos), [datos])
  const yaCapturado = useMemo(() => {
    const m = {}
    for (const x of datos.movimientos) {
      if (x.tipo === 'consumo' && x.planta_id === plantaId && x.fecha >= quincena.inicio && x.fecha <= quincena.fin) m[x.producto_id] = (m[x.producto_id] || 0) + x.cantidad
    }
    return m
  }, [datos, plantaId, quincena])
  const facturas = useMemo(() => facturacionPorQuincena(datos.movimientos, datos.productos, datos.plantas), [datos])

  const filas = productos.map((p) => {
    const previo = yaCapturado[p.id]
    const n = previo != null ? previo : Number(cant[p.id]) || 0
    const tiene = stockPlanta(stock, plantaId, p.id)
    return { p, previo, n, tiene, excede: previo == null && n > tiene, importe: n * Number(p.precio_consumo || 0) }
  })
  const nuevas = filas.filter((f) => f.previo == null && f.n > 0)
  const totalMonto = filas.reduce((s, f) => s + f.importe, 0)
  const totalPiezas = filas.reduce((s, f) => s + f.n, 0)
  const hayExceso = filas.some((f) => f.excede)
  const planta = plantas.find((p) => p.id === plantaId)

  function cambiar(fn) {
    fn()
    setCant({})
    setOk(null)
    setError(null)
  }

  async function guardar() {
    if (!window.confirm(`¿Guardar el consumo de ${planta?.nombre}, quincena ${quincena.etiqueta}?\n\n${nuevas.length} SKU(s), ${formatNum(nuevas.reduce((s, f) => s + f.n, 0))} pzas, ${formatPesos(nuevas.reduce((s, f) => s + f.importe, 0))}`)) return
    setGuardando(true)
    setError(null)
    const { error: e } = await registrarConsumo({
      fecha: quincena.fin,
      plantaId,
      lineas: nuevas.map((f) => ({ producto_id: f.p.id, cantidad: f.n })),
      referencia: `Quincena ${quincena.etiqueta}`,
    })
    setGuardando(false)
    if (e) return setError(e.message)
    setOk('Consumo guardado.')
    setCant({})
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
          <span className="field-label">Quincena</span>
          <select className="input" value={clave} onChange={(e) => cambiar(() => setClave(e.target.value))}>
            {opciones.map((q) => <option key={q.clave} value={q.clave}>{q.etiqueta}</option>)}
          </select>
        </label>
      </div>

      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="num">Hay en planta</th>
              <th className="num">Consumo</th>
              <th className="num">Precio</th>
              <th className="num">A facturar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.p.id} className={f.excede ? 'frisa-fila--rojo' : ''}>
                <td><strong>{f.p.sku}</strong><div className="frisa__sub">{f.p.nombre}</div></td>
                <td className="num">{formatNum(f.tiene)}</td>
                <td className="num">
                  {f.previo != null ? (
                    <span title="Ya se capturó en esta quincena">{formatNum(f.previo)} <span className="frisa__sub">✓ capturado</span></span>
                  ) : (
                    <input className="input frisa-input" inputMode="numeric" placeholder="0" value={cant[f.p.id] ?? ''} aria-label={`Consumo ${f.p.sku}`}
                      onChange={(e) => setCant((c) => ({ ...c, [f.p.id]: e.target.value.replace(/[^0-9]/g, '') }))} />
                  )}
                  {f.excede && <div className="frisa__falta">más de lo que hay</div>}
                </td>
                <td className="num">{formatPesos(f.p.precio_consumo)}</td>
                <td className="num">{f.importe ? formatPesos(f.importe) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Total {planta?.nombre} · {quincena.etiqueta}</strong></td>
              <td className="num"><strong>{formatNum(totalPiezas)}</strong></td>
              <td></td>
              <td className="num"><strong>{formatPesos(totalMonto)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {hayExceso && <p className="form-error">Hay consumos mayores a lo que tiene la planta: revisa la captura.</p>}
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="frisa__ok">{ok}</p>}
      <button type="button" className="btn btn--primary" disabled={guardando || hayExceso || nuevas.length === 0} onClick={guardar}>
        {guardando ? 'Guardando…' : 'Guardar consumo'}
      </button>

      <h3 className="section-title section-title--small frisa__titulo">A facturar por planta y quincena</h3>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead><tr><th>Quincena</th><th>Planta</th><th className="num">Piezas</th><th className="num">Monto</th></tr></thead>
          <tbody>
            {facturas.slice(0, 30).map((f) => (
              <tr key={f.quincena.clave + f.planta_id}>
                <td>{f.quincena.etiqueta}</td>
                <td>{f.planta}</td>
                <td className="num">{formatNum(f.piezas)}</td>
                <td className="num">{formatPesos(f.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
