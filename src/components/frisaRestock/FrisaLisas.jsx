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
      {(() => {
        const s = (k) => calculo.filas.reduce((t, f) => t + Math.max(0, f[k] || 0), 0)
        const hay = s('stock'), proceso = s('enProceso'), piden = s('piden'), comprar = s('aComprar')
        return (
          <div className="stats-grid frisa-lisas__totales">
            <div className="stat-card"><span className="stat-card__label">Hay en anaquel</span><span className="stat-card__value">{num(hay)}</span></div>
            <div className="stat-card"><span className="stat-card__label">En proceso</span><span className="stat-card__value">{num(proceso)}</span><span className="stat-card__hint">ya en órdenes de taller</span></div>
            <div className="stat-card"><span className="stat-card__label">Faltan por hacer</span><span className="stat-card__value">{num(piden)}</span><span className="stat-card__hint">lo que piden las órdenes de taller sugeridas</span></div>
            <div className="stat-card"><span className="stat-card__label">A comprar</span><span className="stat-card__value">{num(comprar)}</span><span className="stat-card__hint">faltan por hacer − hay</span></div>
            <div className="stat-card"><span className="stat-card__label">Total</span><span className="stat-card__value">{num(proceso + piden)}</span><span className="stat-card__hint">en proceso + faltan por hacer</span></div>
          </div>
        )
      })()}
      {!filas.length && <p className="frisa__sub">Sin movimiento de playera lisa todavía. Marca “Ver todas” para capturar el primer conteo.</p>}
      {filas.length > 0 && (
        <div className="revision__tabla-wrap">
          <table className="simple-table frisa-tabla frisa-niveles__tabla">
            <thead><tr><th>Playera lisa</th><th className="num">Stock (anaquel)</th><th>Para</th><th className="num">En proceso</th><th className="num">Piden</th><th className="num">Total</th><th className="num">A comprar</th></tr></thead>
            <tbody>
              {filas.map((f) => <FilaLisa key={f.lisa.id} f={f} todas={todas} puede={puede.bodega} onListo={onListo} />)}
            </tbody>
          </table>
        </div>
      )}
      {puede.compras && <PedidoLisas filas={calculo.filas} proveedorSugerido={calculo.filas.find((f) => f.proveedor)?.proveedor || ''} onListo={onListo} />}
    </section>
  )
}

// Una lisa = un renglón por producto que la usa (con / sin reflejante). El stock y "A comprar"
// son de la lisa (es la misma materia prima) y van en el primer renglón.
function FilaLisa({ f, todas, puede, onListo }) {
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
  const clase = f.aComprar > 0 ? 'frisa-niveles__fila--critico' : f.stock < 0 ? 'frisa-niveles__fila--pedir' : 'frisa-niveles__fila--ok'
  const prods = (f.porProducto || []).filter((p) => todas || p.enProceso || p.piden)
  const renglones = prods.length ? prods : [null]
  return renglones.map((p, i) => (
    <tr key={p?.producto_frisa_id || 'x'} className={clase + (i > 0 ? ' frisa-lisas__sub' : '')}>
      <td data-label="Playera lisa">{i === 0 && <><strong>{f.lisa.talla}</strong> <NombreFrisa producto={{ ...lisaComoProducto(f.lisa), nombre: `${f.lisa.color} ${MANGA[f.lisa.manga]}` }} /></>}</td>
      <td data-label="Stock" className="num">
        {i === 0 && (editando ? (
          <span className="frisa-niveles__editar">
            <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" autoFocus value={valor} onFocus={(e) => e.target.select()}
              onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }} aria-label="Conteo de playera lisa" />
            <button type="button" className="btn btn--primary btn--small" onClick={guardar} aria-label="Guardar">✓</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditando(false)} aria-label="Cancelar">×</button>
            {error && <span className="form-error frisa-niveles__error">{error}</span>}
          </span>
        ) : puede ? (
          <button type="button" className="frisa-niveles__stock" onClick={() => { setValor(String(Math.max(0, f.stock))); setError(null); setEditando(true) }}>{num(f.stock)}</button>
        ) : <strong>{num(f.stock)}</strong>)}
        {i === 0 && f.stock < 0 && !editando && <div className="frisa__falta">faltó registrar</div>}
      </td>
      <td data-label="Para">{p ? <><strong>{p.reflejante || p.nombre}</strong>{p.reflejante && <div className="frisa__sub">{p.nombre}</div>}</> : <span className="frisa__sub">—</span>}</td>
      <td data-label="En proceso" className="num">{p?.enProceso ? num(p.enProceso) : ''}</td>
      <td data-label="Piden" className="num">{p?.piden ? num(p.piden) : ''}</td>
      <td data-label="Total" className="num">{p && (p.enProceso + p.piden) ? <strong>{num(p.enProceso + p.piden)}</strong> : ''}</td>
      <td data-label="A comprar" className="num">{i === 0 && f.aComprar ? <strong>{num(f.aComprar)}</strong> : ''}</td>
    </tr>
  ))
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
                <td data-label="Necesitan" className="num">{f.piden ? num(f.piden) : '0'}
                  {(f.porProducto || []).filter((p) => p.piden).length > 1 && (
                    <div className="frisa__sub">{f.porProducto.filter((p) => p.piden).map((p) => `${(p.reflejante || p.nombre).toLowerCase()} ${num(p.piden)}`).join(' · ')}</div>
                  )}
                  {(f.porProducto || []).filter((p) => p.piden).length === 1 && (
                    <div className="frisa__sub">{(f.porProducto.find((p) => p.piden).reflejante || '').toLowerCase()}</div>
                  )}</td>
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
