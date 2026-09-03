import { useState } from 'react'
import { createPendingItem, uploadPendingItemPhoto } from '../../services/pendingItemsService'

const TIPOS = [
  { key: 'general', label: 'General' },
  { key: 'reparacion', label: 'Orden de reparación' },
]

// "Orden de reparación" es un tipo particular de pendiente: una prenda
// concreta que se manda a reparar, con su talla/cantidad y una foto de qué
// hay que arreglarle — el resto de los pendientes (trámites, compras, etc.)
// se quedan como estaban, sin estos campos.
export default function PendingItemForm({ onCreated }) {
  const [tipo, setTipo] = useState('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [garment, setGarment] = useState('')
  const [talla, setTalla] = useState('')
  const [cantidad, setCantidad] = useState('')
  // null = todavía no se elige ninguno de los dos — se exige elegir uno
  // antes de poder crear el pendiente (ver handleSubmit).
  const [inventariado, setInventariado] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)

  const isReparacion = tipo === 'reparacion'

  function resetForm() {
    setTipo('general')
    setTitle('')
    setDescription('')
    setCategory('')
    setGarment('')
    setTalla('')
    setCantidad('')
    setInventariado(null)
    setPhoto(null)
    setPhotoPreview(null)
  }

  function handlePhotoInput(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setError(new Error('Escribe al menos un título.'))
      return
    }
    if (isReparacion && !garment.trim()) {
      setError(new Error('Indica qué prenda se va a reparar.'))
      return
    }
    if (isReparacion && inventariado === null) {
      setError(new Error('Selecciona "Inventariado" o "No inventariado".'))
      return
    }

    setSaving(true)
    setError(null)

    let fotoUrl = null
    let fotoPath = null
    if (isReparacion && photo) {
      const { data: uploaded, error: uploadError } = await uploadPendingItemPhoto(photo)
      if (uploadError) {
        setSaving(false)
        setError(uploadError)
        return
      }
      fotoUrl = uploaded.url
      fotoPath = uploaded.path
    }

    const { error: createError } = await createPendingItem({
      title: title.trim(),
      description: description.trim(),
      category: isReparacion ? 'Orden de reparación' : category.trim(),
      garment: isReparacion ? garment.trim() : null,
      talla: isReparacion ? talla.trim() : null,
      cantidad: isReparacion && cantidad ? Number(cantidad) : null,
      fotoUrl,
      fotoPath,
      inventariado: isReparacion ? inventariado : null,
    })
    setSaving(false)

    if (createError) {
      setError(createError)
      return
    }

    resetForm()
    setOpen(false)
    onCreated?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        + Nuevo pendiente
      </button>
    )
  }

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <div className="order-filters__group">
        <span className="order-filters__label">Tipo</span>
        <div className="order-filters__chips">
          {TIPOS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={'chip' + (tipo === t.key ? ' chip--active' : '')}
              onClick={() => setTipo(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label>
          Título *
          <input
            type="text"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isReparacion ? 'Ej. Chamarra con cierre descosido' : 'Ej. Máquina de bordado en reparación'}
          />
        </label>
        {!isReparacion && (
          <label>
            Categoría
            <input
              type="text"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej. Reparación, Compra, Trámite…"
            />
          </label>
        )}
      </div>

      {isReparacion && (
        <div className="form-row-3">
          <label>
            Prenda *
            <input
              type="text"
              className="input"
              value={garment}
              onChange={(e) => setGarment(e.target.value)}
              placeholder="Ej. Playera polo"
            />
          </label>
          <label>
            Talla
            <input
              type="text"
              className="input"
              value={talla}
              onChange={(e) => setTalla(e.target.value)}
              placeholder="Ej. M"
            />
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              className="input"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="1"
            />
          </label>
        </div>
      )}

      {isReparacion && (
        <div className="order-filters__group">
          <span className="order-filters__label">Inventariado *</span>
          <div className="order-filters__chips">
            <button
              type="button"
              className={'chip' + (inventariado === true ? ' chip--active' : '')}
              onClick={() => setInventariado(true)}
            >
              Inventariado
            </button>
            <button
              type="button"
              className={'chip' + (inventariado === false ? ' chip--active' : '')}
              onClick={() => setInventariado(false)}
            >
              No inventariado
            </button>
          </div>
        </div>
      )}

      <label>
        {isReparacion ? 'Comentarios — qué se necesita de esta prenda' : 'Detalles'}
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            isReparacion
              ? 'Ej. Cambiar cierre, quedó descosido del lado izquierdo…'
              : 'Con quién quedó, fecha esperada de regreso, etc.'
          }
        />
      </label>

      {isReparacion && (
        <div className="photo-picker">
          {!photoPreview ? (
            <label className="photo-picker__add">
              <input type="file" accept="image/*" onChange={handlePhotoInput} hidden />
              + Agregar foto
            </label>
          ) : (
            <div className="photo-picker__grid">
              <div className="photo-picker__thumb">
                <img src={photoPreview} alt="Foto de la prenda" />
                <button type="button" onClick={removePhoto} aria-label="Quitar foto">
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="form-error">{error.message}</p>}

      <div className="order-form__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            resetForm()
            setOpen(false)
          }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Agregar pendiente'}
        </button>
      </div>
    </form>
  )
}
