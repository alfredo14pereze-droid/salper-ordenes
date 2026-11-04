import { useMemo, useState } from 'react'
import { guardarPlanta, guardarProducto } from '../../services/frisaConsignacionService'
import { ordenarProductos, modeloDe, formatPesos } from '../../utils/frisaConsignacion'

// V181 — Catálogo: plantas de Frisa y SKUs (un SKU por modelo y talla).
// Lo que se da de alta aquí es real (no es de prueba): "Borrar datos de
// prueba" no lo toca.
export default function FrisaCatalogo({ datos, recargar }) {
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [planta, setPlanta] = useState('')
  const [modelo, setModelo] = useState({ modelo: '', prefijo: '', tallas: '', precio: '' })
  const [guardando, setGuardando] = useState(false)
  const grupos = useMemo(() => {
    const m = new Map()
    for (const p of ordenarProductos(datos.productos)) {
      const k = modeloDe(p)
      m.set(k, [...(m.get(k) || []), p])
    }
    return [...m.entries()]
  }, [datos])

  async function correr(fn, msg) {
    setGuardando(true)
    setError(null)
    setOk(null)
    const r = await fn()
    setGuardando(false)
    if (r?.error) return setError(r.error.message)
    setOk(msg)
    recargar()
  }

  async function altaModelo(e) {
    e.preventDefault()
    const tallas = modelo.tallas.split(/[,\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean)
    const pref = modelo.prefijo.trim().toUpperCase()
    await correr(async () => {
      for (const t of tallas.length ? tallas : ['']) {
        const r = await guardarProducto({ sku: t ? `${pref}-${t}` : pref, modelo: modelo.modelo, talla: t, precio: Number(modelo.precio) })
        if (r.error) return r
      }
      setModelo({ modelo: '', prefijo: '', tallas: '', precio: '' })
      return null
    }, `Se dieron de alta ${tallas.length || 1} SKU(s).`)
  }

  async function cambiarPrecio(p, valor) {
    const n = Number(valor)
    if (valor === '' || n === Number(p.precio_consumo)) return
    await correr(() => guardarProducto({ id: p.id, sku: p.sku, modelo: modeloDe(p), talla: p.talla, precio: n, activo: p.activo }), `Precio de ${p.sku} actualizado.`)
  }

  return (
    <div>
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="frisa__ok">{ok}</p>}

      <h3 className="section-title section-title--small">Plantas</h3>
      <ul className="frisa-catalogo__plantas">
        {datos.plantas.map((p) => (
          <li key={p.id}>
            {p.nombre} {p.es_prueba && <span className="frisa__prueba">prueba</span>} {p.activa === false && <span className="frisa__sub">(inactiva)</span>}
            <button type="button" className="btn btn--ghost btn--small" disabled={guardando}
              onClick={() => correr(() => guardarPlanta({ id: p.id, nombre: p.nombre, activa: p.activa === false }), 'Planta actualizada.')}>
              {p.activa === false ? 'Activar' : 'Desactivar'}
            </button>
          </li>
        ))}
      </ul>
      <form className="frisa-form__fila" onSubmit={(e) => { e.preventDefault(); correr(() => guardarPlanta({ nombre: planta }).then((r) => { if (!r.error) setPlanta(''); return r }), 'Planta agregada.') }}>
        <label><span className="field-label">Nueva planta</span><input className="input" value={planta} placeholder="Ej. Frisa Acería" onChange={(e) => setPlanta(e.target.value)} /></label>
        <button type="submit" className="btn btn--secondary btn--small" disabled={guardando || !planta.trim()}>Agregar planta</button>
      </form>

      <h3 className="section-title section-title--small frisa__titulo">Modelos y tallas</h3>
      <form className="card frisa-panel" onSubmit={altaModelo}>
        <strong>Nuevo modelo</strong>
        <div className="frisa-form__fila">
          <label><span className="field-label">Modelo</span><input className="input" required value={modelo.modelo} placeholder="Playera C/R M/C c/reflejante" onChange={(e) => setModelo({ ...modelo, modelo: e.target.value })} /></label>
          <label><span className="field-label">Prefijo del SKU</span><input className="input" required value={modelo.prefijo} placeholder="FR-PLA-MC" onChange={(e) => setModelo({ ...modelo, prefijo: e.target.value })} /></label>
          <label><span className="field-label">Tallas (separadas por coma)</span><input className="input" value={modelo.tallas} placeholder="S, M, L, XL, 2XL" onChange={(e) => setModelo({ ...modelo, tallas: e.target.value })} /></label>
          <label><span className="field-label">Precio de consumo</span><input className="input" required type="number" min="0" step="0.01" value={modelo.precio} onChange={(e) => setModelo({ ...modelo, precio: e.target.value })} /></label>
        </div>
        <p className="frisa__sub">Se crea un SKU por talla: {modelo.prefijo ? `${modelo.prefijo.toUpperCase()}-${(modelo.tallas.split(/[,\s]+/).filter(Boolean)[0] || 'M').toUpperCase()}` : 'FR-PLA-MC-M'}, …</p>
        <div><button type="submit" className="btn btn--primary btn--small" disabled={guardando}>Dar de alta</button></div>
      </form>

      {grupos.map(([m, ps]) => (
        <details key={m} className="card frisa-panel">
          <summary><strong>{m}</strong> <span className="frisa__sub">· {ps.length} talla(s) · {formatPesos(ps[0].precio_consumo)}</span>{ps[0].es_prueba && <span className="frisa__prueba">prueba</span>}</summary>
          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla">
              <thead><tr><th>SKU</th><th>Talla</th><th className="num">Precio de consumo</th><th></th></tr></thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.sku}</strong></td>
                    <td>{p.talla || '—'}</td>
                    <td className="num"><input className="input frisa-input frisa-input--ancho" type="number" min="0" step="0.01" defaultValue={p.precio_consumo} aria-label={`Precio ${p.sku}`} onBlur={(e) => cambiarPrecio(p, e.target.value)} /></td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--small" disabled={guardando}
                        onClick={() => correr(() => guardarProducto({ id: p.id, sku: p.sku, modelo: modeloDe(p), talla: p.talla, precio: Number(p.precio_consumo), activo: p.activo === false }), 'SKU actualizado.')}>
                        {p.activo === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
