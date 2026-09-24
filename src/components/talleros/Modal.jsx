import { useEffect } from 'react'

// V63 — modal simple (overlay + tarjeta); se cierra con Esc o al tocar fuera.
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="mt-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mt-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mt-modal__head">
          <h3>{title}</h3>
          <button type="button" className="item-block__remove" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
