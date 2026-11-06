import { ESTADOS_SURTIDO } from '../../utils/frisaSurtido'

export function EstadoSurtido({ estado }) {
  const e = ESTADOS_SURTIDO[estado]
  return <span className={'frisa-nivel frisa-nivel--' + e.clase}>{e.label}</span>
}
