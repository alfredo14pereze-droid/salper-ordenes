import { useMemo, useState } from 'react'
import { filasSemaforo, agruparPorModelo, ordenarProductos, formatNum, formatFecha, hoyISO, SEMANAS_MINIMO, SEMANAS_OBJETIVO, DIAS_DOS_ENTREGAS } from '../../utils/frisaConsignacion'
import { registrarProduccion } from '../../services/frisaConsignacionService'

export const ETIQUETA_COLOR = { rojo: 'Rojo', amarillo: 'Pedir producción', verde: 'Bien' }


export function VistaToggle({ porModelo, setPorModelo }) {
  return (
    <div className="order-filters__chips frisa__chips">
      <button type="button" className={'chip' + (porModelo ? ' chip--active' : '')} onClick={() => setPorModelo(true)}>Por modelo</button>
      <button type="button" className={'chip' + (!porModelo ? ' chip--active' : '')} onClick={() => setPorModelo(false)}>Por talla (SKU)</button>
    </div>
  )
}

export function NivelBadge({ color }) {
  return <span className={'frisa-nivel frisa-nivel--' + color}>{ETIQUETA_COLOR[color]}</span>
}

// Pantalla 1 — Semáforo por SKU + registrar producción (entra a bodega).
export default function FrisaSemaforo({ datos, recargar }) {
  // V181 — por modelo (suma sus tallas) o por SKU (cada talla).
  const [porModelo, setPorModelo] = useState(true)
  const { filas, ventana } = useMemo(() => {
    const base = porModelo ? agruparPorModelo(datos.productos, datos.movimientos) : { productos: ordenarProductos(datos.productos), movimientos: datos.movimientos }
    return filasSemaforo(base.productos, base.movimientos)
  }, [datos, porModelo])
  const productosForm = useMemo(() => ordenarProductos(datos.productos), [datos])
  const [form, setForm] = useState({ fecha: hoyISO(), productoId: '', cantidad: '', referencia: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)

  const q = ventana.quincenas
  const textoVentana = q.length
    ? `${q.length} quincena${q.length === 1 ? '' : 's'} (${formatFecha(q.at(-1).inicio)} – ${formatFecha(q[0].fin)}) = ${formatNum(ventana.semanas, 1)} semanas`
    : 'todavía no hay consumo capturado'

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    setOk(null)
    const { error: err } = await registrarProduccion({ ...form, cantidad: Number(form.cantidad) })
    setGuardando(false)
    if (err) return setError(err.message)
    const p = datos.productos.find((x) => x.id === form.productoId)
    setOk(`Entraron ${form.cantidad} pzas de ${p?.sku} a bodega.`)
    setForm((f) => ({ ...f, productoId: '', cantidad: '', referencia: '' }))
    recargar()
  }

  return (
    <div>
      <p className="frisa__nota">
        Consumo semanal = consumo de las últimas {textoVentana}. <strong>Rojo</strong>: la bodega SALPER no alcanza para {DIAS_DOS_ENTREGAS} días
        (2 entregas). <strong>Amarillo</strong>: menos de {SEMANAS_MINIMO} semanas de cobertura. Sugerido = {SEMANAS_OBJETIVO} semanas − stock
        total, en múltiplos de 10.
      </p>
      <VistaToggle porModelo={porModelo} setPorModelo={setPorModelo} />
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="num">Bodega</th>
              <th className="num">En plantas</th>
              <th className="num">Total</th>
              <th className="num">Consumo / sem</th>
              <th className="num">Cobertura</th>
              <th>Nivel</th>
              <th className="num">Sugerido producir</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto.id} className={'frisa-fila--' + f.color}>
                <td>
                  <strong>{f.producto.sku}</strong>
                  <div className="frisa__sub">{f.producto.nombre}</div>
                </td>
                <td className="num">
                  {formatNum(f.bodega)}
                  {f.color === 'rojo' && <div className="frisa__sub">necesita {formatNum(Math.ceil(f.necesario20))}</div>}
                </td>
                <td className="num">{formatNum(f.enPlantas)}</td>
                <td className="num"><strong>{formatNum(f.total)}</strong></td>
                <td className="num">{formatNum(f.consumoSemanal, 1)}</td>
                <td className="num">{Number.isFinite(f.cobertura) ? `${formatNum(f.cobertura, 1)} sem` : '—'}</td>
                <td><NivelBadge color={f.color} /></td>
                <td className="num"><strong>{f.sugerido ? formatNum(f.sugerido) : '—'}</strong></td>
                <td>
                  {!porModelo && <button type="button" className="btn btn--ghost btn--small"
                    onClick={() => setForm((x) => ({ ...x, productoId: f.producto.id, cantidad: f.sugerido ? String(f.sugerido) : '' }))}>
                    Registrar producción
                  </button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card frisa-form" onSubmit={guardar}>
        <h3 className="section-title section-title--small">Registrar producción terminada (entra a bodega SALPER)</h3>
        <div className="frisa-form__fila">
          <label>
            <span className="field-label">Fecha</span>
            <input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </label>
          <label>
            <span className="field-label">SKU</span>
            <select className="input" value={form.productoId} onChange={(e) => setForm({ ...form, productoId: e.target.value })} required>
              <option value="">Elige…</option>
              {productosForm.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}
            </select>
          </label>
          <label>
            <span className="field-label">Piezas</span>
            <input className="input" type="number" min="1" step="1" inputMode="numeric" value={form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
          </label>
          <label>
            <span className="field-label">Referencia (opcional)</span>
            <input className="input" value={form.referencia} placeholder="Ej. orden FR-012" onChange={(e) => setForm({ ...form, referencia: e.target.value })} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        {ok && <p className="frisa__ok">{ok}</p>}
        <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar producción'}</button>
      </form>
    </div>
  )
}
