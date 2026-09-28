import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canMoverInventario, canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos, useInventarioExistencias } from '../hooks/useInventario'
import { formatTalla } from '../utils/inventarioTallas'
import MovimientoModal from '../components/inventario/MovimientoModal'
import HistorialModal from '../components/inventario/HistorialModal'
import ReporteModal from '../components/inventario/ReporteModal'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { buildReporteBlob, reporteFileName } from '../utils/generateInventarioReportePdf'

// V89/V92 — Inventario (artículos por fuera de Microsip), pantalla
// principal: secciones (colegios) como pestañas, prendas como acordeón
// (una lista desplegable por prenda, para no scrollear con secciones que
// tienen muchas prendas), tallas completas por prenda (huecos en 0,
// aunque no exista el artículo todavía — se crea solo hasta el primer
// movimiento), existencia por ubicación o total, +/- rápido, buscador y
// reporte en PDF por colegio. En modo prueba: RequireInventarioAccess ya
// filtró rol + correo antes de llegar aquí.
function buildArticulos(filas) {
  const map = new Map()
  for (const f of filas) {
    let a = map.get(f.articulo_id)
    if (!a) {
      a = {
        articuloId: f.articulo_id,
        seccionId: f.seccion_id,
        prenda: f.prenda,
        tallaId: f.talla_id,
        talla: f.talla,
        tallaOrden: f.talla_orden,
        minimo: f.minimo,
        porUbicacion: {},
        total: 0,
      }
      map.set(f.articulo_id, a)
    }
    a.porUbicacion[f.ubicacion_id] = f.existencia
    a.total += f.existencia
  }
  return [...map.values()]
}

// V92 — dentro de cada prenda, rellena con "chips virtuales" (existencia
// 0, sin fila real en inv_articulos todavía) cualquier talla del catálogo
// que caiga ENTRE la talla más chica y la más grande que esa prenda ya
// tiene en este colegio — así no se pierden tallas que el Google Sheet
// original no listó. Es "por familia", no por rango global: agrupa las
// tallas que la prenda ya tiene en infantil/letra/pantalón/sin-talla
// (mismos cortes de `orden` que V89 sembró) y solo rellena huecos DENTRO
// de cada familia que la prenda ya toca — nunca le mezcla, por ejemplo,
// tallas de pantalón a una playera que solo usa infantil, aunque el orden
// de ambas quede "cerca". Tampoco ofrece variantes TALL/(NN) a menos que
// la propia prenda ya use ese estilo (si no, "4 TALL" aparecería de la
// nada entre "4" y "6" para prendas que nunca lo usan). El artículo real
// se crea hasta que se hace el primer movimiento sobre ese chip (ver
// MovimientoModal).
function tallaFamilia(orden) {
  if (orden < 1000) return 'infantil'
  if (orden < 2000) return 'letra'
  if (orden < 9000) return 'pantalon'
  return 'sin_talla'
}

function esTallaVariante(nombre) {
  return /TALL/i.test(nombre) || /\(\d+\)/.test(nombre)
}

function fillTallaGaps(items, todasLasTallas) {
  if (items.length < 2) return items
  const existentes = new Set(items.map((i) => i.tallaId))
  const { seccionId, prenda } = items[0]

  const porFamilia = new Map()
  for (const it of items) {
    const familia = tallaFamilia(it.tallaOrden)
    if (!porFamilia.has(familia)) porFamilia.set(familia, { minOrden: it.tallaOrden, maxOrden: it.tallaOrden, cantidad: 0, tieneVariante: false })
    const f = porFamilia.get(familia)
    f.minOrden = Math.min(f.minOrden, it.tallaOrden)
    f.maxOrden = Math.max(f.maxOrden, it.tallaOrden)
    f.cantidad += 1
    if (esTallaVariante(it.talla)) f.tieneVariante = true
  }

  const faltantes = []
  for (const t of todasLasTallas) {
    if (existentes.has(t.id)) continue
    const familia = tallaFamilia(t.orden)
    const info = porFamilia.get(familia)
    if (!info || info.cantidad < 2) continue // sin al menos 2 tallas de esa familia, no hay rango que interpolar
    if (t.orden < info.minOrden || t.orden > info.maxOrden) continue
    if (esTallaVariante(t.nombre) && !info.tieneVariante) continue
    faltantes.push({
      articuloId: null,
      seccionId,
      prenda,
      tallaId: t.id,
      talla: t.nombre,
      tallaOrden: t.orden,
      minimo: null,
      porUbicacion: {},
      total: 0,
      virtual: true,
    })
  }
  if (faltantes.length === 0) return items
  return [...items, ...faltantes].sort((a, b) => a.tallaOrden - b.tallaOrden)
}

