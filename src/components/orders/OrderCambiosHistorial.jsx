import { useState } from 'react'
import { formatDateTime } from '../../utils/dates'
import CambioDetalle from './CambioDetalle'

function estadoDe(c) {
  if (!c.requiere_aceptar) return 'Antes de confirmarse (no se pide aceptar)'
  if (c.aceptado_en) return `✓ Aceptado por ${c.aceptado_por_nombre || 'fábrica'} · ${formatDateTime(c.aceptado_en)}`
  return 'Pendiente de aceptar'
}

// V178 — todos los cambios de la orden (datos y prendas), más reciente
// primero, con quién los hizo, cuándo y quién los aceptó. Cerrado por default.
export default function OrderCambiosHistorial({ cambios = [], tiposPorClave }) {
  const [abierto, setAbierto] = useState(false)
  if (cambios.length === 0) return null
  return (
    <div className="cambios-historial">
      <button type="button" className="cambios-historial__toggle" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        {abierto ? '▾' : '▸'} Historial de cambios ({cambios.length})
      </button>
      {abierto && (
        <div className="cambios-historial__lista">
          {cambios.map((c) => (
            <div key={c.id} className={'cambios-historial__item' + (c.requiere_aceptar && !c.aceptado_en ? ' cambios-historial__item--pendiente' : '')}>
              <CambioDetalle cambio={c} tiposPorClave={tiposPorClave} estado={estadoDe(c)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
