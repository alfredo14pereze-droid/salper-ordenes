import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canViewProduccionMontos } from '../utils/permissions'
import {
  listarSemanas,
  revisionSemana,
  cerrarSemana,
  aprobarSemana,
  reabrirSemana,
  fetchRegistrosOperadora,
} from '../services/produccionService'

// V69 — Revisión y aprobación semanal (admin_general / admin_fabrica). Terminología:
// "valor generado" (NO es el sueldo). Todo el cálculo viene del servidor
// (prod_revision_semana); aquí solo se muestra. Semana aprobada = congelada.
export default function ProduccionRevisionPage() {
  return (
    <RequireRole allow={canViewProduccionMontos}>
      <Revision />
    </RequireRole>
  )
}

const money = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))
const dt = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const ESTADO = { abierta: 'Abierta', en_revision: 'En revisión', aprobada: 'Aprobada' }

function Revision() {
  const { role } = useAuth()
  const esGeneral = role === 'admin_general'
  const [semanas, setSemanas] = useState([])
  const [semanaId, setSemanaId] = useState(null)
  const [filas, setFilas] = useState([])
  const [prevTotal, setPrevTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [error, setError] = useState(null)
  const [accionError, setAccionError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [abierta, setAbierta] = useState(null) // operadora expandida
  const [registros, setRegistros] = useState([])
  const [refresco, setRefresco] = useState(0)

  const cargarSemanas = useCallback(async (mantener) => {
    const { data, error: err } = await listarSemanas(40)
    if (err) return setError(err)
    setSemanas(data || [])
    setSemanaId((actual) => {
      if (mantener && actual && (data || []).some((s) => s.id === actual)) return actual
      const pendiente = (data || []).find((s) => s.estado !== 'aprobada')
      return (pendiente || (data || [])[0])?.id || null
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarSemanas(false)
  }, [cargarSemanas])

  const semana = useMemo(() => semanas.find((s) => s.id === semanaId) || null, [semanas, semanaId])
  // Semana APROBADA inmediatamente anterior (misma regla del motor).
  const semanaAnterior = useMemo(() => {
    if (!semana) return null
    return semanas.filter((s) => s.estado === 'aprobada' && s.fecha_inicio < semana.fecha_inicio).sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1))[0] || null
  }, [semanas, semana])

  useEffect(() => {
    if (!semanaId) return
    let vivo = true
    setLoadingDetalle(true)
    setAbierta(null)
    Promise.all([revisionSemana(semanaId), semanaAnterior ? revisionSemana(semanaAnterior.id) : Promise.resolve({ data: null })]).then(([a, b]) => {
      if (!vivo) return
      if (a.error) setError(a.error)
      else setFilas(a.data || [])
      setPrevTotal(b.data ? b.data.reduce((s, r) => s + Number(r.total_premio || 0), 0) : null)
      setLoadingDetalle(false)
    })
    return () => {
      vivo = false
    }
  }, [semanaId, semanaAnterior, refresco])

  async function accion(fn, confirmar, ...args) {
    if (confirmar && !window.confirm(confirmar)) return
    setBusy(true)
    setAccionError(null)
    const { error: err } = await fn(semanaId, ...args)
    setBusy(false)
    if (err) return setAccionError(err.message)
    await cargarSemanas(true)
    setRefresco((n) => n + 1)
  }

  async function reabrir() {
    const motivo = window.prompt('Motivo para reabrir esta semana (se guarda en las notas):')
    if (!motivo || !motivo.trim()) return
    accion(reabrirSemana, null, motivo.trim())
  }

  async function verRegistros(f) {
    if (abierta === f.operadora_id) return setAbierta(null)
    setAbierta(f.operadora_id)
    setRegistros([])
    const { data } = await fetchRegistrosOperadora(semanaId, f.operadora_id)
    setRegistros(data || [])
  }

  if (loading) return <Loading label="Cargando semanas…" />
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />
  if (!semana) return <p className="page">Todavía no hay semanas de producción.</p>

  const totalPremios = filas.reduce((s, r) => s + Number(r.total_premio || 0), 0)
  const totalValor = filas.reduce((s, r) => s + Number(r.valor_generado || 0), 0)
  const delta = prevTotal == null ? null : totalPremios - prevTotal
  const congelada = filas.length > 0 && filas[0].congelada

  return (
    <div className="page">
      <h2 className="section-title">Revisión de producción</h2>
      <p className="template-hint">Valor generado = lo que produjo cada operadora (no es su sueldo). Con él se calculan los premios.</p>

      <div className="revision__barra">
        <label>
          Semana
          <select className="input" value={semanaId || ''} onChange={(e) => setSemanaId(e.target.value)}>
            {semanas.map((s) => (
              <option key={s.id} value={s.id}>
                {dt(s.fecha_inicio)} – {dt(s.fecha_fin)} · {ESTADO[s.estado]}
                {s.importada ? ' (Excel)' : ''}
              </option>
            ))}
          </select>
        </label>
        <span className={`badge revision__estado revision__estado--${semana.estado}`}>{ESTADO[semana.estado]}</span>
        <div className="revision__acciones">
          {semana.estado === 'abierta' && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => accion(cerrarSemana, 'Al pasar a revisión se bloquea la captura de Juanis. ¿Continuar?')}
            >
              Pasar a revisión
            </button>
          )}
          {semana.estado === 'en_revision' && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || filas.length === 0}
              onClick={() => accion(aprobarSemana, `¿Aprobar la semana ${dt(semana.fecha_inicio)} – ${dt(semana.fecha_fin)}? Total de premios ${money(totalPremios)}. Quedará congelada.`)}
            >
              Aprobar semana
            </button>
          )}
          {semana.estado === 'aprobada' && !semana.importada && esGeneral && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={reabrir}>
              Reabrir…
            </button>
          )}
        </div>
      </div>
      {accionError && <p className="form-error">{accionError}</p>}
      {semana.estado === 'abierta' && <p className="template-hint">Semana abierta: la captura sigue disponible. Esto es solo una vista previa.</p>}
      {congelada && <p className="template-hint">Semana aprobada: los premios están congelados.</p>}

      <div className="revision__resumen">
        <div>
          <span>Total de premios</span>
          <b>{money(totalPremios)}</b>
        </div>
        <div>
          <span>Personas evaluadas</span>
          <b>{filas.length}</b>
        </div>
        <div>
          <span>Valor generado (total)</span>
          <b>{money(totalValor)}</b>
        </div>
        <div>
          <span>Semana anterior{semanaAnterior ? ` (${dt(semanaAnterior.fecha_inicio)} – ${dt(semanaAnterior.fecha_fin)})` : ''}</span>
          <b>
            {prevTotal == null ? 'Sin semana anterior' : money(prevTotal)}
            {delta != null && (
              <small className={delta > 0 ? 'revision__sube' : delta < 0 ? 'revision__baja' : ''}>
                {' '}
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {money(Math.abs(delta))}
              </small>
            )}
          </b>
        </div>
      </div>

      {loadingDetalle ? (
        <Loading label="Calculando…" />
      ) : filas.length === 0 ? (
        <p className="template-hint">No hay datos en esta semana.</p>
      ) : (
        <div className="revision__tabla-wrap">
          <table className="simple-table revision__tabla">
            <thead>
              <tr>
                <th>Lugar</th>
                <th>Operadora</th>
                <th>Valor generado</th>
                <th>Semana anterior</th>
                <th>Mejora</th>
                <th>Bono meta</th>
                <th>Bono lugar</th>
                <th>Bono mejora</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <Fragment key={f.operadora_id}>
                  <tr className="revision__fila" onClick={() => verRegistros(f)}>
                    <td>{f.lugar}</td>
                    <td>
                      {f.numero_operadora ?? '—'} · {f.nombre}
                    </td>
                    <td>{money(f.valor_generado)}</td>
                    <td>{money(f.valor_anterior)}</td>
                    <td>{f.mejora_pct == null ? 'Sin base' : `${Number(f.mejora_pct).toFixed(1)}%`}</td>
                    <td>{money(f.bono_meta)}</td>
                    <td>{money(f.bono_lugar)}</td>
                    <td>{money(f.bono_mejora)}</td>
                    <td>
                      <b>{money(f.total_premio)}</b>
                    </td>
                  </tr>
                  {abierta === f.operadora_id && (
                    <tr>
                      <td colSpan={9} className="revision__detalle">
                        {semana.importada ? (
                          <span className="template-hint">Semana importada del Excel: no tiene detalle por operación.</span>
                        ) : registros.length === 0 ? (
                          <span className="template-hint">Sin registros esta semana.</span>
                        ) : (
                          <table className="simple-table">
                            <thead>
                              <tr>
                                <th>Fecha</th>
                                <th>Folio</th>
                                <th>Operación</th>
                                <th>Piezas</th>
                                <th>Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {registros.map((r) => (
                                <tr key={r.id}>
                                  <td>{dt(r.fecha)}</td>
                                  <td>{r.folio_operacion}</td>
                                  <td>
                                    {r.prod_operaciones?.prenda} · {r.prod_operaciones?.parte} · {r.prod_operaciones?.operacion}
                                  </td>
                                  <td>{r.piezas}</td>
                                  <td>{money(r.valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {semana.notas && <p className="template-hint" style={{ whiteSpace: 'pre-line' }}>{semana.notas}</p>}
    </div>
  )
}
