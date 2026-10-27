import RequireRole from '../components/common/RequireRole'
import { canUsarCotizador } from '../utils/permissions'
import Cotizador from '../components/cotizador/Cotizador'

// Cotizador de destajo por prenda (solo admin_general y admin_fabrica).
export default function CotizadorPage() {
  return (
    <RequireRole allow={canUsarCotizador}>
      <div className="page">
        <h2 className="section-title">Cotizador</h2>
        <Cotizador />
      </div>
    </RequireRole>
  )
}
