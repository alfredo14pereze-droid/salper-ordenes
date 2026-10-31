import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../talleros/Modal'
import PdfPreviewModal from '../pdf/PdfPreviewModal'
import { fetchOperacionesTodas, guardarOperacion } from '../../services/produccionService'
import { useAuth } from '../../contexts/AuthContext'
import { canCapturarProduccion, esFabricaSoloLectura } from '../../utils/permissions'
import HojasImpresas from './HojasImpresas'
import { buildCatalogoOperacionesPdfBlob, catalogoPdfFileName } from '../../utils/generateProduccionPdf'
import { COLUMNAS_DEFAULT, COLUMNAS_OPCIONALES, operacionesParaImprimir } from '../../utils/imprimirOperaciones'
import {
  centena,
  sugerirFolioPrendaExistente,
  sugerirCentenaNueva,
  resumenCentenas,
  validarFolioNuevo,
  MIN_LIBRES_AVISO,
} from '../../utils/produccionStats'

const NUEVA = '__nueva__'

// V70 — Catálogo de operaciones. Los folios se organizan por centenas según la prenda: al dar de alta se
// sugiere el siguiente folio libre; las operaciones NUNCA se borran (solo se desactivan) y un folio jamás se reutiliza.
// `consulta`: vista de solo consulta (Juanis, /produccion/operaciones): buscar y
// filtrar, sin altas, ediciones ni información de folios libres.
export default function OperacionesAdmin({ consulta = false }) {
  const { role } = useAuth()
  const soloLectura = consulta || esFabricaSoloLectura(role)
  const [ops, setOps] = useState([])
  const [error, setError] = useState(null)
  const [fPrenda, setFPrenda] = useState('')
  const [q, setQ] = useState('')
  const [verCentenas, setVerCentenas] = useState(false)
  const [alta, setAlta] = useState(null)
  const [edit, setEdit] = useState(null)
  // Palomitas para escoger qué imprimir (se conservan al cambiar el filtro).
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [imprimir, setImprimir] = useState(false)
  const [verHojas, setVerHojas] = useState(false) // V173

  const cargar = useCallback(async () => {
    const { data, error: err } = await fetchOperacionesTodas()
    if (err) setError(err.message)
    else setOps(data || [])
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const prendas = useMemo(() => [...new Set(ops.map((o) => o.prenda))].sort(), [ops])
  const centenas = useMemo(() => resumenCentenas(ops), [ops])
  const filtradas = useMemo(() => {
    const n = q.trim().toLowerCase()
    return ops.filter((o) => (!fPrenda || o.prenda === fPrenda) && (!n || `${o.folio} ${o.operacion} ${o.parte}`.toLowerCase().includes(n)))
  }, [ops, fPrenda, q])
  const todasVisiblesMarcadas = filtradas.length > 0 && filtradas.every((o) => marcadas.has(o.folio))
  function marcar(folio) {
    setMarcadas((prev) => {
      const n = new Set(prev)
      if (n.has(folio)) n.delete(folio)
      else n.add(folio)
      return n
    })
  }
  function marcarVisibles() {
    setMarcadas((prev) => {
      const n = new Set(prev)
      for (const o of filtradas) {
        if (todasVisiblesMarcadas) n.delete(o.folio)
        else n.add(o.folio)
      }
      return n
    })
  }

  const centenasPrenda = useMemo(() => (fPrenda ? centenas.filter((c) => c.prendas.includes(fPrenda)) : []), [centenas, fPrenda])
  const pocas = centenas.filter((c) => c.pocos)

  async function toggleActiva(o) {
    setError(null)
    const { error: err } = await guardarOperacion({ folio: o.folio, prenda: o.prenda, parte: o.parte, operacion: o.operacion, segundos: o.segundos, activa: !o.activa, nuevo: false })
    if (err) return setError(err.message)
    cargar()
  }

  return (
    <div>
      <div className="revision__barra">
        <label>
          Prenda
          <select className="input" value={fPrenda} onChange={(e) => setFPrenda(e.target.value)}>
            <option value="">Todas ({ops.length})</option>
            {prendas.map((p) => (
              <option key={p} value={p}>
                {p} ({ops.filter((o) => o.prenda === p).length})
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar
          <input className="input" placeholder="Folio u operación…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="revision__acciones">
          {!consulta && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setVerCentenas((v) => !v)}>
              {verCentenas ? 'Ocultar' : 'Folios libres por centena'}
            </button>
          )}
          {fPrenda && (
            <Link to={`/produccion/operaciones/imprimir?prenda=${encodeURIComponent(fPrenda)}`} className="btn btn--primary btn--small">
              Imprimir operaciones
            </Link>
          )}
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setImprimir(true)}>
            Imprimir…
          </button>
          <button type="button" className={'btn btn--small ' + (verHojas ? 'btn--primary' : 'btn--secondary')} aria-pressed={verHojas} onClick={() => setVerHojas((v) => !v)}>
            {verHojas ? 'Ocultar hojas impresas' : 'Hojas impresas'}
          </button>
          {!soloLectura && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() =>
                // Si ya hay prenda filtrada, el folio sugerido sale desde el inicio.
                setAlta({ prendaSel: fPrenda || '', prendaNueva: '', folio: fPrenda ? String(sugerirFolioPrendaExistente(ops, fPrenda)?.folio ?? '') : '', parte: '', operacion: '', segundos: '' })
              }>
              + Nueva operación
            </button>
          )}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {verHojas && <HojasImpresas puedeQuitar={canCapturarProduccion(role)} />}
      {marcadas.size > 0 && (
        <p className="template-hint">
          {marcadas.size} {marcadas.size === 1 ? 'operación marcada' : 'operaciones marcadas'} para imprimir.{' '}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setMarcadas(new Set())}>
            Quitar marcas
          </button>
        </p>
      )}
      {!consulta && pocas.length > 0 && (
        <p className="produccion__aviso">
          ⚠ A estas centenas les quedan menos de {MIN_LIBRES_AVISO} folios libres: {pocas.map((c) => `${c.centena * 100} (${c.libres})`).join(', ')}.
        </p>
      )}
      {!consulta && fPrenda && centenasPrenda.length > 0 && (
        <p className="template-hint">
          {fPrenda}: {centenasPrenda.map((c) => `centena ${c.centena * 100} — ${c.libres} folios libres`).join(' · ')}
        </p>
      )}
      {verCentenas && (
        <div className="card" style={{ marginBottom: 12 }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>Centena</th>
                <th>Prendas</th>
                <th>Usados</th>
                <th>Libres</th>
              </tr>
            </thead>
            <tbody>
              {centenas.map((c) => (
                <tr key={c.centena} className={c.pocos ? 'produccion__pocos' : ''}>
                  <td>{c.centena * 100}</td>
                  <td>{c.prendas.join(', ')}</td>
                  <td>{c.usados}</td>
                  <td>{c.libres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="revision__tabla-wrap">
        <table className="simple-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={todasVisiblesMarcadas}
                  onChange={marcarVisibles}
                  title={`Marcar las ${filtradas.length} que se ven`}
                  aria-label={`Marcar las ${filtradas.length} que se ven`}
                />
              </th>
              <th>Folio</th>
              <th>Prenda</th>
              <th>Parte</th>
              <th>Operación</th>
              <th>Seg.</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, 300).map((o) => (
              <tr key={o.folio} className={o.activa ? '' : 'mt-catalogo__item--off'}>
                <td>
                  <input type="checkbox" checked={marcadas.has(o.folio)} onChange={() => marcar(o.folio)} aria-label={`Marcar ${o.folio} para imprimir`} />
                </td>
                <td>{o.folio}</td>
                <td>{o.prenda}</td>
                <td>{o.parte}</td>
                <td>{o.operacion}</td>
                <td>{o.segundos}</td>
                <td>{o.activa ? 'Activa' : 'Inactiva'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!soloLectura && (
                    <>
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => setEdit({ ...o, segundos: String(o.segundos) })}>
                        Editar
                      </button>{' '}
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => toggleActiva(o)}>
                        {o.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtradas.length > 300 && <p className="template-hint">Mostrando 300 de {filtradas.length}; filtra por prenda o busca.</p>}
      </div>
      {!consulta && <p className="template-hint">Las operaciones no se borran: se desactivan. Un folio nunca se reutiliza.</p>}

      {alta && <AltaOperacion ops={ops} prendas={prendas} valores={alta} onClose={() => setAlta(null)} onDone={() => { setAlta(null); cargar() }} />}
      {edit && <EditarOperacion op={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); cargar() }} />}
      {imprimir && <ImprimirOperaciones ops={ops} visibles={filtradas} marcadas={marcadas} filtro={{ prenda: fPrenda, q }} onClose={() => setImprimir(false)} />}
    </div>
  )
}

function EditarOperacion({ op, onClose, onDone }) {
  const [v, setV] = useState(op)
  const [error, setError] = useState(null)
  async function guardar(e) {
    e.preventDefault()
    const { error: err } = await guardarOperacion({ folio: op.folio, prenda: op.prenda, parte: v.parte, operacion: v.operacion, segundos: Number(v.segundos), activa: op.activa, nuevo: false })
    if (err) return setError(err.message)
    onDone()
  }
  return (
    <Modal title={`Editar operación ${op.folio}`} onClose={onClose}>
      <form className="order-form" onSubmit={guardar}>
        <p className="template-hint">{op.prenda} · folio {op.folio}. Cambiar el tiempo no modifica semanas ya capturadas.</p>
        <label>
          Parte
          <input className="input" value={v.parte} onChange={(e) => setV({ ...v, parte: e.target.value })} />
        </label>
        <label>
          Operación
          <input className="input" value={v.operacion} onChange={(e) => setV({ ...v, operacion: e.target.value })} />
        </label>
        <label>
          Tiempo en segundos
          <input className="input" type="number" step="0.5" min="0.5" value={v.segundos} onChange={(e) => setV({ ...v, segundos: e.target.value })} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!v.parte.trim() || !v.operacion.trim() || !(Number(v.segundos) > 0)}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AltaOperacion({ ops, prendas, valores, onClose, onDone }) {
  const [v, setV] = useState(valores)
  const [error, setError] = useState(null)
  const esNueva = v.prendaSel === NUEVA
  const prenda = esNueva ? v.prendaNueva.trim().toUpperCase() : v.prendaSel

  // Al elegir la prenda se sugiere el folio (editable).
  function elegirPrenda(sel) {
    let folio = ''
    if (sel === NUEVA) folio = String(sugerirCentenaNueva(ops).folio)
    else if (sel) folio = String(sugerirFolioPrendaExistente(ops, sel)?.folio ?? '')
    setV({ ...v, prendaSel: sel, folio })
  }

  const folioNum = v.folio === '' ? null : Number(v.folio)
  const val = folioNum == null ? null : validarFolioNuevo(ops, folioNum, esNueva ? null : prenda)
  const otrasEnCentena = folioNum == null ? [] : [...new Set(ops.filter((o) => centena(o.folio) === centena(folioNum) && o.prenda !== prenda).map((o) => o.prenda))]

  async function guardar(e) {
    e.preventDefault()
    setError(null)
    const { error: err } = await guardarOperacion({ folio: folioNum, prenda, parte: v.parte, operacion: v.operacion, segundos: Number(v.segundos), activa: true, nuevo: true })
    if (err) return setError(err.message)
    onDone()
  }

  const listo = prenda && folioNum != null && !val?.existe && v.parte.trim() && v.operacion.trim() && Number(v.segundos) > 0

  return (
    <Modal title="Nueva operación" onClose={onClose}>
      <form className="order-form" onSubmit={guardar}>
        <label>
          Prenda *
          <select className="input" value={v.prendaSel} onChange={(e) => elegirPrenda(e.target.value)}>
            <option value="">Selecciona…</option>
            {prendas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={NUEVA}>Prenda nueva…</option>
          </select>
        </label>
        {esNueva && (
          <label>
            Nombre de la prenda nueva *
            <input className="input" value={v.prendaNueva} onChange={(e) => setV({ ...v, prendaNueva: e.target.value })} placeholder="Ej. CHALECO" />
          </label>
        )}
        <label>
          Folio * <small>(sugerido; puedes cambiarlo)</small>
          <input className="input" type="number" min="0" value={v.folio} onChange={(e) => setV({ ...v, folio: e.target.value })} />
        </label>
        {val?.existe && <p className="form-error">El folio {folioNum} ya existe. Un folio nunca se reutiliza.</p>}
        {val && !val.existe && val.fuera && <p className="produccion__aviso">⚠ Ese folio queda fuera de la centena de {prenda} ({val.centenas.map((c) => c * 100).join(', ')}).</p>}
        {val && !val.existe && otrasEnCentena.length > 0 && (
          <p className="template-hint">La centena {centena(folioNum) * 100} también la usa: {otrasEnCentena.join(', ')}.</p>
        )}
        {val && !val.existe && val.pocosLibres && (
          <p className="produccion__aviso">⚠ Con este folio a la centena {centena(folioNum) * 100} le quedarán {val.libresTras} folios libres (menos de {MIN_LIBRES_AVISO}).</p>
        )}
        <label>
          Parte *
          <input className="input" value={v.parte} onChange={(e) => setV({ ...v, parte: e.target.value })} />
        </label>
        <label>
          Operación *
          <input className="input" value={v.operacion} onChange={(e) => setV({ ...v, operacion: e.target.value })} />
        </label>
        <label>
          Tiempo en segundos *
          <input className="input" type="number" step="0.5" min="0.5" value={v.segundos} onChange={(e) => setV({ ...v, segundos: e.target.value })} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!listo}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Imprimir operaciones escogiendo qué va en la hoja: lo que se ve (filtro y
// búsqueda), solo las marcadas o todo el catálogo; con o sin inactivas; qué
// columnas; y si cada prenda va en su propia hoja.
function ImprimirOperaciones({ ops, visibles, marcadas, filtro, onClose }) {
  const [modo, setModo] = useState(marcadas.size > 0 ? 'marcadas' : 'visibles')
  const [incluirInactivas, setIncluirInactivas] = useState(false)
  const [columnas, setColumnas] = useState(COLUMNAS_DEFAULT)
  const [porPrenda, setPorPrenda] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  const lista = operacionesParaImprimir(ops, { modo, visibles, marcadas, incluirInactivas })
  const descripcionFiltro = [filtro.prenda, filtro.q.trim() && `"${filtro.q.trim()}"`].filter(Boolean).join(' · ') || 'sin filtro'
  const toggleColumna = (key) => setColumnas((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  async function verPdf() {
    setGenerando(true)
    setError(null)
    try {
      const blob = await buildCatalogoOperacionesPdfBlob(lista, { columnas, porPrenda })
      setPreview({ blob, fileName: catalogoPdfFileName('operaciones') })
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message}`)
    }
    setGenerando(false)
  }

  if (preview) return <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={onClose} />

  const opcion = (valor, texto, deshabilitada = false) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, opacity: deshabilitada ? 0.5 : 1 }}>
      <input type="radio" name="modo-impresion" checked={modo === valor} disabled={deshabilitada} onChange={() => setModo(valor)} />
      {texto}
    </label>
  )

  return (
    <Modal title="Imprimir operaciones" onClose={onClose}>
      <div className="order-form">
        <div>
          <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>
            ¿Qué operaciones?
          </span>
          {opcion('visibles', `Las que se ven ahora (${visibles.length}) — ${descripcionFiltro}`)}
          {opcion('marcadas', `Solo las marcadas (${marcadas.size})`, marcadas.size === 0)}
          {opcion('todas', `Todo el catálogo (${ops.length})`)}
          {marcadas.size === 0 && <p className="template-hint">Para escoger una por una, márcalas con la casilla de la izquierda en la tabla.</p>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
          <input type="checkbox" checked={incluirInactivas} onChange={(e) => setIncluirInactivas(e.target.checked)} />
          Incluir operaciones inactivas
        </label>
        <div>
          <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>
            Columnas (folio y operación siempre van)
          </span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {COLUMNAS_OPCIONALES.map((c) => (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={columnas.includes(c.key)} onChange={() => toggleColumna(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
          <input type="checkbox" checked={porPrenda} onChange={(e) => setPorPrenda(e.target.checked)} />
          Una hoja por prenda (con el nombre de la prenda de título)
        </label>
        <p className="template-hint">
          Se imprimirán <b>{lista.length}</b> {lista.length === 1 ? 'operación' : 'operaciones'}.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" disabled={generando || lista.length === 0} onClick={verPdf}>
            {generando ? 'Generando…' : 'Ver PDF'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
