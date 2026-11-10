import { useMemo, useState } from 'react'
import { nombreFrisa } from '../../utils/frisaColores'
import Modal from '../talleros/Modal'
import { recognizeDocument } from '../../services/documentOcrService'
import { crearSurtido, editarSurtido, subirPdfOC } from '../../services/frisaSurtidoService'
import { sugerirClave, piezasDe } from '../../utils/frisaSurtido'

const num = (n) => Number(n || 0).toLocaleString('es-MX')
let siguiente = 1
const renglon = (x = {}) => ({ key: siguiente++, producto_id: '', cantidad: '', texto_pdf: '', talla_pdf: '', como: null, ...x })

// Subir el PDF de una OC de Frisa → orden de surtido (o corregir una pendiente).
const ESTADO_TXT = { pendiente: 'pendiente', surtida: 'surtida', entregada: 'entregada' }
const normOC = (x) => String(x || '').replace(/\s+/g, '').toUpperCase()

export default function FrisaSurtidoForm({ productos, alias, surtido, lineas, existentes = [], onClose, onGuardada }) {
  const editando = Boolean(surtido)
  const [f, setF] = useState({
    numero_oc: surtido?.numero_oc || '', planta: surtido?.planta || '', fecha_oc: surtido?.fecha_oc || '',
    fecha_limite: surtido?.fecha_limite || '', notas: surtido?.notas || '',
  })
  const [renglones, setRenglones] = useState(() =>
    editando ? lineas.map((l) => renglon({ producto_id: l.producto_id, cantidad: String(l.cantidad), texto_pdf: l.texto_pdf || '', talla_pdf: l.talla_pdf || '' })) : [])
  const [pdf, setPdf] = useState(null) // { path, leido }
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)

  const opciones = useMemo(() => [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [productos])

  async function leer(file) {
    if (!file) return
    setLeyendo(true)
    setError(null)
    setAviso(null)
    const [sub, ocr] = await Promise.all([subirPdfOC(file), recognizeDocument(file, 'frisa_oc')])
    setLeyendo(false)
    if (sub.error) return setError('No se pudo guardar el PDF: ' + sub.error.message)
    if (ocr.error) {
      setPdf({ path: sub.data, leido: null })
      return setError('Se guardó el PDF pero no se pudo leer: ' + ocr.error.message + ' Llena los datos a mano.')
    }
    const d = ocr.data || {}
    setPdf({ path: sub.data, leido: d })
    setF((x) => ({
      ...x,
      numero_oc: d.numero || x.numero_oc, planta: d.planta || x.planta,
      fecha_oc: d.fechaOc || x.fecha_oc, fecha_limite: d.fechaLimite || x.fecha_limite,
    }))
    const nuevos = (d.articulos || []).map((a) => {
      const s = sugerirClave(a.nombre, a.talla, productos, alias, a.codigo)
      return renglon({ producto_id: s.producto_id || '', cantidad: String(a.cantidad), texto_pdf: a.nombre, talla_pdf: a.talla || '', como: s.como })
    })
    setRenglones(nuevos)
    const sin = nuevos.filter((r) => !r.producto_id).length
    setAviso(d.warning || `Se leyeron ${nuevos.length} renglones${sin ? `; ${sin} sin clave: elígela a mano` : ''}. Revisa todo antes de guardar.`)
  }

  const setR = (key, campo, valor) => setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, [campo]: valor, ...(campo === 'producto_id' ? { como: null } : {}) } : r)))
  const quitar = (key) => setRenglones((rs) => rs.filter((r) => r.key !== key))

  // La misma OC no se puede subir dos veces (la base también lo impide).
  const yaSubida = f.numero_oc
    ? existentes.find((x) => x.id !== surtido?.id && x.estado !== 'cancelada' && normOC(x.numero_oc) === normOC(f.numero_oc))
    : null
  const repetidas = (() => {
    const c = {}
    for (const r of renglones) if (r.producto_id) c[r.producto_id] = (c[r.producto_id] || 0) + 1
    return new Set(Object.keys(c).filter((k) => c[k] > 1))
  })()
  const totalPzas = piezasDe(renglones.map((r) => ({ cantidad: Number(r.cantidad) || 0 })))

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!renglones.length) return setError('Agrega al menos un renglón.')
    if (renglones.some((r) => !r.producto_id)) return setError('Hay renglones sin clave.')
    if (renglones.some((r) => !/^\d+$/.test(r.cantidad) || Number(r.cantidad) <= 0)) return setError('Revisa las cantidades (enteros mayores que 0).')
    if (repetidas.size) return setError('Hay claves repetidas: júntalas en un solo renglón.')
    const datos = {
      ...f,
      lineas: renglones.map((r) => ({ producto_id: r.producto_id, cantidad: Number(r.cantidad), texto_pdf: r.texto_pdf || null, talla_pdf: r.talla_pdf || null })),
      pdf_path: pdf?.path, leido_pdf: pdf?.leido,
    }
    setGuardando(true)
    const { data, error: err } = editando ? await editarSurtido(surtido.id, datos) : await crearSurtido(datos)
    setGuardando(false)
    if (err) return setError(err.message)
    onGuardada(data)
  }

  return (
    <Modal title={editando ? `Corregir OC ${surtido.numero_oc}` : 'Subir orden de compra de Frisa'} onClose={onClose}>
      <form className="frisa-niveles__supuestos" onSubmit={guardar}>
        {!editando && (
          <label className="frisa-niveles__archivo">
            <span className="field-label">PDF de la orden de compra</span>
            <input type="file" accept="application/pdf,image/*" disabled={leyendo} onChange={(e) => leer(e.target.files?.[0])} />
            {leyendo && <span className="frisa__sub">Leyendo el PDF…</span>}
          </label>
        )}
        {aviso && <p className="frisa__nota">{aviso}</p>}

        <div className="frisa-form__fila">
          <label><span className="field-label">Número de OC</span>
            <input className="input" value={f.numero_oc} onChange={(e) => setF({ ...f, numero_oc: e.target.value })} required />
            {yaSubida && <span className="form-error">Esta OC ya está subida ({ESTADO_TXT[yaSubida.estado] || yaSubida.estado}, {yaSubida.planta}). No se puede subir otra vez.</span>}</label>
          <label><span className="field-label">Planta</span>
            <input className="input" value={f.planta} onChange={(e) => setF({ ...f, planta: e.target.value })} required /></label>
          <label><span className="field-label">Fecha de la OC</span>
            <input className="input" type="date" value={f.fecha_oc || ''} onChange={(e) => setF({ ...f, fecha_oc: e.target.value })} /></label>
          <label><span className="field-label">Fecha límite</span>
            <input className="input" type="date" value={f.fecha_limite || ''} onChange={(e) => setF({ ...f, fecha_limite: e.target.value })} /></label>
        </div>

        <div className="frisa-surtido__renglones">
          {renglones.map((r) => (
            <div key={r.key} className={'frisa-surtido__renglon' + (!r.producto_id || repetidas.has(r.producto_id) ? ' is-error' : '')}>
              {r.texto_pdf && <span className="frisa__sub">PDF: {r.texto_pdf}{r.talla_pdf ? ` · talla ${r.talla_pdf}` : ''}</span>}
              <div className="frisa-surtido__renglon-campos">
                <select className="input" value={r.producto_id} onChange={(e) => setR(r.key, 'producto_id', e.target.value)} aria-label="Clave">
                  <option value="">Elige el producto…</option>
                  {opciones.map((p) => <option key={p.id} value={p.id}>{nombreFrisa(p.nombre)}</option>)}
                </select>
                <input className="input frisa-input" type="number" min="1" step="1" inputMode="numeric" value={r.cantidad}
                  onChange={(e) => setR(r.key, 'cantidad', e.target.value)} aria-label="Cantidad" placeholder="Pzas" />
                <button type="button" className="item-block__remove" onClick={() => quitar(r.key)} aria-label="Quitar renglón">×</button>
              </div>
              {r.como === 'codigo' && <span className="frisa__ok frisa__sub">✓ por el número de artículo</span>}
              {r.como === 'aprendido' && <span className="frisa__ok frisa__sub">✓ como la vez pasada</span>}
              {r.como === 'parecido' && <span className="frisa__sub">Sugerida por parecido: revísala</span>}
              {repetidas.has(r.producto_id) && <span className="frisa__falta">Clave repetida</span>}
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setRenglones((rs) => [...rs, renglon()])}>+ Agregar renglón</button>
        </div>

        <label><span className="field-label">Notas (opcional)</span>
          <input className="input" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></label>

        <p className="frisa__nota">{renglones.length} renglones · <strong>{num(totalPzas)} piezas</strong></p>
        {error && <p className="form-error">{error}</p>}
        <div className="frisa__botones">
          <button type="submit" className="btn btn--primary" disabled={guardando || leyendo || !!yaSubida}>
            {guardando ? 'Guardando…' : editando ? 'Guardar corrección' : 'Crear orden de surtido'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
