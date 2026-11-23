import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { ErrorState, Loading } from '../components/common/States'
import AyudaModulo from '../components/common/AyudaModulo'
import { useAuth } from '../contexts/AuthContext'
import { canCargarAtr, canOcAtr } from '../utils/permissions'
import { recognizeDocument } from '../services/documentOcrService'
import {
  crearProductoAtr, fetchAtrOcAlias, fetchAtrOcLista, fetchAtrProductos, guardarAtrOc, subirPdfOcAtr,
} from '../services/atrService'
import { TALLAS_ATR, leerBata, ordenTalla } from '../utils/atrCarga'
import { ESTADOS_OC, ocRepetida, problemaRenglon, renglonesDesdePdf, repetidos } from '../utils/atrOc'
import '../components/atr/atr.css'

// V215 — Subir una OC de ATR: PDF → lectura con Claude → revisión
// obligatoria (lo que no liga con el catálogo sale en rojo: asignar o dar de
// alta) → atr_oc_guardar. Nada se guarda sin pasar por esta revisión.
export default function AtrOcNuevaPage() {
  return (
    <RequireRole allow={canOcAtr}>
      <AtrOcNueva />
    </RequireRole>
  )
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' })
let siguiente = 1
const renglon = (x = {}) => ({ key: siguiente++, texto_pdf: '', talla_pdf: '', talla: '', cantidad: '', producto_id: '', como: null, ...x })

function AtrOcNueva() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [productos, setProductos] = useState(null)
  const [lista, setLista] = useState([])
  const [errorCarga, setErrorCarga] = useState(null)

  const [f, setF] = useState({ numero_oc: '', fecha_oc: hoy(), fecha_entrega: '', notas: '' })
  const [renglones, setRenglones] = useState([])
  const [pdf, setPdf] = useState(null) // { path, leido, url (local) }
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)
  const [revisado, setRevisado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [alta, setAlta] = useState(null) // { key, bolsa, color }

  useEffect(() => {
    Promise.all([fetchAtrProductos(), fetchAtrOcLista()]).then(([p, l]) => {
      if (p.error || l.error) return setErrorCarga(p.error || l.error)
      setProductos(p.data)
      setLista(l.data || [])
    })
  }, [])

  useEffect(() => () => pdf?.url && URL.revokeObjectURL(pdf.url), [pdf])

  const porId = useMemo(() => Object.fromEntries((productos || []).map((p) => [p.id, p])), [productos])
  const tallasDe = (id) => {
    const t = porId[id]?.tallas?.length ? porId[id].tallas : TALLAS_ATR
    return [...t].sort((a, b) => ordenTalla(a) - ordenTalla(b))
  }

  async function leer(file) {
    if (!file) return
    setLeyendo(true)
    setError(null)
    setAviso(null)
    setRevisado(false)
    const url = URL.createObjectURL(file)
    const [sub, ocr] = await Promise.all([subirPdfOcAtr(file), recognizeDocument(file, 'atr_oc')])
    if (sub.error) {
      setLeyendo(false)
      URL.revokeObjectURL(url)
      return setError('No se pudo guardar el PDF: ' + sub.error.message)
    }
    if (ocr.error) {
      setLeyendo(false)
      setPdf({ path: sub.data, leido: null, url })
      return setError('Se guardó el PDF pero no se pudo leer: ' + ocr.error.message + ' Llena los datos a mano.')
    }
    const d = ocr.data || {}
    const al = await fetchAtrOcAlias((d.articulos || []).map((a) => a.nombre))
    setLeyendo(false)
    setPdf({ path: sub.data, leido: d, url })
    setF((x) => ({
      ...x,
      numero_oc: d.numero || x.numero_oc,
      fecha_oc: d.fechaOc || x.fecha_oc,
      fecha_entrega: d.fechaEntrega || x.fecha_entrega,
    }))
    const nuevos = renglonesDesdePdf(d.articulos, productos, al.data || {}).map((r) => renglon(r))
    setRenglones(nuevos)
    const sin = nuevos.filter((r) => !r.producto_id).length
    setAviso(d.warning || `Se leyeron ${nuevos.length} renglones${sin ? `; ${sin} sin bata (en rojo): asígnalas o dalas de alta` : ''}. Revisa todo contra el PDF antes de guardar.`)
  }

  const setR = (key, campo, valor) =>
    setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, [campo]: valor, ...(campo === 'producto_id' ? { como: null } : {}) } : r)))
  const quitar = (key) => setRenglones((rs) => rs.filter((r) => r.key !== key))

  function abrirAlta(r) {
    const { bolsa, color } = leerBata(r.texto_pdf)
    setAlta({ key: r.key, bolsa: bolsa === null ? '' : String(bolsa), color: color.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) })
  }
  async function darDeAlta() {
    setError(null)
    if (alta.bolsa === '') return setError('Elige si la bata nueva es con o sin bolsa.')
    if (!alta.color.trim()) return setError('Escribe el color de la bata nueva.')
    const { data, error: e } = await crearProductoAtr(alta.bolsa === 'true', alta.color)
    if (e) return setError(e.message)
    const nuevo = { ...data, con_bolsa: !!data.especificaciones?.bolsa }
    setProductos((ps) => (ps.some((p) => p.id === nuevo.id) ? ps : [...ps, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
    setR(alta.key, 'producto_id', nuevo.id)
    setAlta(null)
  }

  const yaSubida = ocRepetida(f.numero_oc, lista)
  const reps = repetidos(renglones)
  const problemas = renglones.map((r) => problemaRenglon(r, r.producto_id ? tallasDe(r.producto_id) : null))
  const conProblema = problemas.filter(Boolean).length
  const totalPzas = renglones.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    if (!f.numero_oc.trim()) return setError('Captura el número de OC.')
    if (!f.fecha_oc) return setError('Captura la fecha de la OC.')
    if (yaSubida) return setError(`La OC ${yaSubida.numero_oc} ya está subida.`)
    if (!renglones.length) return setError('Agrega al menos un renglón.')
    if (conProblema) return setError('Hay renglones en rojo: corrígelos antes de guardar.')
    if (!revisado) return setError('Marca que revisaste los renglones contra el PDF.')
    setGuardando(true)
    const { data, error: err } = await guardarAtrOc({
      ...f,
      pdf_url: pdf?.path,
      leido_pdf: pdf?.leido,
      lineas: renglones.map((r) => ({ producto_id: r.producto_id, talla: r.talla, cantidad: Number(r.cantidad), texto_pdf: r.texto_pdf || null })),
    })
    setGuardando(false)
    if (err) return setError(err.message.replace('OC_REPETIDA:', '').trim())
    navigate(`/atr/oc/${data.id}`)
  }

  if (errorCarga) return <div className="page"><ErrorState error={errorCarga} /></div>
  if (!productos) return <div className="page"><Loading /></div>

  return (
    <div className="page atr">
      <Link to="/atr?tab=oc" className="atr-volver">← Órdenes de compra</Link>
      <div className="section-header">
        <h2 className="section-title">Nueva orden de compra de ATR <AyudaModulo id="atr" /></h2>
      </div>

      <div className={'atr-oc-nueva' + (pdf?.url ? ' atr-oc-nueva--con-pdf' : '')}>
        <form className="atr-oc-form" onSubmit={guardar}>
          <label className="atr-campo">
            <span className="field-label">PDF de la orden de compra</span>
            <input type="file" accept="application/pdf,image/*" disabled={leyendo} onChange={(e) => leer(e.target.files?.[0])} />
            {leyendo && <span className="atr-muted"> Leyendo el PDF…</span>}
          </label>
          {aviso && <p className="atr-aviso">{aviso}</p>}

          <div className="atr-oc-datos">
            <label><span className="field-label">Número de OC</span>
              <input className="input" value={f.numero_oc} onChange={(e) => setF({ ...f, numero_oc: e.target.value })} required />
            </label>
            <label><span className="field-label">Fecha de la OC</span>
              <input className="input" type="date" value={f.fecha_oc || ''} onChange={(e) => setF({ ...f, fecha_oc: e.target.value })} required />
            </label>
            <label><span className="field-label">Fecha de entrega (opcional)</span>
              <input className="input" type="date" value={f.fecha_entrega || ''} onChange={(e) => setF({ ...f, fecha_entrega: e.target.value })} />
            </label>
          </div>
          {yaSubida && (
            <p className="form-error">
              Esta OC ya está subida ({ESTADOS_OC[yaSubida.estado]}). <Link to={`/atr/oc/${yaSubida.id}`}>Ver la OC {yaSubida.numero_oc}</Link>
            </p>
          )}

          <div className="atr-oc-renglones">
            {renglones.map((r, i) => (
              <div key={r.key} className={'atr-bloque atr-oc-renglon' + (problemas[i] ? ' atr-oc-renglon--rojo' : '')}>
                {r.texto_pdf && <div className="atr-muted atr-oc-pdf-txt">PDF: {r.texto_pdf}{r.talla_pdf ? ` · talla ${r.talla_pdf}` : ''}</div>}
                <div className="atr-oc-renglon__campos">
                  <select className="input" value={r.producto_id} onChange={(e) => setR(r.key, 'producto_id', e.target.value)} aria-label="Bata">
                    <option value="">Elige la bata…</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <select className="input" value={r.talla} onChange={(e) => setR(r.key, 'talla', e.target.value)} aria-label="Talla">
                    <option value="">Talla…</option>
                    {[...new Set([...(r.producto_id ? tallasDe(r.producto_id) : TALLAS_ATR), ...(r.talla ? [r.talla] : [])])].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input className="input atr-oc-cant" type="number" min="1" step="1" inputMode="numeric" placeholder="Pzas"
                    value={r.cantidad} onChange={(e) => setR(r.key, 'cantidad', e.target.value)} aria-label="Cantidad" />
                  <button type="button" className="atr-quitar" onClick={() => quitar(r.key)} aria-label="Quitar renglón">×</button>
                </div>
                {r.como === 'aprendido' && <span className="atr-ok">✓ como la vez pasada</span>}
                {r.como === 'parecido' && <span className="atr-muted">Sugerida por parecido: revísala</span>}
                {problemas[i] && <span className="atr-negativo">{problemas[i]}</span>}
                {reps.has(`${r.producto_id}|${r.talla}`) && <span className="atr-muted">Bata y talla repetidas: se sumarán en una línea.</span>}
                {!r.producto_id && canCargarAtr(role) && alta?.key !== r.key && (
                  <button type="button" className="btn btn--ghost btn--small atr-oc-alta-btn" onClick={() => abrirAlta(r)}>Dar de alta bata nueva</button>
                )}
                {alta?.key === r.key && (
                  <div className="atr-ligar atr-oc-alta">
                    <select className="input" value={alta.bolsa} onChange={(e) => setAlta({ ...alta, bolsa: e.target.value })} aria-label="Con o sin bolsa">
                      <option value="">¿Con o sin bolsa?</option>
                      <option value="true">Con bolsa</option>
                      <option value="false">Sin bolsa</option>
                    </select>
                    <input className="input" placeholder="Color" value={alta.color} onChange={(e) => setAlta({ ...alta, color: e.target.value })} />
                    <button type="button" className="btn btn--primary btn--small" onClick={darDeAlta}>Dar de alta</button>
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => setAlta(null)}>Cancelar</button>
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setRenglones((rs) => [...rs, renglon()])}>+ Agregar renglón</button>
          </div>

          <label className="atr-campo"><span className="field-label">Notas (opcional)</span>
            <input className="input" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
          </label>

          <p className="atr-conteo">
            {renglones.length} renglones · <strong>{totalPzas.toLocaleString('es-MX')} batas</strong>
            {conProblema > 0 && <span className="atr-negativo"> · {conProblema} en rojo</span>}
          </p>
          <label className="atr-check atr-oc-revisado">
            <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
            Revisé cada renglón contra el PDF (bata, talla y cantidad)
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="atr-pie">
            <Link to="/atr?tab=oc" className="btn btn--ghost">Cancelar</Link>
            <button type="submit" className="btn btn--primary" disabled={guardando || leyendo || !!yaSubida || conProblema > 0 || !revisado || !renglones.length}>
              {guardando ? 'Guardando…' : 'Guardar OC'}
            </button>
          </div>
        </form>

        {pdf?.url && (
          <div className="atr-oc-visor">
            <iframe title="PDF de la OC" src={pdf.url} />
          </div>
        )}
      </div>
    </div>
  )
}

