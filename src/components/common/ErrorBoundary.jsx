import { Component } from 'react'
import { Link } from 'react-router-dom'

// V59 — red de seguridad: sin esto, UN error al pintar cualquier pantalla
// dejaba TODA la app en blanco (ni menú lateral, ni mensaje — así se vio
// en "Nueva orden" cuando una orden traía una talla nula). Ahora el error
// se queda dentro del área de contenido: el menú sigue ahí, se explica que
// algo falló y se puede volver al Dashboard o recargar. Se remonta solo al
// cambiar de ruta (ver `key` en AppLayout.jsx).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[SALPER] Error al pintar la pantalla:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="page page--narrow">
        <div className="state-message state-message--error">
          <p>
            <strong>Esta pantalla tuvo un problema y no se pudo mostrar.</strong>
          </p>
          <p>
            No se perdió nada de lo guardado. Intenta recargar la página; si sigue igual, avísale a quien administra el
            sistema con este detalle:
          </p>
          <p className="pantone-hint">{String(this.state.error?.message || this.state.error)}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              Recargar la página
            </button>
            <Link to="/" className="btn btn--ghost" onClick={() => this.setState({ error: null })}>
              Ir al Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
