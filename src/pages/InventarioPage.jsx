import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canMoverInventario, canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos, useInventarioEstructura, useInventarioCatalogo } from '../hooks/useInventario'
import { formatTalla } from '../utils/inventarioTallas'
import MovimientoModal from '../components/inventario/MovimientoModal'
import HistorialModal from '../components/inventario/HistorialModal'
import ReporteModal from '../components/inventario/ReporteModal'
import ArticuloBuscador from '../components/inventario/ArticuloBuscador'
import EntradaModeloModal from '../components/inventario/EntradaModeloModal'
import NuevoProductoModal from '../components/inventario/NuevoProductoModal'
import ModeloOpcionesModal from '../components/inventario/ModeloOpcionesModal'
import PdfPreviewModal from '../components/pdf/PdfPreviewModal'
import { buildReporteBlob, reporteFileName } from '../utils/generateInventarioReportePdf'

// V89/V92 — Inventario (artículos por fuera de Microsip), pantalla
// principal: secciones (colegios / líneas) como pestañas, prendas como
// acordeón, existencia por ubicación o total, +/- rápido y reporte en PDF.
//
// V121 — catálogo estructurado:
//   - Se carga TODO el inventario una vez (useInventarioCatalogo) y la
//     pestaña solo filtra en memoria; eso permite el buscador flexible
//     global (encuentra en cualquier sección y te lleva a ella).
//   - Los artículos que pertenecen a un MODELO se agrupan por modelo y
//     muestran siempre todas sus tallas (las que están en 0, en gris).
//     Desde ahí: "Dar entrada" por cuadrícula y "Opciones" (talla extra,
//     alias).
//   - Los artículos SIN modelo ("sin clasificar") se siguen agrupando por
//     el texto de su prenda y rellenando huecos de talla, igual que antes.

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
// la propia prenda ya use ESE MISMO estilo (TALL y (NN) van por separado) (si no, "4 TALL" aparecería de la
// nada entre "4" y "6" para prendas que nunca lo usan). El artículo real
// se crea hasta que se hace el primer movimiento sobre ese chip (ver
// MovimientoModal).
function tallaFamilia(orden) {
  if (orden < 1000) return 'infantil'
  if (orden < 2000) return 'letra'
  if (orden < 9000) return 'pantalon'
  return 'sin_talla'
}

// Estilo de una talla "variante": 'tall' (4 TALL) o 'paren' (1(20)); null si
// es una talla normal. Son estilos distintos: una prenda etiquetada con
// 1(20)/2(22) no usa tallas TALL, y al revés.
function estiloVariante(nombre) {
  if (/TALL/i.test(nombre)) return 'tall'
  if (/\(\d+\)/.test(nombre)) return 'paren'
  return null
}

// Tallas que casi ninguna prenda usa (hoy solo el vestido de Avenue): nunca
// se ofrecen como hueco; la prenda que las lleva las tiene dadas de alta.
const TALLAS_SIN_RELLENO = new Set(['3', '3 TALL'])

