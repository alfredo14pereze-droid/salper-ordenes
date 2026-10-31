import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHojasImpresas, quitarHojaImpresa } from '../../services/hojasImpresasService'
import { coincideNombre } from '../../utils/buscarPorNombre'
import BuscadorNombre from '../common/BuscadorNombre'
import { Loading, ErrorState, EmptyState } from '../common/States'
import { formatDateTime } from '../../utils/dates'
import '../impresion/impresion.css'

// V173 — hojas de operaciones que ya se imprimieron (una por prenda + título).
// Se pueden ver, volver a imprimir y quitar. Ver schema_v173_hojas_impresas.sql.
export default function HojasImpresas({ puedeQuitar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [quitando, setQuitando] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await fetchHojasImpresas()
    if (err) return setError(err)
    setError(null)
    setLista(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function quitar(h) {
    if (!window.confirm(`¿Quitar la hoja «${h.titulo}» de la lista?`)) return
    setQuitando(h.id)
    const { error: err } = await quitarHojaImpresa(h.id)
    setQuitando(null)
    if (err) return setError(err)
    setLista((prev) => prev.filter((x) => x.id !== h.id))
  }

  if (error) return <ErrorState error={error} onRetry={load} />
  if (!lista) return <Loading label="Cargando hojas impresas…" />
  if (lista.length === 0) {
    return <EmptyState>Todavía no se ha impreso ninguna hoja. Elige una prenda y toca «Imprimir operaciones»: al imprimirla se guarda aquí.</EmptyState>
  }

  const visibles = lista.filter((h) => coincideNombre(busqueda, h.titulo, h.prenda))
  return (
    <div className="hojas-impresas">
      <BuscadorNombre value={busqueda} onChange={setBusqueda} placeholder="Buscar por título o prenda…" />
      {busqueda && (
        <p className="template-hint">
          {visibles.length} de {lista.length}
        </p>
      )}
      {visibles.length === 0 && <EmptyState>Ninguna hoja coincide con «{busqueda}».</EmptyState>}
      {visibles.map((h) => {
        const ops = h.operaciones || []
        const abierto = abierta === h.id
        return (
          <section key={h.id} className="card hojas-impresas__item">
            <button type="button" className="hojas-impresas__head" aria-expanded={abierto} onClick={() => setAbierta(abierto ? null : h.id)}>
              <strong>
                {abierto ? '▾' : '▸'} {h.titulo}
              </strong>
              <span className="template-hint">
                {h.prenda} · {ops.length} {ops.length === 1 ? 'operación' : 'operaciones'} · impresa {h.veces} {h.veces === 1 ? 'vez' : 'veces'} · última {formatDateTime(h.ultima_en)}
                {h.ultima_por_nombre ? ` por ${h.ultima_por_nombre}` : ''}
              </span>
            </button>
            {abierto && (
              <>
                <div className="revision__tabla-wrap">
                  <table className="simple-table">
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Operación</th>
                        <th className="hojas-impresas__num">Tiempo (seg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.map((o) => (
                        <tr key={o.folio}>
                          <td>{o.folio}</td>
                          <td>{o.operacion}</td>
                          <td className="hojas-impresas__num">{Number(o.segundos).toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="hojas-impresas__acciones">
                  <Link to={`/produccion/operaciones/imprimir?hoja=${h.id}`} className="btn btn--secondary btn--small">
                    Volver a imprimir
                  </Link>
                  {puedeQuitar && (
                    <button type="button" className="btn btn--ghost btn--small" disabled={quitando === h.id} onClick={() => quitar(h)}>
                      {quitando === h.id ? 'Quitando…' : 'Quitar de la lista'}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
