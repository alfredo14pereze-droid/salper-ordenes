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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(22, 19, 15, 0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          width: '100%',
          maxWidth: 760,
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-border, #e5e1d8)',
          }}
        >
          <span className="section-title section-title--small" style={{ margin: 0 }}>
            {fileName}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
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
