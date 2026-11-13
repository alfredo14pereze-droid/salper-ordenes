import { useState } from 'react'
import Modal from '../talleros/Modal'
import { estatusLabel, sumarDias } from '../../utils/crm'
import { hoyLocal } from '../../utils/tareas'

// V207 — Cambio de estatus que pide algo más: 'perdido' (motivo) o
// 'en_pausa' (fecha para volver a contactar). Se usa en la ficha y en el tablero.
// Atajos para la fecha de "volver a contactar".
export function AtajosFecha({ valor, onElegir }) {
  const hoy = hoyLocal()
  const atajos = [
    ['1 semana', sumarDias(hoy, 7)],
    ['2 semanas', sumarDias(hoy, 14)],
    ['1 mes', sumarDias(hoy, 30)],
    ['3 meses', sumarDias(hoy, 91)],
  ]
  return (
    <div className="crm-atajos">
      {atajos.map(([label, f]) => (
        <button key={label} type="button" className={'chip' + (valor === f ? ' chip--active' : '')} onClick={() => onElegir(f)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function EstatusModal({ estatus, onClose, onConfirmar }) {
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const perdido = estatus === 'perdido'
  return (
    <Modal title={`Cambiar a «${estatusLabel(estatus)}»`} onClose={onClose}>
      <form
        className="crm-form"
        onSubmit={async (ev) => {
          ev.preventDefault()
          if (perdido && !motivo.trim()) return setError('Escribe por qué se perdió.')
          if (!perdido && !fecha) return setError('Elige cuándo volver a contactar.')
          setGuardando(true)
          await onConfirmar(perdido ? { motivoPerdida: motivo } : { fechaSeguimiento: fecha, notaSeguimiento: nota })
          setGuardando(false)
        }}
      >
        {perdido ? (
          <label>
            <span className="field-label">¿Por qué se perdió? *</span>
            <input className="input" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} list="crm-motivos" placeholder="Precio, ya tienen proveedor, no contestan…" autoFocus />
            <datalist id="crm-motivos">
              {['Precio', 'Ya tienen proveedor', 'No contestan', 'Tiempo de entrega', 'No les interesa', 'Calidad'].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        ) : (
          <>
            <p className="crm-muted">Para que no se olvide: elige cuándo volver a buscarlos.</p>
            <AtajosFecha valor={fecha} onElegir={setFecha} />
            <label>
              <span className="field-label">Fecha para volver a contactar *</span>
              <input className="input" type="date" value={fecha} min={hoyLocal()} onChange={(ev) => setFecha(ev.target.value)} />
            </label>
            <label>
              <span className="field-label">Nota (opcional)</span>
              <input className="input" value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Ej. retomar en temporada de compras" />
            </label>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="crm-form__botones">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Cambiar estatus'}</button>
        </div>
      </form>
    </Modal>
  )
}