function fillTallaGaps(items, todasLasTallas) {
  if (items.length < 2) return items
  const existentes = new Set(items.map((i) => i.tallaId))
  const { seccionId, prenda, modeloId = null } = items[0]

  const porFamilia = new Map()
  for (const it of items) {
    const familia = tallaFamilia(it.tallaOrden)
    if (!porFamilia.has(familia)) porFamilia.set(familia, { minOrden: it.tallaOrden, maxOrden: it.tallaOrden, cantidad: 0, estilos: new Set() })
    const f = porFamilia.get(familia)
    f.minOrden = Math.min(f.minOrden, it.tallaOrden)
    f.maxOrden = Math.max(f.maxOrden, it.tallaOrden)
    f.cantidad += 1
    const estilo = estiloVariante(it.talla)
    if (estilo) f.estilos.add(estilo)
  }

  const faltantes = []
  for (const t of todasLasTallas) {
    if (existentes.has(t.id)) continue
    const familia = tallaFamilia(t.orden)
    const info = porFamilia.get(familia)
    if (!info || info.cantidad < 2) continue // sin al menos 2 tallas de esa familia, no hay rango que interpolar
    if (t.orden < info.minOrden || t.orden > info.maxOrden) continue
    if (TALLAS_SIN_RELLENO.has(t.nombre)) continue
    const estilo = estiloVariante(t.nombre)
    if (estilo && !info.estilos.has(estilo)) continue
    faltantes.push({
      articuloId: null,
      seccionId,
      prenda,
      modeloId,
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

// Grupos de una sección: uno por modelo + uno por prenda sin clasificar.
function agrupar(articulosSeccion, modelosSeccion, todasLasTallas) {
  // Un modelo creado con el asistente trae sus tallas definidas (a propósito
  // se le pudieron quitar algunas del juego), así que se muestra tal cual.
  // Uno formado al clasificar artículos viejos (sin juego) conserva el
  // relleno de huecos de V92, para no perder tallas que ya se veían en 0.
  const grupos = modelosSeccion.map((m) => ({
    key: `m:${m.id}`,
    label: m.nombreCorto,
    modelo: m,
    items: m.juegoId ? m.articulos : fillTallaGaps(m.articulos, todasLasTallas),
  }))
  const sueltos = new Map()
  for (const a of articulosSeccion) {
    if (a.modeloId) continue
    if (!sueltos.has(a.prenda)) sueltos.set(a.prenda, [])
    sueltos.get(a.prenda).push(a)
  }
  for (const [prenda, items] of sueltos) {
    grupos.push({
      key: `p:${prenda}`,
      label: prenda,
      modelo: null,
      items: fillTallaGaps([...items].sort((x, y) => x.tallaOrden - y.tallaOrden), todasLasTallas),
    })
  }
  return grupos.sort((x, y) => x.label.localeCompare(y.label, 'es'))
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
  const { clasificaciones, tipos, juegos, loading: loadingEstructura, refresh: refreshEstructura } = useInventarioEstructura()
  const {
    articulos,
    modelos,
    sinV121,
    loading: loadingExistencias,
    error: existenciasError,
    refresh: refreshExistencias,
  } = useInventarioCatalogo({ secciones, tallas, ubicaciones, tipos, listo: !loadingCatalogos && !loadingEstructura })

  const [seccionId, setSeccionId] = useState(null)
  const [clasificacionFiltro, setClasificacionFiltro] = useState('todas') // 'todas' | clasificacion_id | 'sin'
  const [viewMode, setViewMode] = useState('total') // 'total' | ubicacion_id
  // { kind: 'movimiento' | 'historial' | 'entrada' | 'nuevoModelo' | 'opciones', ... }
  const [modal, setModal] = useState(null)
  const [abiertas, setAbiertas] = useState(() => new Set())
  const [todoAbierto, setTodoAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(null) // articuloId al que llevó el buscador
  const [destino, setDestino] = useState(null) // grupo al que hay que hacer scroll (buscador / modelo recién creado)
  const [showReporte, setShowReporte] = useState(false)
  const [pdfBlob, setPdfBlob] = useState(null)
  const [pdfName, setPdfName] = useState('')

  const seccionesActivas = useMemo(() => secciones.filter((s) => s.activa), [secciones])
  const ubicacionesActivas = useMemo(() => ubicaciones.filter((u) => u.activa), [ubicaciones])
  const motivosDisponibles = useMemo(() => motivos.filter((m) => m.activo && !m.sistema), [motivos])
  const hayClasificadas = seccionesActivas.some((s) => s.clasificacion_id)

  const seccionesVisibles = useMemo(() => {
    if (clasificacionFiltro === 'todas') return seccionesActivas
    if (clasificacionFiltro === 'sin') return seccionesActivas.filter((s) => !s.clasificacion_id)
    return seccionesActivas.filter((s) => s.clasificacion_id === clasificacionFiltro)
  }, [seccionesActivas, clasificacionFiltro])

  const seccionActivaId =
    (seccionId && seccionesVisibles.some((s) => s.id === seccionId) ? seccionId : null) ?? seccionesVisibles[0]?.id ?? null
  const seccionActivaNombre = seccionesActivas.find((s) => s.id === seccionActivaId)?.nombre || ''

  const gruposTodos = useMemo(
    () =>
      agrupar(
        articulos.filter((a) => a.seccionId === seccionActivaId),
        modelos.filter((m) => m.seccionId === seccionActivaId),
        tallas
      ),
    [articulos, modelos, seccionActivaId, tallas]
  )

  const sinClasificar = useMemo(() => articulos.filter((a) => !a.modeloId).length, [articulos])
  const existenciaVista = useCallback((a) => (viewMode === 'total' ? a.total : a.porUbicacion[viewMode] ?? 0), [viewMode])

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

  function irAGrupo(seccion, grupoKey, articuloId = null) {
    setClasificacionFiltro('todas')
    setSeccionId(seccion)
    setAbiertas((cur) => new Set(cur).add(`${seccion}:${grupoKey}`))
    setResaltado(articuloId)
    setDestino(`${seccion}:${grupoKey}`)
  }

  useEffect(() => {
    if (!destino) return
    const el = document.getElementById(`inv-grupo-${destino}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setDestino(null)
  }, [destino, gruposTodos])

  function closeAndRefresh() {
    setModal(null)
    refreshExistencias()
  }

  async function refreshTodo() {
    await Promise.all([refreshCatalogos(), refreshEstructura(), refreshExistencias()])
  }

  async function handleGenerarReporte({ modo, ubicacionSeleccionada, prendasFiltro }) {
    setShowReporte(false)
    let grupoFilas = gruposTodos
    if (prendasFiltro) grupoFilas = grupoFilas.filter((g) => prendasFiltro.includes(g.label))
    // En el PDF cada fila lleva el nombre del grupo (modelo o prenda), no
    // el texto interno de `prenda`.
    const filasReporte = grupoFilas.flatMap((g) => g.items.map((a) => ({ ...a, prenda: g.label })))
    const fecha = new Date().toISOString()
    const subtitulo = !prendasFiltro
      ? 'Todas las prendas'
      : prendasFiltro.length === 1
        ? prendasFiltro[0]
        : `${prendasFiltro.length} prendas: ${prendasFiltro.join(', ')}`
    const blob = await buildReporteBlob({
      seccionNombre: seccionActivaNombre,
      subtitulo,
      fecha,
      filas: filasReporte,
      modo,
      ubicaciones: ubicacionesActivas,
      ubicacionSeleccionada,
    })
    setPdfBlob(blob)
    setPdfName(reporteFileName(seccionActivaNombre, prendasFiltro, fecha))
  }

  if (loadingCatalogos) return <Loading label="Cargando inventario…" />
  if (catalogosError) return <ErrorState error={catalogosError} onRetry={refreshCatalogos} />

  const estructuraLista = !sinV121 && !loadingExistencias
  const modeloOpciones = modal?.kind === 'opciones' ? modelos.find((m) => m.id === modal.modeloId) : null

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Inventario</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canMover && estructuraLista && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setModal({ kind: 'entrada', modelo: null })}>
              Dar entrada
            </button>
          )}
          {canEditar && estructuraLista && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => setModal({ kind: 'nuevoModelo' })}>
              + Nuevo producto
            </button>
          )}
          {seccionActivaId && (
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setShowReporte(true)}>
              Reporte
            </button>
          )}
          <Link to="/inventario/movimientos" className="btn btn--secondary btn--small">
            Movimientos
          </Link>
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

      {canEditar && estructuraLista && sinClasificar > 0 && (
        <p className="inv-banner">
          Hay {sinClasificar} artículos sin clasificar (siguen funcionando igual).{' '}
          <Link to="/inventario/sin-clasificar">Clasificarlos →</Link>
        </p>
      )}

      {seccionesActivas.length === 0 ? (
        <EmptyState>Todavía no hay secciones dadas de alta.</EmptyState>
      ) : (
        <>
          <div className="inv-toolbar">
            <ArticuloBuscador
              articulos={articulos}
              existencia={existenciaVista}
              etiquetaExistencia="pzas"
              onSelect={(a) => irAGrupo(a.seccionId, a.modeloId ? `m:${a.modeloId}` : `p:${a.prenda}`, a.articuloId)}
              placeholder="Buscar en todo el inventario… (ej. po tri 12)"
              disabled={loadingExistencias}
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

          {hayClasificadas && (
            <div className="inv-clasif-filtro">
              {[
                { key: 'todas', label: 'Todos' },
                ...clasificaciones.filter((c) => c.activa).map((c) => ({ key: c.id, label: c.nombre })),
                { key: 'sin', label: 'Sin clasificación' },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={'inv-clasif-filtro__btn' + (clasificacionFiltro === c.key ? ' inv-clasif-filtro__btn--on' : '')}
                  onClick={() => setClasificacionFiltro(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="type-tabs" style={{ marginBottom: 10 }}>
            {seccionesVisibles.map((s) => (
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

          {loadingExistencias && <Loading label="Cargando existencias…" />}
          {existenciasError && <ErrorState error={existenciasError} onRetry={refreshExistencias} />}

          {!loadingExistencias && !existenciasError && gruposTodos.length === 0 && (
            <EmptyState>
              {seccionActivaId ? 'Este cliente o línea todavía no tiene artículos.' : 'No hay clientes o líneas con esa clasificación.'}
            </EmptyState>
          )}

          {!loadingExistencias && !existenciasError && gruposTodos.length > 0 && (
            <>
              <div className="inv-expandir">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setTodoAbierto((v) => !v)}>
                  {todoAbierto ? 'Contraer todo' : 'Ver todo con tallas'}
                </button>
              </div>
              <div className="inv-prenda-list">
                {gruposTodos.map((g) => {
                  const key = `${seccionActivaId}:${g.key}`
                  const abierta = todoAbierto || abiertas.has(key)
                  const totalPrenda = g.items.reduce((sum, a) => sum + a.total, 0)
                  return (
                    <div key={g.key} id={`inv-grupo-${key}`} className="card inv-prenda-card">
                      <button
                        type="button"
                        className="inv-prenda-card__header"
                        onClick={() => toggleAbierta(key)}
                        aria-expanded={abierta}
                      >
                        <span className={'inv-prenda-card__chevron' + (abierta ? ' inv-prenda-card__chevron--open' : '')}>▸</span>
                        <span className="inv-prenda-card__nombre">
                          {g.label}
                          {!g.modelo && canEditar && estructuraLista && <span className="inv-prenda-card__tag">sin clasificar</span>}
                        </span>
                        <span className="inv-prenda-card__total">{totalPrenda} pzas</span>
                      </button>
                      {abierta && g.modelo && (canMover || canEditar) && (
                        <div className="inv-modelo-acciones">
                          {canMover && (
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              onClick={() => setModal({ kind: 'entrada', modelo: g.modelo })}
                            >
                              Dar entrada
                            </button>
                          )}
                          {canEditar && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              onClick={() => setModal({ kind: 'opciones', modeloId: g.modelo.id })}
                            >
                              + Talla / alias
                            </button>
                          )}
                        </div>
                      )}
                      {abierta && (
                        <div className="inv-chip-row">
                          {g.items.map((a) => {
                            const valor = existenciaVista(a)
                            const bajoMinimo = a.minimo != null && a.total < a.minimo
                            const chipKey = a.articuloId || `${a.prenda}-${a.tallaId}`
                            return (
                              <div
                                key={chipKey}
                                className={
                                  'inv-chip' +
                                  (bajoMinimo ? ' inv-chip--low' : '') +
                                  (a.virtual ? ' inv-chip--virtual' : '') +
                                  (valor === 0 && !bajoMinimo ? ' inv-chip--cero' : '') +
                                  (a.articuloId && a.articuloId === resaltado ? ' inv-chip--hit' : '')
                                }
                              >
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
                                      aria-label={`Salida de ${g.label} ${a.talla}`}
                                      onClick={() => setModal({ kind: 'movimiento', tipo: 'salida', articulo: a })}
                                    >
                                      −
                                    </button>
                                    <button
                                      type="button"
                                      className="inv-chip__btn"
                                      aria-label={`Entrada de ${g.label} ${a.talla}`}
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
            </>
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
      {modal?.kind === 'entrada' && (
        <EntradaModeloModal
          modelos={modelos}
          modeloInicial={modal.modelo}
          ubicaciones={ubicacionesActivas}
          motivos={motivosDisponibles}
          defaultUbicacionId={viewMode !== 'total' ? viewMode : ubicacionesActivas[0]?.id}
          onClose={() => setModal(null)}
          onDone={closeAndRefresh}
        />
      )}
      {modal?.kind === 'nuevoModelo' && (
        <NuevoProductoModal
          secciones={secciones}
          clasificaciones={clasificaciones}
          tipos={tipos}
          tallas={tallas}
          modelos={modelos}
          ubicaciones={ubicacionesActivas}
          motivos={motivosDisponibles}
          seccionInicialId={seccionActivaId}
          defaultUbicacionId={viewMode !== 'total' ? viewMode : ubicacionesActivas[0]?.id}
          canMover={canMover}
          refreshCatalogos={refreshCatalogos}
          refreshEstructura={refreshEstructura}
          onClose={() => setModal(null)}
          onDone={async ({ modeloId, seccionId: seccionNueva }) => {
            setModal(null)
            await refreshTodo()
            irAGrupo(seccionNueva, `m:${modeloId}`)
          }}
          onUsarExistente={(m) => {
            setModal(null)
            irAGrupo(m.seccionId, `m:${m.id}`)
          }}
        />
      )}
      {modeloOpciones && (
        <ModeloOpcionesModal modelo={modeloOpciones} tallas={tallas} onClose={() => setModal(null)} onChanged={refreshExistencias} />
      )}
      {showReporte && seccionActivaId && (
        <ReporteModal
          seccionNombre={seccionActivaNombre}
          ubicaciones={ubicacionesActivas}
          prendas={gruposTodos.map((g) => g.label)}
          onClose={() => setShowReporte(false)}
          onGenerate={handleGenerarReporte}
        />
      )}
      {pdfBlob && <PdfPreviewModal blob={pdfBlob} fileName={pdfName} onClose={() => setPdfBlob(null)} />}
    </div>
  )
}
