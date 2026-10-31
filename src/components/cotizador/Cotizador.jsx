import { useEffect, useMemo, useState } from 'react'
import { fetchOperacionesTodas } from '../../services/produccionService'
import { COSTO_POR_SEGUNDO, MAX_OPERADORAS, MINUTOS_EFECTIVOS_DIA } from '../../config/costos'
import { agruparPorParte, cotizar, foliosVigentes, sinTiempo, validarOperadoras, validarPiezas } from './calculos'
import { guardarCotizacion } from '../../services/cotizacionesService'
import './cotizador.css'

const pesos = (n, max = 2) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: max })
const num = (n, d = 2) => n.toLocaleString('es-MX', { maximumFractionDigits: d })

// Cotizador de destajo: elige prenda → marca operaciones → piezas y operadoras
// → costo y días. Cálculo en el navegador.
// V172 — se puede guardar (paso 5) y volver a abrir una guardada: `inicial`
// trae { nombre, prenda, folios, piezas, operadoras } y se recalcula con el
// catálogo de hoy.
export default function Cotizador({ inicial = null, onGuardada }) {
  const [ops, setOps] = useState(null)
  const [error, setError] = useState(null)
  const [prenda, setPrenda] = useState(inicial?.prenda || '')
  const [marcadas, setMarcadas] = useState(() => new Set(inicial?.folios || []))
  const [piezas, setPiezas] = useState(inicial ? String(inicial.piezas) : '')
  const [operadoras, setOperadoras] = useState(inicial ? String(inicial.operadoras) : '')

  useEffect(() => {
    fetchOperacionesTodas().then(({ data, error: err }) => {
      if (err) setError(err.message)
      else setOps((data || []).filter((o) => o.activa))
    })
  }, [])

  const prendas = useMemo(() => [...new Set((ops || []).map((o) => o.prenda))].sort(), [ops])
  const opsPrenda = useMemo(() => (ops || []).filter((o) => o.prenda === prenda), [ops, prenda])
  const partes = useMemo(() => agruparPorParte(opsPrenda), [opsPrenda])

  function elegirPrenda(p) {
    setPrenda(p)
    // Al elegir prenda se marcan todas sus operaciones; se desmarcan las que no apliquen.
    setMarcadas(new Set((ops || []).filter((o) => o.prenda === p).map((o) => o.folio)))
  }
  function marcar(folio) {
    setMarcadas((prev) => {
      const n = new Set(prev)
      if (n.has(folio)) n.delete(folio)
      else n.add(folio)
      return n
    })
  }
  function marcarParte(operaciones, valor) {
    setMarcadas((prev) => {
      const n = new Set(prev)
      for (const o of operaciones) valor ? n.add(o.folio) : n.delete(o.folio)
      return n
    })
  }

  const errPiezas = piezas === '' ? null : validarPiezas(piezas)
  const errOperadoras = operadoras === '' ? null : validarOperadoras(operadoras)
  const seleccionadas = opsPrenda.filter((o) => marcadas.has(o.folio))
  const r = cotizar(seleccionadas, piezas, operadoras)
  const t = r.totales

  const listaParaGuardar = prenda && seleccionadas.length > 0 && !validarPiezas(piezas) && !validarOperadoras(operadoras)
  const faltanDeInicial = inicial && ops ? foliosVigentes({ prenda: inicial.prenda, operaciones: inicial.folios.map((folio) => ({ folio })) }, ops).faltan : 0

  if (error) return <p className="form-error">{error}</p>
  if (!ops) return <p className="template-hint">Cargando catálogo de operaciones…</p>

  return (
    <div className="cotizador">
      <p className="produccion__aviso cotizador__leyenda">Solo costo de destajo. No incluye sueldo base, indirectos ni margen.</p>
      {inicial && (
        <p className="template-hint">
          Volviste a abrir «{inicial.nombre}» con los tiempos y precios de hoy.
          {faltanDeInicial > 0 && ` ${faltanDeInicial} ${faltanDeInicial === 1 ? 'operación ya no está' : 'operaciones ya no están'} en el catálogo y no se cuentan.`}
        </p>
      )}

      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">1. Prenda</h3>
        <select className="input" value={prenda} onChange={(e) => elegirPrenda(e.target.value)}>
          <option value="">Selecciona una prenda…</option>
          {prendas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </section>

      {prenda && (
        <section className="card cotizador__paso">
          <h3 className="section-title section-title--small">
            2. Operaciones ({seleccionadas.length} de {opsPrenda.length})
          </h3>
          {partes.map(({ parte, operaciones }) => {
            const n = operaciones.filter((o) => marcadas.has(o.folio)).length
            return (
              <div key={parte} className="cotizador__parte">
                <div className="cotizador__parte-encabezado">
                  <strong>{parte}</strong>
                  <span className="template-hint">
                    {n} de {operaciones.length}
                  </span>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => marcarParte(operaciones, true)}>
                    Seleccionar todas
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => marcarParte(operaciones, false)}>
                    Limpiar
                  </button>
                </div>
                <ul className="cotizador__ops">
                  {operaciones.map((o) => (
                    <li key={o.folio}>
                      <label>
                        <input type="checkbox" checked={marcadas.has(o.folio)} onChange={() => marcar(o.folio)} />
                        <span className="cotizador__folio">{o.folio}</span>
                        <span className="cotizador__op">{o.operacion}</span>
                        <span className="cotizador__seg">{sinTiempo(o) ? <span className="cotizador__alerta">⚠ sin tiempo</span> : `${num(Number(o.segundos))} seg`}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">3. Lote</h3>
        <div className="cotizador__campos">
          <label>
            Piezas
            <input className="input" type="number" min="1" step="1" inputMode="numeric" value={piezas} onChange={(e) => setPiezas(e.target.value)} />
            {errPiezas && <span className="form-error">{errPiezas}</span>}
          </label>
          <label>
            Operadoras (1 a {MAX_OPERADORAS})
            <input className="input" type="number" min="1" max={MAX_OPERADORAS} step="1" inputMode="numeric" value={operadoras} onChange={(e) => setOperadoras(e.target.value)} />
            {errOperadoras && <span className="form-error">{errOperadoras}</span>}
          </label>
        </div>
      </section>

      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">4. Resultado{prenda ? ` — ${prenda}` : ''}</h3>
        {r.conAviso > 0 && (
          <p className="produccion__aviso">
            ⚠ {r.conAviso} {r.conAviso === 1 ? 'operación seleccionada no tiene' : 'operaciones seleccionadas no tienen'} tiempo (y por lo tanto precio). Cuentan como 0: revisa el catálogo.
          </p>
        )}
        <div className="cotizador__totales">
          <Dato label="Segundos por pieza" valor={num(t.segundosPorPieza)} />
          <Dato label="Costo unitario" valor={pesos(t.costoUnitario, 3)} />
          <Dato label="Costo total del lote" valor={pesos(t.costoTotalLote)} destacado />
          <Dato label="Minutos por pieza" valor={num(t.minutosPorPieza)} />
          <Dato label="Tiempo total (min)" valor={num(t.tiempoTotalMin)} />
          <Dato label="Operadoras" valor={num(t.operadoras, 0)} />
          <Dato label="Días de producción" valor={num(t.diasProduccion)} destacado />
          <Dato label="Días (redondeado hacia arriba)" valor={num(t.diasEnteros, 0)} />
        </div>
        <p className="template-hint">
          Precio por segundo: {pesos(COSTO_POR_SEGUNDO, 3)} · {MINUTOS_EFECTIVOS_DIA} minutos efectivos por operadora al día.
        </p>

        {r.filas.length === 0 ? (
          <p className="template-hint">{prenda ? 'No hay operaciones seleccionadas.' : 'Elige una prenda para ver sus operaciones.'}</p>
        ) : (
          <div className="revision__tabla-wrap">
            <table className="simple-table cotizador__tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Operación</th>
                  <th className="cotizador__num">Tiempo (seg)</th>
                  <th className="cotizador__num">Precio por pieza</th>
                  <th className="cotizador__num">Costo del lote</th>
                </tr>
              </thead>
              <tbody>
                {r.filas.map((f) => (
                  <tr key={f.folio} className={f.aviso ? 'cotizador__fila-alerta' : ''}>
                    <td>{f.folio}</td>
                    <td>
                      {f.operacion}
                      {f.aviso && <span className="cotizador__alerta"> ⚠ tiempo 0 / sin precio</span>}
                    </td>
                    <td className="cotizador__num">{num(f.tiempo)}</td>
                    <td className="cotizador__num">{pesos(f.precio, 3)}</td>
                    <td className="cotizador__num">{pesos(f.costoLote)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Total</th>
                  <th className="cotizador__num">{num(t.segundosPorPieza)}</th>
                  <th className="cotizador__num">{pesos(t.costoUnitario, 3)}</th>
                  <th className="cotizador__num">{pesos(t.costoTotalLote)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {listaParaGuardar && (
        <GuardarCotizacion
          prenda={prenda}
          piezas={piezas}
          operadoras={operadoras}
          folios={seleccionadas.map((o) => o.folio)}
          onGuardada={onGuardada}
        />
      )}
    </div>
  )
}

// V172 — guarda la cotización tal como está, con un nombre para encontrarla.
function GuardarCotizacion({ prenda, piezas, operadoras, folios, onGuardada }) {
  const [nombre, setNombre] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [guardada, setGuardada] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Ponle un nombre para encontrarla después.')
    setSaving(true)
    setError(null)
    const { data, error: err } = await guardarCotizacion({
      nombre: nombre.trim(),
      nota: nota.trim(),
      prenda,
      folios,
      piezas,
      operadoras,
      costoPorSegundo: COSTO_POR_SEGUNDO,
      minutosDia: MINUTOS_EFECTIVOS_DIA,
    })
    setSaving(false)
    if (err) return setError(err.message)
    setGuardada(data?.nombre || nombre.trim())
    setNombre('')
    setNota('')
    onGuardada?.(data)
  }

  return (
    <form className="card cotizador__paso" onSubmit={guardar}>
      <h3 className="section-title section-title--small">5. Guardar cotización</h3>
      <div className="cotizador__campos">
        <label>
          Nombre
          <input
            className="input"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              setGuardada(null)
            }}
            placeholder={`Ej. ${prenda} Colegio Americano`}
          />
        </label>
        <label>
          Nota (opcional)
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Cliente, variante, algo a recordar…" />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      {guardada && <p className="nota-leido--ok">✓ Se guardó «{guardada}». La encuentras en «Guardadas».</p>}
      <div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cotización'}
        </button>
      </div>
    </form>
  )
}

function Dato({ label, valor, destacado = false }) {
  return (
    <div className={'cotizador__dato' + (destacado ? ' cotizador__dato--destacado' : '')}>
      <span className="cotizador__dato-label">{label}</span>
      <span className="cotizador__dato-valor">{valor}</span>
    </div>
  )
}
