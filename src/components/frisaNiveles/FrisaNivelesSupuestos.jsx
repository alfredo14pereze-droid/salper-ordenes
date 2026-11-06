import { useMemo, useState } from 'react'
import Modal from '../talleros/Modal'
import { guardarSupuestos } from '../../services/frisaNivelesService'
import { conNiveles, resumenNiveles } from '../../utils/frisaNiveles'

// Días entre dos fechas, contando las dos (1 ene – 16 oct 2026 = 289).
export function diasEntre(inicio, fin) {
  if (!inicio || !fin) return null
  const a = Date.UTC(...inicio.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))
  const b = Date.UTC(...fin.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)))
  return Math.round((b - a) / 86400000) + 1
}

const CAMPOS = [
  ['dias_periodo', 'Días del periodo 2026', 'Entre cuántos días se divide el consumo 2026 para sacar la demanda diaria.'],
  ['dias_minimo', 'Días de mínimo (crítico)', 'Debajo de esto es CRÍTICO (20 = 2 entregas).'],
  ['dias_reorden', 'Días de reorden (pedir)', 'Debajo de esto hay que PEDIR (28 = 4 semanas).'],
  ['dias_maximo', 'Días de máximo', 'Stock objetivo (42 = 6 semanas).'],
]

export default function FrisaNivelesSupuestos({ cfg, productos, onClose, onGuardado }) {
  const [f, setF] = useState({
    dias_periodo: String(cfg.dias_periodo), dias_minimo: String(cfg.dias_minimo),
    dias_reorden: String(cfg.dias_reorden), dias_maximo: String(cfg.dias_maximo),
    fecha_inicio_consumo: cfg.fecha_inicio_consumo || '', fecha_corte_consumo: cfg.fecha_corte_consumo || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const numeros = Object.fromEntries(CAMPOS.map(([k]) => [k, Number(f[k])]))
  const validos = CAMPOS.every(([k]) => /^\d+$/.test(f[k]) && Number(f[k]) > 0)
  const ordenOk = validos && numeros.dias_minimo <= numeros.dias_reorden && numeros.dias_reorden <= numeros.dias_maximo
  const diasFechas = diasEntre(f.fecha_inicio_consumo, f.fecha_corte_consumo)

  const antes = useMemo(() => resumenNiveles(conNiveles(productos, cfg)), [productos, cfg])
  const despues = useMemo(() => (validos ? resumenNiveles(conNiveles(productos, numeros)) : null), [productos, validos, numeros.dias_periodo, numeros.dias_minimo, numeros.dias_reorden, numeros.dias_maximo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar(e) {
    e.preventDefault()
    if (!validos) return setError('Todos los días deben ser números enteros mayores que 0.')
    if (!ordenOk) return setError('Debe cumplirse: mínimo ≤ reorden ≤ máximo.')
    setGuardando(true)
    setError(null)
    const { data, error: err } = await guardarSupuestos({ ...numeros, fecha_inicio_consumo: f.fecha_inicio_consumo, fecha_corte_consumo: f.fecha_corte_consumo })
    setGuardando(false)
    if (err) return setError(err.message)
    onGuardado(data)
  }

  const linea = (r) => `${r.critico} CRÍTICO · ${r.pedir} PEDIR · ${r.ok} OK · ${r.piezasAPedir.toLocaleString('es-MX')} pzas a pedir`

  return (
    <Modal title="Supuestos de niveles" onClose={onClose}>
      <form className="frisa-niveles__supuestos" onSubmit={guardar}>
        <div className="frisa-form__fila">
          <label>
            <span className="field-label">Consumo 2026 desde</span>
            <input className="input" type="date" value={f.fecha_inicio_consumo} onChange={(e) => setF({ ...f, fecha_inicio_consumo: e.target.value })} />
          </label>
          <label>
            <span className="field-label">hasta (corte)</span>
            <input className="input" type="date" value={f.fecha_corte_consumo} onChange={(e) => setF({ ...f, fecha_corte_consumo: e.target.value })} />
          </label>
        </div>
        {diasFechas != null && diasFechas > 0 && String(diasFechas) !== f.dias_periodo && (
          <p className="frisa__nota">
            Esas fechas son {diasFechas} días.{' '}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setF({ ...f, dias_periodo: String(diasFechas) })}>Usar {diasFechas}</button>
          </p>
        )}
        {CAMPOS.map(([k, label, ayuda]) => (
          <label key={k} className="frisa-niveles__supuesto">
            <span className="field-label">{label}</span>
            <input className="input frisa-input" type="number" min="1" step="1" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            <span className="frisa__sub">{ayuda}</span>
          </label>
        ))}
        <p className="frisa__nota">
          Hoy: {linea(antes)}
          {despues && <><br />Con estos supuestos: <strong>{linea(despues)}</strong></>}
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="frisa__botones">
          <button type="submit" className="btn btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar supuestos'}</button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
