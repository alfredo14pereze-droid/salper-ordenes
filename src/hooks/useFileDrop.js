import { useCallback, useState } from 'react'

// V52 — arrastrar y soltar un archivo (foto o PDF) directo sobre el botón
// de subir, en vez de forzar a abrir el explorador de archivos. Genérico:
// no reemplaza el <input type="file"> normal (sigue funcionando con
// clic), solo le agrega los manejadores de drag-and-drop al elemento que
// envuelve. `onFiles` recibe un array de File[], igual que si vinieran
// de `Array.from(e.target.files)`.
export function useFileDrop(onFiles, { disabled = false } = {}) {
  const [dragActive, setDragActive] = useState(false)

  const onDragOver = useCallback(
    (e) => {
      if (disabled) return
      e.preventDefault()
    },
    [disabled]
  )

  const onDragEnter = useCallback(
    (e) => {
      if (disabled) return
      e.preventDefault()
      setDragActive(true)
    },
    [disabled]
  )

  const onDragLeave = useCallback(
    (e) => {
      if (disabled) return
      e.preventDefault()
      // Los hijos del propio dropzone (texto, iconos) también disparan
      // dragleave al pasar el mouse entre ellos — solo apagar el
      // resaltado cuando de verdad se sale del elemento completo.
      if (e.currentTarget.contains(e.relatedTarget)) return
      setDragActive(false)
    },
    [disabled]
  )

  const onDrop = useCallback(
    (e) => {
      if (disabled) return
      e.preventDefault()
      setDragActive(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) onFiles(files)
    },
    [disabled, onFiles]
  )

  return { dragActive, dropHandlers: { onDragOver, onDragEnter, onDragLeave, onDrop } }
}
