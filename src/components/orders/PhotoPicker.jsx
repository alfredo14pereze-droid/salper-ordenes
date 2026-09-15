import { useEffect, useState } from 'react'
import FileDropLabel from '../common/FileDropLabel'

// Selector de fotos para el formulario de "Nueva orden": la orden todavía
// no existe (no hay order_id para subir a Storage), así que aquí solo se
// guardan los archivos en memoria y se muestran previews. La subida real
// ocurre después de crear la orden (ver NewOrderPage.jsx +
// services/photosService.js).
export default function PhotoPicker({ files, onChange }) {
  const [previews, setPreviews] = useState([])

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  function handleNewFiles(newFiles) {
    onChange([...files, ...newFiles])
  }

  function removeAt(index) {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="photo-picker">
      <FileDropLabel className="photo-picker__add" accept="image/*" multiple onFiles={handleNewFiles}>
        + Agregar fotos (o arrastra aquí)
      </FileDropLabel>

      {previews.length > 0 && (
        <div className="photo-picker__grid">
          {previews.map((url, i) => (
            <div key={url} className="photo-picker__thumb">
              <img src={url} alt={files[i].name} />
              <button type="button" onClick={() => removeAt(i)} aria-label="Quitar foto">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
