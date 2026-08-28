import { getStatus, isCompleted } from '../../utils/status'

// Negro con texto ámbar para las 5 etapas en proceso (son solo una
// etiqueta de "en qué va", no un juicio de bien/mal). "Completado" es la
// única excepción: cuenta como indicador semántico ("bien" / terminado),
// así que se pinta de verde — ver la regla de colores en styles/index.css.
export default function StatusBadge({ status }) {
  const s = getStatus(status)
  const good = isCompleted(status)

  return <span className={'badge ' + (good ? 'badge--status-good' : 'badge--status')}>{s.label}</span>
}
