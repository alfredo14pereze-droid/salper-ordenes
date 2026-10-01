import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RequireInventarioAccess from '../components/common/RequireInventarioAccess'
import { Loading, ErrorState, EmptyState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canEditarInventario } from '../utils/permissions'
import { useInventarioCatalogos, useInventarioEstructura, useInventarioCatalogo } from '../hooks/useInventario'
import { vincularArticulos, clasificarSeccion } from '../services/inventarioService'
import { sugerirClasificacion, nombreModelo } from '../utils/inventarioCatalogo'
import { formatTalla } from '../utils/inventarioTallas'

// V121 — "Artículos sin clasificar" (solo quien administra catálogos).
// Los artículos que ya existían antes del catálogo estructurado NO se
// tocan ni se renombran solos: aquí se les asigna tipo de prenda y
// variante para vincularlos a un modelo, uno por uno o varios a la vez.
// Cada renglón es un grupo (cliente o línea + texto de la prenda) con
// todas sus tallas — el cliente y la talla ya los tiene cada artículo.
// La pantalla PROPONE tipo y variante leyendo el nombre (ver
// sugerirClasificacion); nada se aplica hasta presionar "Aplicar".
// Vincular solo llena modelo_id: no cambia el nombre original, la talla,
// la sección ni la existencia, y se puede deshacer desde el modelo.

export default function InventarioSinClasificarPage() {
  return (
    <RequireInventarioAccess>
      <Gate />
    </RequireInventarioAccess>
  )
}

function Gate() {
  const { role } = useAuth()
  if (!canEditarInventario(role)) {
    return (
      <div className="page page--narrow">
        <p className="page-subtitle">No tienes permiso para clasificar artículos de Inventario.</p>
        <Link to="/inventario" className="btn btn--ghost btn--small">
          ← Inventario
        </Link>
      </div>
    )
  }
  return <Content />
}

