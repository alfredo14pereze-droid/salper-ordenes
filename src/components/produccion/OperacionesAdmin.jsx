import { useCallback, useEffect, useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { fetchOperacionesTodas, guardarOperacion } from '../../services/produccionService'
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
export default function OperacionesAdmin() {
  const [ops, setOps] = useState([])
  const [error, setError] = useState(null)
  const [fPrenda, setFPrenda] = useState('')
  const [q, setQ] = useState('')
  const [verCentenas, setVerCentenas] = useState(false)
  const [alta, setAlta] = useState(null)
  const [edit, setEdit] = useState(null)

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
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setVerCentenas((v) => !v)}>
            {verCentenas ? 'Ocultar' : 'Folios libres por centena'}
          </button>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setAlta({ prendaSel: fPrenda || '', prendaNueva: '', folio: '', parte: '', operacion: '', segundos: '' })}>
            + Nueva operación
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {pocas.length > 0 && (
        <p className="produccion__aviso">
          ⚠ A estas centenas les quedan menos de {MIN_LIBRES_AVISO} folios libres: {pocas.map((c) => `${c.centena * 100} (${c.libres})`).join(', ')}.
        </p>
      )}
      {fPrenda && centenasPrenda.length > 0 && (
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
                <td>{o.folio}</td>
                <td>{o.prenda}</td>
                <td>{o.parte}</td>
                <td>{o.operacion}</td>
                <td>{o.segundos}</td>
                <td>{o.activa ? 'Activa' : 'Inactiva'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setEdit({ ...o, segundos: String(o.segundos) })}>
                    Editar
                  </button>{' '}
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => toggleActiva(o)}>
                    {o.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtradas.length > 300 && <p className="template-hint">Mostrando 300 de {filtradas.length}; filtra por prenda o busca.</p>}
      </div>
      <p className="template-hint">Las operaciones no se borran: se desactivan. Un folio nunca se reutiliza.</p>

      {alta && <AltaOperacion ops={ops} prendas={prendas} valores={alta} onClose={() => setAlta(null)} onDone={() => { setAlta(null); cargar() }} />}
      {edit && <EditarOperacion op={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); cargar() }} />}
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
