import { useState } from 'react'
import PdfPreviewModal from '../pdf/PdfPreviewModal'

// V109 — botón "Imprimir X" reusado en las 3 secciones de catálogo de
// Admin producción (Operaciones/Operadoras/Reglas de premios): genera el
// PDF al momento (sin guardar nada) y muestra la vista previa, igual que
// el resto de los imprimibles de la app.
export default function ImprimirCatalogo({ label, build, fileName }) {
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  async function imprimir() {
    setGenerando(true)
    setError(null)
    try {
      const blob = await build()
      setPreview({ blob, fileName })
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message}`)
    }
    setGenerando(false)
  }

  return (
    <>
      <button type="button" className="btn btn--ghost btn--small" onClick={imprimir} disabled={generando}>
        {generando ? 'Generando…' : label}
      </button>
      {error && <p className="form-error">{error}</p>}
      {preview && <PdfPreviewModal blob={preview.blob} fileName={preview.fileName} onClose={() => setPreview(null)} />}
    </>
  )
}
