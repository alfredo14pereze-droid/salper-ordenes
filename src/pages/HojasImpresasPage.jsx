import RequireRole from '../components/common/RequireRole'
import HojasImpresas from '../components/produccion/HojasImpresas'
import { canConsultarHojasImpresas } from '../utils/permissions'

// V200 — «Hojas impresas» de solo consulta para costura (Carmen): ve las hojas
// que ya se imprimieron y las puede volver a imprimir. No edita ni quita nada.
export default function HojasImpresasPage() {
  return (
    <RequireRole allow={canConsultarHojasImpresas}>
      <div className="page">
        <h2 className="section-title">Hojas impresas</h2>
        <p className="form-hint">Solo consulta. Para cambiar una hoja, avisa a un administrador.</p>
        <HojasImpresas puedeQuitar={false} />
      </div>
    </RequireRole>
  )
}
