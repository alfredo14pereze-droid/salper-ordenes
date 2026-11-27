import { useEffect, useState } from 'react'

// Modal reusable de vista previa de PDF (V26, ver Parte 4 — "en vez de
// forzar la descarga directa, muestra primero una vista previa"). Se
// aplica a todos los PDFs de la app (confirmación de orden, remisión):
// el botón genera el blob, este modal lo muestra en un <iframe> (los
// navegadores renderizan PDFs nativos ahí) y solo baja el archivo cuando
// el usuario le da al botón "Descargar" de aquí adentro.
export default function PdfPreviewModal({ blob, fileName, onClose }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (!blob) return null

  function handleDownload() {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    // 2026-11-27 — estilos a clases (.pdf-preview en index.css) para poder
    // ajustarlo en el celular: sin margen, alto de lo visible y botones a la mano.
    <div className="pdf-preview" onClick={onClose}>
      <div className="pdf-preview__panel" onClick={(e) => e.stopPropagation()}>
        <div className="pdf-preview__head">
          <span className="section-title section-title--small pdf-preview__nombre">
            {fileName}
          </span>
          <div className="pdf-preview__botones">
            <button type="button" className="btn btn--primary btn--small" onClick={handleDownload}>
              Descargar
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
        {url && <iframe title={fileName} src={url} style={{ flex: 1, border: 'none' }} />}
      </div>
    </div>
  )
}
