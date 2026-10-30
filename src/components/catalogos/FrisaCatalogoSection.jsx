import { useCallback, useEffect, useState } from 'react'
import { Loading, ErrorState } from '../common/States'
import BuscadorNombre from '../common/BuscadorNombre'
import { coincideNombre } from '../../utils/buscarPorNombre'
import { fetchProductosFrisa, guardarProductoFrisa } from '../../services/frisaService'
import { PROCESOS_FRISA_OPTIONS } from '../../lib/constants'
import {
  ORIGENES_FRISA,
  etiquetaProceso,
  moverProceso,
  procesosParaGuardar,
  secuenciaDeProducto,
  validarProductoFrisa,
} from '../../utils/frisa'

// V155 — Catálogos → Frisa: productos de Frisa con su secuencia de
// procesos, en orden. La secuencia se copia a cada orden al crearla: editar
// un producto solo afecta a las órdenes que se creen después.

const vacio = {
  codigo: '',
  nombre: '',
  origen: 'confeccionada',
  tallasRango: 'S-3XL',
  color: '',
  tela: '',
  proveedor: '',
  descripcion: '',
  activo: true,
  procesos: [{ proceso: 'terminado', impresiones: '', notas: '' }],
}

function formDeProducto(p) {
  return {
    id: p.id,
    codigo: p.codigo || '',
    nombre: p.nombre || '',
    origen: p.origen || 'confeccionada',
    tallasRango: p.tallas_rango || '',
    color: p.color || '',
    tela: p.tela || '',
    proveedor: p.proveedor || '',
    descripcion: p.descripcion || '',
    activo: p.activo !== false,
    procesos: secuenciaDeProducto(p).map((x) => ({ proceso: x.proceso, impresiones: x.impresiones ?? '', notas: x.notas || '' })),
  }
}

