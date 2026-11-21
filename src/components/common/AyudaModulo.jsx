import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ayudaDeModulo } from '../../config/ayudaModulos'
import './AyudaModulo.css'

// Botón "¿Cómo se usa?" del encabezado de cada módulo. Los textos viven en
// src/config/ayudaModulos.js (una entrada por `id`). Si el id no tiene
// entrada, no se pinta nada — nunca rompe la página.
//
// Uso: dentro del título del módulo, a la derecha del texto:
//   <h2 className="section-title">Inventario <AyudaModulo id="inventario" /></h2>
//
// El panel se monta en <body> (portal): lateral desde la derecha en
// escritorio, hoja desde abajo en celular. Se cierra con la X, con Esc o
// tocando fuera. Solo frontend: no lee ni escribe nada en la base.
export default function AyudaModulo({ id }) {
  const ayuda = ayudaDeModulo(id)
  const [abierto, setAbierto] = useState(false)
  const botonRef = useRef(null)
  const cerrarRef = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', onKey)
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const boton = botonRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowAntes
      boton?.focus()
    }
  }, [abierto])

  if (!ayuda) return null

  const tituloId = `ayuda-titulo-${ayuda.id}`
  const tips = (ayuda.tips || []).filter(Boolean)

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className="ayuda-modulo__boton"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        aria-label={`¿Cómo se usa ${ayuda.titulo}?`}
        title="¿Cómo se usa?"
      >
        <span className="ayuda-modulo__icono" aria-hidden="true">?</span>
        <span className="ayuda-modulo__texto">¿Cómo se usa?</span>
      </button>
      {abierto && createPortal(
        <div className="ayuda-modulo__fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}>
          <div className="ayuda-modulo__panel" role="dialog" aria-modal="true" aria-labelledby={tituloId}>
            <div className="ayuda-modulo__cabeza">
              <h2 id={tituloId} className="ayuda-modulo__titulo">{ayuda.titulo}</h2>
              <button ref={cerrarRef} type="button" className="ayuda-modulo__cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar ayuda">
                ×
              </button>
            </div>
            <div className="ayuda-modulo__cuerpo">
              <section>
                <h3>¿Qué es?</h3>
                <p>{ayuda.queEs}</p>
              </section>
              <section>
                <h3>¿Para qué sirve?</h3>
                <p>{ayuda.paraQueSirve}</p>
              </section>
              <section>
                <h3>¿Cómo se usa?</h3>
                <ol>
                  {ayuda.pasos.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
              </section>
              {tips.length > 0 && (
                <section>
                  <h3>Tips</h3>
                  <ul>
                    {tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </section>
              )}
              {ayuda.roles?.length > 0 && (
                <section>
                  <h3>¿Quién lo usa?</h3>
                  <div className="ayuda-modulo__roles">
                    {ayuda.roles.map((r) => <span key={r} className="ayuda-modulo__rol">{r}</span>)}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
