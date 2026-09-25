import { useEffect, useMemo, useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { TrendChart, LineChart } from '../components/produccion/StatsCharts'
import { canViewProduccionMontos } from '../utils/permissions'
import {
  fetchOperadorasTodas,
  statsInfo,
  statsSemanas,
  statsDistribucionMeta,
  statsDestacados,
  statsPrendas,
  statsOperaciones,
  statsDias,
} from '../services/produccionService'

// V72 — Estadísticas de producción: mismo estilo/estructura que Estadísticas (tarjetas .stat-card,
// barras .stage-bars / .month-bars, tablas .stats-table). TODO el cálculo viene de Supabase
// (prod_stats_*); aquí solo se muestra. Solo admin_general / admin_fabrica.
export default function EstadisticasProduccionPage() {
  return (
    <RequireRole allow={canViewProduccionMontos}>
      <Contenido />
    </RequireRole>
  )
}

const money = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 }))
const pct = (n, d = 1) => (n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(d)}%`)
const dia = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
const diaLargo = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}
const colorCambio = (v) => (v == null ? 'var(--color-text-muted)' : v > 0 ? 'var(--color-good)' : v < 0 ? 'var(--color-danger)' : undefined)
const ESTADO = { abierta: 'abierta', en_revision: 'en revisión', aprobada: 'aprobada' }
const ORIGEN = { congelado: 'Congelado', calculado: 'Recalculado con las reglas actuales', preliminar: 'Preliminar' }

function StatCard({ label, value, hint, color, badge }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value" style={color ? { color } : undefined}>
        {value}
      </span>
      {badge && <span className="pstat-badge">{badge}</span>}
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}

function Seccion({ titulo, children, nota }) {
  return (
    <section className="dashboard-all-orders">
      <div className="section-header">
        <h2 className="section-title">{titulo}</h2>
      </div>
      {nota && <p className="template-hint">{nota}</p>}
      {children}
    </section>
  )
}

function Contenido() {
  const [operadoras, setOperadoras] = useState([])
  const [operadoraId, setOperadoraId] = useState('')
  const [todas, setTodas] = useState([])
  const [info, setInfo] = useState(null)
  const [desde, setDesde] = useState(null)
  const [hasta, setHasta] = useState(null)
  const [selId, setSelId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [detalle, setDetalle] = useState({ dist: [], dest: null, prendas: [], ops: [], dias: [] })
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Catálogos + info una sola vez
  useEffect(() => {
    Promise.all([fetchOperadorasTodas(), statsInfo()]).then(([o, i]) => {
      if (o.error || i.error) setError(o.error || i.error)
      else {
        setOperadoras((o.data || []).filter((x) => x.activo))
        setInfo(i.data)
      }
    })
  }, [])

  // Serie de semanas (depende de la operadora)
  useEffect(() => {
    let vivo = true
    statsSemanas(operadoraId || null).then(({ data, error: err }) => {
      if (!vivo) return
      if (err) return setError(err)
      const rows = data || []
      setTodas(rows)
      setLoading(false)
      setDesde((d) => (d && rows.some((r) => r.fecha_inicio === d) ? d : rows[Math.max(rows.length - 12, 0)]?.fecha_inicio || null))
      setHasta((h) => (h && rows.some((r) => r.fecha_fin === h) ? h : rows[rows.length - 1]?.fecha_fin || null))
    })
    return () => {
      vivo = false
    }
  }, [operadoraId])

  const rango = useMemo(() => todas.filter((r) => (!desde || r.fecha_inicio >= desde) && (!hasta || r.fecha_fin <= hasta)), [todas, desde, hasta])

  // Semana seleccionada: por default la más reciente CON producción dentro del rango
  useEffect(() => {
    if (rango.length === 0) return setSelId(null)
    setSelId((actual) => {
      if (actual && rango.some((r) => r.semana_id === actual)) return actual
      const conDatos = [...rango].reverse().find((r) => Number(r.valor_total) > 0)
      return (conDatos || rango[rango.length - 1]).semana_id
    })
  }, [rango])

  const sel = rango.find((r) => r.semana_id === selId) || null
  const idxSel = todas.findIndex((r) => r.semana_id === selId)

  // Detalles (distribución, destacados, prendas, operaciones, días)
  useEffect(() => {
    if (!selId || !desde || !hasta) return
    let vivo = true
    setCargandoDetalle(true)
    const op = operadoraId || null
    Promise.all([
      statsDistribucionMeta(selId, op),
      op ? Promise.resolve({ data: null }) : statsDestacados(selId),
      statsPrendas(desde, hasta, op),
      statsOperaciones(desde, hasta, op),
      statsDias(desde, hasta, op),
    ]).then(([a, b, c, d, e]) => {
      if (!vivo) return
      const err = a.error || b.error || c.error || d.error || e.error
      if (err) setError(err)
      else setDetalle({ dist: a.data || [], dest: b.data, prendas: c.data || [], ops: d.data || [], dias: e.data || [] })
      setCargandoDetalle(false)
    })
    return () => {
      vivo = false
    }
  }, [selId, desde, hasta, operadoraId])

  if (loading) return <Loading label="Calculando estadísticas de producción…" />
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />
  if (todas.length === 0) {
    return (
      <div className="page">
        <h2 className="section-title">Estadísticas de producción</h2>
        <EmptyState>Todavía no hay semanas de producción.</EmptyState>
      </div>
    )
  }

  const preliminar = sel?.premios_origen === 'preliminar'
  const nivel1 = info?.primer_nivel_meta
  const maxDist = Math.max(...detalle.dist.map((d) => d.cantidad), 1)
  const maxPrenda = Math.max(...detalle.prendas.map((p) => Number(p.valor)), 1)
  const maxDia = Math.max(...detalle.dias.map((d) => Number(d.valor_prom)), 1)
  const porPiezas = detalle.ops.filter((o) => o.criterio === 'piezas')
  const porValor = detalle.ops.filter((o) => o.criterio === 'valor')
  const hayDetalle = detalle.prendas.length > 0
  const notaOperacion = info?.primera_semana_con_registros
    ? `Datos por operación desde ${diaLargo(info.primera_semana_con_registros)} (primera semana capturada en el sistema). Las semanas importadas del Excel solo tienen totales por persona.`
    : 'Todavía no hay semanas capturadas en el sistema: el detalle por operación aparecerá desde la primera semana que se capture. Las semanas importadas del Excel solo tienen totales por persona.'
  const operadoraNombre = operadoras.find((o) => o.id === operadoraId)?.nombre

  return (
    <div className="page">
      <div className="section-header">
        <h2 className="section-title">Estadísticas de producción</h2>
      </div>
      <p className="page-subtitle">
        Valor generado y premios por semana (miércoles a martes). Valor generado no es el sueldo. Solo lectura: todo se calcula en el servidor.
      </p>

      <div className="revision__barra">
        <label>
          Desde
          <select className="input" value={desde || ''} onChange={(e) => setDesde(e.target.value)}>
            {todas.map((r) => (
              <option key={r.semana_id} value={r.fecha_inicio} disabled={hasta && r.fecha_fin > hasta}>
                {dia(r.fecha_inicio)} – {dia(r.fecha_fin)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hasta
          <select className="input" value={hasta || ''} onChange={(e) => setHasta(e.target.value)}>
            {todas.map((r) => (
              <option key={r.semana_id} value={r.fecha_fin} disabled={desde && r.fecha_inicio < desde}>
                {dia(r.fecha_inicio)} – {dia(r.fecha_fin)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semana seleccionada
          <select className="input" value={selId || ''} onChange={(e) => setSelId(e.target.value)}>
            {[...rango].reverse().map((r) => (
              <option key={r.semana_id} value={r.semana_id}>
                {dia(r.fecha_inicio)} – {dia(r.fecha_fin)} · {ESTADO[r.estado]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operadora
          <select className="input" value={operadoraId} onChange={(e) => setOperadoraId(e.target.value)}>
            <option value="">Todas</option>
            {operadoras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            setDesde(todas[Math.max(todas.length - 12, 0)]?.fecha_inicio)
            setHasta(todas[todas.length - 1]?.fecha_fin)
            setOperadoraId('')
          }}
        >
          Últimas 12 semanas
        </button>
      </div>
      {operadoraNombre && <p className="template-hint">Mostrando solo a {operadoraNombre}.</p>}

      {/* 1) KPIs de la semana seleccionada */}
      {sel && (
        <>
          <p className="template-hint">
            Semana del {dia(sel.fecha_inicio)} al {dia(sel.fecha_fin)} ({ESTADO[sel.estado]}
            {sel.importada ? ', importada del Excel' : ''}).
          </p>
          <div className="stats-grid">
            <StatCard label="Valor generado total" value={money(sel.valor_total)} hint={operadoraNombre ? 'de la operadora seleccionada' : 'de todas las operadoras'} />
            <StatCard label="Vs. semana anterior" value={pct(sel.vs_anterior_pct)} color={colorCambio(sel.vs_anterior_pct)} hint={idxSel > 0 ? `Semana anterior: ${money(todas[idxSel - 1]?.valor_total)}` : 'Sin semana anterior'} />
            <StatCard label="Vs. promedio de 4 semanas" value={pct(sel.vs_prom4_pct)} color={colorCambio(sel.vs_prom4_pct)} hint="contra las 4 semanas previas" />
            <StatCard
              label="Total de premios"
              value={sel.premios_total == null ? '—' : money(sel.premios_total)}
              badge={sel.premios_total != null && sel.premios_origen === 'preliminar' ? 'Preliminar' : null}
              hint={sel.premios_total == null ? 'Sin producción en esta semana' : ORIGEN[sel.premios_origen]}
            />
            <StatCard label="Premios / valor generado" value={sel.premios_pct == null ? '—' : `${Number(sel.premios_pct).toFixed(1)}%`} hint="cuánto del valor generado se va en premios" />
            <StatCard
              label="Con primer nivel de bono meta"
              value={`${sel.con_meta} / ${sel.participantes}`}
              hint={nivel1 != null ? `participantes con valor generado de ${money(nivel1)} o más` : 'sin reglas de meta activas'}
            />
          </div>
          {preliminar && <p className="produccion__aviso">Semana {ESTADO[sel.estado]}: los premios son una vista previa y pueden cambiar hasta aprobar la semana.</p>}
        </>
      )}

      {/* 2) Tendencia */}
      <Seccion titulo="Tendencia semanal" nota="Valor generado total y total de premios por semana.">
        {rango.length === 0 ? (
          <EmptyState>No hay semanas en el rango elegido.</EmptyState>
        ) : (
          <TrendChart semanas={rango.map((r) => ({ fecha_fin: r.fecha_fin, valor: Number(r.valor_total), premios: r.premios_total == null ? null : Number(r.premios_total), preliminar: r.premios_origen === 'preliminar' }))} />
        )}
      </Seccion>

      {/* 3) Premios / valor generado (%) */}
      <Seccion titulo="Premios como % del valor generado">
        {rango.every((r) => r.premios_pct == null) ? (
          <EmptyState>No hay semanas con producción en este rango para calcular el porcentaje.</EmptyState>
        ) : (
          <LineChart puntos={rango.map((r) => ({ fecha_fin: r.fecha_fin, valor: r.premios_pct == null ? null : Number(r.premios_pct), preliminar: r.premios_origen === 'preliminar' }))} formato={(v) => `${Number(v).toFixed(1)}%`} />
        )}
      </Seccion>

      {/* 4) Distribución por nivel de bono meta */}
      <Seccion titulo="Distribución por nivel de bono meta" nota={sel ? `Semana del ${dia(sel.fecha_inicio)} al ${dia(sel.fecha_fin)}.` : undefined}>
        {cargandoDetalle ? (
          <Loading label="Calculando…" />
        ) : detalle.dist.every((d) => d.cantidad === 0) ? (
          <EmptyState>No hay participantes con datos en esta semana.</EmptyState>
        ) : (
          <div className="stage-bars">
            {detalle.dist.map((d) => (
              <div key={d.desde ?? 'sin'} className="stage-bar-row">
                <span className="stage-bar-row__label">{d.desde == null ? 'Sin bono meta' : `Desde ${money(d.desde)} (bono ${money(d.bono)})`}</span>
                <div className="stage-bar-row__track">
                  <div className="stage-bar-row__fill" style={{ width: `${d.cantidad ? Math.max((d.cantidad / maxDist) * 100, 4) : 0}%` }} />
                </div>
                <span className="stage-bar-row__value">{d.cantidad}</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* 5) Destacados */}
      <Seccion titulo="Destacados" nota={operadoraId ? 'Los destacados comparan a todas las operadoras: elige "Todas" para verlos.' : sel ? `Semana del ${dia(sel.fecha_inicio)} al ${dia(sel.fecha_fin)}. "Abajo de su promedio" = 10% o más por debajo del promedio de sus 4 semanas previas.` : undefined}>
        {!operadoraId && detalle.dest && !cargandoDetalle && (
          <div className="pstat-cols">
            <div>
              <h3 className="pstat-sub">Top 5 por valor generado</h3>
              <div className="table-scroll">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Operadora</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.dest.top_valor.map((t) => (
                      <tr key={t.nombre}>
                        <td>{t.nombre}</td>
                        <td>{money(t.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3 className="pstat-sub">Top 5 por % de mejora</h3>
              {detalle.dest.top_mejora.length === 0 ? (
                <EmptyState>Nadie tiene semana anterior con qué comparar.</EmptyState>
              ) : (
                <div className="table-scroll">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Operadora</th>
                        <th>Mejora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.dest.top_mejora.map((t) => (
                        <tr key={t.nombre}>
                          <td>{t.nombre}</td>
                          <td style={{ color: 'var(--color-good)' }}>{pct(t.mejora_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h3 className="pstat-sub">Abajo de su promedio 3+ semanas seguidas</h3>
              {detalle.dest.rachas.length === 0 ? (
                <EmptyState>Nadie lleva 3 semanas seguidas abajo de su promedio 🎉</EmptyState>
              ) : (
                <div className="table-scroll">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Operadora</th>
                        <th>Semanas</th>
                        <th>Valor</th>
                        <th>Su promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.dest.rachas.map((t) => (
                        <tr key={t.nombre}>
                          <td>{t.nombre}</td>
                          <td style={{ color: 'var(--color-danger)' }}>{t.semanas}</td>
                          <td>{money(t.valor)}</td>
                          <td>{money(t.promedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Seccion>

      {/* 6) Por prenda */}
      <Seccion titulo="Valor generado por prenda" nota={notaOperacion}>
        {cargandoDetalle ? (
          <Loading label="Calculando…" />
        ) : !hayDetalle ? (
          <EmptyState>Sin datos por operación en este rango: solo hay semanas importadas del Excel (totales por persona) o no se ha capturado nada todavía.</EmptyState>
        ) : (
          <div className="stage-bars">
            {detalle.prendas.map((p) => (
              <div key={p.prenda} className="stage-bar-row">
                <span className="stage-bar-row__label">{p.prenda}</span>
                <div className="stage-bar-row__track">
                  <div className="stage-bar-row__fill" style={{ width: `${Math.max((Number(p.valor) / maxPrenda) * 100, 4)}%` }} />
                </div>
                <span className="stage-bar-row__value">{money(p.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* 7) Top 10 operaciones */}
      <Seccion titulo="Top 10 operaciones" nota={notaOperacion}>
        {cargandoDetalle ? (
          <Loading label="Calculando…" />
        ) : porPiezas.length === 0 ? (
          <EmptyState>Sin datos por operación en este rango.</EmptyState>
        ) : (
          <div className="pstat-cols pstat-cols--2">
            {[
              { titulo: 'Por piezas', filas: porPiezas },
              { titulo: 'Por valor generado', filas: porValor },
            ].map((t) => (
              <div key={t.titulo}>
                <h3 className="pstat-sub">{t.titulo}</h3>
                <div className="table-scroll">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Operación</th>
                        <th>Piezas</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.filas.map((o) => (
                        <tr key={`${t.titulo}-${o.folio}`}>
                          <td>{o.pos}</td>
                          <td>
                            {o.prenda} · {o.operacion} <small>({o.folio})</small>
                          </td>
                          <td>{num(o.piezas)}</td>
                          <td>{money(o.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* 8) Por día de la semana */}
      <Seccion titulo="Producción por día de la semana" nota={`Promedio por semana capturada del rango (de miércoles a martes). ${notaOperacion}`}>
        {cargandoDetalle ? (
          <Loading label="Calculando…" />
        ) : !hayDetalle ? (
          <EmptyState>Sin datos por día en este rango: se necesitan semanas capturadas en el sistema.</EmptyState>
        ) : (
          <div className="month-bars">
            {detalle.dias.map((d) => (
              <div key={d.orden} className="month-bar">
                <div className="month-bar__track">
                  <div className="month-bar__fill" style={{ height: `${Math.max((Number(d.valor_prom) / maxDia) * 100, 4)}%` }} />
                </div>
                <span className="month-bar__count">{money(d.valor_prom)}</span>
                <span className="month-bar__label">{d.dia}</span>
                <span className="month-bar__pct">{num(d.piezas_prom)} pzas</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  )
}
