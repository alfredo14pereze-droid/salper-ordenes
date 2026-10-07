import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loading, ErrorState, EmptyState } from '../common/States'
import { fetchEtapasTerminadas } from '../../services/ordersService'
import { fetchProfiles } from '../../services/usersService'
import { ETAPA_LABELS } from '../../lib/constants'
import { getOrderPieceCount } from '../../utils/demand'
import { formatDate, formatDateTime } from '../../utils/dates'
import { formatMinutosHabiles } from '../../utils/horasHabiles'
import {
  medirEtapa,
  resumenPorEtapa,
  resumenPorOperario,
  resumenTotal,
  rangoPeriodo,
  limitesPeriodo,
  hoyTorreon,
  aCsv,
  MOTIVO_SIN_MEDIR,
} from '../../utils/tiemposEtapas'

const ORDEN_ETAPAS = ['impresion', 'sublimado', 'corte', 'produccion', 'bordado', 'impresion_prenda', 'terminado']
const PERIODOS = [
  ['semana', 'Esta semana'],
  ['semana_pasada', 'Semana pasada'],
  ['mes', 'Este mes'],
  ['mes_pasado', 'Mes pasado'],
  ['rango', 'Rango'],
]
const SIN_OPERARIO = 'Sin operario'
const tiempo = (m) => formatMinutosHabiles(m)
const porPieza = (m) => (m == null ? '—' : `${m < 10 ? m.toFixed(1) : Math.round(m)} min`)
const etiquetaEtapa = (e) => ETAPA_LABELS[e] || e

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{value}</span>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}

