import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { Loading, ErrorState } from '../components/common/States'
import { useAuth } from '../contexts/AuthContext'
import { canCreateProducto, canManageCatalogs, canViewCatalogos } from '../utils/permissions'
import { fetchClienteById } from '../services/clientesService'
import { fetchTelas } from '../services/telasService'
import { fetchProductosByCliente, guardarProducto, setProductoProcesos, uploadProductoFoto, deleteProducto } from '../services/productosService'
import { resumenProducto } from '../utils/productoCatalogo'
import { PROCESOS_MAQUILA_OPTIONS } from '../lib/constants'
import { esClienteMaquila, etiquetaProcesos, ordenarProcesos } from '../utils/maquila'

// V133 — catálogo de UN cliente (colegio): se entra desde Catálogos y aquí se
// ven sus productos con foto, se abre la ficha completa de cada uno y se
// editan (datos, fotos y bordados con la foto del logotipo).

const bordadoVacio = () => ({ ubicacion: '', descripcion: '', foto_url: '', foto_path: '' })

// Alta y edición con el mismo formulario (guardar_producto crea o actualiza).
// Lo que no se edita aquí (pantone, proveedor, técnicas, rango original de
// tallas…) se conserva tal cual.
// V143 — en un cliente de maquila el producto lleva además sus procesos
// (casillas libres: ninguno es obligatorio, tampoco corte).
function ProductoForm({ producto = null, clienteId, telas, esMaquila = false, onSaved, onCancel }) {
  const esp = producto?.especificaciones || {}
  const [v, setV] = useState({
    nombre: producto?.nombre || '',
    garment: producto?.garment || '',
    color: producto?.color || '',
    telaId: producto?.tela_id || '',
    manga: esp.manga || '',
    vivos: esp.vivos || '',
    cuello: esp.cuello || '',
    punos: esp.punos || '',
    observaciones: esp.observaciones || '',
    tallas: (producto?.tallas || []).join(', '),
    validado: !producto?.pendiente_validar,
  })
  const [procesos, setProcesos] = useState(producto?.procesos || [])
  const toggleProceso = (key) => setProcesos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  const [fotos, setFotos] = useState(producto?.fotos || [])
  const [bordados, setBordados] = useState(() => (producto?.bordados || []).map((b) => ({ ...bordadoVacio(), ...b })))
  const [subiendo, setSubiendo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo, valor) => setV((prev) => ({ ...prev, [campo]: valor }))
  const setBordado = (i, patch) => setBordados((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  async function subir(files) {
    setSubiendo(true)
    setError(null)
    const subidas = []
    for (const file of files) {
      const { data, error: uploadError } = await uploadProductoFoto(clienteId, file)
      if (uploadError) {
        setError(uploadError)
        break
      }
      subidas.push(data)
    }
    setSubiendo(false)
    return subidas
  }

  async function handleFotos(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (files.length === 0) return
    const subidas = await subir(files)
    setFotos((prev) => [...prev, ...subidas])
  }

  async function handleFotoBordado(i, e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const [subida] = await subir([file])
    if (subida) setBordado(i, { foto_url: subida.url, foto_path: subida.path })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!v.nombre.trim()) return
    setSaving(true)
    setError(null)

    const especificaciones = { ...esp }
    for (const campo of ['manga', 'vivos', 'cuello', 'punos', 'observaciones']) {
      if (v[campo].trim()) especificaciones[campo] = v[campo].trim()
      else delete especificaciones[campo]
    }

    const { data: guardado, error: saveError } = await guardarProducto({
      id: producto?.id || null,
      clienteId,
      nombre: v.nombre.trim(),
      garment: v.garment.trim(),
      color: v.color.trim(),
      pantone: producto?.pantone,
      telaId: v.telaId || null,
      especificaciones,
      bordados: bordados
        .map((b) => ({ ...b, ubicacion: b.ubicacion.trim(), descripcion: b.descripcion.trim() }))
        .filter((b) => b.ubicacion || b.descripcion || b.foto_url),
      tallas: v.tallas.split(',').map((t) => t.trim()).filter(Boolean),
      tallasRango: producto?.tallas_rango,
      fotos,
      pendienteValidar: !v.validado,
      notasValidacion: v.validado ? null : producto?.notas_validacion,
    })
    if (saveError) {
      setSaving(false)
      setError(saveError)
      return
    }
    if (esMaquila) {
      const { error: procesosError } = await setProductoProcesos(guardado.id, ordenarProcesos(procesos))
      if (procesosError) {
        setSaving(false)
        setError(new Error(`El producto se guardó, pero no sus procesos: ${procesosError.message}`))
        return
      }
    }
    setSaving(false)
    onSaved?.()
  }

  const campoTexto = (campo, etiqueta, placeholder) => (
    <label>
      {etiqueta}
      <input type="text" className="input" placeholder={placeholder} value={v[campo]} onChange={(e) => set(campo, e.target.value)} />
    </label>
  )

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      {campoTexto('nombre', 'Nombre del producto', 'Ej. Playera polo blanca')}
      {esMaquila && (
        <div>
          <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
            Procesos que se le hacen
          </span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {PROCESOS_MAQUILA_OPTIONS.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={procesos.includes(opt.key)} onChange={() => toggleProceso(opt.key)} />
                {opt.label}
              </label>
            ))}
          </div>
          <p className="pantone-hint">Las órdenes de maquila de este producto nacen con estas etapas. Cambiarlas no afecta a las órdenes ya creadas.</p>
        </div>
      )}
      <div className="form-row">
        {campoTexto('garment', 'Prenda', 'Ej. Playera polo, Short…')}
        {campoTexto('color', 'Color')}
      </div>
      <div className="form-row">
        <label>
          Tela
          <select className="input" value={v.telaId} onChange={(e) => set('telaId', e.target.value)}>
            <option value="">Sin especificar</option>
            {telas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        {campoTexto('manga', 'Manga')}
      </div>
      <div className="form-row">
        {campoTexto('vivos', 'Vivos')}
        {campoTexto('cuello', 'Cuello')}
      </div>
      <div className="form-row">
        {campoTexto('punos', 'Puños')}
        {campoTexto('tallas', 'Tallas que se manejan (separadas por coma)', 'Ej. 2, 4, 6, 8, 10, 12, 14, XS, CH, M, L, XL')}
      </div>
      {campoTexto('observaciones', 'Observaciones')}

      <div>
        <span className="field-label">Fotos del producto</span>
        <div className="producto-fotos">
          {fotos.map((f, i) => (
            <div key={f.path || f.url} className="producto-fotos__item">
              <img src={f.url} alt="" />
              <button type="button" aria-label="Quitar foto" onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <label className="producto-fotos__agregar">
            + Foto
            <input type="file" accept="image/*" multiple hidden onChange={handleFotos} />
          </label>
        </div>
      </div>

      <div>
        <span className="field-label">Bordados (dónde va, qué es y la foto del logotipo)</span>
        <div className="producto-bordados">
          {bordados.map((b, i) => (
            <div key={i} className="producto-bordado">
              {b.foto_url ? (
                <div className="producto-fotos__item">
                  <img src={b.foto_url} alt="" />
                  <button type="button" aria-label="Quitar foto del logotipo" onClick={() => setBordado(i, { foto_url: '', foto_path: '' })}>
                    ×
                  </button>
                </div>
              ) : (
                <label className="producto-fotos__agregar">
                  + Foto del logo
                  <input type="file" accept="image/*" hidden onChange={(e) => handleFotoBordado(i, e)} />
                </label>
              )}
              <div className="producto-bordado__campos">
                <input
                  type="text"
                  className="input"
                  placeholder="Dónde va — Ej. Pecho izquierdo"
                  value={b.ubicacion}
                  onChange={(e) => setBordado(i, { ubicacion: e.target.value })}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Qué es — Ej. Logo del colegio"
                  value={b.descripcion}
                  onChange={(e) => setBordado(i, { descripcion: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="sizes-row__remove"
                aria-label="Quitar bordado"
                onClick={() => setBordados((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="add-size-btn" style={{ marginTop: 8 }} onClick={() => setBordados((prev) => [...prev, bordadoVacio()])}>
          + Agregar bordado
        </button>
      </div>

      <label className="producto-validado">
        <input type="checkbox" checked={v.validado} onChange={(e) => set('validado', e.target.checked)} />
        Datos validados (quita el aviso «Datos por validar»)
      </label>

      {subiendo && <p className="page-subtitle">Subiendo foto…</p>}
      {error && <p className="form-error">{error.message}</p>}
      <div className="order-form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving || subiendo || !v.nombre.trim()}>
          {saving ? 'Guardando…' : producto ? 'Guardar cambios' : 'Guardar producto'}
        </button>
      </div>
    </form>
  )
}

// Ficha completa de un producto: todas las fotos, especificaciones y bordados.
function ProductoDetalle({ producto, telas, esMaquila = false, canEdit, canDelete, onChanged, onClose }) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const esp = producto.especificaciones || {}
  const tela = telas.find((t) => t.id === producto.tela_id)
  const fotos = producto.fotos?.length ? producto.fotos : producto.foto_url ? [{ url: producto.foto_url }] : []

  const filas = [
    esMaquila && ['Procesos', etiquetaProcesos(producto.procesos) || 'Sin procesos marcados'],
    producto.garment && ['Prenda', producto.garment],
    producto.color && ['Color', producto.color],
    (tela || esp.tela_extra) && ['Tela', [tela?.nombre, esp.tela_extra].filter(Boolean).join(', ')],
    esp.manga && ['Manga', esp.manga],
    esp.vivos && ['Vivos', esp.vivos],
    esp.cuello && ['Cuello', esp.cuello],
    esp.punos && ['Puños', esp.punos],
    esp.bies && ['Bies', esp.bies],
    esp.hilo && ['Hilo', esp.hilo],
    esp.tecnicas?.length > 0 && ['Técnicas', esp.tecnicas.join(', ')],
    producto.tallas?.length > 0 && ['Tallas que se manejan', producto.tallas.join(', ')],
    esp.proveedor && ['Proveedor', esp.proveedor],
    esp.observaciones && ['Observaciones', esp.observaciones],
  ].filter(Boolean)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    const { error: deleteError } = await deleteProducto(producto.id)
    setBusy(false)
    if (deleteError) {
      setError(deleteError)
      return
    }
    onChanged?.()
    onClose?.()
  }

  if (editing) {
    return (
      <div className="card">
        <h3 className="section-title section-title--small">Editar: {producto.nombre}</h3>
        <ProductoForm
          producto={producto}
          clienteId={producto.cliente_id}
          telas={telas}
          esMaquila={esMaquila}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged?.()
          }}
        />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="producto-detalle__head">
        <h3 className="section-title section-title--small" style={{ margin: 0 }}>
          {producto.nombre}
        </h3>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          Cerrar
        </button>
      </div>
      {producto.pendiente_validar && (
        <p className="producto-aviso producto-aviso--bloque">
          ⚠️ Datos por validar{producto.notas_validacion ? ` — ${producto.notas_validacion}` : ''}
        </p>
      )}
      {fotos.length > 0 && (
        <div className="producto-detalle__fotos">
          {fotos.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
              <img src={f.url} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <dl className="detail-list producto-detalle__datos">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt>{etiqueta}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {producto.bordados?.length > 0 && (
        <>
          <span className="field-label">Bordados</span>
          <div className="producto-bordados">
            {producto.bordados.map((b, i) => (
              <div key={i} className="producto-bordado">
                {b.foto_url ? (
                  <a href={b.foto_url} target="_blank" rel="noreferrer" className="producto-fotos__item">
                    <img src={b.foto_url} alt="" loading="lazy" />
                  </a>
                ) : (
                  <span className="producto-fotos__agregar producto-fotos__agregar--vacio">Sin foto del logo</span>
                )}
                <div>
                  <b>{b.ubicacion || 'Sin ubicación'}</b>
                  {b.descripcion && <div className="page-subtitle" style={{ margin: 0 }}>{b.descripcion}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p className="form-error">{error.message}</p>}
      {(canEdit || canDelete) && (
        <div className="order-form__actions" style={{ marginTop: 14 }}>
          {canDelete &&
            (confirming ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                  onClick={handleDelete}
                  disabled={busy}
                >
                  {busy ? 'Eliminando…' : '¿Seguro? Eliminar'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  No
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
                Eliminar
              </button>
            ))}
          {canEdit && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing(true)}>
              {producto.pendiente_validar ? 'Completar datos' : 'Editar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CatalogoClienteContent() {
  const { clienteId } = useParams()
  const { role } = useAuth()
  const canEdit = canCreateProducto(role)
  const canDelete = canManageCatalogs(role)

  const [cliente, setCliente] = useState(null)
  const [telas, setTelas] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [abiertoId, setAbiertoId] = useState(null)
  const [creando, setCreando] = useState(false)

  const load = useCallback(async () => {
    const { data, error: loadError } = await fetchProductosByCliente(clienteId)
    if (loadError) setError(loadError)
    setProductos(data || [])
    setLoading(false)
  }, [clienteId])

  useEffect(() => {
    fetchClienteById(clienteId).then(({ data, error: clienteError }) => {
      if (clienteError) setError(clienteError)
      setCliente(data)
    })
    fetchTelas().then(({ data }) => setTelas(data || []))
    load()
  }, [clienteId, load])

  if (loading) return <Loading label="Cargando catálogo…" />
  if (error) return <ErrorState error={error} />

  const pendientes = productos.filter((p) => p.pendiente_validar).length
  const visibles = soloPendientes ? productos.filter((p) => p.pendiente_validar) : productos
  const abierto = productos.find((p) => p.id === abiertoId)
  const esMaquila = esClienteMaquila(cliente)

  return (
    <div className="page">
      <Link to="/catalogos" className="back-link">
        ← Catálogos
      </Link>
      <h2 className="section-title">{cliente?.nombre || 'Cliente'}</h2>
      <p className="page-subtitle">
        {productos.length} producto(s) en el catálogo{pendientes > 0 ? ` · ${pendientes} con datos por validar` : ''}
      </p>
      {esMaquila && <p className="pantone-hint">Cliente de maquila: cada producto indica qué procesos se le hacen.</p>}

      <div className="catalogo-cliente__barra">
        <label className="producto-validado">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo pendientes de validar ({pendientes})
        </label>
        {canEdit && !creando && (
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setCreando(true)}>
            + Producto nuevo
          </button>
        )}
      </div>

      {creando && (
        <div className="card">
          <h3 className="section-title section-title--small">Producto nuevo de {cliente?.nombre}</h3>
          <ProductoForm
            clienteId={clienteId}
            telas={telas}
            esMaquila={esMaquila}
            onCancel={() => setCreando(false)}
            onSaved={() => {
              setCreando(false)
              load()
            }}
          />
        </div>
      )}

      {abierto && (
        <ProductoDetalle
          key={abierto.id}
          producto={abierto}
          telas={telas}
          esMaquila={esMaquila}
          canEdit={canEdit}
          canDelete={canDelete}
          onChanged={load}
          onClose={() => setAbiertoId(null)}
        />
      )}

      {visibles.length === 0 ? (
        <p className="page-subtitle">
          {soloPendientes ? 'No hay productos pendientes de validar.' : 'Este cliente todavía no tiene productos en el catálogo.'}
        </p>
      ) : (
        <div className="producto-picker__grid producto-picker__grid--grande">
          {visibles.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'producto-card' + (p.id === abiertoId ? ' producto-card--activo' : '')}
              onClick={() => {
                setAbiertoId(p.id)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              {p.foto_url ? <img src={p.foto_url} alt="" loading="lazy" /> : <span className="producto-card__sin-foto">Sin foto</span>}
              <span className="producto-card__nombre">{p.nombre}</span>
              <span className="producto-card__prenda">{resumenProducto(p, telas)}</span>
              {esMaquila && <span className="producto-card__prenda">{etiquetaProcesos(p.procesos) || '⚠️ Sin procesos'}</span>}
              {p.pendiente_validar && <span className="producto-aviso">⚠️ Datos por validar</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CatalogoClientePage() {
  return (
    <RequireRole allow={canViewCatalogos}>
      <CatalogoClienteContent />
    </RequireRole>
  )
}