// Lista ordenable de procesos: subir, bajar, quitar y agregar.
function SecuenciaEditor({ procesos, onChange, disabled }) {
  const disponibles = PROCESOS_FRISA_OPTIONS.filter((o) => !procesos.some((p) => p.proceso === o.key))
  const set = (i, patch) => onChange(procesos.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  return (
    <div className="frisa-secuencia">
      {procesos.map((p, i) => (
        <div key={p.proceso} className="frisa-secuencia__paso">
          <span className="frisa-secuencia__n">{i + 1}</span>
          <strong className="frisa-secuencia__nombre">{etiquetaProceso(p.proceso)}</strong>
          {p.proceso === 'impresion' && (
            <label className="frisa-secuencia__impresiones">
              Impresiones
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="input"
                value={p.impresiones}
                onChange={(e) => set(i, { impresiones: e.target.value })}
                disabled={disabled}
              />
            </label>
          )}
          <input
            type="text"
            className="input frisa-secuencia__notas"
            placeholder="Notas (opcional)"
            value={p.notas}
            onChange={(e) => set(i, { notas: e.target.value })}
            disabled={disabled}
            aria-label={`Notas de ${etiquetaProceso(p.proceso)}`}
          />
          <span className="frisa-secuencia__botones">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(moverProceso(procesos, i, -1))} disabled={disabled || i === 0} aria-label="Subir">
              ↑
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(moverProceso(procesos, i, 1))} disabled={disabled || i === procesos.length - 1} aria-label="Bajar">
              ↓
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange(procesos.filter((_, j) => j !== i))} disabled={disabled} aria-label="Quitar">
              ×
            </button>
          </span>
        </div>
      ))}
      {disponibles.length > 0 && (
        <select
          className="input frisa-secuencia__agregar"
          value=""
          disabled={disabled}
          onChange={(e) => e.target.value && onChange([...procesos, { proceso: e.target.value, impresiones: e.target.value === 'impresion' ? '1' : '', notas: '' }])}
        >
          <option value="">+ Agregar proceso…</option>
          {disponibles.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function ProductoForm({ inicial, onSaved, onCancel }) {
  const [form, setForm] = useState(inicial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  async function handleSubmit(e) {
    e.preventDefault()
    const falta = validarProductoFrisa(form)
    if (falta) {
      setError(new Error(falta))
      return
    }
    setSaving(true)
    setError(null)
    const { error: saveError } = await guardarProductoFrisa({ ...form, procesos: procesosParaGuardar(form.procesos) })
    setSaving(false)
    if (saveError) {
      setError(saveError)
      return
    }
    onSaved?.()
  }

  return (
    <form className="order-form" onSubmit={handleSubmit} style={{ width: '100%', marginTop: 10 }}>
      <div className="form-row">
        <label>
          Código *
          <input type="text" className="input" value={form.codigo} onChange={(e) => set('codigo', e.target.value.toUpperCase())} placeholder="FR-CAM-BAS" autoFocus />
        </label>
        <label>
          Nombre *
          <input type="text" className="input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Origen *
          <select className="input" value={form.origen} onChange={(e) => set('origen', e.target.value)}>
            {ORIGENES_FRISA.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tallas
          <input type="text" className="input" value={form.tallasRango} onChange={(e) => set('tallasRango', e.target.value)} placeholder="S-3XL" />
        </label>
      </div>
      <div className="form-row">
        <label>
          Color
          <input type="text" className="input" value={form.color} onChange={(e) => set('color', e.target.value)} />
        </label>
        <label>
          Tela
          <input type="text" className="input" value={form.tela} onChange={(e) => set('tela', e.target.value)} />
        </label>
      </div>
      <label>
        Proveedor
        <input type="text" className="input" value={form.proveedor} onChange={(e) => set('proveedor', e.target.value)} />
      </label>
      <label>
        Descripción
        <textarea className="input" rows={2} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
      </label>
      <div>
        <span className="field-label" style={{ marginBottom: 6, display: 'block' }}>
          Procesos, en orden *
        </span>
        <SecuenciaEditor procesos={form.procesos} onChange={(v) => set('procesos', v)} disabled={saving} />
        <p className="pantone-hint">Cada proceso le aparece a su estación cuando el anterior está terminado. Los cambios aplican a las órdenes nuevas.</p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} />
        Activo (se puede elegir en órdenes nuevas)
      </label>
      {error && <p className="form-error">{error.message}</p>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar producto'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ProductoRow({ producto, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false)
  const pasos = secuenciaDeProducto(producto)
  const datos = [
    producto.origen === 'comprada' ? 'Comprada' : 'Confeccionada',
    producto.tallas_rango,
    producto.color,
    producto.tela && `Tela: ${producto.tela}`,
    producto.proveedor && `Proveedor: ${producto.proveedor}`,
  ].filter(Boolean)

  return (
    <div className="document-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{producto.codigo}</strong> <span>{producto.nombre}</span>
        {!producto.activo && <span className="badge badge--danger" style={{ marginLeft: 6 }}>Dado de baja</span>}
        <p className="pantone-hint" style={{ marginTop: 2 }}>{datos.join(' · ')}</p>
        <ol className="frisa-pasos">
          {pasos.map((p) => (
            <li key={p.proceso}>
              {etiquetaProceso(p.proceso)}
              {p.impresiones ? <b> ×{p.impresiones}</b> : null}
              {p.notas ? <span className="pantone-hint"> — {p.notas}</span> : null}
            </li>
          ))}
        </ol>
        {producto.descripcion && <p className="pantone-hint">{producto.descripcion}</p>}
        {editing && (
          <ProductoForm
            inicial={formDeProducto(producto)}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false)
              onSaved?.()
            }}
          />
        )}
      </div>
      {canEdit && !editing && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
          Editar
        </button>
      )}
    </div>
  )
}

export default function FrisaCatalogoSection({ canEdit }) {
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [agregando, setAgregando] = useState(false)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await fetchProductosFrisa()
    if (fetchError) setError(fetchError)
    else {
      setProductos(data || [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visibles = productos.filter((p) => coincideNombre(busqueda, p.nombre, p.codigo))

  return (
    <div className="card">
      <div className="section-header" style={abierto ? undefined : { marginBottom: 0 }}>
        <button type="button" className="catalogo-toggle" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          <span className="catalogo-toggle__flecha">{abierto ? '▾' : '▸'}</span>
          <h3 className="section-title section-title--small" style={{ marginBottom: 0 }}>
            Frisa
          </h3>
          {!loading && <span className="section-count">{busqueda.trim() && abierto ? `${visibles.length} de ${productos.length}` : productos.length}</span>}
        </button>
        {abierto && canEdit && !agregando && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setAgregando(true)}>
            + Agregar producto
          </button>
        )}
      </div>
      {abierto && agregando && (
        <ProductoForm
          inicial={vacio}
          onCancel={() => setAgregando(false)}
          onSaved={() => {
            setAgregando(false)
            load()
          }}
        />
      )}
      {abierto && loading && <Loading label="Cargando…" />}
      {abierto && error && <ErrorState error={error} onRetry={load} />}
      {abierto && !loading && !error && productos.length === 0 && <p className="page-subtitle">No hay productos de Frisa todavía.</p>}
      {abierto && !loading && !error && productos.length > 0 && (
        <BuscadorNombre value={busqueda} onChange={setBusqueda} placeholder="Buscar en Frisa por nombre o código" autoFocus />
      )}
      {abierto && !loading && !error && productos.length > 0 && visibles.length === 0 && (
        <p className="page-subtitle">Ninguno coincide con “{busqueda.trim()}”.</p>
      )}
      {abierto && !loading && !error && visibles.length > 0 && (
        <div className="document-list">
          {visibles.map((p) => (
            <ProductoRow key={p.id} producto={p} canEdit={canEdit} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  )
}
