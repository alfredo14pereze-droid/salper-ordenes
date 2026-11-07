import { useState } from 'react'
import { capturarLisa, crearCompraLisas } from '../../services/frisaRestockService'
import { nombreLisa, lisaComoProducto, MANGA } from '../../utils/frisaLisas'
import { NombreFrisa } from '../frisaNiveles/comunes'

const num = (n) => Number(n || 0).toLocaleString('es-MX')

// V187 — Playera lisa (sin procesos): stock, comprometidas por las órdenes de
// taller, libres, lo que piden las órdenes propuestas y cuánto comprar.
export default function FrisaLisas({ calculo, puede, onListo }) {
  const [todas, setTodas] = useState(false)
  const filas = calculo.filas.filter((f) => todas || f.stock || f.enProceso || f.piden)
  return (
    <section className="frisa-restock__seccion">
      <div className="frisa__barra">
        <h2 className="section-title section-title--small">Playera lisa (sin procesos)</h2>
        <label className="frisa-niveles__toggle"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Ver todas</label>
      </div>
      <p className="frisa__sub">
        Por color, manga y talla. Stock = lo que hay en el anaquel: se descuentan al crear (o ligar) la orden de taller y regresan si
        se quita del restock. En proceso = las que ya están en órdenes de taller. A comprar = lo que piden las órdenes propuestas − stock.
        {puede.bodega ? ' Toca el stock para capturar el conteo del anaquel.' : ''}
      </p>
      {!filas.length && <p className="frisa__sub">Sin movimiento de playera lisa todavía. Marca “Ver todas” para capturar el primer conteo.</p>}
      {filas.length > 0 && (
        <div className="revision__tabla-wrap">
          <table className="simple-table frisa-tabla frisa-niveles__tabla">
            <thead><tr><th>Playera lisa</th><th className="num">Stock (anaquel)</th><th className="num">En proceso</th><th className="num">Piden</th><th className="num">A comprar</th><th>La usan</th></tr></thead>
            <tbody>
              {filas.map((f) => <FilaLisa key={f.lisa.id} f={f} puede={puede.bodega} onListo={onListo} />)}
            </tbody>
          </table>
        </div>
      )}
      {puede.compras && <PedidoLisas filas={calculo.filas} proveedorSugerido={calculo.filas.find((f) => f.proveedor)?.proveedor || ''} onListo={onListo} />}
    </section>
  )
}

function FilaLisa({ f, puede, onListo }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [error, setError] = useState(null)
  async function guardar() {
    if (!/^\d+$/.test(valor)) return setError('Número entero de 0 o más.')
    const { error: e } = await capturarLisa(f.lisa.id, Number(valor))
    if (e) return setError(e.message)
    setEditando(false)
    onListo(`Conteo guardado: ${nombreLisa(f.lisa)} = ${num(valor)}.`)
  }
  return (
    <tr className={f.aComprar > 0 ? 'frisa-niveles__fila--critico' : f.stock < 0 ? 'frisa-niveles__fila--pedir' : 'frisa-niveles__fila--ok'}>
      <td data-label="Playera lisa"><strong>{f.lisa.talla}</strong> <NombreFrisa producto={{ ...lisaComoProducto(f.lisa), nombre: `${f.lisa.color} ${MANGA[f.lisa.manga]}` }} /></td>
      <td data-label="Stock" className="num">
        {editando ? (
          <span className="frisa-niveles__editar">
            <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" autoFocus value={valor} onFocus={(e) => e.target.select()}
              onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }} aria-label="Conteo de playera lisa" />
            <button type="button" className="btn btn--primary btn--small" onClick={guardar} aria-label="Guardar">✓</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(false)} aria-label="Cancelar">×</button>
            {error && <span className="form-error frisa-niveles__error">{error}</span>}
          </span>
        ) : puede ? (
          <button type="button" className="frisa-niveles__stock" onClick={() => { setValor(String(Math.max(0, f.stock))); setError(null); setEditando(true) }}>{num(f.stock)}</button>
        ) : <strong>{num(f.stock)}</strong>}
        {f.stock < 0 && !editando && <div className="frisa__falta">faltó registrar</div>}
      </td>
      <td data-label="En proceso" className="num">{f.enProceso ? num(f.enProceso) : ''}</td>
      <td data-label="Piden" className="num">{f.piden ? num(f.piden) : ''}</td>
      <td data-label="A comprar" className="num"><strong>{f.aComprar ? num(f.aComprar) : ''}</strong></td>
      <td data-label="La usan" className="frisa__sub">{f.productos.join(', ')}</td>
    </tr>
  )
}

