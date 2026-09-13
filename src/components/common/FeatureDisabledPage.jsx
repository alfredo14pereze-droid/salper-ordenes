import { EmptyState } from './States'

// V31 — página que se muestra en vez de un módulo apagado por
// featureFlags.js (ver PEDIDOS_PROVEEDOR_HABILITADO). Evita que alguien
// entre directo por URL a un módulo que no está listo para producción
// todavía, aunque su código siga completo (solo está apagado, no
// borrado).
export default function FeatureDisabledPage() {
  return (
    <div className="page page--narrow">
      <EmptyState>Este módulo todavía no está disponible en el sistema.</EmptyState>
    </div>
  )
}
