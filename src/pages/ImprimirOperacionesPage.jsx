import { useSearchParams } from 'react-router-dom'
import RequireRole from '../components/common/RequireRole'
import { canVerOperacionesProduccion, canViewProduccionMontos } from '../utils/permissions'
import { useAuth } from '../contexts/AuthContext'
import HojaOperacionesPrenda from '../components/impresion/HojaOperacionesPrenda'

// Hoja de impresión de las operaciones de una prenda (?prenda=...). La ven los
// mismos que ven el catálogo de operaciones; no trae montos.
export default function ImprimirOperacionesPage() {
  const [params] = useSearchParams()
  const { role } = useAuth()
  const prenda = params.get('prenda') || ''
  const volverA = canViewProduccionMontos(role) ? '/produccion/admin' : '/produccion/operaciones'
  return (
    <RequireRole allow={canVerOperacionesProduccion}>
      {prenda ? <HojaOperacionesPrenda prenda={prenda} volverA={volverA} /> : <p className="page">Falta elegir la prenda.</p>}
    </RequireRole>
  )
}