// Pedido de playera lisa: TODAS las tallas, con lo que hay, lo que necesitan las órdenes
// de taller propuestas y OK / PEDIR. Solo las de PEDIR traen cantidad sugerida (se puede cambiar).
function PedidoLisas({ filas, proveedorSugerido, onListo }) {
  const [cant, setCant] = useState(() => Object.fromEntries(filas.map((f) => [f.lisa.id, f.aComprar > 0 ? String(f.aComprar) : ''])))
  const [proveedor, setProveedor] = useState(proveedorSugerido)
  const [fecha, setFecha] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState(null)
  const total = filas.reduce((t, f) => t + (Number(cant[f.lisa.id]) || 0), 0)
  const aPedir = filas.filter((f) => f.aComprar > 0).length
  async function crear() {
    setTrabajando(true)
    setError(null)
    const lineas = filas.map((f) => ({ lisa_id: f.lisa.id, cantidad: Number(cant[f.lisa.id]) || 0 })).filter((l) => l.cantidad > 0)
    const { data, error: e } = await crearCompraLisas({ proveedor, fechaEsperada: fecha, lineas })
    setTrabajando(false)
    if (e) return setError(e.message)
    onListo(`Se creó el pedido de playera lisa #${data.folio} a ${data.proveedor} (${num(total)} pzas).`)
  }
  return (
    <div className="card frisa-restock__propuesta">
      <h3 className="section-title section-title--small">Pedido de playera lisa</h3>
      <p className="frisa__sub">
        Todas las tallas: <strong>Hay</strong> = en el anaquel · <strong>Necesitan</strong> = lo que piden las órdenes de taller por pedir.
        {aPedir ? ` ${aPedir} tallas dicen PEDIR y ya traen la cantidad; las de OK alcanzan.` : ' Todas dicen OK: alcanza lo que hay.'} Puedes cambiar cualquier cantidad.
      </p>
      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla frisa-niveles__tabla">
          <thead><tr><th>Playera lisa</th><th className="num">Hay</th><th className="num">Necesitan</th><th>Estado</th><th className="num">A pedir</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.lisa.id} className={f.aComprar > 0 ? 'frisa-niveles__fila--critico' : 'frisa-niveles__fila--ok'}>
                <td data-label="Playera lisa"><strong>{f.lisa.talla}</strong> <NombreFrisa producto={{ ...lisaComoProducto(f.lisa), nombre: `${f.lisa.color} ${MANGA[f.lisa.manga]}` }} /></td>
                <td data-label="Hay" className="num">{num(f.stock)}</td>
                <td data-label="Necesitan" className="num">{f.piden ? num(f.piden) : '0'}</td>
                <td data-label="Estado">{f.aComprar > 0
                  ? <span className="frisa-nivel frisa-nivel--rojo">PEDIR</span>
                  : <span className="frisa-nivel frisa-nivel--verde">OK</span>}</td>
                <td data-label="A pedir" className="num">
                  <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" value={cant[f.lisa.id]} placeholder="0"
                    onChange={(e) => setCant({ ...cant, [f.lisa.id]: e.target.value })} aria-label={`A pedir ${f.lisa.color} ${f.lisa.talla}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="frisa-form__fila">
        <label><span className="field-label">Proveedor</span><input className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej. Vlank" /></label>
        <label><span className="field-label">Se espera (opcional)</span><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="btn btn--primary" disabled={trabajando || total <= 0 || !proveedor.trim()} onClick={crear}>{trabajando ? 'Guardando…' : `Crear pedido de playera lisa (${num(total)} pzas)`}</button>
    </div>
  )
}