function TablaResumen({ titulo, filas, nombre }) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>{titulo}</th>
          <th>Terminadas</th>
          <th>Con tiempo</th>
          <th>Promedio</th>
          <th>Mediana</th>
          <th>Más rápida</th>
          <th>Más lenta</th>
          <th>Por pieza</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave}>
            <td>{nombre(f.clave)}</td>
            <td>{f.terminadas}</td>
            <td>{f.medidas}</td>
            <td>
              <strong>{tiempo(f.promedio)}</strong>
            </td>
            <td>{tiempo(f.mediana)}</td>
            <td>{tiempo(f.minimo)}</td>
            <td>{tiempo(f.maximo)}</td>
            <td>{porPieza(f.minutosPorPieza)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// V139 — Tiempos reales por etapa (sección de Estadísticas de producción).
// Sale de orden_etapas: lo que marcan las estaciones con Iniciar / Terminar.
// El tiempo es HÁBIL (8:00 a 18:00, lunes a viernes, sin descontar comida).
// Todavía no hay tiempo estándar por etapa: se muestran solo tiempos reales.
export default function TiemposEtapas() {
  const [periodo, setPeriodo] = useState('semana')
  const [desde, setDesde] = useState(() => rangoPeriodo('semana').desde)
  const [hasta, setHasta] = useState(() => hoyTorreon())
  const [operario, setOperario] = useState('')
  const [etapa, setEtapa] = useState('')
  const [crudas, setCrudas] = useState([])
  const [nombres, setNombres] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const rango = useMemo(() => (periodo === 'rango' ? { desde, hasta } : rangoPeriodo(periodo)), [periodo, desde, hasta])
  const rangoValido = Boolean(rango.desde && rango.hasta && rango.desde <= rango.hasta)

  useEffect(() => {
    fetchProfiles().then(({ data }) => setNombres(Object.fromEntries((data || []).map((p) => [p.id, p.full_name]))))
  }, [])

  useEffect(() => {
    if (!rangoValido) return
    let vivo = true
    setLoading(true)
    const { desdeIso, hastaIso } = limitesPeriodo(rango)
    fetchEtapasTerminadas(desdeIso, hastaIso).then(({ data, error: err }) => {
      if (!vivo) return
      setError(err || null)
      setCrudas(data || [])
      setLoading(false)
    })
    return () => {
      vivo = false
    }
  }, [rango, rangoValido])

  const todas = useMemo(
    () =>
      crudas.map((r) => ({
        id: r.id,
        orderId: r.order_id,
        folio: r.orders?.order_number,
        cliente: r.orders?.client_name,
        etapa: r.etapa,
        operarioId: r.responsable_id || '',
        inicio: r.iniciado_en,
        fin: r.completado_en,
        piezas: getOrderPieceCount(r.orders),
        ...medirEtapa(r),
      })),
    [crudas],
  )
  const nombreOperario = (id) => (id ? nombres[id] || 'Usuario eliminado' : SIN_OPERARIO)

  const operarios = useMemo(() => [...new Set(todas.map((f) => f.operarioId))].sort((a, b) => nombreOperario(a).localeCompare(nombreOperario(b))), [todas, nombres])
  const etapas = useMemo(() => ORDEN_ETAPAS.filter((e) => todas.some((f) => f.etapa === e)), [todas])
  const filas = useMemo(
    () => todas.filter((f) => (operario === '' || f.operarioId === (operario === '-' ? '' : operario)) && (!etapa || f.etapa === etapa)),
    [todas, operario, etapa],
  )

  const total = useMemo(() => resumenTotal(filas), [filas])
  const porEtapa = useMemo(() => resumenPorEtapa(filas, ORDEN_ETAPAS), [filas])
  const porOperario = useMemo(() => resumenPorOperario(filas), [filas])
  const textoRango = rangoValido ? `${formatDate(rango.desde)} – ${formatDate(rango.hasta)}` : ''

  function detalleParaExportar() {
    return filas.map((f) => [
      f.folio,
      f.cliente,
      etiquetaEtapa(f.etapa),
      nombreOperario(f.operarioId),
      f.inicio ? formatDateTime(f.inicio) : '',
      formatDateTime(f.fin),
      f.minutos == null ? '' : Math.round(f.minutos),
      f.piezas || '',
      f.minutos != null && f.piezas ? (f.minutos / f.piezas).toFixed(2) : '',
      f.motivo ? MOTIVO_SIN_MEDIR[f.motivo] : '',
    ])
  }
  const ENCABEZADOS = ['Folio', 'Cliente', 'Etapa', 'Operario', 'Inicio', 'Fin', 'Minutos hábiles', 'Piezas', 'Minutos por pieza', 'Sin medir']

  function descargarCsv() {
    const blob = new Blob(['﻿' + aCsv(ENCABEZADOS, detalleParaExportar())], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tiempos-etapas_${rango.desde}_${rango.hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimir() {
    const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    const tabla = (cab, cuerpo) =>
      `<table><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${cuerpo
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    const cabResumen = ['Terminadas', 'Con tiempo', 'Promedio', 'Mediana', 'Más rápida', 'Más lenta', 'Por pieza']
    const filaResumen = (f) => [f.terminadas, f.medidas, tiempo(f.promedio), tiempo(f.mediana), tiempo(f.minimo), tiempo(f.maximo), porPieza(f.minutosPorPieza)]
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tiempos por etapa ${esc(textoRango)}</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px}p{margin:4px 0;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}</style></head><body>
<h1>SALPER · Tiempos reales por etapa</h1><p>${esc(textoRango)} · Tiempo hábil (8:00 a 18:00, lunes a viernes)</p>
<h2>Por etapa</h2>${tabla(['Etapa', ...cabResumen], porEtapa.map((f) => [etiquetaEtapa(f.clave), ...filaResumen(f)]))}
<h2>Por operario</h2>${tabla(['Operario', ...cabResumen], porOperario.map((f) => [nombreOperario(f.clave), ...filaResumen(f)]))}
<h2>Detalle</h2>${tabla(ENCABEZADOS, detalleParaExportar())}
</body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <section className="dashboard-all-orders tiempos-etapas">
      <div className="section-header">
        <h2 className="section-title">Tiempos reales por etapa</h2>
      </div>
      <p className="template-hint">
        Lo que marcan las estaciones con Iniciar y Terminar, por fecha en que se terminó la etapa. El tiempo es hábil: de 8:00 a 18:00, de lunes a
        viernes, sin descontar la comida. Todavía no hay tiempo estándar por etapa; aquí solo van los tiempos reales.
      </p>

      <div className="revision__barra">
        <label>
          Periodo
          <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {periodo === 'rango' && (
          <>
            <label>
              Desde
              <input type="date" className="input" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label>
              Hasta
              <input type="date" className="input" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Operario
          <select className="input" value={operario} onChange={(e) => setOperario(e.target.value)}>
            <option value="">Todos</option>
            {operarios.map((id) => (
              <option key={id || '-'} value={id || '-'}>
                {nombreOperario(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Etapa
          <select className="input" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            <option value="">Todas</option>
            {etapas.map((e) => (
              <option key={e} value={e}>
                {etiquetaEtapa(e)}
                {e === 'impresion_prenda' ? ' (prenda)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="revision__acciones">
          <button type="button" className="btn btn--secondary btn--small" disabled={!filas.length} onClick={imprimir}>
            Imprimir
          </button>
          <button type="button" className="btn btn--secondary btn--small" disabled={!filas.length} onClick={descargarCsv}>
            Descargar CSV
          </button>
        </div>
      </div>
      {textoRango && <p className="pstat-sub">{textoRango}</p>}

      {!rangoValido ? (
        <EmptyState>Elige un rango de fechas válido.</EmptyState>
      ) : loading ? (
        <Loading label="Cargando tiempos…" />
      ) : error ? (
        <ErrorState error={error} />
      ) : !filas.length ? (
        <EmptyState>No se terminó ninguna etapa en este periodo con estos filtros.</EmptyState>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Etapas terminadas" value={total.terminadas} />
            <StatCard label="Con tiempo medido" value={total.medidas} hint={total.sinMedir ? `${total.sinMedir} sin medir` : 'Todas'} />
            <StatCard label="Tiempo promedio" value={tiempo(total.promedio)} hint="Hábil, por etapa" />
            <StatCard label="Mediana" value={tiempo(total.mediana)} hint="La mitad tardó menos" />
          </div>
          {total.sinMedir > 0 && (
            <p className="template-hint">
              {total.sinMedir} de {total.terminadas} no entran al promedio: no se marcó Iniciar, se tocaron Iniciar y Terminar de corrido (menos de 2
              minutos), o todo se hizo fuera de horario. Para que cuenten, la estación debe tocar Iniciar al empezar la orden.
            </p>
          )}

          <h3 className="section-title section-title--small">Por etapa</h3>
          <div className="tiempos-etapas__scroll">
            <TablaResumen titulo="Etapa" filas={porEtapa} nombre={(e) => etiquetaEtapa(e) + (e === 'impresion_prenda' ? ' (prenda)' : '')} />
          </div>

          <h3 className="section-title section-title--small">Por operario</h3>
          <div className="tiempos-etapas__scroll">
            <TablaResumen titulo="Operario" filas={porOperario} nombre={nombreOperario} />
          </div>

          <h3 className="section-title section-title--small">Detalle</h3>
          <div className="tiempos-etapas__scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Etapa</th>
                  <th>Operario</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Tiempo hábil</th>
                  <th>Piezas</th>
                  <th>Por pieza</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link to={`/orden/${f.orderId}`}>#{f.folio}</Link> <span className="tiempos-etapas__cliente">{f.cliente}</span>
                    </td>
                    <td>{etiquetaEtapa(f.etapa)}</td>
                    <td>{nombreOperario(f.operarioId)}</td>
                    <td>{f.inicio ? formatDateTime(f.inicio) : '—'}</td>
                    <td>{formatDateTime(f.fin)}</td>
                    <td>{f.minutos != null ? <strong>{tiempo(f.minutos)}</strong> : <span className="tiempos-etapas__sin">{MOTIVO_SIN_MEDIR[f.motivo]}</span>}</td>
                    <td>{f.piezas || '—'}</td>
                    <td>{f.minutos != null && f.piezas ? porPieza(f.minutos / f.piezas) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
