import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Loading, ErrorState } from '../common/States'
import { canCapturarStockFrisa, canEditarSupuestosFrisa, canVerDemandaFrisa } from '../../utils/permissions'
import { fetchFrisaNiveles, capturarStock } from '../../services/frisaNivelesService'
import { fetchSurtidosYLineas } from '../../services/frisaSurtidoService'
import { conInventario } from '../../utils/frisaSurtido'
import {
  CONFIG_INICIAL, ESTADOS, calcularNiveles, conNiveles, filtrarNiveles, opcionesDe, ordenarPorEstado, resumenNiveles, formatoDemanda,
} from '../../utils/frisaNiveles'
import { EstadoBadge, fechaCorta, NombreFrisa, ColorFrisa } from './comunes'
import { nombreFrisa } from '../../utils/frisaColores'
import FrisaNivelesDetalle from './FrisaNivelesDetalle'
import FrisaNivelesSupuestos from './FrisaNivelesSupuestos'
import FrisaNivelesExportar from './FrisaNivelesExportar'

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'))

const FILTROS_ESTADO = [
  ['todos', 'Todos'],
  ['alerta', 'Solo CRÍTICO + PEDIR'],
  ['critico', 'CRÍTICO'],
  ['pedir', 'PEDIR'],
  ['ok', 'OK'],
]

