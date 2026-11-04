import { useMemo, useState } from 'react'
import { recognizeDocument, MAX_OCR_FILE_SIZE_MB } from '../../services/documentOcrService'
import { guardarOC } from '../../services/frisaConsignacionService'
import { sugerirProducto, sugerirPlanta, ordenarProductos, formatNum } from '../../utils/frisaConsignacion'

// V181 — subir el PDF de la orden de compra de Frisa: el sistema lo lee y
// prellena; aquí se revisa y se elige el SKU de cada renglón (lo que se
// elige se aprende para la próxima). También se puede capturar a mano.
let siguiente = 1
const renglon = (x = {}) => ({ k: siguiente++, descripcion: '', talla: '', cantidad: '', producto_id: '', como: null, ...x })

export default function FrisaNuevaOC({ datos, onCancelar, onGuardada }) {
  const plantas = datos.plantas.filter((p) => p.activa !== false)
  const productos = useMemo(() => ordenarProductos(datos.productos.filter((p) => p.activo !== false)), [datos])
  const [form, setForm] = useState({ numero: '', plantaId: '', fechaOc: '', fechaLimite: '', notas: '' })
  const [lineas, setLineas] = useState([renglon()])
  const [leido, setLeido] = useState(null)
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function leerPdf(file) {
    if (!file) return
    setLeyendo(true)
    setAviso(null)
    setError(null)
    const { data, error: e } = await recognizeDocument(file, 'frisa_oc')
    setLeyendo(false)
    if (e) return setError(e.message)
    setLeido({ ...data, archivo: file.name })
    const plantaId = data.planta ? sugerirPlanta(data.planta, plantas) : null
    setForm((f) => ({ ...f, numero: data.numero || f.numero, plantaId: plantaId || f.plantaId, fechaOc: data.fechaOc || f.fechaOc, fechaLimite: data.fechaLimite || f.fechaLimite }))
    const ls = (data.articulos || []).map((a) => {
      const s = sugerirProducto(a.nombre, a.talla, productos, datos.alias)
      return renglon({ descripcion: a.nombre, talla: a.talla || '', cantidad: String(a.cantidad), producto_id: s.producto_id || '', como: s.como })
    })
    if (ls.length) setLineas(ls)
    const sinSku = ls.filter((l) => !l.producto_id).length
    setAviso(data.warning || `Se leyeron ${ls.length} renglones${data.planta ? ` · planta en el PDF: "${data.planta}"` : ''}${!plantaId && data.planta ? ' (elige la planta)' : ''}.${sinSku ? ` Falta elegir el SKU de ${sinSku}.` : ''} Revisa todo antes de guardar.`)
  }

  const poner = (k, campo, valor) => setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, [campo]: valor, ...(campo === 'producto_id' ? { como: 'elegido' } : {}) } : l)))
  const validas = lineas.filter((l) => Number(l.cantidad) > 0)
  const sinSku = validas.filter((l) => !l.producto_id)
  const total = validas.reduce((s, l) => s + Number(l.cantidad), 0)
  const puede = form.numero.trim() && form.plantaId && validas.length && !sinSku.length

  async function guardar() {
    // El mismo SKU en dos renglones se junta en uno.
    const porSku = new Map()
    for (const l of validas) {
      const x = porSku.get(l.producto_id)
      if (x) x.cantidad += Number(l.cantidad)
      else porSku.set(l.producto_id, { producto_id: l.producto_id, cantidad: Number(l.cantidad), descripcion: l.descripcion || null, talla_pdf: l.talla || null })
    }
    setGuardando(true)
    setError(null)
    const { data, error: e } = await guardarOC({ ...form, lineas: [...porSku.values()], leido })
    setGuardando(false)
    if (e) return setError(e.message)
    onGuardada(data)
  }

  return (
    <div className="card frisa-panel">
      <div className="frisa__barra">
        <h3 className="section-title section-title--small">Nueva orden de compra</h3>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancelar}>← Regresar</button>
      </div>

      <label className="frisa-subir">
        <input type="file" accept="application/pdf,image/*" disabled={leyendo} onChange={(e) => leerPdf(e.target.files?.[0])} />
        <span>{leyendo ? 'Leyendo el PDF…' : `📄 Elige el PDF de la orden de compra (máx. ${MAX_OCR_FILE_SIZE_MB} MB)`}</span>
      </label>
      {aviso && <p className="frisa__nota">{aviso}</p>}

      <div className="frisa-form__fila">
        <label><span className="field-label">Número de OC</span>
          <input className="input" value={form.numero} placeholder="4500…" onChange={(e) => setForm({ ...form, numero: e.target.value })} /></label>
        <label><span className="field-label">Planta</span>
          <select className="input" value={form.plantaId} onChange={(e) => setForm({ ...form, plantaId: e.target.value })}>
            <option value="">Elige…</option>
            {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></label>
        <label><span className="field-label">Fecha de la OC</span>
          <input className="input" type="date" value={form.fechaOc} onChange={(e) => setForm({ ...form, fechaOc: e.target.value })} /></label>
        <label><span className="field-label">Fecha límite de entrega</span>
          <input className="input" type="date" value={form.fechaLimite} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} /></label>
      </div>

      <div className="revision__tabla-wrap">
        <table className="simple-table frisa-tabla">
          <thead><tr><th>Descripción (como viene en la OC)</th><th>Talla</th><th className="num">Cantidad</th><th>SKU</th><th></th></tr></thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.k} className={Number(l.cantidad) > 0 && !l.producto_id ? 'frisa-fila--amarillo' : ''}>
                <td><input className="input" value={l.descripcion} aria-label="Descripción" onChange={(e) => poner(l.k, 'descripcion', e.target.value)} /></td>
                <td><input className="input frisa-input" value={l.talla} aria-label="Talla" onChange={(e) => poner(l.k, 'talla', e.target.value)} /></td>
                <td className="num"><input className="input frisa-input" inputMode="numeric" value={l.cantidad} aria-label="Cantidad"
                  onChange={(e) => poner(l.k, 'cantidad', e.target.value.replace(/[^0-9]/g, ''))} /></td>
                <td>
                  <select className="input" value={l.producto_id} aria-label="SKU" onChange={(e) => poner(l.k, 'producto_id', e.target.value)}>
                    <option value="">Elige el SKU…</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}
                  </select>
                  {l.como === 'aprendido' && <div className="frisa__ok frisa__sub">✓ como la vez pasada</div>}
                  {l.como === 'parecido' && <div className="frisa__sub">Sugerido: revisa que sea el correcto</div>}
                </td>
                <td><button type="button" className="btn btn--ghost btn--small" aria-label="Quitar renglón" onClick={() => setLineas((ls) => ls.filter((x) => x.k !== l.k))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setLineas((ls) => [...ls, renglon()])}>+ Agregar renglón</button>

      <label className="frisa-form__ancho"><span className="field-label">Notas (opcional)</span>
        <input className="input" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></label>

      {sinSku.length > 0 && <p className="frisa__sub">Falta elegir el SKU de {sinSku.length} renglón(es).</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="frisa__botones">
        <button type="button" className="btn btn--primary" disabled={!puede || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : `Guardar orden de compra (${formatNum(total)} pzas)`}
        </button>
      </div>
    </div>
  )
}
