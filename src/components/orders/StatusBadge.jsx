import { getStatus } from '../../utils/status'

// Cada etapa de producción tiene su propio color (progresión ámbar→naranja,
// definida una sola vez en lib/constants.js → STATUSES) para reconocerla de
// un vistazo — "completado" sigue siendo la única en verde, el único
// indicador semántico real de "bien" entre las 6. Rojo queda fuera de esta
// paleta a propósito: se reserva para urgencia de fecha de entrega (ver
// OrderCard), nunca para una etapa.
export default function StatusBadge({ status }) {
  const s = getStatus(status)

  return (
    <span className="badge badge--status" style={{ background: s.color, color: s.textColor }}>
      {s.label}
    </span>
  )
}
