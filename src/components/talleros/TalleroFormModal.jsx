import { useState } from 'react'
import Modal from './Modal'
import FileDropLabel from '../common/FileDropLabel'
import {
  createTallero,
  updateTallero,
  uploadTalleroFoto,
  COLORES_TALLERO,
  ESTADOS_CONTENIDO,
  UBICACIONES,
} from '../../services/tallerosService'

// V63 — alta y edición (admin). En alta el código TAL-### lo asigna el
// servidor; el estado inicial solo puede ser disponible o en reparación
// (para prestarlo se usa "Prestar").
export default function TalleroFormModal({ tallero, productos, onClose, onDone }) {
  const editing = !!tallero
  const [v, setV] = useState({
    productoId: tallero?.producto_id || '',
    tallas: tallero?.tallas || '',
    tallasFaltantes: tallero?.tallas_faltantes || '',
    estadoContenido: tallero?.estado_contenido || 'completo',
    color: tallero?.color || '',
    tela: tallero?.tela || '',
    ubicacion: tallero?.ubicacion || '',
    estanteria: tallero?.estanteria || '',
    observaciones: tallero?.observaciones || '',
    estadoUso: tallero?.estado_uso || 'disponible',
  })
  const [fotoFile, setFotoFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const prestado = tallero?.estado_uso === 'prestado'

  function set(field, value) {
    setV((x) => ({ ...x, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    let foto = null
    if (fotoFile) {
      const { data, error: upErr } = await uploadTalleroFoto(fotoFile)
      if (upErr) {
        setSaving(false)
        return setError(upErr)
      }
      foto = data
    }
    const payload = { ...v, tallasFaltantes: v.estadoContenido === 'incompleto' ? v.tallasFaltantes : '' }
    const { error: err } = editing ? await updateTallero(tallero.id, payload, foto) : await createTallero(payload, foto)
    setSaving(false)
    if (err) return setError(err)
    onDone()
  }

  return (
    <Modal title={editing ? `Editar ${tallero.codigo}` : 'Nuevo tallero'} onClose={onClose}>
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            Prenda *
            <select className="input" value={v.productoId} onChange={(e) => set('productoId', e.target.value)}>
              <option value="">Selecciona…</option>
              {productos
                .filter((p) => p.activo || p.id === v.productoId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Color
            <select className="input" value={v.color} onChange={(e) => set('color', e.target.value)}>
              <option value="">—</option>
              {COLORES_TALLERO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Tallas que trae
            <input type="text" className="input" value={v.tallas} onChange={(e) => set('tallas', e.target.value)} placeholder="Ej. XS-XL" />
          </label>
          <label>
            Tela
            <input type="text" className="input" value={v.tela} onChange={(e) => set('tela', e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Contenido
            <select className="input" value={v.estadoContenido} onChange={(e) => set('estadoContenido', e.target.value)}>
              {ESTADOS_CONTENIDO.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {v.estadoContenido === 'incompleto' && (
            <label>
              Tallas faltantes
              <input type="text" className="input" value={v.tallasFaltantes} onChange={(e) => set('tallasFaltantes', e.target.value)} placeholder="Ej. 2XL, 3XL" />
            </label>
          )}
        </div>
        <div className="form-row">
          <label>
            Ubicación
            <select className="input" value={v.ubicacion} onChange={(e) => set('ubicacion', e.target.value)}>
              <option value="">—</option>
              {UBICACIONES.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estantería
            <input type="text" className="input" value={v.estanteria} onChange={(e) => set('estanteria', e.target.value)} />
          </label>
        </div>
        <label>
          Estado
          {prestado ? (
            <input type="text" className="input" value="Prestado (regístralo como devuelto para cambiarlo)" disabled />
          ) : (
            <select className="input" value={v.estadoUso} onChange={(e) => set('estadoUso', e.target.value)}>
              <option value="disponible">Disponible</option>
              <option value="en_reparacion">En reparación</option>
            </select>
          )}
        </label>
        <label>
          Observaciones
          <input type="text" className="input" value={v.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
        </label>
        <div>
          <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>
            Foto
          </span>
          <FileDropLabel className="btn btn--secondary btn--small" style={{ display: 'inline-flex' }} accept="image/*" onFiles={(f) => setFotoFile(f[0])}>
            {fotoFile ? fotoFile.name : editing && tallero.foto_url ? 'Cambiar foto (o arrastra aquí)' : 'Subir foto (o arrastra aquí)'}
          </FileDropLabel>
        </div>
        {error && <p className="form-error">{error.message}</p>}
        <div className="order-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving || !v.productoId}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
