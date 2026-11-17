import { useEffect, useState } from 'react'
import { fetchAtrEstadoOrden } from '../../services/atrService'
import { formatDateTime } from '../../utils/dates'
import './atr.css'

// V211 — En una orden de ATR: "Sumado al inventario ATR ✓" cuando lo surtido
// en Terminado ya entró al inventario (lo hace la base al completar
// Terminado). Avisa si hay prendas que no vienen del catálogo de ATR (esas no
// se suman). En órdenes de otros clientes no pinta nada.
export default function AtrEtiquetaOrden({ order }) {
  const [estado, setEstado] = useState(null)
  const firma = `${order.id}|${order.status}|${order.eliminada_en || ''}|${JSON.stringify(order.items || [])}`

  useEffect(() => {
    let vivo = true
    fetchAtrEstadoOrden(order.id).then(({ data }) => vivo && setEstado(data))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  if (!estado?.es_atr) return null
  return (
    <div className="atr-etiqueta">
      {estado.sumado ? (
        <span className="atr-etiqueta__ok" title={estado.sumado_en ? `Desde ${formatDateTime(estado.sumado_en)}` : undefined}>
          Sumado al inventario ATR ✓ · {estado.piezas} {estado.piezas === 1 ? 'bata' : 'batas'}
        </span>
      ) : (
        <span className="atr-muted">Inventario ATR: se suma lo surtido al completar Terminado.</span>
      )}
      {estado.prendas_sin_ligar > 0 && (
        <span className="atr-etiqueta__aviso">
          {estado.prendas_sin_ligar === 1 ? '1 prenda no viene' : `${estado.prendas_sin_ligar} prendas no vienen`} del catálogo de ATR y no se suma
          {estado.prendas_sin_ligar === 1 ? '' : 'n'} al inventario.
        </span>
      )}
    </div>
  )
}
