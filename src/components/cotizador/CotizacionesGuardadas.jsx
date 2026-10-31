import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { borrarCotizacion, fetchCotizacionesGuardadas } from '../../services/cotizacionesService'
import { coincideNombre } from '../../utils/buscarPorNombre'
import BuscadorNombre from '../common/BuscadorNombre'
import { Loading, ErrorState, EmptyState } from '../common/States'
import { formatDateTime } from '../../utils/dates'
import { cotizarGuardada } from './calculos'

const pesos = (n, max = 2) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: max })
const num = (n, d = 2) => n.toLocaleString('es-MX', { maximumFractionDigits: d })

// V172 — cotizaciones guardadas: buscar, ver el detalle, imprimir su hoja de
// operaciones, volver a cotizar o borrar. Ver schema_v172_cotizaciones_guardadas.sql.
export default function CotizacionesGuardadas({ onVolverACotizar, recargar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [borrando, setBorrando] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchCotizacionesGuardadas()
    if (err) return setError(err)
    setError(null)
    setLista(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load, recargar])

  async function borrar(c) {
    if (!window.confirm(`¿Borrar la cotización «${c.nombre}»?`)) return
    setBorrando(c.id)
    const { error: err } = await borrarCotizacion(c.id)
    setBorrando(null)
    if (err) return setError(err)
    setLista((prev) => prev.filter((x) => x.id !== c.id))
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!lista) return <Loading label="Cargando cotizaciones…" />
  if (lista.length === 0) return <EmptyState>Todavía no hay cotizaciones guardadas. Haz una en «Cotizar» y guárdala en el paso 5.</EmptyState>

  const visibles = lista.filter((c) => coincideNombre(busqueda, c.nombre, c.prenda, c.nota))
  return (
    <div className="cotizador">
      <BuscadorNombre value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, prenda o nota…" />
      {busqueda && (
        <p className="template-hint">
          {visibles.length} de {lista.length}
        </p>
      )}
      {visibles.length === 0 && <EmptyState>Ninguna cotización coincide con «{busqueda}».</EmptyState>}
      {visibles.map((c) => {
        const r = cotizarGuardada(c)
        const t = r.totales
        const abierto = abierta === c.id
        return (
          <section key={c.id} className="card cotizador__paso">
            <button type="button" className="cotizador__guardada-head" aria-expanded={abierto} onClick={() => setAbierta(abierto ? null : c.id)}>
              <strong>
                {abierto ? '▾' : '▸'} {c.nombre}
              </strong>
              <span className="template-hint">
                {c.prenda} · {num(c.piezas, 0)} piezas · {c.operadoras} operadoras · {formatDateTime(c.creado_en)}
                {c.creado_por_nombre ? ` · ${c.creado_por_nombre}` : ''}
              </span>
              <span className="cotizador__guardada-resumen">
                <span>Unitario {pesos(t.costoUnitario, 3)}</span>
                <span>Lote {pesos(t.costoTotalLote)}</span>
                <span>{num(t.diasEnteros, 0)} {t.diasEnteros === 1 ? 'día' : 'días'}</span>
              </span>
            </button>

            {abierto && (
              <>
                {c.nota && <p className="template-hint">Nota: {c.nota}</p>}
                <div className="cotizador__totales">
                  <Dato label="Segundos por pieza" valor={num(t.segundosPorPieza)} />
                  <Dato label="Costo unitario" valor={pesos(t.costoUnitario, 3)} />
                  <Dato label="Costo total del lote" valor={pesos(t.costoTotalLote)} destacado />
                  <Dato label="Días de producción" valor={num(t.diasProduccion)} destacado />
                </div>
                <p className="template-hint">
                  Con los números de ese día: {pesos(Number(c.costo_por_segundo), 3)} por segundo · {num(Number(c.minutos_dia))} minutos por operadora al día.
                </p>
                <div className="revision__tabla-wrap">
                  <table className="simple-table cotizador__tabla">
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Operación</th>
                        <th className="cotizador__num">Tiempo (seg)</th>
                        <th className="cotizador__num">Precio por pieza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.filas.map((f) => (
                        <tr key={f.folio}>
                          <td>{f.folio}</td>
                          <td>{f.operacion}</td>
                          <td className="cotizador__num">{num(f.tiempo)}</td>
                          <td className="cotizador__num">{pesos(f.precio, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cotizador__guardada-acciones">
                  <Link to={`/produccion/operaciones/imprimir?cotizacion=${c.id}`} className="btn btn--secondary btn--small">
                    Imprimir hoja de operaciones
                  </Link>
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => onVolverACotizar(c)}>
                    Volver a cotizar
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" disabled={borrando === c.id} onClick={() => borrar(c)}>
                    {borrando === c.id ? 'Borrando…' : 'Borrar'}
                  </button>
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
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
