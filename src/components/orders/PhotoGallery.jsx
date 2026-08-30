import { useState } from 'react'
import { uploadOrderPhotos, removeOrderPhoto, MAX_PHOTO_SIZE_MB } from '../../services/photosService'
import { useAuth } from '../../contexts/AuthContext'

// Fotos de referencia ya guardadas en una orden (order.reference_photos),
// con opción de agregar más y de eliminar. Vive en el detalle de la orden.
// Subir/borrar requiere sesión (cualquier rol, no hay distinción aquí) —
// como invitado solo se puede ver la galería.
export default function PhotoGallery({ order, onUpdated }) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const photos = order.reference_photos || []

  async function handleFileInput(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    setUploading(true)
    setError(null)
    const { error: uploadError } = await uploadOrderPhotos(order.id, files)
    setUploading(false)

    if (uploadError) {
      setError(uploadError)
      return
    }
    onUpdated?.()
  }

  async function handleRemove(photo) {
    setError(null)
    const { error: removeError } = await removeOrderPhoto(order.id, photo)
    if (removeError) {
      setError(removeError)
      return
    }
    onUpdated?.()
  }

  return (
    <div className="photo-gallery">
      <div className="photo-gallery__header">
        <h4>Fotos de especificación</h4>
        {user && (
          <label className="btn btn--secondary btn--small">
            <input type="file" accept="image/*" multiple onChange={handleFileInput} hidden disabled={uploading} />
            {uploading ? 'Subiendo…' : '+ Agregar fotos'}
          </label>
        )}
      </div>

      {error && <p className="form-error">{error.message}</p>}

      {photos.length === 0 ? (
        <p className="photo-gallery__empty">Sin fotos todavía (máx. {MAX_PHOTO_SIZE_MB}MB por imagen).</p>
      ) : (
        <div className="photo-gallery__grid">
          {photos.map((photo) => (
            <div key={photo.path} className="photo-gallery__thumb">
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} alt={photo.name} />
              </a>
              {user && (
                <button type="button" onClick={() => handleRemove(photo)} aria-label="Eliminar foto">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