function groupByPrenda(articulos, todasLasTallas) {
  const groups = new Map()
  for (const a of articulos) {
    if (!groups.has(a.prenda)) groups.set(a.prenda, [])
    groups.get(a.prenda).push(a)
  }
  return [...groups.entries()]
    .map(([prenda, items]) => ({
      prenda,
      items: fillTallaGaps([...items].sort((x, y) => x.tallaOrden - y.tallaOrden), todasLasTallas),
    }))
    .sort((x, y) => x.prenda.localeCompare(y.prenda, 'es'))
}

export default function InventarioPage() {
  return (
    <RequireInventarioAccess>
      <InventarioContent />
    </RequireInventarioAccess>
  )
}

function InventarioContent() {
  const { role } = useAuth()
  const canMover = canMoverInventario(role)
  const canEditar = canEditarInventario(role)
  const {
    secciones,
    ubicaciones,
    tallas,
    motivos,
    loading: loadingCatalogos,
    error: catalogosError,
    refresh: refreshCatalogos,
  } = useInventarioCatalogos()
  const [seccionId, setSeccionId] = useState(null)
  const [viewMode, setViewMode] = useState('total') // 'total' | ubicacion_id
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // { kind: 'movimiento' | 'historial', articulo, tipo? }
  const [abiertas, setAbiertas] = useState(() => new Set())
  const [showReporte, setShowReporte] = useState(false)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfName, setPdfName] = useState('')

  const seccionesActivas = useMemo(() => secciones.filter((s) => s.activa), [secciones])
  const ubicacionesActivas = useMemo(() => ubicaciones.filter((u) => u.activa), [ubicaciones])
  const motivosDisponibles = useMemo(() => motivos.filter((m) => m.activo && !m.sistema), [motivos])

  const seccionActivaId = seccionId ?? (loadingCatalogos ? undefined : seccionesActivas[0]?.id ?? null)
  const seccionActivaNombre = seccionesActivas.find((s) => s.id === seccionActivaId)?.nombre || ''

  const { filas, loading: loadingExistencias, error: existenciasError, refresh: refreshExistencias } = useInventarioExistencias(seccionActivaId)

  const gruposTodos = useMemo(() => groupByPrenda(buildArticulos(filas), tallas), [filas, tallas])

  const grupos = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return gruposTodos
    return gruposTodos.filter((g) => g.prenda.toLowerCase().includes(needle))
  }, [gruposTodos, q])

  // La llave incluye la sección: el mismo nombre de prenda se repite en
  // varios colegios (ej. "Falda", "Pantalon"), y sin esto abrir una en un
  // colegio la dejaría abierta también en otro que tenga una prenda con el
  // mismo nombre.
  function toggleAbierta(key) {
    setAbiertas((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function closeAndRefresh() {
    setModal(null)
    refreshExistencias()
  }

  async function handleGenerarReporte({ modo, ubicacionSeleccionada, prendaFiltro }) {
    setShowReporte(false)
    let grupoFilas = gruposTodos
    if (prendaFiltro) grupoFilas = grupoFilas.filter((g) => g.prenda === prendaFiltro)
    const filasReporte = grupoFilas.flatMap((g) => g.items)
    const fecha = new Date().toISOString()
    const blob = await buildReporteBlob({
      seccionNombre: seccionActivaNombre,
      prendaFiltro,
      fecha,
      filas: filasReporte,
      modo,
      ubicaciones: ubicacionesActivas,
      ubicacionSeleccionada,
    })
    setPdfBlob(blob)
    setPdfName(reporteFileName(seccionActivaNombre, prendaFiltro, fecha))
  }

  if (loadingCatalogos) return <Loading label="Cargando inventario…" />
  if (catalogosError) return <ErrorState error={catalogosError} onRetry={refreshCatalogos} />

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Inventario</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seccionActivaId && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setShowReporte(true)}>
              Reporte
            </button>
          )}
          {canMover && (
            <Link to="/inventario/traspasos" className="btn btn--secondary btn--small">
              Traspasos
            </Link>
          )}
          {canMover && (
            <Link to="/inventario/conteos" className="btn btn--secondary btn--small">
              Conteo físico
            </Link>
          )}
          {canEditar && (
            <Link to="/inventario/admin" className="btn btn--ghost btn--small">
              Administración
            </Link>
          )}
        </div>
      </div>

      {seccionesActivas.length === 0 ? (
        <EmptyState>Todavía no hay secciones dadas de alta.</EmptyState>
      ) : (
        <>
          <div className="type-tabs" style={{ marginBottom: 10 }}>
            {seccionesActivas.map((s) => (
              <button
                key={s.id}
                type="button"
                className={'type-tab' + (s.id === seccionActivaId ? ' type-tab--active' : '')}
                onClick={() => setSeccionId(s.id)}
              >
                {s.nombre}
              </button>
            ))}
          </div>

          <div className="inv-toolbar">
            <input
              type="search"
              className="input"
              placeholder="Buscar prenda…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="type-tabs">
              <button
                type="button"
                className={'type-tab' + (viewMode === 'total' ? ' type-tab--active' : '')}
                onClick={() => setViewMode('total')}
              >
                Total
              </button>
              {ubicacionesActivas.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={'type-tab' + (viewMode === u.id ? ' type-tab--active' : '')}
                  onClick={() => setViewMode(u.id)}
                >
                  {u.nombre}
                </button>
              ))}
            </div>
          </div>

          {loadingExistencias && <Loading label="Cargando existencias…" />}
          {existenciasError && <ErrorState error={existenciasError} onRetry={refreshExistencias} />}

          {!loadingExistencias && !existenciasError && grupos.length === 0 && (
            <EmptyState>No hay artículos con esos filtros.</EmptyState>
          )}

          {!loadingExistencias && !existenciasError && grupos.length > 0 && (
            <div className="inv-prenda-list">
              {grupos.map((g) => {
                const key = `${seccionActivaId}:${g.prenda}`
                const abierta = abiertas.has(key)
                const totalPrenda = g.items.reduce((sum, a) => sum + a.total, 0)
                return (
                  <div key={g.prenda} className="card inv-prenda-card">
                    <button
                      type="button"
                      className="inv-prenda-card__header"
                      onClick={() => toggleAbierta(key)}
                      aria-expanded={abierta}
                    >
                      <span className={'inv-prenda-card__chevron' + (abierta ? ' inv-prenda-card__chevron--open' : '')}>▸</span>
                      <span className="inv-prenda-card__nombre">{g.prenda}</span>
                      <span className="inv-prenda-card__total">{totalPrenda} pzas</span>
                    </button>
                    {abierta && (
                      <div className="inv-chip-row">
                        {g.items.map((a) => {
                          const valor = viewMode === 'total' ? a.total : a.porUbicacion[viewMode] ?? 0
                          const bajoMinimo = a.minimo != null && a.total < a.minimo
                          const chipKey = a.articuloId || `${a.prenda}-${a.tallaId}`
                          return (
                            <div key={chipKey} className={'inv-chip' + (bajoMinimo ? ' inv-chip--low' : '') + (a.virtual ? ' inv-chip--virtual' : '')}>
                              {a.articuloId ? (
                                <button
                                  type="button"
                                  className="inv-chip__main"
                                  onClick={() => setModal({ kind: 'historial', articulo: a })}
                                  title="Ver historial"
                                >
                                  <span className="inv-chip__talla">{formatTalla(a.talla)}</span>
                                  <span className="inv-chip__valor">{valor}</span>
                                  {a.minimo != null && <span className="inv-chip__minimo">mín. {a.minimo}</span>}
                                </button>
                              ) : (
                                <div className="inv-chip__main" title="Sin movimientos todavía">
                                  <span className="inv-chip__talla">{formatTalla(a.talla)}</span>
                                  <span className="inv-chip__valor">{valor}</span>
                                </div>
                              )}
                              {canMover && (
                                <div className="inv-chip__actions">
                                  <button
                                    type="button"
                                    className="inv-chip__btn"
                                    aria-label={`Salida de ${g.prenda} ${a.talla}`}
                                    onClick={() => setModal({ kind: 'movimiento', tipo: 'salida', articulo: a })}
                                  >
                                    −
                                  </button>
                                  <button
                                    type="button"
                                    className="inv-chip__btn"
                                    aria-label={`Entrada de ${g.prenda} ${a.talla}`}
                                    onClick={() => setModal({ kind: 'movimiento', tipo: 'entrada', articulo: a })}
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {modal?.kind === 'movimiento' && (
        <MovimientoModal
          articulo={modal.articulo}
          tipo={modal.tipo}
          ubicaciones={ubicacionesActivas}
          motivos={motivosDisponibles}
          defaultUbicacionId={viewMode !== 'total' ? viewMode : ubicacionesActivas[0]?.id}
          onClose={() => setModal(null)}
          onDone={closeAndRefresh}
        />
      )}
      {modal?.kind === 'historial' && <HistorialModal articulo={modal.articulo} onClose={() => setModal(null)} />}
      {showReporte && seccionActivaId && (
        <ReporteModal
          seccionNombre={seccionActivaNombre}
          ubicaciones={ubicacionesActivas}
          prendas={gruposTodos.map((g) => g.prenda)}
          onClose={() => setShowReporte(false)}
          onGenerate={handleGenerarReporte}
        />
      )}
      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfName} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
