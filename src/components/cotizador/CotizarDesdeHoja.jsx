import { useEffect, useState } from 'react'
import { fetchOperacionesTodas } from '../../services/produccionService'
import { recognizeDocument } from '../../services/documentOcrService'
import { guardarCotizacionHoja } from '../../services/cotizacionesService'
import { cotizar, validarOperadoras, validarPiezas } from './calculos'
import { folioValido, ligarHoja, operacionesQueCuentan, resumenHoja } from '../../utils/cotizarHoja'
import { GuardarCotizacion, PasoLote, Resultado, num } from './partes'
import './cotizador.css'

// V191 — Cotizar desde una hoja de operaciones impresa: se sube la foto o el
// PDF, la IA lee folio/operación/segundos, cada renglón se liga al catálogo
// por folio y se revisa/corrige antes de calcular y guardar. El costo usa los
// segundos del catálogo (los de hoy), no los de la hoja.
// `inicial` (al volver a cotizar una guardada desde hoja): { nombre, folios, piezas, operadoras }.

const ESTADO = {
  ok: { txt: '✓ Coincide', cls: 'cotizador__estado--ok' },
  segundos: { txt: '⚠ Otros segundos', cls: 'cotizador__estado--aviso' },
  inactiva: { txt: '⚠ Ya no está activa', cls: 'cotizador__estado--aviso' },
  no_encontrado: { txt: '✗ Folio no existe', cls: 'cotizador__estado--mal' },
  sin_folio: { txt: '✗ Falta el folio', cls: 'cotizador__estado--mal' },
  repetido: { txt: '✗ Repetido', cls: 'cotizador__estado--mal' },
}

let siguiente = 1
const renglon = (x = {}) => ({ key: siguiente++, folio: '', operacion: '', segundos: null, parte: null, ...x })

