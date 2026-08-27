import { STATUSES } from '../../lib/constants'
import { getStatusIndex } from '../../utils/status'

export default function StatusStepper({ status }) {
  const currentIndex = getStatusIndex(status)

  return (
    <ol className="status-stepper">
      {STATUSES.map((s, i) => {
        let state = 'pending'
        if (i < currentIndex) state = 'done'
        if (i === currentIndex) state = 'current'

        return (
          <li key={s.key} className={`status-stepper__step status-stepper__step--${state}`}>
            <span className="status-stepper__dot" style={{ '--step-color': s.color }} />
            <span className="status-stepper__label">{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
