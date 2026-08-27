import { getStatusLabel } from '../../utils/status'
import { formatDateTime } from '../../utils/dates'
import { EmptyState } from '../common/States'

// Timeline con fecha/hora de cada cambio de estado (más reciente primero).
export default function StatusHistoryList({ history }) {
  if (!history || history.length === 0) {
    return <EmptyState>Todavía no hay historial de cambios.</EmptyState>
  }

  return (
    <ol className="history-list">
      {history.map((entry) => (
        <li key={entry.id} className="history-list__item">
          <span className="history-list__status">{getStatusLabel(entry.status)}</span>
          <span className="history-list__date">{formatDateTime(entry.changed_at)}</span>
          {entry.notes && <p className="history-list__notes">{entry.notes}</p>}
        </li>
      ))}
    </ol>
  )
}