// Las fotos del celular suelen pesar más de 3 MB: se achican antes de mandarlas.
async function achicarImagen(file) {
  if (!file.type.startsWith('image/') || file.size <= 1.5 * 1024 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export default function CotizarDesdeHoja({ inicial = null, onGuardada }) {
  const [catalogo, setCatalogo] = useState(null)
  const [error, setError] = useState(null)
  const [leidas, setLeidas] = useState(() => (inicial?.folios || []).map((folio) => renglon({ folio: String(folio) })))
  const [titulo, setTitulo] = useState(inicial?.nombre || '')
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [errorLectura, setErrorLectura] = useState(null)
  const [nuevoFolio, setNuevoFolio] = useState('')
  const [piezas, setPiezas] = useState(inicial ? String(inicial.piezas) : '')
  const [operadoras, setOperadoras] = useState(inicial ? String(inicial.operadoras) : '')
  const [vuelta, setVuelta] = useState(0) // reinicia el nombre sugerido al leer otra hoja

  useEffect(() => {
    fetchOperacionesTodas().then(({ data, error: err }) => {
      if (err) setError(err.message)
      else setCatalogo(data || [])
    })
  }, [])

  async function subir(e) {
    const original = e.target.files?.[0]
    e.target.value = ''
    if (!original) return
    setLeyendo(true)
    setAviso(null)
    setErrorLectura(null)
    const file = await achicarImagen(original)
    const { data, error: err } = await recognizeDocument(file, 'hoja_operaciones')
    setLeyendo(false)
    if (err) return setErrorLectura(err.message)
    const ops = data?.operaciones || []
    setLeidas(ops.map((o) => renglon({ folio: o.folio == null ? '' : String(o.folio), operacion: o.operacion, segundos: o.segundos, parte: o.parte })))
    if (data?.titulo) setTitulo(data.titulo)
    setVuelta((n) => n + 1)
    setAviso(data?.warning || `Se leyeron ${ops.length} ${ops.length === 1 ? 'operación' : 'operaciones'}. Revisa la lista antes de cotizar.`)
  }

  const setFolio = (key, valor) => setLeidas((ls) => ls.map((l) => (l.key === key ? { ...l, folio: valor } : l)))
  const quitar = (key) => setLeidas((ls) => ls.filter((l) => l.key !== key))
  function agregar(e) {
    e.preventDefault()
    if (folioValido(nuevoFolio) == null) return
    setLeidas((ls) => [...ls, renglon({ folio: nuevoFolio.trim() })])
    setNuevoFolio('')
  }

  if (error) return <p className="form-error">{error}</p>
  if (!catalogo) return <p className="template-hint">Cargando catálogo de operaciones…</p>

  const renglones = ligarHoja(leidas, catalogo)
  const res = resumenHoja(renglones)
  const cuentan = operacionesQueCuentan(renglones)
  const r = cotizar(cuentan, piezas, operadoras)
  const listaParaGuardar = cuentan.length > 0 && !validarPiezas(piezas) && !validarOperadoras(operadoras)
  const nuevoValido = folioValido(nuevoFolio) != null

  return (
    <div className="cotizador">
      <p className="produccion__aviso cotizador__leyenda">Solo costo de destajo. No incluye sueldo base, indirectos ni margen.</p>
      {inicial && <p className="template-hint">Volviste a abrir «{inicial.nombre}» con los tiempos y precios de hoy.</p>}

      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">1. Hoja de operaciones</h3>
        <p className="template-hint">Sube la foto o el PDF de la hoja impresa (la que trae Folio, Operación y Tiempo). La página lee los folios y los busca en el catálogo.</p>
        <div className="cotizador__subir">
          <label className="btn btn--primary" style={{ opacity: leyendo ? 0.6 : 1, cursor: leyendo ? 'wait' : 'pointer' }}>
            {leyendo ? 'Leyendo la hoja…' : leidas.length ? 'Subir otra hoja' : 'Subir hoja (foto o PDF)'}
            <input type="file" accept="image/*,application/pdf" hidden disabled={leyendo} onChange={subir} />
          </label>
        </div>
        {errorLectura && <p className="form-error">{errorLectura}</p>}
        {aviso && <p className="template-hint">{aviso}</p>}
      </section>

      {(leidas.length > 0 || titulo) && (
        <section className="card cotizador__paso">
          <h3 className="section-title section-title--small">2. Revisa las operaciones{titulo ? ` — ${titulo}` : ''}</h3>
          <p className="template-hint">
            {res.cuentan} de {res.total} cuentan
            {res.segundos > 0 && ` · ${res.segundos} con otros segundos (se usan los del catálogo)`}
            {res.inactiva > 0 && ` · ${res.inactiva} ya no activas`}
            {res.noCuentan > 0 && ` · ${res.noCuentan} no cuentan: corrige el folio o quítalas`}
          </p>
          {renglones.length > 0 && (
            <div className="revision__tabla-wrap">
              <table className="simple-table cotizador__tabla cotizador__hoja">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Operación</th>
                    <th className="cotizador__num">Seg. hoja</th>
                    <th className="cotizador__num">Seg. catálogo</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((rg) => {
                    const l = leidas[rg.i]
                    const e = ESTADO[rg.estado]
                    return (
                      <tr key={l.key}>
                        <td>
                          <input className="input cotizador__folio-input" inputMode="numeric" value={l.folio} onChange={(ev) => setFolio(l.key, ev.target.value)} aria-label="Folio" />
                        </td>
                        <td>
                          {rg.op ? rg.op.operacion : l.operacion || '—'}
                          {rg.op && (
                            <span className="template-hint">
                              {' '}
                              · {rg.op.prenda} / {rg.op.parte}
                            </span>
                          )}
                          {rg.op && l.operacion && rg.estado !== 'ok' && <div className="template-hint">En la hoja: {l.operacion}</div>}
                        </td>
                        <td className="cotizador__num">{l.segundos == null ? '—' : num(Number(l.segundos))}</td>
                        <td className="cotizador__num">{rg.op ? num(Number(rg.op.segundos)) : '—'}</td>
                        <td>
                          <span className={'cotizador__estado ' + e.cls}>{e.txt}</span>
                        </td>
                        <td>
                          <button type="button" className="btn btn--ghost btn--small" onClick={() => quitar(l.key)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <form className="cotizador__agregar" onSubmit={agregar}>
            <input className="input" inputMode="numeric" placeholder="Folio" value={nuevoFolio} onChange={(e) => setNuevoFolio(e.target.value)} aria-label="Folio para agregar" />
            <button type="submit" className="btn btn--secondary btn--small" disabled={!nuevoValido}>
              + Agregar folio
            </button>
          </form>
        </section>
      )}

      <PasoLote piezas={piezas} setPiezas={setPiezas} operadoras={operadoras} setOperadoras={setOperadoras} />
      <Resultado titulo={titulo} r={r} vacio={leidas.length ? 'Ninguna operación cuenta todavía: corrige los folios.' : 'Sube una hoja para ver sus operaciones.'} />

      {listaParaGuardar && (
        <GuardarCotizacion
          key={vuelta}
          nombreInicial={inicial ? '' : titulo}
          placeholder={titulo ? `Ej. ${titulo} Colegio Americano` : 'Ej. Camisa Colegio Americano'}
          guardar={(extra) => guardarCotizacionHoja({ ...extra, folios: cuentan.map((o) => o.folio), piezas, operadoras })}
          onGuardada={onGuardada}
        />
      )}
    </div>
  )
}
