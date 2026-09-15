import { useFileDrop } from '../../hooks/useFileDrop'

// V52 — reemplaza el patrón repetido de <label>...<input type="file"
// hidden/>...</label> que ya existía en varios lados (fotos, PDFs de
// documentos, foto de bordado, etc.): mismo look y mismo click-para-
// elegir-archivo de siempre, pero ahora también se le puede soltar un
// archivo arrastrado encima. `onFiles` recibe un array de File[] tanto
// si viene del selector nativo como si viene de un arrastre.
export default function FileDropLabel({ className, style, accept, multiple, disabled, onFiles, children }) {
  const { dragActive, dropHandlers } = useFileDrop(onFiles, { disabled })

  function handleInputChange(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length > 0) onFiles(files)
  }

  return (
    <label className={className + (dragActive ? ' dropzone--active' : '')} style={style} {...dropHandlers}>
      <input type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={handleInputChange} hidden />
      {children}
    </label>
  )
}