export default function FrisaNiveles() {
  const { role } = useAuth()
  const puedeCapturar = canCapturarStockFrisa(role)
  const puedeSupuestos = canEditarSupuestosFrisa(role)
  const verDemanda = canVerDemandaFrisa(role)

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [filtros, setFiltros] = useState({ estado: 'todos', tipo: '', color: '', texto: '', mostrarSinMovimiento: true }) // 2026-11-12: siempre se ven (con su etiqueta)
  const [modal, setModal] = useState(null) // { tipo: 'detalle'|'supuestos'|'exportar', clave? }

  const recargar = useCallback(async () => {
    // V185 — también las órdenes surtidas sin entregar (apartado).
    const [{ data, error: e }, sl] = await Promise.all([fetchFrisaNiveles(), fetchSurtidosYLineas()])
    if (e || sl.error) setError(e || sl.error)
    else {
      setError(null)
      setDatos({ ...data, surtidos: sl.data.surtidos, lineas: sl.data.lineas })
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const cfg = datos?.config || CONFIG_INICIAL
  const filas = useMemo(() => conNiveles(conInventario(datos?.productos || [], datos?.surtidos, datos?.lineas), cfg), [datos, cfg])
  const resumen = useMemo(() => resumenNiveles(filas), [filas])
  const visibles = useMemo(() => ordenarPorEstado(filtrarNiveles(filas, filtros)), [filas, filtros])
  const tipos = useMemo(() => opcionesDe(filas, 'tipo'), [filas])
  const colores = useMemo(() => opcionesDe(filas, 'color'), [filas])
  const sinMovimiento = filas.filter((f) => f.niveles.sinMovimiento).length

  // Al capturar, se reemplaza la fila con la que regresa la base: el estado se recalcula al instante.
  const actualizarFila = useCallback((fila) => {
    setDatos((d) => ({ ...d, productos: d.productos.map((p) => (p.id === fila.id ? fila : p)) }))
  }, [])

  if (cargando) return <Loading />
  if (error) return <div className="page"><ErrorState error={error} onRetry={recargar} /></div>

  const set = (k, v) => setFiltros((f) => ({ ...f, [k]: v }))
  const detalle = modal?.tipo === 'detalle' ? filas.find((f) => f.clave === modal.clave) : null

  return (
    <div className="page frisa frisa-niveles">
      <div className="frisa__encabezado">
        <div>
          <h1 className="page-title">Frisa · niveles de inventario</h1>
          <p className="page-subtitle">
            Inventario del almacén de la fábrica: real − apartado (surtido sin entregar) = disponible; los niveles se calculan con el
            disponible.{verDemanda && <> Demanda diaria = consumo 2026 ÷ {cfg.dias_periodo} días
            {cfg.fecha_corte_consumo ? ` (${fechaCorta(cfg.fecha_inicio_consumo)} – ${fechaCorta(cfg.fecha_corte_consumo)})` : ''}.</>}
            Mínimo {cfg.dias_minimo} días · reorden {cfg.dias_reorden} · máximo {cfg.dias_maximo}.
          </p>
        </div>
        <div className="frisa__botones">
          {filas.length > 0 && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setModal({ tipo: 'exportar' })}>
              Exportar A PEDIR
            </button>
          )}
          {/* "Importar del Sheet" se quitó el 2026-11-13: el Sheet ya se importó y no se vuelve a usar. */}
          {puedeSupuestos && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setModal({ tipo: 'supuestos' })}>Supuestos</button>
          )}
        </div>
      </div>

      {!filas.length ? (
        <div className="card frisa__vacio">
          <p>Todavía no hay claves.</p>
        </div>
      ) : (
        <>
          <div className="stats-grid frisa-niveles__resumen">
            {[
              ['critico', 'CRÍTICO', resumen.critico, 'stock ≤ mínimo'],
              ['pedir', 'PEDIR', resumen.pedir, 'stock ≤ reorden'],
              ['ok', 'OK', resumen.ok, `${sinMovimiento} sin movimiento`],
            ].map(([k, label, n, hint]) => (
              <button key={k} type="button" className={'stat-card frisa-niveles__tarjeta frisa-niveles__tarjeta--' + k + (filtros.estado === k ? ' is-activa' : '')}
                onClick={() => set('estado', filtros.estado === k ? 'todos' : k)}>
                <span className="stat-card__label">{label}</span>
                <span className="stat-card__value">{num(n)}</span>
                <span className="stat-card__hint">{hint}</span>
              </button>
            ))}
            <button type="button" className={'stat-card frisa-niveles__tarjeta' + (filtros.estado === 'alerta' ? ' is-activa' : '')}
              onClick={() => set('estado', filtros.estado === 'alerta' ? 'todos' : 'alerta')}>
              <span className="stat-card__label">Piezas a pedir</span>
              <span className="stat-card__value">{num(resumen.piezasAPedir)}</span>
              <span className="stat-card__hint">{resumen.critico + resumen.pedir} claves</span>
            </button>
          </div>

          <div className="frisa-niveles__filtros">
            <div className="order-filters__chips frisa__chips">
              {FILTROS_ESTADO.map(([k, label]) => (
                <button key={k} type="button" className={'chip' + (filtros.estado === k ? ' chip--active' : '')} onClick={() => set('estado', k)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="frisa-niveles__campos">
              <input className="input" type="search" placeholder="Buscar clave, artículo o nombre" value={filtros.texto} onChange={(e) => set('texto', e.target.value)} />
              <select className="input" value={filtros.tipo} onChange={(e) => set('tipo', e.target.value)} aria-label="Tipo">
                <option value="">Todos los tipos</option>
                {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="input" value={filtros.color} onChange={(e) => set('color', e.target.value)} aria-label="Color">
                <option value="">Todos los colores</option>
                {colores.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <p className="frisa__nota">
            {visibles.length} de {filas.length} productos.{puedeCapturar ? ' Toca el real para capturar un conteo; toca el producto para ver el detalle.' : ' Toca el producto para ver el detalle.'}
          </p>

          <div className="revision__tabla-wrap">
            <table className="simple-table frisa-tabla frisa-niveles__tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Color</th>
                  <th className="num">Real</th>
                  <th className="num">Apartado</th>
                  <th className="num">Disponible</th>
                  {verDemanda && <th className="num">Demanda diaria</th>}
                  <th className="num">Mínimo</th>
                  <th className="num">Reorden</th>
                  <th className="num">Máximo</th>
                  <th>Estado</th>
                  <th className="num">A PEDIR</th>
                  <th>Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <FilaNivel key={f.id} fila={f} cfg={cfg} puedeCapturar={puedeCapturar} verDemanda={verDemanda} onGuardado={actualizarFila}
                    onDetalle={() => setModal({ tipo: 'detalle', clave: f.clave })} />
                ))}
                {!visibles.length && (
                  <tr><td colSpan={11} className="frisa__sub">Ninguna clave con estos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detalle && (
        <FrisaNivelesDetalle fila={detalle} cfg={cfg} puedeCapturar={puedeCapturar} verDemanda={verDemanda} onGuardado={actualizarFila} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'supuestos' && (
        <FrisaNivelesSupuestos cfg={cfg} productos={datos.productos} onClose={() => setModal(null)}
          onGuardado={(c) => { setDatos((d) => ({ ...d, config: c })); setModal(null) }} />
      )}
      {modal?.tipo === 'exportar' && (
        <FrisaNivelesExportar filas={filas} cfg={cfg} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function FilaNivel({ fila, cfg, puedeCapturar, verDemanda, onGuardado, onDetalle }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('') // 2026-11-12: por qué se ajusta (sale en Movimientos)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const borrador = editando && valor !== '' && /^\d+$/.test(valor) ? Number(valor) : null
  const n = borrador == null ? fila.niveles : calcularNiveles({ ...fila, stock_actual: borrador, disponible: borrador - fila.apartado }, cfg)

  function abrir() {
    setValor(String(fila.stock_actual))
    setMotivo('')
    setError(null)
    setEditando(true)
  }

  async function guardar() {
    if (!/^\d+$/.test(valor)) return setError('Escribe un número entero de 0 o más.')
    if (Number(valor) === fila.stock_actual) return setEditando(false)
    setGuardando(true)
    const { data, error: e } = await capturarStock({ clave: fila.clave, stock: Number(valor), comentario: motivo.trim() || null })
    setGuardando(false)
    if (e) return setError(e.message)
    setEditando(false)
    onGuardado(data)
  }

  return (
    <tr className={'frisa-niveles__fila--' + n.estado + (fila.niveles.sinMovimiento ? ' frisa-niveles__fila--quieta' : '')}>
      <td data-label="Producto">
        <button type="button" className="frisa-niveles__clave" onClick={onDetalle}><NombreFrisa producto={fila} className="frisa__prod" /></button>
      </td>
      <td data-label="Color"><ColorFrisa producto={fila} /></td>
      <td data-label="Real" className="num">
        {editando ? (
          <span className="frisa-niveles__editar">
            <input className="input frisa-input" type="number" min="0" step="1" inputMode="numeric" autoFocus value={valor}
              disabled={guardando} aria-label={`Stock de ${nombreFrisa(fila.nombre)}`} onFocus={(e) => e.target.select()}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }} />
            <input className="input frisa-niveles__motivo" value={motivo} placeholder="Motivo (ej. conteo físico)" disabled={guardando}
              onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }} aria-label="Motivo del ajuste" />
            <button type="button" className="btn btn--primary btn--small" disabled={guardando} onClick={guardar} aria-label="Guardar">✓</button>
            <button type="button" className="btn btn--ghost btn--small" disabled={guardando} onClick={() => setEditando(false)} aria-label="Cancelar">×</button>
            {error && <span className="form-error frisa-niveles__error">{error}</span>}
          </span>
        ) : puedeCapturar ? (
          <button type="button" className="frisa-niveles__stock" onClick={abrir} title="Capturar stock">{num(fila.stock_actual)}</button>
        ) : (
          <strong>{num(fila.stock_actual)}</strong>
        )}
      </td>
      <td data-label="Apartado" className="num">{fila.apartado ? num(fila.apartado) : ''}</td>
      <td data-label="Disponible" className="num"><strong>{num(borrador == null ? fila.disponible : borrador - fila.apartado)}</strong></td>
      {verDemanda && <td data-label="Demanda diaria" className="num">{n.sinMovimiento ? '' : formatoDemanda(n.demanda)}</td>}
      <td data-label="Mínimo" className="num">{num(n.minimo)}</td>
      <td data-label="Reorden" className="num">{num(n.reorden)}</td>
      <td data-label="Máximo" className="num">{num(n.maximo)}</td>
      <td data-label="Estado">{fila.niveles.sinMovimiento
        ? <span className="frisa-nivel frisa-nivel--neutro" title="Sin ventas en 2026: no tiene mínimo, reorden ni máximo">SIN MOVIMIENTO</span>
        : <EstadoBadge estado={n.estado} />}</td>
      <td data-label="A PEDIR" className="num"><strong>{n.aPedir == null ? '' : num(n.aPedir)}</strong></td>
      <td data-label="Tendencia">{fila.tendencia || ''}</td>
    </tr>
  )
}
