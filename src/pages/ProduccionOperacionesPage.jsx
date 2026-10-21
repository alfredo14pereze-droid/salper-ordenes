import RequireRole from '../components/common/RequireRole'
import { canVerOperacionesProduccion } from '../utils/permissions'
import OperacionesAdmin from '../components/produccion/OperacionesAdmin'

// 2026-10-21 — catálogo de operaciones de solo consulta (pedido de Alfredo para
// Juanis): todas las operaciones, con filtro por prenda y búsqueda por folio u
// operación. No se puede modificar nada; eso sigue en Admin producción.
export default function ProduccionOperacionesPage() {
  return (
    <RequireRole allow={canVerOperacionesProduccion}>
      <div className="page">
        <h2 className="section-title">Operaciones de producción</h2>
        <p className="form-hint">Solo consulta. Para cambiar una operación, avisa a un administrador.</p>
        <OperacionesAdmin consulta />
      </div>
    </RequireRole>
  )
}
