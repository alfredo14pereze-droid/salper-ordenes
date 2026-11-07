import { useEffect, useMemo, useState } from 'react'
import { fetchOperacionesTodas } from '../../services/produccionService'
import { agruparPorParte, cotizar, foliosVigentes, sinTiempo, validarOperadoras, validarPiezas } from './calculos'
import { guardarCotizacion } from '../../services/cotizacionesService'
import { GuardarCotizacion, PasoLote, Resultado, num } from './partes'
import './cotizador.css'

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

  const seleccionadas = opsPrenda.filter((o) => marcadas.has(o.folio))
  const r = cotizar(seleccionadas, piezas, operadoras)

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

      <PasoLote piezas={piezas} setPiezas={setPiezas} operadoras={operadoras} setOperadoras={setOperadoras} />
      <Resultado titulo={prenda} r={r} vacio={prenda ? 'No hay operaciones seleccionadas.' : 'Elige una prenda para ver sus operaciones.'} />

      {listaParaGuardar && (
        <GuardarCotizacion
          placeholder={`Ej. ${prenda} Colegio Americano`}
          guardar={(extra) => guardarCotizacion({ ...extra, prenda, folios: seleccionadas.map((o) => o.folio), piezas, operadoras })}
          onGuardada={onGuardada}
        />
      )}
    </div>
  )
}
