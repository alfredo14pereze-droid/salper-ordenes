import { useState } from 'react'
import { COSTO_POR_SEGUNDO, MAX_OPERADORAS, MINUTOS_EFECTIVOS_DIA } from '../../config/costos'
import { validarOperadoras, validarPiezas } from './calculos'

export const pesos = (n, max = 2) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: max })
export const num = (n, d = 2) => n.toLocaleString('es-MX', { maximumFractionDigits: d })

// Pasos que comparten "Por prenda" y "Desde hoja" (V191): lote, resultado y guardar.

export function PasoLote({ numero = 3, piezas, setPiezas, operadoras, setOperadoras }) {
  const errPiezas = piezas === '' ? null : validarPiezas(piezas)
  const errOperadoras = operadoras === '' ? null : validarOperadoras(operadoras)
  return (
      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">{numero}. Lote</h3>
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
  )
}

export function Resultado({ numero = 4, titulo, r, vacio }) {
  const t = r.totales
  return (
      <section className="card cotizador__paso">
        <h3 className="section-title section-title--small">{numero}. Resultado{titulo ? ` — ${titulo}` : ''}</h3>
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
          <p className="template-hint">{vacio}</p>
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
  )
}

// V172 — guarda la cotización tal como está, con un nombre para encontrarla.
export function GuardarCotizacion({ numero = 5, placeholder, nombreInicial = '', guardar: guardarRpc, onGuardada }) {
  const [nombre, setNombre] = useState(nombreInicial)
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [guardada, setGuardada] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Ponle un nombre para encontrarla después.')
    setSaving(true)
    setError(null)
    const { data, error: err } = await guardarRpc({
      nombre: nombre.trim(),
      nota: nota.trim(),
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
      <h3 className="section-title section-title--small">{numero}. Guardar cotización</h3>
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
            placeholder={placeholder}
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

export function Dato({ label, valor, destacado = false }) {
  return (
    <div className={'cotizador__dato' + (destacado ? ' cotizador__dato--destacado' : '')}>
      <span className="cotizador__dato-label">{label}</span>
      <span className="cotizador__dato-valor">{valor}</span>
    </div>
  )
}
