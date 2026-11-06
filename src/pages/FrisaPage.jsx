import { useState } from 'react'
import RequireRole from '../components/common/RequireRole'
import { useAuth } from '../contexts/AuthContext'
import { canViewSeccionFrisa, canViewFrisaNiveles, canViewFrisaConsignacion, canViewFrisaSurtido, canSurtirFrisa, canSubirOCFrisa } from '../utils/permissions'
import FrisaNiveles from '../components/frisaNiveles/FrisaNiveles'
import FrisaSurtidoSeccion from '../components/frisaSurtido/FrisaSurtidoSeccion'
import FrisaRestock from '../components/frisaRestock/FrisaRestock'
import FrisaReportes from '../components/frisaReportes/FrisaReportes'
import FrisaMicrosip from '../components/frisaMicrosip/FrisaMicrosip'
import FrisaConsignacionPage from './FrisaConsignacionPage'

// V184 — sección "Frisa": Niveles de inventario (todos con fn.ver) y, solo
// para admin_general, la consignación de prueba de V180/V181.
export default function FrisaPage() {
  return (
    <RequireRole allow={canViewSeccionFrisa}>
      <FrisaSeccion />
    </RequireRole>
  )
}

function FrisaSeccion() {
  const { role } = useAuth()
  const partes = [
    canViewFrisaNiveles(role) && ['niveles', 'Niveles de inventario'],
    canViewFrisaSurtido(role) && ['surtido', 'Órdenes de surtido'],
    canViewFrisaSurtido(role) && ['urgente', 'Urgente'],
    canViewFrisaNiveles(role) && ['restock', 'Restock'],
    canViewFrisaNiveles(role) && ['microsip', 'Revisión Microsip'],
    canViewFrisaNiveles(role) && ['reportes', 'Reportes'],
    canViewFrisaConsignacion(role) && ['consignacion', 'Consignación (prueba)'],
  ].filter(Boolean)
  // Quien surte pero no administra (Leo) entra directo a las órdenes de surtido.
  const inicial = canSurtirFrisa(role) && !canSubirOCFrisa(role) && partes.some(([k]) => k === 'surtido') ? 'surtido' : partes[0][0]
  const [parte, setParte] = useState(inicial)

  return (
    <div>
      {partes.length > 1 && (
        <div className="notas-pestanas frisa__secciones" role="tablist">
          {partes.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={parte === k}
              className={'notas-pestana' + (parte === k ? ' notas-pestana--activa' : '')} onClick={() => setParte(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {parte === 'niveles' && <FrisaNiveles />}
      {(parte === 'surtido' || parte === 'urgente') && <FrisaSurtidoSeccion key={parte} vista={parte} />}
      {parte === 'restock' && <FrisaRestock />}
      {parte === 'reportes' && <FrisaReportes />}
      {parte === 'microsip' && <FrisaMicrosip />}
      {parte === 'consignacion' && <FrisaConsignacionPage />}
    </div>
  )
}