function Content() {
  const { secciones, ubicaciones, tallas, loading: loadingCatalogos, error: catalogosError, refresh: refreshCatalogos } = useInventarioCatalogos()
  const { clasificaciones, tipos, loading: loadingEstructura } = useInventarioEstructura()
  const { articulos, sinV121, loading, error, refresh } = useInventarioCatalogo({
    secciones,
    tallas,
    ubicaciones,
    tipos,
    listo: !loadingCatalogos && !loadingEstructura,
  })
  const [ediciones, setEdiciones] = useState({}) // key → { tipoId?, variante? } (lo que el admin cambió sobre la sugerencia)
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [seccionFiltro, setSeccionFiltro] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const tiposActivos = useMemo(() => tipos.filter((t) => t.activo), [tipos])
  const tipoNombre = useMemo(() => new Map(tipos.map((t) => [t.id, t.nombre])), [tipos])

  // Grupos: (sección, prenda) con sus tallas, y la sugerencia de cada uno.
  const grupos = useMemo(() => {
    const map = new Map()
    for (const a of articulos) {
      if (a.modeloId) continue
      const key = `${a.seccionId}:${a.prenda}`
      if (!map.has(key)) map.set(key, { key, seccionId: a.seccionId, seccion: a.seccion, prenda: a.prenda, items: [], total: 0 })
      const g = map.get(key)
      g.items.push(a)
      g.total += a.total
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        items: g.items.sort((x, y) => x.tallaOrden - y.tallaOrden),
        sugerencia: sugerirClasificacion(g.prenda, tiposActivos),
      }))
      .sort((x, y) => x.seccion.localeCompare(y.seccion, 'es') || x.prenda.localeCompare(y.prenda, 'es'))
  }, [articulos, tiposActivos])

  const valorDe = (g) => ({ ...g.sugerencia, ...(ediciones[g.key] || {}) })

  const porSeccion = useMemo(() => {
    const map = new Map()
    for (const g of grupos) {
      if (seccionFiltro && g.seccionId !== seccionFiltro) continue
      if (!map.has(g.seccionId)) map.set(g.seccionId, [])
      map.get(g.seccionId).push(g)
    }
    return [...map.entries()].map(([seccionId, items]) => ({ seccion: secciones.find((s) => s.id === seccionId), items }))
  }, [grupos, seccionFiltro, secciones])

  const seccionesConPendientes = useMemo(() => {
    const ids = new Set(grupos.map((g) => g.seccionId))
    return secciones.filter((s) => ids.has(s.id))
  }, [grupos, secciones])

  const visibles = porSeccion.flatMap((s) => s.items)
  const seleccionados = visibles.filter((g) => seleccion.has(g.key) && valorDe(g).tipoId)

  function editar(key, cambios) {
    setEdiciones((cur) => ({ ...cur, [key]: { ...(cur[key] || {}), ...cambios } }))
  }

  function toggle(key) {
    setSeleccion((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function seleccionarConSugerencia() {
    setSeleccion(new Set(visibles.filter((g) => valorDe(g).tipoId).map((g) => g.key)))
  }

  async function aplicar(lista) {
    if (lista.length === 0) return
    setSaving(true)
    setSaveError(null)
    setAviso(null)
    const { data, error: err } = await vincularArticulos(
      lista.map((g) => {
        const v = valorDe(g)
        return { seccionId: g.seccionId, tipoPrendaId: v.tipoId, variante: v.variante, articuloIds: g.items.map((a) => a.articuloId) }
      })
    )
    setSaving(false)
    if (err) return setSaveError(err)
    setSeleccion((cur) => {
      const next = new Set(cur)
      for (const g of lista) next.delete(g.key)
      return next
    })
    setAviso(`Listo: ${data} artículos clasificados en ${lista.length} ${lista.length === 1 ? 'modelo' : 'modelos'}.`)
    refresh()
  }

  async function cambiarClasificacion(seccion, clasificacionId) {
    setSaveError(null)
    const { error: err } = await clasificarSeccion({ seccionId: seccion.id, clasificacionId, clienteId: seccion.cliente_id })
    if (err) return setSaveError(err)
    refreshCatalogos()
  }

  if (loadingCatalogos || loading) return <Loading label="Cargando artículos…" />
  if (catalogosError || error) return <ErrorState error={catalogosError || error} onRetry={refresh} />

  return (
    <div className="page">
      <div className="new-order-header">
        <h2 className="section-title">Artículos sin clasificar</h2>
        <Link to="/inventario" className="btn btn--ghost btn--small">
          ← Inventario
        </Link>
      </div>

      {sinV121 ? (
        <EmptyState>Falta aplicar la migración V121 en la base de datos para poder clasificar artículos.</EmptyState>
      ) : grupos.length === 0 ? (
        <EmptyState>Todos los artículos ya están clasificados en un modelo.</EmptyState>
      ) : (
        <>
          <p className="page-subtitle">
            {grupos.length} prendas ({grupos.reduce((n, g) => n + g.items.length, 0)} artículos) todavía sin modelo. Revisa el tipo y la variante
            propuestos, corrige lo necesario y aplica. No se renombra nada ni cambia la existencia; mientras no los clasifiques siguen
            funcionando igual.
          </p>

          <div className="inv-toolbar">
            <select className="input" value={seccionFiltro} onChange={(e) => setSeccionFiltro(e.target.value)}>
              <option value="">Todos los clientes y líneas</option>
              {seccionesConPendientes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--ghost btn--small" onClick={seleccionarConSugerencia}>
                Seleccionar todos los que tienen tipo
              </button>
              {seleccion.size > 0 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setSeleccion(new Set())}>
                  Quitar selección
                </button>
              )}
            </div>
          </div>

          {aviso && <p className="inv-banner">{aviso}</p>}
          {saveError && <p className="form-error">{saveError.message}</p>}

          {porSeccion.map(({ seccion, items }) => (
            <div key={seccion?.id} className="card inv-sc-seccion">
              <div className="inv-sc-seccion__head">
                <h3 className="section-title section-title--small" style={{ margin: 0 }}>
                  {seccion?.nombre}
                </h3>
                <label className="pantone-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  Clasificación
                  <select
                    className="input input--small"
                    style={{ width: 'auto' }}
                    value={seccion?.clasificacion_id || ''}
                    onChange={(e) => cambiarClasificacion(seccion, e.target.value || null)}
                  >
                    <option value="">Sin clasificación</option>
                    {clasificaciones.filter((c) => c.activa).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {items.map((g) => {
                const v = valorDe(g)
                return (
                  <div key={g.key} className="inv-sc-fila">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${g.prenda}`}
                      checked={seleccion.has(g.key)}
                      disabled={!v.tipoId}
                      onChange={() => toggle(g.key)}
                    />
                    <div>
                      <span className="inv-sc-fila__prenda">{g.prenda}</span>
                      <p className="pantone-hint">
                        {g.items.map((a) => formatTalla(a.talla)).join(' · ')} — {g.total} pzas
                      </p>
                    </div>
                    <select
                      className="input input--small"
                      aria-label="Tipo de prenda"
                      value={v.tipoId}
                      onChange={(e) => editar(g.key, { tipoId: e.target.value })}
                    >
                      <option value="">Tipo de prenda…</option>
                      {tiposActivos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="input input--small"
                      aria-label="Variante"
                      placeholder="Variante (opcional)"
                      value={v.variante}
                      onChange={(e) => editar(g.key, { variante: e.target.value })}
                    />
                    <button type="button" className="btn btn--secondary btn--small" disabled={saving || !v.tipoId} onClick={() => aplicar([g])}>
                      Aplicar
                    </button>
                    <p className="pantone-hint inv-sc-fila__resultado">
                      {v.tipoId ? (
                        <>
                          Quedaría como: <b>{nombreModelo({ tipo: tipoNombre.get(v.tipoId), seccion: g.seccion, variante: v.variante.trim() })}</b>
                        </>
                      ) : (
                        'Sin sugerencia: elige el tipo de prenda.'
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          ))}

          {seleccionados.length > 0 && (
            <div className="inv-sc-barra">
              <span>
                {seleccionados.length} {seleccionados.length === 1 ? 'prenda seleccionada' : 'prendas seleccionadas'} (
                {seleccionados.reduce((n, g) => n + g.items.length, 0)} artículos)
              </span>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={() => aplicar(seleccionados)}>
                {saving ? 'Aplicando…' : 'Aplicar a los seleccionados'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
